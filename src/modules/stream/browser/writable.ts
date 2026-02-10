/**
 * Browser Stream - Writable
 */

import type { WritableStreamOptions, WritableLike } from "@stream/types";
import { EventEmitter } from "@utils/event-emitter";

import type { Writable as NodeWritable } from "stream";

// =============================================================================
// Writable Stream Wrapper
// =============================================================================

/**
 * Extended Writable options that match Node.js API
 */
export interface WritableOptions<T = Uint8Array> extends WritableStreamOptions {
  stream?: WritableStream<T>;
  autoDestroy?: boolean;
  emitClose?: boolean;
  defaultEncoding?: string;
  write?: (
    this: Writable<T>,
    chunk: T,
    encoding: string,
    callback: (error?: Error | null) => void
  ) => void;
  final?: (this: Writable<T>, callback: (error?: Error | null) => void) => void;
}

/**
 * A wrapper around Web WritableStream that provides Node.js-like API
 */
export class Writable<T = Uint8Array> extends EventEmitter {
  private _stream: WritableStream<T>;
  private _writer: WritableStreamDefaultWriter<T> | null = null;
  private _ended: boolean = false;
  private _finished: boolean = false;
  private _destroyed: boolean = false;
  private _errored: Error | null = null;
  private _closed: boolean = false;
  private _pendingWrites: number = 0;
  private _writableLength: number = 0;
  private _needDrain: boolean = false;
  private _corked: number = 0;
  private _corkedChunks: Array<{ chunk: T; callback?: (error?: Error | null) => void }> = [];
  private _defaultEncoding: string = "utf8";
  private _aborted: boolean = false;
  private _ownsStream: boolean = false;
  // User-provided write function (Node.js compatibility)
  private _writeFunc?: (
    chunk: T,
    encoding: string,
    callback: (error?: Error | null) => void
  ) => void;
  // User-provided final function (Node.js compatibility)
  private _finalFunc?: (callback: (error?: Error | null) => void) => void;
  readonly objectMode: boolean;
  readonly writableHighWaterMark: number;
  readonly autoDestroy: boolean;
  readonly emitClose: boolean;

  constructor(options?: WritableOptions<T>) {
    super();
    this.objectMode = options?.objectMode ?? false;
    this.writableHighWaterMark = options?.highWaterMark ?? 16384;
    this.autoDestroy = options?.autoDestroy ?? true;
    this.emitClose = options?.emitClose ?? true;
    this._defaultEncoding = options?.defaultEncoding ?? "utf8";

    // Store user-provided write function
    if (options?.write) {
      this._writeFunc = options.write.bind(this);
    }
    // Store user-provided final function
    if (options?.final) {
      this._finalFunc = options.final.bind(this);
    }

    if (options?.stream) {
      this._stream = options.stream;
      this._ownsStream = false;
    } else {
      this._ownsStream = true;
      // Create bound references to instance properties/methods for use in WritableStream callbacks
      const getWriteFunc = (): typeof this._writeFunc => this._writeFunc;
      const getFinalFunc = (): typeof this._finalFunc => this._finalFunc;
      const getDefaultEncoding = (): string => this._defaultEncoding;
      const setFinished = (value: boolean): void => {
        this._finished = value;
      };
      const setAborted = (value: boolean): void => {
        this._aborted = value;
      };
      const emitEvent = this.emit.bind(this);
      const getEmitClose = (): boolean => this.emitClose;
      const callWrite = (chunk: T): any => (this as any)._write?.(chunk);

      this._stream = new WritableStream<T>({
        write: async chunk => {
          // Use user-provided write function or default behavior
          const writeFunc = getWriteFunc();
          if (writeFunc) {
            await new Promise<void>((resolve, reject) => {
              writeFunc(chunk, getDefaultEncoding(), err => {
                if (err) {
                  reject(err);
                } else {
                  resolve();
                }
              });
            });
          } else {
            // Override this in subclasses
            callWrite(chunk);
          }
        },
        close: async () => {
          // Call final function if provided
          const finalFunc = getFinalFunc();
          if (finalFunc) {
            await new Promise<void>((resolve, reject) => {
              finalFunc(err => {
                if (err) {
                  reject(err);
                } else {
                  resolve();
                }
              });
            });
          }
          setFinished(true);
          emitEvent("finish");
          if (getEmitClose()) {
            emitEvent("close");
          }
        },
        abort: reason => {
          setAborted(true);
          emitEvent("error", reason);
        }
      });
    }
  }

  /**
   * Set default encoding for string writes
   */
  setDefaultEncoding(encoding: string): this {
    this._defaultEncoding = encoding;
    return this;
  }

  /**
   * Buffer writes until uncork() is called
   */
  cork(): void {
    this._corked++;
  }

  /**
   * Flush buffered writes from cork()
   */
  uncork(): void {
    if (this._corked > 0) {
      this._corked--;
    }

    if (this._corked === 0) {
      // Flush all corked chunks
      const chunks = this._corkedChunks;
      this._corkedChunks = [];
      for (const { chunk, callback } of chunks) {
        this._doWrite(chunk, callback);
      }
    }
  }

  /**
   * Write data to the stream
   */
  write(chunk: T, callback?: (error?: Error | null) => void): boolean;
  write(chunk: T, encoding?: string, callback?: (error?: Error | null) => void): boolean;
  write(
    chunk: T,
    encodingOrCallback?: string | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void
  ): boolean {
    if (this._destroyed || this._ended) {
      const err = new Error("Cannot write after stream destroyed/ended");
      const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
      cb?.(err);
      return false;
    }

    const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;

    // If corked, buffer the write
    if (this._corked > 0) {
      this._corkedChunks.push({ chunk, callback: cb });
      const chunkSize = this._getChunkSize(chunk);
      this._writableLength += chunkSize;
      return this._writableLength < this.writableHighWaterMark;
    }

    const ok = this._doWrite(chunk, cb);
    if (!ok) {
      this._needDrain = true;
    }
    return ok;
  }

  private _doWrite(chunk: T, callback?: (error?: Error | null) => void): boolean {
    // Track pending writes for writableLength
    const chunkSize = this._getChunkSize(chunk);
    this._pendingWrites++;
    this._writableLength += chunkSize;
    const writer = this._getWriter();
    writer
      .write(chunk)
      .then(() => {
        this._pendingWrites--;
        this._writableLength -= chunkSize;
        if (this._needDrain && this._writableLength < this.writableHighWaterMark) {
          this._needDrain = false;
          this.emit("drain");
        }
        callback?.(null);
      })
      .catch(err => {
        this._pendingWrites--;
        this._writableLength -= chunkSize;
        // Avoid double-emitting if we're already in an errored/destroyed state.
        if (!this._destroyed) {
          this._errored = err;
          this.emit("error", err);
        }
        callback?.(err);
      });

    // Return false if we've exceeded high water mark (for backpressure)
    return this._writableLength < this.writableHighWaterMark;
  }

  private _getChunkSize(chunk: T): number {
    if (this.objectMode) {
      return 1;
    }
    if (chunk instanceof Uint8Array) {
      return chunk.byteLength;
    }
    if (typeof chunk === "string") {
      return chunk.length;
    }
    return 0;
  }

  /**
   * End the stream
   */
  end(callback?: () => void): this;
  end(chunk: T, callback?: () => void): this;
  end(chunk: T, encoding?: string, callback?: () => void): this;
  end(
    chunkOrCallback?: T | (() => void),
    encodingOrCallback?: string | (() => void),
    callback?: () => void
  ): this {
    if (this._ended) {
      return this;
    }

    this._ended = true;

    const chunk = typeof chunkOrCallback !== "function" ? chunkOrCallback : undefined;
    const cb: (() => void) | undefined =
      typeof chunkOrCallback === "function"
        ? (chunkOrCallback as () => void)
        : typeof encodingOrCallback === "function"
          ? (encodingOrCallback as () => void)
          : callback;

    const finish = async (): Promise<void> => {
      try {
        const writer = this._getWriter();
        if (chunk !== undefined) {
          await writer.write(chunk);
        }
        await writer.close();

        if (this._writer === writer) {
          this._writer = null;
          try {
            writer.releaseLock();
          } catch {
            // Ignore
          }
        }

        // If we own the underlying Web WritableStream, its `close()` handler already
        // emits finish/close. For external streams, we must emit finish ourselves.
        if (!this._ownsStream) {
          this._finished = true;
          this.emit("finish");
          if (this.emitClose) {
            this.emit("close");
          }
        }
        if (cb) {
          cb();
        }
      } catch (err) {
        this.emit("error", err);
      }
    };

    finish();
    return this;
  }

  /**
   * Destroy the stream
   */
  destroy(error?: Error): this {
    if (this._destroyed) {
      return this;
    }

    this._destroyed = true;
    this._ended = true;

    if (error && !this._errored) {
      this._errored = error;
      this.emit("error", error);
    }

    if (this._writer) {
      const writer = this._writer;
      this._writer = null;
      writer
        .abort(error)
        .catch(() => {})
        .finally(() => {
          try {
            writer.releaseLock();
          } catch {
            // Ignore
          }
        });
    }

    this._closed = true;
    this.emit("close");
    return this;
  }

  /**
   * Get the underlying Web WritableStream
   */
  get webStream(): WritableStream<T> {
    return this._stream;
  }

  get writable(): boolean {
    return !this._destroyed && !this._ended;
  }

  get writableEnded(): boolean {
    return this._ended;
  }

  get writableFinished(): boolean {
    return this._finished;
  }

  get writableLength(): number {
    return this._writableLength;
  }

  /** Whether the stream has been destroyed */
  get destroyed(): boolean {
    return this._destroyed;
  }

  /** The error that destroyed the stream, or null */
  get errored(): Error | null {
    return this._errored;
  }

  /** Whether the stream has been closed */
  get closed(): boolean {
    return this._closed;
  }

  /** Whether the stream needs drain (writableLength exceeds high water mark) */
  get writableNeedDrain(): boolean {
    return this._writableLength >= this.writableHighWaterMark;
  }

  /** How many times cork() has been called without uncork() */
  get writableCorked(): number {
    return this._corked;
  }

  /** Whether the stream was aborted */
  get writableAborted(): boolean {
    return this._aborted;
  }

  /** Whether the stream is in object mode */
  get writableObjectMode(): boolean {
    return this.objectMode;
  }

  /** Get default encoding */
  get defaultEncoding(): string {
    return this._defaultEncoding;
  }

  /**
   * Get the internal buffer state (for debugging)
   * Returns array of objects with length and chunk info
   */
  get writableBuffer(): { length: number; head: T | null } {
    return {
      length: this._corkedChunks.length,
      head: this._corkedChunks.length > 0 ? this._corkedChunks[0].chunk : null
    };
  }

  /**
   * Write multiple chunks at once (batch write).
   * Override in subclass to implement custom batch write logic.
   */
  _writev(
    chunks: Array<{ chunk: T; encoding?: string }>,
    callback: (error?: Error | null) => void
  ): void {
    // Default implementation: write each chunk individually
    let i = 0;
    const writeNext = (): void => {
      if (i >= chunks.length) {
        callback(null);
        return;
      }

      const { chunk } = chunks[i++];
      this._doWrite(chunk, err => {
        if (err) {
          callback(err);
          return;
        }
        // Continue to next chunk
        writeNext();
      });
    };

    writeNext();
  }

  /**
   * Batch write multiple chunks
   */
  writev(
    chunks: Array<{ chunk: T; encoding?: string }>,
    callback?: (error?: Error | null) => void
  ): boolean {
    if (this._destroyed || this._ended) {
      const err = new Error("Cannot write after stream destroyed/ended");
      callback?.(err);
      return false;
    }

    this._writev(chunks, callback ?? (() => {}));

    // Return backpressure indicator
    return this._writableLength < this.writableHighWaterMark;
  }

  private _getWriter(): WritableStreamDefaultWriter<T> {
    if (!this._writer) {
      this._writer = this._stream.getWriter();
    }
    return this._writer;
  }

  // =========================================================================
  // Static Methods (Node.js compatibility)
  // =========================================================================

  /**
   * Convert a Web WritableStream to Node.js Writable
   */
  static fromWeb<T>(webStream: WritableStream<T>, options?: WritableStreamOptions): Writable<T> {
    return new Writable<T>({ ...options, stream: webStream });
  }

  /**
   * Convert a Node.js Writable to Web WritableStream
   */
  static toWeb<T>(nodeStream: Writable<T>): WritableStream<T> {
    return nodeStream.webStream;
  }
}

// =============================================================================
// Cross-environment stream normalization
// =============================================================================

/**
 * Normalize a user-provided writable into this module's Writable.
 * Keeps Web/Node branching at the stream-module boundary.
 */
export function toWritable<T = Uint8Array>(
  stream: WritableLike | WritableStream<T> | NodeWritable
): WritableLike {
  if (stream instanceof Writable) {
    return stream;
  }

  // Web WritableStream
  if ((stream as any)?.getWriter) {
    return new Writable<T>({ stream: stream as WritableStream<T> });
  }

  // Already a Node-like writable (e.g. StreamBuf)
  return stream as WritableLike;
}
