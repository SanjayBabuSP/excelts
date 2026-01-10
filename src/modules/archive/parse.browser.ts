/**
 * ZIP Stream Parser - Browser Version
 *
 * A streaming ZIP parser for browsers using native DecompressionStream.
 * Falls back to pure JavaScript implementation for older browsers.
 * Uses the browser Duplex stream implementation for compatibility.
 */

import { Duplex, PassThrough, concatUint8Arrays } from "@stream";
import { writeUint32LE } from "@archive/utils/binary";
import { indexOfUint8ArrayPattern } from "@archive/utils/bytes";
import {
  runParseLoop,
  type CrxHeader,
  type PullStreamPublicApi,
  type EntryProps,
  type EntryVars,
  type InflateFactory,
  type ParseDriverState,
  type ParseEmitter,
  type ParseIO,
  type ParseOptions,
  type ZipEntry,
  streamUntilValidatedDataDescriptor
} from "@archive/parse.base";
import { inflateRaw as fallbackInflateRaw } from "@archive/deflate-fallback";
import { ByteQueue } from "@archive/byte-queue";
import { DATA_DESCRIPTOR_SIG } from "@archive/zip-constants";
import { hasDeflateRawDecompressionStream } from "@archive/compress.base";

// =============================================================================
// Browser InflateRaw using DecompressionStream
// =============================================================================

/**
 * Duplex stream that wraps browser's native DecompressionStream.
 * Handles the "Junk found after end of compressed data" error gracefully
 * by treating it as end of stream when using data descriptors.
 *
 * Uses Duplex instead of Transform because DecompressionStream's output
 * is inherently async and doesn't fit the Transform's sync callback model.
 */
class BrowserInflateRaw extends Duplex {
  private decompressionStream: DecompressionStream;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private reading = false;
  private writeClosed = false;
  private _junkError = false;
  private _bytesIn = 0;
  private _bytesOut = 0;
  private _readingDone = false;
  private _readingDonePromise: Promise<void>;
  private _resolveReadingDone!: () => void;
  // Track pending write count for proper ordering
  private _pendingWrites = 0;
  private _writeFinishedPromise: Promise<void> | null = null;
  private _resolveWriteFinished: (() => void) | null = null;

  constructor() {
    // Pass write handler to Duplex so pipe() calls our write method
    // Also pass final handler to close the DecompressionStream when _writable ends
    super({
      write: (chunk: Uint8Array, _encoding: string, callback: (error?: Error | null) => void) => {
        this._doWrite(chunk, callback);
      },
      final: (callback: (error?: Error | null) => void) => {
        this._closeWriter(() => {
          callback();
        });
      }
    });
    this.decompressionStream = new DecompressionStream("deflate-raw");
    this.writer =
      this.decompressionStream.writable.getWriter() as WritableStreamDefaultWriter<Uint8Array>;
    this.reader = this.decompressionStream.readable.getReader();
    this._readingDonePromise = new Promise(resolve => {
      this._resolveReadingDone = resolve;
    });
    this._startReading();
  }

  // Internal write implementation
  private _doWrite(chunk: Uint8Array, callback?: (error?: Error | null) => void): void {
    if (this._junkError) {
      // Already got junk error, don't write more
      if (callback) {
        callback();
      }
      return;
    }

    this._bytesIn += chunk.length;
    this._pendingWrites++;

    this.writer
      .write(chunk)
      .then(() => {
        this._pendingWrites--;
        if (this._pendingWrites === 0 && this._resolveWriteFinished) {
          this._resolveWriteFinished();
        }
        if (callback) {
          callback();
        }
      })
      .catch(e => {
        this._pendingWrites--;
        if (this._pendingWrites === 0 && this._resolveWriteFinished) {
          this._resolveWriteFinished();
        }
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("Junk") || msg.includes("junk")) {
          this._junkError = true;
          if (callback) {
            callback();
          }
        } else {
          if (callback) {
            callback(e);
          } else {
            this.emit("error", e);
          }
        }
      });
  }

  private async _startReading(): Promise<void> {
    if (this.reading) {
      return;
    }
    this.reading = true;

    try {
      while (true) {
        const { done, value } = await this.reader.read();
        if (done) {
          break;
        }
        this._bytesOut += value.length;
        // Directly push to the readable side of Duplex
        this.push(value);
      }
    } catch (e) {
      // "Junk found after end of compressed data" is expected when using data descriptors
      // because we can't know the exact compressed size upfront
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Junk") || msg.includes("junk")) {
        this._junkError = true;
        // This is OK - we've read all decompressed data
      } else {
        // Re-throw other errors
        this.emit("error", e);
      }
    } finally {
      this._readingDone = true;
      this._resolveReadingDone();
      // Signal end of readable side
      this.push(null);
    }
  }

  // Override write to feed data into DecompressionStream
  override write(
    chunk: Uint8Array,
    encodingOrCallback?: string | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void
  ): boolean {
    // Handle overload
    let cb: ((error?: Error | null) => void) | undefined;
    if (typeof encodingOrCallback === "function") {
      cb = encodingOrCallback;
    } else {
      cb = callback;
    }

    this._doWrite(chunk, cb);
    return true;
  }

  // Override end to close the DecompressionStream writer
  override end(
    chunkOrCallback?: Uint8Array | (() => void),
    encodingOrCallback?: string | (() => void),
    callback?: () => void
  ): this {
    // Handle overloads
    let chunk: Uint8Array | undefined;
    let cb: (() => void) | undefined;

    if (typeof chunkOrCallback === "function") {
      cb = chunkOrCallback;
    } else if (chunkOrCallback !== undefined) {
      chunk = chunkOrCallback;
      if (typeof encodingOrCallback === "function") {
        cb = encodingOrCallback;
      } else {
        cb = callback;
      }
    }

    // Write final chunk if provided
    if (chunk) {
      this.write(chunk, () => {
        this._closeWriter(cb);
      });
    } else {
      this._closeWriter(cb);
    }

    return this;
  }

  private _closeWriter(callback?: () => void): void {
    if (this.writeClosed) {
      this._readingDonePromise.then(() => {
        if (callback) {
          callback();
        }
      });
      return;
    }
    this.writeClosed = true;

    // Wait for pending writes to complete before closing
    const waitForWrites =
      this._pendingWrites > 0
        ? new Promise<void>(resolve => {
            this._writeFinishedPromise = new Promise(r => {
              this._resolveWriteFinished = r;
            });
            this._writeFinishedPromise.then(resolve);
          })
        : Promise.resolve();

    waitForWrites
      .then(() => this.writer.close())
      .catch(() => {})
      .finally(() => {
        this._readingDonePromise.then(() => {
          if (callback) {
            callback();
          }
          this.emit("finish");
        });
      });
  }

  override destroy(error?: Error | null): this {
    if (!this.writeClosed) {
      this.writer.abort(error || undefined).catch(() => {});
    }
    this.reader.cancel(error || undefined).catch(() => {});
    return super.destroy(error);
  }
}

// =============================================================================
// Fallback InflateRaw for browsers without DecompressionStream
// =============================================================================

/**
 * Fallback Inflate that buffers all data, then decompresses at end.
 * Used for older browsers without native DecompressionStream support.
 */
class FallbackInflateRaw extends Duplex {
  private chunks: Uint8Array[] = [];
  private _finished = false;

  constructor() {
    super({
      write: (chunk: Uint8Array, _encoding: string, callback: (error?: Error | null) => void) => {
        if (this._finished) {
          callback(new Error("write after end"));
          return;
        }
        this.chunks.push(chunk);
        callback();
      },
      final: (callback: (error?: Error | null) => void) => {
        this._decompress(callback);
      }
    });
  }

  private _decompress(callback: (error?: Error | null) => void): void {
    try {
      // Combine all chunks
      const data = concatUint8Arrays(this.chunks);

      // Decompress using fallback
      const decompressed = fallbackInflateRaw(data);
      this.push(decompressed);
      this.push(null);
      this._finished = true;
      callback();
    } catch (err) {
      callback(err instanceof Error ? err : new Error(String(err)));
    }
  }

  override destroy(error?: Error | null): this {
    this._finished = true;
    this.chunks = [];
    return super.destroy(error);
  }
}

// =============================================================================
// Factory function with fallback
// =============================================================================

function createInflateRaw(): Duplex {
  if (hasDeflateRawDecompressionStream()) {
    return new BrowserInflateRaw();
  } else {
    return new FallbackInflateRaw();
  }
}

// =============================================================================
// Utilities
// =============================================================================

const dataDescriptorSignature = writeUint32LE(DATA_DESCRIPTOR_SIG);

// =============================================================================
// Types
// =============================================================================

export type { CrxHeader, EntryProps, EntryVars, ParseOptions, ZipEntry };

export type ParseStream = Duplex & {
  promise(): Promise<void>;
} & PullStreamPublicApi & {
    crxHeader?: CrxHeader;
  };

export function createParseClass(createInflateRawFn: InflateFactory): {
  new (opts?: ParseOptions): ParseStream;
} {
  /**
   * ZIP Stream Parser for browsers.
   *
   * Extends Duplex to be compatible with stream.pipe(zip) pattern.
   * - Writable side: accepts ZIP data
   * - Readable side: emits ZipEntry objects
   */
  return class Parse extends Duplex {
    private _opts: ParseOptions;
    private readonly _buffer = new ByteQueue();
    cb?: () => void;
    finished = false;
    match?: number;
    private _pendingResolve?: () => void;
    private _driverState: ParseDriverState = {};
    private _parsingDone: Promise<void> = Promise.resolve();

    crxHeader?: CrxHeader;
    __emittedError?: Error;

    constructor(opts: ParseOptions = {}) {
      super({
        objectMode: true,
        write: (chunk: Uint8Array, _encoding: string, callback: (err?: Error | null) => void) => {
          this._handleWrite(chunk);
          callback();
        },
        final: (callback: (err?: Error | null) => void) => {
          this.finished = true;
          this._wakeUp();
          this.emit("data-available");
          this.emit("chunk", false);
          this._parsingDone.then(() => callback()).catch(callback);
        }
      });

      this._opts = opts;

      const io: ParseIO = {
        pull: (length: number) => this.pull(length),
        pullUntil: (pattern: Uint8Array, includeEof?: boolean) =>
          this.pullUntil(pattern, includeEof),
        stream: (length: number) => this.stream(length),
        streamUntilDataDescriptor: () => this._streamUntilDataDescriptor(),
        setDone: () => {
          this.push(null);
        }
      };

      const emitter: ParseEmitter = {
        emitEntry: (entry: ZipEntry) => {
          this.emit("entry", entry);
        },
        pushEntry: (entry: ZipEntry) => {
          this.push(entry);
        },
        // Browser version historically only pushed entries when forceStream=true.
        // Keep this behavior to avoid changing stream piping semantics.
        pushEntryIfPiped: (_entry: ZipEntry) => {
          return;
        },
        emitCrxHeader: (header: CrxHeader) => {
          this.crxHeader = header;
          this.emit("crx-header", header);
        },
        emitError: (err: Error) => {
          this.__emittedError = err;
          this.emit("error", err);
        },
        emitClose: () => {
          this.emit("close");
        }
      };

      queueMicrotask(() => {
        // NOTE: We intentionally do NOT pass inflateRawSync to runParseLoop in browser.
        // Browser's native DecompressionStream is faster than our pure-JS fallback,
        // so we always use the streaming path for decompression in browsers.
        this._parsingDone = runParseLoop(
          this._opts,
          io,
          emitter,
          () => createInflateRawFn(),
          this._driverState
          // No inflateRawSync - always use streaming DecompressionStream in browser
        );
        this._parsingDone.catch((e: Error) => {
          if (!this.__emittedError || this.__emittedError !== e) {
            this.__emittedError = e;
            this.emit("error", e);
          }
          this.emit("close");
        });
      });
    }

    private _handleWrite(chunk: Uint8Array): void {
      this._buffer.append(chunk);
      this._wakeUp();
      this.emit("data-available");
      this.emit("chunk");
    }

    get buffer(): Uint8Array {
      return this._buffer.view();
    }

    set buffer(value: Uint8Array) {
      this._buffer.reset(value);
    }

    private _maybeReleaseWriteCallback(): void {
      if (typeof this.cb === "function") {
        const callback = this.cb;
        this.cb = undefined;
        callback();
      }
    }

    private _wakeUp(): void {
      if (this._pendingResolve) {
        const resolve = this._pendingResolve;
        this._pendingResolve = undefined;
        resolve();
      }
    }

    private _waitForData(): Promise<void> {
      return new Promise(resolve => {
        this._pendingResolve = resolve;
      });
    }

    private async _pullInternal(length: number): Promise<Uint8Array> {
      if (length === 0) {
        return new Uint8Array(0);
      }

      while (this._buffer.length < length) {
        if (this.finished) {
          if (this._buffer.length > 0) {
            const data = this._buffer.read(this._buffer.length);
            return data;
          }
          throw new Error("FILE_ENDED");
        }
        await this._waitForData();
      }

      return this._buffer.read(length);
    }

    private async _pullUntilInternal(pattern: Uint8Array, includeEof = false): Promise<Uint8Array> {
      const chunks: Uint8Array[] = [];
      let searchFrom = 0;
      const overlap = Math.max(0, pattern.length - 1);

      while (true) {
        const view = this._buffer.view();
        const match = indexOfUint8ArrayPattern(view, pattern, searchFrom);

        if (match !== -1) {
          this.match = match;
          const toRead = match + (includeEof ? pattern.length : 0);
          if (toRead > 0) {
            chunks.push(this._buffer.read(toRead));
          }
          return concatUint8Arrays(chunks);
        }

        // No match yet. Avoid rescanning bytes that can't start a match.
        searchFrom = Math.max(searchFrom, Math.max(0, view.length - overlap));

        if (this.finished) {
          throw new Error("FILE_ENDED");
        }

        const safeLen = Math.max(0, this._buffer.length - pattern.length);
        if (safeLen > 0) {
          chunks.push(this._buffer.read(safeLen));
          searchFrom = Math.max(0, searchFrom - safeLen);
        }

        await this._waitForData();
      }
    }

    private _streamFixedLength(length: number): PassThrough {
      const output = new PassThrough();
      let remaining = length;
      let done = false;

      const pull = (): void => {
        if (done) {
          return;
        }

        while (remaining > 0 && this._buffer.length > 0) {
          const toRead = Math.min(remaining, this._buffer.length);
          const chunk = this._buffer.read(toRead);
          remaining -= toRead;
          output.write(chunk);
        }

        if (remaining === 0) {
          done = true;
          this.removeListener("data-available", pull);
          this._maybeReleaseWriteCallback();
          output.end();
        } else if (this.finished) {
          done = true;
          this.removeListener("data-available", pull);
          output.destroy(new Error("FILE_ENDED"));
        }
      };

      this.on("data-available", pull);
      queueMicrotask(() => pull());
      return output;
    }

    private _streamUntilPattern(pattern: Uint8Array, includeEof = false): PassThrough {
      const output = new PassThrough();
      let done = false;
      let searchFrom = 0;
      const overlap = Math.max(0, pattern.length - 1);

      const pull = (): void => {
        if (done) {
          return;
        }

        const view = this._buffer.view();
        const match = indexOfUint8ArrayPattern(view, pattern, searchFrom);

        if (match !== -1) {
          this.match = match;
          const endIndex = includeEof ? match + pattern.length : match;
          if (endIndex > 0) {
            output.write(this._buffer.read(endIndex));
          }
          done = true;
          this.removeListener("data-available", pull);
          this._maybeReleaseWriteCallback();
          output.end();
          return;
        }

        // No match yet. Avoid rescanning bytes that can't start a match.
        searchFrom = Math.max(searchFrom, Math.max(0, view.length - overlap));

        if (this.finished) {
          done = true;
          this.removeListener("data-available", pull);
          this._maybeReleaseWriteCallback();
          output.destroy(new Error("FILE_ENDED"));
          return;
        }

        const safeLen = Math.max(0, this._buffer.length - pattern.length);
        if (safeLen > 0) {
          output.write(this._buffer.read(safeLen));
          searchFrom = Math.max(0, searchFrom - safeLen);
          this._maybeReleaseWriteCallback();
        }
      };

      this.on("data-available", pull);
      queueMicrotask(() => pull());
      return output;
    }

    stream(eof: number | Uint8Array, includeEof?: boolean): PassThrough {
      if (typeof eof === "number") {
        return this._streamFixedLength(eof);
      }
      return this._streamUntilPattern(eof, includeEof ?? false);
    }

    pull(eof: number | Uint8Array, includeEof?: boolean): Promise<Uint8Array> {
      if (eof === 0) {
        return Promise.resolve(new Uint8Array(0));
      }

      if (typeof eof === "number") {
        // Node-compatible behavior: if finished and not enough bytes, reject.
        if (this.finished && this._buffer.length < eof) {
          return Promise.reject(new Error("FILE_ENDED"));
        }
        if (this._buffer.length >= eof) {
          const data = this._buffer.read(eof);
          if (this._buffer.length === 0) {
            this._maybeReleaseWriteCallback();
          }
          return Promise.resolve(data);
        }
        return this._pullInternal(eof);
      }

      // Pattern mode
      if (this.finished) {
        return Promise.reject(new Error("FILE_ENDED"));
      }
      return this._pullUntilInternal(eof, includeEof ?? false);
    }

    pullUntil(pattern: Uint8Array, includeEof?: boolean): Promise<Uint8Array> {
      return this.pull(pattern, includeEof);
    }

    private _streamUntilDataDescriptor(): PassThrough {
      return streamUntilValidatedDataDescriptor({
        source: {
          getView: () => this._buffer.view(),
          getLength: () => this._buffer.length,
          read: (length: number) => this._buffer.read(length),
          isFinished: () => this.finished,
          onDataAvailable: (cb: () => void) => {
            this.on("data-available", cb);
            return () => this.removeListener("data-available", cb);
          }
        },
        dataDescriptorSignature
      });
    }

    promise(): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        this.on("finish", resolve);
        this.on("end", resolve);
        this.on("error", reject);
      });
    }
  };
}

const BaseParse = createParseClass(createInflateRaw);

export class Parse extends BaseParse {}

export function createParse(opts?: ParseOptions): ParseStream {
  return new Parse(opts);
}
