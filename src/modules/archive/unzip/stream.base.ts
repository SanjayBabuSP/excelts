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
import { ByteQueue } from "@archive/internal/byte-queue";
import { indexOfUint8ArrayPattern } from "@archive/utils/bytes";
import { PatternScanner } from "@archive/utils/pattern-scanner";
import { readUint32LE, writeUint32LE } from "@archive/utils/binary";
import {
  parseZipExtraFields,
  type ZipExtraFields,
  type ZipVars
} from "@archive/utils/zip-extra-fields";
import {
  CENTRAL_DIR_HEADER_SIG,
  DATA_DESCRIPTOR_SIG,
  END_OF_CENTRAL_DIR_SIG,
  LOCAL_FILE_HEADER_SIG,
  ZIP64_END_OF_CENTRAL_DIR_LOCATOR_SIG,
  ZIP64_END_OF_CENTRAL_DIR_SIG
} from "@archive/zip-spec/zip-records";

export const DATA_DESCRIPTOR_SIGNATURE_BYTES = writeUint32LE(DATA_DESCRIPTOR_SIG);

const DEFAULT_UNZIP_STREAM_HIGH_WATER_MARK = 256 * 1024;

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
    const p = new PassThrough({ highWaterMark: DEFAULT_UNZIP_STREAM_HIGH_WATER_MARK });
    let done = false;
    let waitingDrain = false;

    const eofIsNumber = typeof eof === "number";
    let remainingBytes = eofIsNumber ? (eof as number) : 0;
    const pattern = eofIsNumber ? undefined : (eof as Uint8Array);
    const patternLen = pattern ? pattern.length : 0;
    const minTailBytes = eofIsNumber ? 0 : patternLen;

    const scanner = eofIsNumber ? undefined : new PatternScanner(pattern!);

    const cb = (): void => {
      this._maybeReleaseWriteCallback();
    };

    const pull = (): void => {
      if (done || waitingDrain) {
        return;
      }

      while (true) {
        const available = this._queue.length;
        if (!available) {
          break;
        }

        let packet: Uint8Array | undefined;

        if (eofIsNumber) {
          const toRead = Math.min(remainingBytes, available);
          if (toRead > 0) {
            packet = this._queue.read(toRead);
            remainingBytes -= toRead;
          }
          done = done || remainingBytes === 0;
        } else {
          const bufLen = this._queue.length;
          const match = scanner!.find(this._queue);
          if (match !== -1) {
            // store signature match byte offset to allow us to reference
            // this for zip64 offset
            this.match = match;
            const toRead = includeEof ? match + patternLen : match;
            if (toRead > 0) {
              packet = this._queue.read(toRead);
              scanner!.onConsume(toRead);
            }
            done = true;
          } else {
            // No match yet. Avoid rescanning bytes that can't start a match.
            scanner!.onNoMatch(bufLen);

            const len = bufLen - patternLen;
            if (len <= 0) {
              // Keep enough bytes to detect a split signature.
              if (
                this._queue.length === 0 ||
                (minTailBytes && this._queue.length <= minTailBytes)
              ) {
                cb();
              }
            } else {
              packet = this._queue.read(len);
              scanner!.onConsume(len);
            }
          }
        }

        if (!packet) {
          break;
        }

        const ok = p.write(packet);

        // If we drained the internal buffer (or kept only a minimal tail), allow upstream to continue.
        if (this._queue.length === 0 || (minTailBytes && this._queue.length <= minTailBytes)) {
          cb();
        }

        if (!ok) {
          waitingDrain = true;
          p.once("drain", () => {
            waitingDrain = false;
            pull();
          });
          return;
        }

        if (done) {
          cb();
          this.removeListener("chunk", pull);
          p.end();
          return;
        }
      }

      if (!done) {
        if (this.finished) {
          this.removeListener("chunk", pull);
          cb();
          p.destroy(new Error("FILE_ENDED"));
        }
        return;
      }

      this.removeListener("chunk", pull);
      cb();
      p.end();
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

      // Allow the upstream writer to continue once the consumer makes progress.
      // Waiting for a full drain can deadlock when the producer must call `end()`
      // but is blocked behind a deferred write callback.
      this._maybeReleaseWriteCallback();
      return Promise.resolve(data);
    }

    // Otherwise we wait for more data and fulfill directly from the internal queue.
    // This avoids constructing intermediate streams for small pulls (hot path).
    const chunks: Uint8Array[] = [];
    let pullStreamRejectHandler: (e: Error) => void;

    // Pattern scanning state (only used when eof is a pattern)
    const eofIsNumber = typeof eof === "number";
    const pattern = eofIsNumber ? undefined : (eof as Uint8Array);
    const patternLen = pattern ? pattern.length : 0;
    const scanner = eofIsNumber ? undefined : new PatternScanner(pattern!);

    return new Promise<Uint8Array>((resolve, reject) => {
      let settled = false;
      pullStreamRejectHandler = (e: Error) => {
        this.__emittedError = e;
        cleanup();
        reject(e);
      };

      if (this.finished) {
        reject(new Error("FILE_ENDED"));
        return;
      }

      const cleanup = (): void => {
        this.removeListener("chunk", onChunk);
        this.removeListener("finish", onFinish);
        this.removeListener("error", pullStreamRejectHandler);
      };

      const finalize = (): void => {
        cleanup();
        settled = true;
        if (chunks.length === 0) {
          resolve(new Uint8Array(0));
          return;
        }
        resolve(chunks.length === 1 ? chunks[0] : concatUint8Arrays(chunks));
      };

      const onFinish = (): void => {
        if (settled) {
          return;
        }

        // Try one last time to drain anything already buffered.
        onChunk();

        if (!settled) {
          cleanup();
          reject(new Error("FILE_ENDED"));
        }
      };

      const onChunk = (): void => {
        if (typeof eof === "number") {
          const available = this._queue.length;
          if (available <= 0) {
            return;
          }
          const toRead = Math.min(eof, available);
          if (toRead > 0) {
            chunks.push(this._queue.read(toRead));
            eof -= toRead;
          }

          // Allow upstream to continue as soon as we consume bytes.
          // This avoids deadlocks when the last upstream chunk is waiting on its
          // callback and the parser needs an EOF signal after draining buffered data.
          this._maybeReleaseWriteCallback();

          if (eof === 0) {
            finalize();
          }

          return;
        }

        // eof is a pattern
        while (this._queue.length > 0) {
          const bufLen = this._queue.length;
          const match = scanner!.find(this._queue);
          if (match !== -1) {
            // store signature match byte offset to allow us to reference
            // this for zip64 offset
            this.match = match;
            const toRead = includeEof ? match + patternLen : match;
            if (toRead > 0) {
              chunks.push(this._queue.read(toRead));
              scanner!.onConsume(toRead);
            }

            if (this._queue.length === 0 || (patternLen && this._queue.length <= patternLen)) {
              this._maybeReleaseWriteCallback();
            }
            finalize();
            return;
          }

          // No match yet. Avoid rescanning bytes that can't start a match.
          scanner!.onNoMatch(bufLen);

          const safeLen = bufLen - patternLen;
          if (safeLen <= 0) {
            // Keep enough bytes to detect a split signature.
            this._maybeReleaseWriteCallback();
            return;
          }

          chunks.push(this._queue.read(safeLen));
          scanner!.onConsume(safeLen);

          if (this._queue.length === 0 || (patternLen && this._queue.length <= patternLen)) {
            this._maybeReleaseWriteCallback();
            return;
          }
        }
      };

      this.once("error", pullStreamRejectHandler);
      this.on("chunk", onChunk);
      this.once("finish", onFinish);

      // Attempt immediate fulfillment from any already-buffered data.
      onChunk();
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
  const header =
    data.length >= 12 ? parseCrxHeaderFast(data) : parseBuffer<CrxHeader>(data, CRX_HEADER_FORMAT);
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
  const vars =
    data.length >= 26
      ? parseLocalFileHeaderVarsFast(data)
      : parseBuffer<EntryVars>(data, LOCAL_FILE_HEADER_FORMAT);
  const fileNameBuffer = await pull(vars.fileNameLength || 0);
  const extraFieldData = await pull(vars.extraFieldLength || 0);
  return { vars, fileNameBuffer, extraFieldData };
}

export async function readDataDescriptor(pull: PullFn): Promise<DataDescriptorVars> {
  const data = await pull(16);
  return data.length >= 16
    ? parseDataDescriptorVarsFast(data)
    : parseBuffer<DataDescriptorVars>(data, DATA_DESCRIPTOR_FORMAT);
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

function readUint16LEFromBytes(view: Uint8Array, offset: number): number {
  return (view[offset] | ((view[offset + 1] | 0) << 8)) >>> 0;
}

function parseCrxHeaderFast(data: Uint8Array): CrxHeader {
  return {
    version: readUint32LEFromBytes(data, 0),
    pubKeyLength: readUint32LEFromBytes(data, 4),
    signatureLength: readUint32LEFromBytes(data, 8)
  };
}

function parseLocalFileHeaderVarsFast(data: Uint8Array): EntryVars {
  return {
    versionsNeededToExtract: readUint16LEFromBytes(data, 0),
    flags: readUint16LEFromBytes(data, 2),
    compressionMethod: readUint16LEFromBytes(data, 4),
    lastModifiedTime: readUint16LEFromBytes(data, 6),
    lastModifiedDate: readUint16LEFromBytes(data, 8),
    crc32: readUint32LEFromBytes(data, 10),
    compressedSize: readUint32LEFromBytes(data, 14),
    uncompressedSize: readUint32LEFromBytes(data, 18),
    fileNameLength: readUint16LEFromBytes(data, 22),
    extraFieldLength: readUint16LEFromBytes(data, 24)
  };
}

function parseDataDescriptorVarsFast(data: Uint8Array): DataDescriptorVars {
  return {
    dataDescriptorSignature: readUint32LEFromBytes(data, 0),
    crc32: readUint32LEFromBytes(data, 4),
    compressedSize: readUint32LEFromBytes(data, 8),
    uncompressedSize: readUint32LEFromBytes(data, 12)
  };
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

  const last = bufLen - 4;
  let i = buffer.indexOf(b0, start);
  while (i !== -1 && i <= last) {
    if (buffer[i + 1] === b1 && buffer[i + 2] === b2 && buffer[i + 3] === b3) {
      return i;
    }
    i = buffer.indexOf(b0, i + 1);
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

  const viewLen = view.length;

  let searchFrom = startIndex | 0;
  if (searchFrom < 0) {
    searchFrom = 0;
  }
  if (searchFrom > viewLen) {
    searchFrom = viewLen;
  }

  // To avoid missing a signature split across chunk boundaries, we may need
  // to re-check the last (sigLen - 1) bytes on the next scan.
  const sigLen = dataDescriptorSignature.length | 0;
  const overlap = sigLen > 0 ? sigLen - 1 : 0;

  const viewLimit = Math.max(0, viewLen - overlap);

  while (searchFrom < viewLen) {
    const match = indexOf4BytesPattern(view, dataDescriptorSignature, searchFrom);
    if (match === -1) {
      result.foundIndex = -1;
      result.nextSearchFrom = Math.max(searchFrom, viewLimit);
      return result;
    }

    const idx = match;

    // Need 16 bytes for descriptor + 4 bytes for next record signature.
    const nextSigOffset = idx + 16;
    if (nextSigOffset + 4 <= viewLen) {
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
  result.nextSearchFrom = Math.max(searchFrom, viewLimit);
  return result;
}

export interface StreamUntilValidatedDataDescriptorSource {
  getLength(): number;
  read(length: number): Uint8Array;
  /** Optional: zero-copy chunk views for streaming writes. */
  peekChunks?(length: number): Uint8Array[];
  /** Optional: consume bytes previously written from peekChunks(). */
  discard?(length: number): void;
  indexOfPattern(pattern: Uint8Array, startIndex: number): number;
  peekUint32LE(offset: number): number | null;
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

  const output = new PassThrough({ highWaterMark: DEFAULT_UNZIP_STREAM_HIGH_WATER_MARK });
  let done = false;

  let waitingDrain = false;

  // Total number of compressed bytes already emitted for this entry.
  let bytesEmitted = 0;
  const scanner = new PatternScanner(dataDescriptorSignature);

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

    if (waitingDrain) {
      return;
    }

    let available = source.getLength();
    if (available === 0) {
      // If we have no buffered data, ensure upstream isn't stuck behind a
      // deferred write callback.
      source.maybeReleaseWriteCallback?.();
    }
    while (available > 0) {
      // Try to find and validate a descriptor candidate.
      while (true) {
        const idx = scanner.find(source);
        if (idx === -1) {
          break;
        }

        // Need 16 bytes for descriptor + 4 bytes for next record signature.
        const nextSigOffset = idx + 16;
        if (nextSigOffset + 4 <= available) {
          const nextSig = source.peekUint32LE(nextSigOffset);
          const descriptorCompressedSize = source.peekUint32LE(idx + 8);
          const expectedCompressedSize = (bytesEmitted + idx) >>> 0;

          if (
            nextSig !== null &&
            descriptorCompressedSize !== null &&
            isValidZipRecordSignature(nextSig) &&
            descriptorCompressedSize === expectedCompressedSize
          ) {
            if (idx > 0) {
              if (source.peekChunks && source.discard) {
                const parts = source.peekChunks(idx);
                let written = 0;
                for (const part of parts) {
                  const ok = output.write(part);
                  written += part.length;
                  if (!ok) {
                    waitingDrain = true;
                    output.once("drain", () => {
                      waitingDrain = false;
                      pull();
                    });
                    break;
                  }
                }
                if (written > 0) {
                  source.discard(written);
                  bytesEmitted += written;
                  available -= written;
                  scanner.onConsume(written);
                }
                if (waitingDrain) {
                  return;
                }
              } else {
                const ok = output.write(source.read(idx));
                bytesEmitted += idx;
                available -= idx;
                scanner.onConsume(idx);

                if (!ok) {
                  waitingDrain = true;
                  output.once("drain", () => {
                    waitingDrain = false;
                    pull();
                  });
                  return;
                }
              }
            }

            done = true;
            source.maybeReleaseWriteCallback?.();
            cleanup();
            output.end();
            return;
          }

          scanner.searchFrom = idx + 1;
          continue;
        }

        // Not enough bytes to validate yet. Re-check this candidate once more bytes arrive.
        scanner.searchFrom = idx;
        break;
      }

      // No validated match yet.
      scanner.onNoMatch(available);

      // Flush most of the buffered data but keep a tail so a potential signature
      // split across chunks can still be detected/validated.
      const flushLen = Math.max(0, available - keepTailBytes);
      if (flushLen > 0) {
        if (source.peekChunks && source.discard) {
          const parts = source.peekChunks(flushLen);
          let written = 0;
          for (const part of parts) {
            const ok = output.write(part);
            written += part.length;
            if (!ok) {
              waitingDrain = true;
              output.once("drain", () => {
                waitingDrain = false;
                pull();
              });
              break;
            }
          }

          if (written > 0) {
            source.discard(written);
            bytesEmitted += written;
            available -= written;
            scanner.onConsume(written);
          }

          if (available <= keepTailBytes) {
            source.maybeReleaseWriteCallback?.();
          }

          return;
        }

        const ok = output.write(source.read(flushLen));
        bytesEmitted += flushLen;
        available -= flushLen;
        scanner.onConsume(flushLen);

        if (available <= keepTailBytes) {
          source.maybeReleaseWriteCallback?.();
        }

        if (!ok) {
          waitingDrain = true;
          output.once("drain", () => {
            waitingDrain = false;
            pull();
          });
        }

        return;
      }

      // Need more data.
      // IMPORTANT: If we keep a tail and cannot flush anything yet, we must still
      // release upstream write callbacks; otherwise the producer can deadlock waiting
      // for backpressure while we wait for more bytes to arrive.
      source.maybeReleaseWriteCallback?.();
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
   * Browser-only: use a Web Worker to run inflate off the main thread.
   * Defaults to false.
   */
  useWorkerInflate?: boolean;
  /**
   * Browser-only: provide an explicit Worker script URL.
   *
   * Useful under strict CSP that blocks `blob:` workers. When set, the browser
   * parser will try to construct `new Worker(workerInflateUrl)`.
   */
  workerInflateUrl?: string;
  /**
   * Input backpressure high-water mark (bytes).
   *
   * When provided, implementations may delay the writable callback until the
   * internal input buffer drops below `inputLowWaterMarkBytes`.
   *
   * This is primarily used by the browser parser, because its writable side
   * otherwise tends to accept unlimited data and can cause large memory spikes.
   */
  inputHighWaterMarkBytes?: number;
  /**
   * Input backpressure low-water mark (bytes).
   * When the internal buffer drops to (or below) this value, a delayed writable
   * callback may be released.
   */
  inputLowWaterMarkBytes?: number;
  /**
   * Threshold (in bytes) for small file optimization.
   * Files smaller than this will use sync decompression (no stream overhead).
   *
   * Note: the optimization is only applied when the entry sizes are trusted
   * (i.e. no data descriptor) and BOTH compressedSize and uncompressedSize
   * are below this threshold. This avoids buffering huge highly-compressible
   * files (e.g. large XML) in memory, which would defeat streaming.
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
 * Default threshold for small file optimization (5MB).
 */
export const DEFAULT_PARSE_THRESHOLD_BYTES = 5 * 1024 * 1024;

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

async function pumpKnownCompressedSizeToEntry(
  io: ParseIO,
  inflater: Transform | Duplex | PassThrough,
  entry: ZipEntry,
  compressedSize: number
): Promise<void> {
  // Keep chunks reasonably large to reduce per-await overhead.
  const CHUNK_SIZE = 256 * 1024;

  let remaining = compressedSize;
  let err: Error | null = null;

  const onError = (e: Error): void => {
    err = e;
  };

  inflater.once("error", onError);
  entry.once("error", onError);

  let skipping = false;

  const waitForDrainOrSkipSignal = async (): Promise<void> => {
    await new Promise<void>(resolve => {
      const anyInflater = inflater as any;

      const cleanup = () => {
        try {
          anyInflater?.removeListener?.("drain", onDrain);
        } catch {
          // ignore
        }
        try {
          entry.removeListener("__autodrain", onAutodrain);
        } catch {
          // ignore
        }
        try {
          entry.removeListener("close", onClose);
        } catch {
          // ignore
        }
      };

      const onDrain = () => {
        cleanup();
        resolve();
      };
      const onAutodrain = () => {
        cleanup();
        resolve();
      };
      const onClose = () => {
        cleanup();
        resolve();
      };

      if (typeof anyInflater?.once === "function") {
        anyInflater.once("drain", onDrain);
      }
      entry.once("__autodrain", onAutodrain);
      entry.once("close", onClose);
    });
  };

  const switchToSkip = async (): Promise<void> => {
    if (skipping) {
      return;
    }
    skipping = true;

    // Stop forwarding decompressed output. We only need to advance the ZIP cursor.
    try {
      const anyInflater = inflater as any;
      if (typeof anyInflater.unpipe === "function") {
        anyInflater.unpipe(entry as any);
      }
    } catch {
      // ignore
    }

    // End the entry as early as possible so downstream drain resolves quickly.
    try {
      if (!(entry as any).writableEnded && !(entry as any).destroyed) {
        entry.end();
      }
    } catch {
      // ignore
    }

    // Stop the inflater to avoid work/backpressure.
    try {
      const anyInflater = inflater as any;
      if (typeof anyInflater.destroy === "function") {
        anyInflater.destroy();
      }
    } catch {
      // ignore
    }
  };

  try {
    // Pipe decompressed output into the entry stream.
    (inflater as any).pipe(entry as any);

    while (remaining > 0) {
      if (err) {
        throw err;
      }

      // If downstream decides to autodrain mid-entry (common when a consumer bails out
      // early due to a limit), stop inflating and just skip the remaining compressed bytes.
      if (!skipping && (entry.__autodraining || (entry as any).destroyed)) {
        await switchToSkip();
      }

      const toPull = Math.min(CHUNK_SIZE, remaining);
      const chunk = await io.pull(toPull);
      if (chunk.length !== toPull) {
        throw new Error("FILE_ENDED");
      }

      remaining -= chunk.length;

      if (!skipping) {
        const ok = (inflater as any).write(chunk);
        if (!ok) {
          await waitForDrainOrSkipSignal();
        }
      }
    }

    if (!skipping) {
      (inflater as any).end();
    }

    // Wait for all writes to complete (not for consumption).
    await finished(entry, { readable: false });
  } finally {
    inflater.removeListener("error", onError);
    entry.removeListener("error", onError);
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

  const entry = new PassThrough({
    highWaterMark: DEFAULT_UNZIP_STREAM_HIGH_WATER_MARK
  }) as ZipEntry;
  let autodraining = false;

  entry.autodrain = function () {
    autodraining = true;
    entry.__autodraining = true;
    // Signal producers that downstream has switched to drain mode.
    // This helps avoid deadlocks if the producer is waiting on backpressure.
    entry.emit("__autodrain");
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
  // 1. Entry sizes are trusted (no data descriptor)
  // 2. File size is known and below threshold
  // 3. inflateRawSync is provided
  // 4. File needs decompression (compressionMethod != 0)
  // 5. Not autodraining
  //
  // We require BOTH compressedSize and uncompressedSize <= thresholdBytes.
  // This prevents materializing large highly-compressible files in memory,
  // which can cause massive peak RSS and negate streaming backpressure.
  const sizesTrusted = !hasDataDescriptorFlag(vars.flags);
  const compressedSize = vars.compressedSize || 0;
  const uncompressedSize = vars.uncompressedSize || 0;

  const useSmallFileOptimization =
    sizesTrusted &&
    fileSizeKnown &&
    inflateRawSync &&
    vars.compressionMethod !== 0 &&
    !autodraining &&
    compressedSize <= thresholdBytes &&
    uncompressedSize <= thresholdBytes;

  if (useSmallFileOptimization) {
    // Read compressed data directly and decompress synchronously
    const compressedData = await io.pull(compressedSize);
    const decompressedData = inflateRawSync!(compressedData);
    entry.end(decompressedData);
    // Wait for entry stream write to complete (not for read/consume)
    await finished(entry, { readable: false });
    return;
  }

  const inflater =
    vars.compressionMethod && !autodraining
      ? inflateFactory()
      : new PassThrough({ highWaterMark: DEFAULT_UNZIP_STREAM_HIGH_WATER_MARK });

  if (fileSizeKnown) {
    await pumpKnownCompressedSizeToEntry(io, inflater, entry, vars.compressedSize || 0);
    return;
  }

  await pipeline(io.streamUntilDataDescriptor() as any, inflater as any, entry as any);
  const dd = await readDataDescriptor(async l => io.pull(l));
  entry.size = dd.uncompressedSize || 0;
}
