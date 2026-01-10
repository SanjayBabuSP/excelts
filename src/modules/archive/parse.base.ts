import {
  parseDosDateTimeUTC,
  resolveZipLastModifiedDateFromUnixSeconds
} from "@archive/utils/timestamps";
import {
  Duplex,
  PassThrough,
  Transform,
  concatUint8Arrays,
  pipeline,
  finished,
  type Readable
} from "@stream";
import { parseTyped as parseBuffer } from "@archive/utils/parse-buffer";
import { ByteQueue } from "@archive/byte-queue";
import { indexOfUint8ArrayPattern } from "@archive/utils/bytes";
import { readUint32LE, writeUint32LE } from "@archive/utils/binary";
import {
  parseZipExtraFields,
  type ZipExtraFields,
  type ZipVars
} from "@archive/utils/zip-extra-fields";
import {
  CENTRAL_DIR_HEADER_SIG,
  END_OF_CENTRAL_DIR_SIG,
  LOCAL_FILE_HEADER_SIG,
  ZIP64_END_OF_CENTRAL_DIR_LOCATOR_SIG,
  ZIP64_END_OF_CENTRAL_DIR_SIG
} from "@archive/zip-constants";

// Shared parseBuffer() formats
export const CRX_HEADER_FORMAT: [string, number][] = [
  ["version", 4],
  ["pubKeyLength", 4],
  ["signatureLength", 4]
];

export const LOCAL_FILE_HEADER_FORMAT: [string, number][] = [
  ["versionsNeededToExtract", 2],
  ["flags", 2],
  ["compressionMethod", 2],
  ["lastModifiedTime", 2],
  ["lastModifiedDate", 2],
  ["crc32", 4],
  ["compressedSize", 4],
  ["uncompressedSize", 4],
  ["fileNameLength", 2],
  ["extraFieldLength", 2]
];

export const DATA_DESCRIPTOR_FORMAT: [string, number][] = [
  ["dataDescriptorSignature", 4],
  ["crc32", 4],
  ["compressedSize", 4],
  ["uncompressedSize", 4]
];

export const CENTRAL_DIRECTORY_FILE_HEADER_FORMAT: [string, number][] = [
  ["versionMadeBy", 2],
  ["versionsNeededToExtract", 2],
  ["flags", 2],
  ["compressionMethod", 2],
  ["lastModifiedTime", 2],
  ["lastModifiedDate", 2],
  ["crc32", 4],
  ["compressedSize", 4],
  ["uncompressedSize", 4],
  ["fileNameLength", 2],
  ["extraFieldLength", 2],
  ["fileCommentLength", 2],
  ["diskNumber", 2],
  ["internalFileAttributes", 2],
  ["externalFileAttributes", 4],
  ["offsetToLocalFileHeader", 4]
];

export const END_OF_CENTRAL_DIRECTORY_FORMAT: [string, number][] = [
  ["diskNumber", 2],
  ["diskStart", 2],
  ["numberOfRecordsOnDisk", 2],
  ["numberOfRecords", 2],
  ["sizeOfCentralDirectory", 4],
  ["offsetToStartOfCentralDirectory", 4],
  ["commentLength", 2]
];

// Shared entry metadata helpers
export interface ZipEntryVarsMeta {
  flags: number | null;
  uncompressedSize: number;
  lastModifiedDate: number | null;
  lastModifiedTime: number | null;
}

export type { ZipVars, ZipExtraFields };

export interface ZipEntryPropsMeta {
  path: string;
  pathBuffer: Uint8Array;
  flags: {
    isUnicode: boolean;
  };
}

export interface CrxHeader {
  version: number | null;
  pubKeyLength: number | null;
  signatureLength: number | null;
  publicKey?: Uint8Array;
  signature?: Uint8Array;
}

export interface LocalFileHeaderVars {
  versionsNeededToExtract: number | null;
  flags: number | null;
  compressionMethod: number | null;
  lastModifiedTime: number | null;
  lastModifiedDate: number | null;
  crc32: number | null;
  compressedSize: number | null;
  uncompressedSize: number | null;
  fileNameLength: number | null;
  extraFieldLength: number | null;
}

export interface DataDescriptorVars {
  dataDescriptorSignature: number | null;
  crc32: number | null;
  compressedSize: number | null;
  uncompressedSize: number | null;
}

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export function decodeZipEntryPath(pathBuffer: Uint8Array): string {
  return textDecoder.decode(pathBuffer);
}

export function isZipUnicodeFlag(flags: number | null): boolean {
  return ((flags || 0) & 0x800) !== 0;
}

export function isZipDirectoryPath(path: string): boolean {
  if (path.length === 0) {
    return false;
  }
  const last = path.charCodeAt(path.length - 1);
  return last === 47 || last === 92;
}

export function getZipEntryType(path: string, uncompressedSize: number): "Directory" | "File" {
  return uncompressedSize === 0 && isZipDirectoryPath(path) ? "Directory" : "File";
}

export function buildZipEntryProps(
  path: string,
  pathBuffer: Uint8Array,
  flags: number | null
): ZipEntryPropsMeta {
  return {
    path,
    pathBuffer,
    flags: {
      isUnicode: isZipUnicodeFlag(flags)
    }
  };
}

export function resolveZipEntryLastModifiedDateTime(
  vars: ZipEntryVarsMeta,
  extraFields: ZipExtraFields
): Date {
  const dosDate = vars.lastModifiedDate || 0;
  const dosTime = vars.lastModifiedTime || 0;

  const dosDateTime = parseDosDateTimeUTC(dosDate, dosTime);

  const unixSecondsMtime = extraFields.mtimeUnixSeconds;
  if (unixSecondsMtime === undefined) {
    return dosDateTime;
  }

  return resolveZipLastModifiedDateFromUnixSeconds(dosDate, dosTime, unixSecondsMtime);
}

export const parseExtraField = parseZipExtraFields;

export function hasDataDescriptorFlag(flags: number | null): boolean {
  return ((flags || 0) & 0x08) !== 0;
}

export function isFileSizeKnown(flags: number | null, compressedSize: number | null): boolean {
  return !hasDataDescriptorFlag(flags) || (compressedSize || 0) > 0;
}

export type DrainStream = Transform & { promise: () => Promise<void> };

export function autodrain(stream: { pipe: (dest: Transform) => unknown }): DrainStream {
  const draining = stream.pipe(
    new Transform({
      transform(_chunk: Uint8Array, _encoding: string, callback: () => void) {
        callback();
      }
    })
  ) as DrainStream;

  draining.promise = () =>
    new Promise<void>((resolve, reject) => {
      draining.on("finish", resolve);
      draining.on("error", reject);
    });

  return draining;
}

/**
 * Collects all data from a readable stream into a single Uint8Array.
 */
export function bufferStream(entry: Readable): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const stream = new Transform({
      transform(d: Uint8Array, _encoding: string, callback: () => void) {
        chunks.push(d);
        callback();
      }
    });

    stream.on("finish", () => {
      resolve(chunks.length === 1 ? chunks[0] : concatUint8Arrays(chunks));
    });
    stream.on("error", reject);

    entry.on("error", reject).pipe(stream);
  });
}

export type PullFn = (length: number) => Promise<Uint8Array>;

const STR_FUNCTION = "function";

export class PullStream extends Duplex {
  protected readonly _queue = new ByteQueue();

  get buffer(): Uint8Array {
    return this._queue.view();
  }
  set buffer(value: Uint8Array) {
    this._queue.reset(value);
  }

  cb?: () => void;
  finished: boolean;
  match?: number;
  __emittedError?: Error;

  constructor() {
    super({ decodeStrings: false, objectMode: true });
    this.finished = false;

    this.on("finish", () => {
      this.finished = true;
      this.emit("chunk", false);
    });
  }

  _write(chunk: Uint8Array | string, _encoding: string, callback: () => void): void {
    const data = typeof chunk === "string" ? textEncoder.encode(chunk) : chunk;
    this._queue.append(data);
    this.cb = callback;
    this.emit("chunk");
  }

  _read(): void {}

  protected _maybeReleaseWriteCallback(): void {
    if (typeof this.cb === STR_FUNCTION) {
      const callback = this.cb;
      this.cb = undefined;
      callback();
    }
  }

  /**
   * The `eof` parameter is interpreted as `file_length` if the type is number
   * otherwise (i.e. Uint8Array) it is interpreted as a pattern signaling end of stream
   */
  stream(eof: number | Uint8Array, includeEof?: boolean): PassThrough {
    const p = new PassThrough();
    let done = false;

    const cb = (): void => {
      this._maybeReleaseWriteCallback();
    };

    const pull = (): void => {
      let packet: Uint8Array | undefined;
      const available = this._queue.length;
      if (available) {
        if (typeof eof === "number") {
          const toRead = Math.min(eof, available);
          if (toRead > 0) {
            packet = this._queue.read(toRead);
            eof -= toRead;
          }
          done = done || eof === 0;
        } else {
          const view = this._queue.view();
          let match = indexOfUint8ArrayPattern(view, eof);
          if (match !== -1) {
            // store signature match byte offset to allow us to reference
            // this for zip64 offset
            this.match = match;
            if (includeEof) {
              match = match + eof.length;
            }
            if (match > 0) {
              packet = this._queue.read(match);
            }
            done = true;
          } else {
            const len = view.length - eof.length;
            if (len <= 0) {
              cb();
            } else {
              packet = this._queue.read(len);
            }
          }
        }
        if (packet) {
          p.write(packet, () => {
            if (
              this._queue.length === 0 ||
              (typeof eof !== "number" && eof.length && this._queue.length <= eof.length)
            ) {
              cb();
            }

            if (done) {
              cb();
              this.removeListener("chunk", pull);
              p.end();
              return;
            }

            // Continue draining regardless of downstream read timing.
            queueMicrotask(pull);
          });
          return;
        }
      }

      if (!done) {
        if (this.finished) {
          this.removeListener("chunk", pull);
          cb();
          p.destroy(new Error("FILE_ENDED"));
          return;
        }
      } else {
        this.removeListener("chunk", pull);
        cb();
        p.end();
      }
    };

    this.on("chunk", pull);
    pull();
    return p;
  }

  pull(eof: number | Uint8Array, includeEof?: boolean): Promise<Uint8Array> {
    if (eof === 0) {
      return Promise.resolve(new Uint8Array(0));
    }

    // If we already have the required data in buffer
    // we can resolve the request immediately
    if (typeof eof === "number" && this._queue.length >= eof) {
      const data = this._queue.read(eof);

      // If we drained the internal buffer, allow the upstream writer to continue.
      if (this._queue.length === 0) {
        this._maybeReleaseWriteCallback();
      }
      return Promise.resolve(data);
    }

    // Otherwise we stream until we have it
    const chunks: Uint8Array[] = [];
    const concatStream = new Transform({
      transform(d: Uint8Array, _encoding: string, cb: () => void) {
        chunks.push(d);
        cb();
      }
    });

    let pullStreamRejectHandler: (e: Error) => void;

    return new Promise<Uint8Array>((resolve, reject) => {
      pullStreamRejectHandler = (e: Error) => {
        this.__emittedError = e;
        reject(e);
      };
      if (this.finished) {
        return reject(new Error("FILE_ENDED"));
      }
      this.once("error", pullStreamRejectHandler); // reject any errors from pullstream itself
      this.stream(eof, includeEof)
        .on("error", reject)
        .pipe(concatStream)
        .on("finish", () => {
          resolve(chunks.length === 1 ? chunks[0] : concatUint8Arrays(chunks));
        })
        .on("error", reject);
    }).finally(() => {
      this.removeListener("error", pullStreamRejectHandler);
    });
  }

  pullUntil(pattern: Uint8Array, includeEof?: boolean): Promise<Uint8Array> {
    return this.pull(pattern, includeEof);
  }
}

// Structural public API for PullStream-like consumers.
//
// NOTE: Do not use the PullStream class type directly for cross-environment typing,
// because it contains protected members (nominal typing).
export type PullStreamPublicApi = {
  buffer: Uint8Array;
  cb?: () => void;
  finished: boolean;
  match?: number;
  stream(eof: number | Uint8Array, includeEof?: boolean): PassThrough;
  pull(eof: number | Uint8Array, includeEof?: boolean): Promise<Uint8Array>;
  pullUntil(pattern: Uint8Array, includeEof?: boolean): Promise<Uint8Array>;
};

export async function readCrxHeader(pull: PullFn): Promise<CrxHeader> {
  const data = await pull(12);
  const header = parseBuffer<CrxHeader>(data, CRX_HEADER_FORMAT);
  const pubKeyLength = header.pubKeyLength || 0;
  const signatureLength = header.signatureLength || 0;

  const keyAndSig = await pull(pubKeyLength + signatureLength);
  header.publicKey = keyAndSig.subarray(0, pubKeyLength);
  header.signature = keyAndSig.subarray(pubKeyLength);
  return header;
}

export async function readLocalFileHeader(pull: PullFn): Promise<{
  vars: EntryVars;
  fileNameBuffer: Uint8Array;
  extraFieldData: Uint8Array;
}> {
  const data = await pull(26);
  const vars = parseBuffer<EntryVars>(data, LOCAL_FILE_HEADER_FORMAT);
  const fileNameBuffer = await pull(vars.fileNameLength || 0);
  const extraFieldData = await pull(vars.extraFieldLength || 0);
  return { vars, fileNameBuffer, extraFieldData };
}

export async function readDataDescriptor(pull: PullFn): Promise<DataDescriptorVars> {
  const data = await pull(16);
  return parseBuffer<DataDescriptorVars>(data, DATA_DESCRIPTOR_FORMAT);
}

export async function consumeCentralDirectoryFileHeader(pull: PullFn): Promise<void> {
  const data = await pull(42);
  const vars = parseBuffer<Record<string, number | null>>(
    data,
    CENTRAL_DIRECTORY_FILE_HEADER_FORMAT
  );
  await pull(vars.fileNameLength || 0);
  await pull(vars.extraFieldLength || 0);
  await pull(vars.fileCommentLength || 0);
}

export async function consumeEndOfCentralDirectoryRecord(pull: PullFn): Promise<void> {
  const data = await pull(18);
  const vars = parseBuffer<Record<string, number | null>>(data, END_OF_CENTRAL_DIRECTORY_FORMAT);
  await pull(vars.commentLength || 0);
}

// =============================================================================
// Validated Data Descriptor Scan (shared by Node + Browser)
// =============================================================================

function isValidZipRecordSignature(sig: number): boolean {
  switch (sig) {
    case LOCAL_FILE_HEADER_SIG:
    case CENTRAL_DIR_HEADER_SIG:
    case END_OF_CENTRAL_DIR_SIG:
    case ZIP64_END_OF_CENTRAL_DIR_SIG:
    case ZIP64_END_OF_CENTRAL_DIR_LOCATOR_SIG:
      return true;
    default:
      return false;
  }
}

function readUint32LEFromBytes(view: Uint8Array, offset: number): number {
  return (
    (view[offset] |
      0 |
      ((view[offset + 1] | 0) << 8) |
      ((view[offset + 2] | 0) << 16) |
      ((view[offset + 3] | 0) << 24)) >>>
    0
  );
}

function indexOf4BytesPattern(buffer: Uint8Array, pattern: Uint8Array, startIndex: number): number {
  if (pattern.length !== 4) {
    return indexOfUint8ArrayPattern(buffer, pattern, startIndex);
  }

  const b0 = pattern[0];
  const b1 = pattern[1];
  const b2 = pattern[2];
  const b3 = pattern[3];

  const bufLen = buffer.length;
  let start = startIndex | 0;
  if (start < 0) {
    start = 0;
  }
  if (start > bufLen - 4) {
    return -1;
  }

  for (let i = start; i <= bufLen - 4; i++) {
    if (buffer[i] === b0 && buffer[i + 1] === b1 && buffer[i + 2] === b2 && buffer[i + 3] === b3) {
      return i;
    }
  }

  return -1;
}

export interface ValidatedDataDescriptorScanResult {
  /** Start index of the descriptor within `view`, or -1 when not found yet. */
  foundIndex: number;
  /** Where the caller should resume searching on the next scan of (a mostly unchanged) view. */
  nextSearchFrom: number;
}

function initScanResult(
  out?: ValidatedDataDescriptorScanResult
): ValidatedDataDescriptorScanResult {
  if (out) {
    return out;
  }
  return { foundIndex: -1, nextSearchFrom: 0 };
}

/**
 * Scan for a validated DATA_DESCRIPTOR record boundary.
 *
 * Scanning for the 4-byte signature alone is unsafe because it can appear inside
 * compressed data. We validate a candidate by requiring:
 * - the next 4 bytes after the 16-byte descriptor form a known ZIP record signature, and
 * - the descriptor's compressedSize matches the number of compressed bytes emitted so far.
 */
export function scanValidatedDataDescriptor(
  view: Uint8Array,
  dataDescriptorSignature: Uint8Array,
  bytesEmitted: number,
  startIndex = 0,
  out?: ValidatedDataDescriptorScanResult
): ValidatedDataDescriptorScanResult {
  const result = initScanResult(out);

  let searchFrom = startIndex | 0;
  if (searchFrom < 0) {
    searchFrom = 0;
  }
  if (searchFrom > view.length) {
    searchFrom = view.length;
  }

  // To avoid missing a signature split across chunk boundaries, we may need
  // to re-check the last (sigLen - 1) bytes on the next scan.
  const sigLen = dataDescriptorSignature.length | 0;
  const overlap = sigLen > 0 ? sigLen - 1 : 0;

  while (searchFrom < view.length) {
    const match = indexOf4BytesPattern(view, dataDescriptorSignature, searchFrom);
    if (match === -1) {
      result.foundIndex = -1;
      result.nextSearchFrom = Math.max(searchFrom, Math.max(0, view.length - overlap));
      return result;
    }

    const idx = match;

    // Need 16 bytes for descriptor + 4 bytes for next record signature.
    const nextSigOffset = idx + 16;
    if (nextSigOffset + 4 <= view.length) {
      const nextSig = readUint32LEFromBytes(view, nextSigOffset);

      const descriptorCompressedSize = readUint32LEFromBytes(view, idx + 8);
      const expectedCompressedSize = (bytesEmitted + idx) >>> 0;

      if (
        isValidZipRecordSignature(nextSig) &&
        descriptorCompressedSize === expectedCompressedSize
      ) {
        result.foundIndex = idx;
        result.nextSearchFrom = idx;
        return result;
      }

      searchFrom = idx + 1;
      continue;
    }

    // Not enough bytes to validate yet. Re-check this candidate once more bytes arrive.
    result.foundIndex = -1;
    result.nextSearchFrom = idx;
    return result;
  }

  result.foundIndex = -1;
  result.nextSearchFrom = Math.max(searchFrom, Math.max(0, view.length - overlap));
  return result;
}

export interface StreamUntilValidatedDataDescriptorSource {
  getView(): Uint8Array;
  getLength(): number;
  read(length: number): Uint8Array;
  isFinished(): boolean;
  onDataAvailable(cb: () => void): () => void;
  maybeReleaseWriteCallback?: () => void;
}

export interface StreamUntilValidatedDataDescriptorOptions {
  source: StreamUntilValidatedDataDescriptorSource;
  dataDescriptorSignature: Uint8Array;
  /** Keep enough bytes to validate: descriptor(16) + next record sig(4) = 20. */
  keepTailBytes?: number;
  errorMessage?: string;
}

/**
 * Stream compressed file data until we reach a validated DATA_DESCRIPTOR boundary.
 *
 * This encapsulates the shared logic used by both Node and browser parsers.
 */
export function streamUntilValidatedDataDescriptor(
  options: StreamUntilValidatedDataDescriptorOptions
): PassThrough {
  const { source, dataDescriptorSignature } = options;
  const keepTailBytes = options.keepTailBytes ?? 20;
  const errorMessage = options.errorMessage ?? "FILE_ENDED: Data descriptor not found";

  const output = new PassThrough();
  let done = false;

  // Total number of compressed bytes already emitted for this entry.
  let bytesEmitted = 0;
  let searchFrom = 0;

  const scanResult: ValidatedDataDescriptorScanResult = { foundIndex: -1, nextSearchFrom: 0 };

  let unsubscribe: (() => void) | undefined;

  const cleanup = (): void => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = undefined;
    }
  };

  const pull = (): void => {
    if (done) {
      return;
    }

    while (source.getLength() > 0) {
      const view = source.getView();
      scanValidatedDataDescriptor(
        view,
        dataDescriptorSignature,
        bytesEmitted,
        searchFrom,
        scanResult
      );
      const foundIndex = scanResult.foundIndex;
      searchFrom = scanResult.nextSearchFrom;

      if (foundIndex !== -1) {
        if (foundIndex > 0) {
          output.write(source.read(foundIndex));
          bytesEmitted += foundIndex;
          searchFrom = Math.max(0, searchFrom - foundIndex);
        }

        done = true;
        source.maybeReleaseWriteCallback?.();
        cleanup();
        output.end();
        return;
      }

      // Flush most of the buffered data but keep a tail so a potential signature
      // split across chunks can still be detected/validated.
      const flushLen = Math.max(0, view.length - keepTailBytes);
      if (flushLen > 0) {
        output.write(source.read(flushLen));
        bytesEmitted += flushLen;
        searchFrom = Math.max(0, searchFrom - flushLen);

        if (source.getLength() <= keepTailBytes) {
          source.maybeReleaseWriteCallback?.();
        }

        return;
      }

      // Need more data.
      break;
    }

    if (!done && source.isFinished()) {
      done = true;
      cleanup();
      output.destroy(new Error(errorMessage));
    }
  };

  unsubscribe = source.onDataAvailable(pull);
  queueMicrotask(pull);
  return output;
}

// =============================================================================
// Shared Parse Loop (used by Node + Browser)
// =============================================================================

export interface ParseOptions {
  verbose?: boolean;
  forceStream?: boolean;
  /**
   * Threshold (in bytes) for small file optimization.
   * Files smaller than this will use sync decompression (no stream overhead).
   * Default: 5MB
   */
  thresholdBytes?: number;
}

export interface EntryVars {
  versionsNeededToExtract: number | null;
  flags: number | null;
  compressionMethod: number | null;
  lastModifiedTime: number | null;
  lastModifiedDate: number | null;
  crc32: number | null;
  compressedSize: number | null;
  uncompressedSize: number | null;
  fileNameLength: number | null;
  extraFieldLength: number | null;
  lastModifiedDateTime?: Date;
  crxHeader?: CrxHeader;
}

export interface EntryProps {
  path: string;
  pathBuffer: Uint8Array;
  flags: {
    isUnicode: boolean;
  };
}

export interface ZipEntry extends PassThrough {
  path: string;
  props: EntryProps;
  type: "Directory" | "File";
  vars: EntryVars;
  extraFields: ZipExtraFields;
  size?: number;
  __autodraining?: boolean;
  autodrain: () => DrainStream;
  buffer: () => Promise<Uint8Array>;
}

export interface ParseDriverState {
  crxHeader?: CrxHeader;
  reachedCD?: boolean;
}

export interface ParseIO {
  pull(length: number): Promise<Uint8Array>;
  pullUntil(pattern: Uint8Array, includeEof?: boolean): Promise<Uint8Array>;
  stream(length: number): PassThrough;
  streamUntilDataDescriptor(): PassThrough;
  setDone(): void;
}

export interface ParseEmitter {
  emitEntry(entry: ZipEntry): void;
  pushEntry(entry: ZipEntry): void;
  pushEntryIfPiped(entry: ZipEntry): void;
  emitCrxHeader(header: CrxHeader): void;
  emitError(err: Error): void;
  emitClose(): void;
}

export type InflateFactory = () => Transform | Duplex | PassThrough;

/**
 * Synchronous inflate function type for small file optimization.
 * When provided and file size is below threshold, this will be used
 * instead of streaming decompression for better performance.
 */
export type InflateRawSync = (data: Uint8Array) => Uint8Array;

/**
 * Default threshold for small file optimization (8MB).
 */
export const DEFAULT_PARSE_THRESHOLD_BYTES = 8 * 1024 * 1024;

const endDirectorySignature = writeUint32LE(END_OF_CENTRAL_DIR_SIG);

export async function runParseLoop(
  opts: ParseOptions,
  io: ParseIO,
  emitter: ParseEmitter,
  inflateFactory: InflateFactory,
  state: ParseDriverState,
  inflateRawSync?: InflateRawSync
): Promise<void> {
  const thresholdBytes = opts.thresholdBytes ?? DEFAULT_PARSE_THRESHOLD_BYTES;

  while (true) {
    const sigBytes = await io.pull(4);
    if (sigBytes.length === 0) {
      emitter.emitClose();
      return;
    }

    const signature = readUint32LE(sigBytes, 0);

    if (signature === 0x34327243) {
      state.crxHeader = await readCrxHeader(async length => io.pull(length));
      emitter.emitCrxHeader(state.crxHeader);
      continue;
    }

    if (signature === LOCAL_FILE_HEADER_SIG) {
      await readFileRecord(
        opts,
        io,
        emitter,
        inflateFactory,
        state,
        thresholdBytes,
        inflateRawSync
      );
      continue;
    }

    if (signature === CENTRAL_DIR_HEADER_SIG) {
      state.reachedCD = true;
      await consumeCentralDirectoryFileHeader(async length => io.pull(length));
      continue;
    }

    if (signature === END_OF_CENTRAL_DIR_SIG) {
      await consumeEndOfCentralDirectoryRecord(async length => io.pull(length));
      io.setDone();
      emitter.emitClose();
      return;
    }

    if (state.reachedCD) {
      // We are in central directory trailing data; resync by scanning for EOCD signature.
      // consumeEndOfCentralDirectoryRecord expects the EOCD signature to be consumed, so includeEof=true.
      const includeEof = true;
      await io.pullUntil(endDirectorySignature, includeEof);
      await consumeEndOfCentralDirectoryRecord(async length => io.pull(length));
      io.setDone();
      emitter.emitClose();
      return;
    }

    emitter.emitError(new Error("invalid signature: 0x" + signature.toString(16)));
    emitter.emitClose();
    return;
  }
}

async function readFileRecord(
  opts: ParseOptions,
  io: ParseIO,
  emitter: ParseEmitter,
  inflateFactory: InflateFactory,
  state: ParseDriverState,
  thresholdBytes: number,
  inflateRawSync?: InflateRawSync
): Promise<void> {
  const {
    vars: headerVars,
    fileNameBuffer,
    extraFieldData
  } = await readLocalFileHeader(async l => io.pull(l));
  const vars = headerVars;

  if (state.crxHeader) {
    vars.crxHeader = state.crxHeader;
  }

  const fileName = decodeZipEntryPath(fileNameBuffer);

  const entry = new PassThrough() as ZipEntry;
  let autodraining = false;

  entry.autodrain = function () {
    autodraining = true;
    entry.__autodraining = true;
    return autodrain(entry);
  };

  entry.buffer = function () {
    return bufferStream(entry);
  };

  entry.path = fileName;
  entry.props = buildZipEntryProps(fileName, fileNameBuffer, vars.flags) as EntryProps;
  entry.type = getZipEntryType(fileName, vars.uncompressedSize || 0);

  if (opts.verbose) {
    if (entry.type === "Directory") {
      console.log("   creating:", fileName);
    } else if (entry.type === "File") {
      if (vars.compressionMethod === 0) {
        console.log(" extracting:", fileName);
      } else {
        console.log("  inflating:", fileName);
      }
    }
  }

  const extra = parseExtraField(extraFieldData, vars);
  vars.lastModifiedDateTime = resolveZipEntryLastModifiedDateTime(vars, extra);

  entry.vars = vars;
  entry.extraFields = extra;
  entry.__autodraining = autodraining;

  const fileSizeKnown = isFileSizeKnown(vars.flags, vars.compressedSize);
  if (fileSizeKnown) {
    entry.size = vars.uncompressedSize || 0;
  }

  if (opts.forceStream) {
    emitter.pushEntry(entry);
  } else {
    emitter.emitEntry(entry);
    emitter.pushEntryIfPiped(entry);
  }

  if (opts.verbose) {
    console.log({
      filename: fileName,
      vars: vars,
      extraFields: entry.extraFields
    });
  }

  // Small file optimization: use sync decompression if:
  // 1. File size is known and below threshold
  // 2. inflateRawSync is provided
  // 3. File needs decompression (compressionMethod != 0)
  // 4. Not autodraining
  const useSmallFileOptimization =
    fileSizeKnown &&
    inflateRawSync &&
    vars.compressionMethod !== 0 &&
    !autodraining &&
    (vars.compressedSize || 0) <= thresholdBytes;

  if (useSmallFileOptimization) {
    // Read compressed data directly and decompress synchronously
    const compressedData = await io.pull(vars.compressedSize || 0);
    const decompressedData = inflateRawSync!(compressedData);
    entry.end(decompressedData);
    // Wait for entry stream write to complete (not for read/consume)
    await finished(entry, { readable: false });
    return;
  }

  const inflater = vars.compressionMethod && !autodraining ? inflateFactory() : new PassThrough();

  if (fileSizeKnown) {
    await pipeline(io.stream(vars.compressedSize || 0) as any, inflater as any, entry as any);
    return;
  }

  await pipeline(io.streamUntilDataDescriptor() as any, inflater as any, entry as any);
  const dd = await readDataDescriptor(async l => io.pull(l));
  entry.size = dd.uncompressedSize || 0;
}
