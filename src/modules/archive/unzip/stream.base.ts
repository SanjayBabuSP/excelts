import {
  Duplex,
  PassThrough,
  Transform,
  concatUint8Arrays,
  pipeline,
  finished,
  type Readable
} from "@stream";
import { ByteQueue } from "@archive/shared/byte-queue";
import { textEncoder as utf8Encoder } from "@stream/shared";
import { PatternScanner } from "@archive/unzip/pattern-scanner";

import {
  DEFAULT_PARSE_THRESHOLD_BYTES,
  buildZipEntryProps,
  decodeZipEntryPath,
  getZipEntryType,
  hasDataDescriptorFlag,
  isFileSizeKnown,
  parseExtraField,
  readDataDescriptor,
  readLocalFileHeader,
  resolveZipEntryLastModifiedDateTime,
  runParseLoopCore,
  isValidZipRecordSignature,
  type CrxHeader,
  type EntryProps,
  type EntryVars,
  type ParseDriverState,
  type ParseOptions,
  type ZipExtraFields
} from "@archive/unzip/parser-core";

export const DEFAULT_UNZIP_STREAM_HIGH_WATER_MARK = 256 * 1024;

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

  // Writable-side backpressure (Node.js)
  private readonly _inputHighWaterMarkBytes: number;
  private readonly _inputLowWaterMarkBytes: number;

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

  constructor(opts: ParseOptions = {}) {
    super({ decodeStrings: false, objectMode: true });
    this.finished = false;

    // Default values are intentionally conservative to avoid memory spikes
    // when parsing large archives under slow consumers.
    const hi = Math.max(64 * 1024, opts.inputHighWaterMarkBytes ?? 2 * 1024 * 1024);
    const lo = Math.max(32 * 1024, opts.inputLowWaterMarkBytes ?? Math.floor(hi / 4));
    this._inputHighWaterMarkBytes = hi;
    this._inputLowWaterMarkBytes = Math.min(lo, hi);

    this.on("finish", () => {
      this.finished = true;
      this.emit("chunk", false);
    });
  }

  _write(chunk: Uint8Array | string, _encoding: string, callback: () => void): void {
    const data = typeof chunk === "string" ? utf8Encoder.encode(chunk) : chunk;
    this._queue.append(data);

    // Apply writable backpressure by deferring the callback when the input buffer is large.
    // Otherwise, release it immediately so producers can stream in more bytes.
    if (this._queue.length >= this._inputHighWaterMarkBytes) {
      this.cb = callback;
    } else {
      callback();
    }
    this.emit("chunk");
  }

  _read(): void {}

  protected _maybeReleaseWriteCallback(): void {
    // Only release a deferred write callback when we've drained enough data.
    // This provides bounded buffering while still preventing deadlocks.
    if (typeof this.cb === STR_FUNCTION && this._queue.length <= this._inputLowWaterMarkBytes) {
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

      // Race fix: `finish` can fire between the early `this.finished` check and
      // registering the listener above. If that happens and we don't have enough
      // buffered bytes to fulfill the pull, the Promise would never settle.
      if (this.finished) {
        onFinish();
      }
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

export async function runParseLoop(
  opts: ParseOptions,
  io: ParseIO,
  emitter: ParseEmitter,
  inflateFactory: InflateFactory,
  state: ParseDriverState,
  inflateRawSync?: InflateRawSync
): Promise<void> {
  const thresholdBytes = opts.thresholdBytes ?? DEFAULT_PARSE_THRESHOLD_BYTES;

  await runParseLoopCore(opts, io, emitter, state, async (_opts, _io, _emitter, _state) => {
    await readFileRecord(opts, io, emitter, inflateFactory, state, thresholdBytes, inflateRawSync);
  });
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
