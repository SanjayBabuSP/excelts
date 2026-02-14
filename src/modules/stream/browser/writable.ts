/**
 * Browser Stream - Writable
 */

import type { WritableStreamOptions, WritableLike } from "@stream/types";
import { EventEmitter } from "@utils/event-emitter";
import { parseEndArgs } from "@stream/common/end-args";
import { StreamStateError } from "@stream/errors";
import { getDefaultHighWaterMark } from "@stream/common/utils";

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
  private _stream: WritableStream<T> | null = null;
  private _writer: WritableStreamDefaultWriter<T> | null = null;
  private _ended: boolean = false;
  private _finished: boolean = false;
  private _destroyed: boolean = false;
  private _errored: Error | null = null;
  private _closed: boolean = false;
  private _writableLength: number = 0;
  private _needDrain: boolean = false;
  private _corked: number = 0;
  private _corkedChunks: Array<{ chunk: T; callback?: (error?: Error | null) => void }> = [];
  private _defaultEncoding: string = "utf8";
  private _ownsStream: boolean = false;
  /** When true, _doWrite calls _writeFunc directly (no Web WritableStream). */
  private _directWrite: boolean = false;
  /**
   * Write queue for direct-write mode.  When a _writeFunc callback is pending
   * (async), subsequent writes are buffered here and drained one-at-a-time,
   * matching Node.js Writable semantics.
   */
  private _writeQueue: Array<{
    chunk: T;
    chunkSize: number;
    callback?: (error?: Error | null) => void;
  }> = [];
  /** Whether a _writeFunc call is currently in-flight (callback not yet invoked). */
  private _writing: boolean = false;
  /** Pending end() operation waiting for the write queue to drain. */
  private _pendingEnd: { cb?: () => void } | null = null;
  // User-provided write function (Node.js compatibility)
  private _writeFunc?: (
    chunk: T,
    encoding: string,
    callback: (error?: Error | null) => void
  ) => void;
  // User-provided final function (Node.js compatibility)
  private _finalFunc?: (callback: (error?: Error | null) => void) => void;
  private _objectMode: boolean;
  private _highWaterMark: number;
  private _autoDestroy: boolean;
  private _emitClose: boolean;

  constructor(options?: WritableOptions<T>) {
    super();
    this._objectMode = options?.objectMode ?? false;
    this._highWaterMark = options?.highWaterMark ?? getDefaultHighWaterMark(this._objectMode);
    this._autoDestroy = options?.autoDestroy ?? true;
    this._emitClose = options?.emitClose ?? true;
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
      this._directWrite = false;
    } else {
      this._ownsStream = true;

      // When we own the stream AND have a user-provided _writeFunc, we bypass
      // Web WritableStream entirely and call _writeFunc directly with a
      // Node.js-style write queue.  This ensures:
      //  - Synchronous callbacks execute synchronously (fixes cork/uncork, write-during-data)
      //  - Async callbacks are properly serialized (fixes Transform async pipeline)
      //  - end()/final waits for all in-flight writes (fixes premature end)
      if (this._writeFunc) {
        this._directWrite = true;
        this._stream = null;
      } else {
        this._directWrite = false;
        this._stream = new WritableStream<T>({
          write: async chunk => {
            // Subclass _write path (no user-provided _writeFunc)
            (this as any)._write?.(chunk);
          },
          close: async () => {
            this._finished = true;
            this.emit("finish");
            if (this._emitClose) {
              this.emit("close");
            }
          },
          abort: reason => {
            this.emit("error", reason);
          }
        });
      }
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
      // Flush all corked chunks.
      // Reset _writableLength for corked chunks first — _doWrite will re-add
      // each chunk's size, so we must subtract the corked total to avoid
      // double-counting (write() already added the size when buffering).
      const chunks = this._corkedChunks;
      this._corkedChunks = [];
      for (const { chunk } of chunks) {
        this._writableLength -= this._getChunkSize(chunk);
      }
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
      return this._writableLength < this._highWaterMark;
    }

    const ok = this._doWrite(chunk, cb);
    if (!ok) {
      this._needDrain = true;
    }
    return ok;
  }

  private _doWrite(chunk: T, callback?: (error?: Error | null) => void): boolean {
    const chunkSize = this._getChunkSize(chunk);
    this._writableLength += chunkSize;

    if (this._directWrite) {
      // Direct-write path: call _writeFunc directly, with Node.js-style
      // serialization — only one _writeFunc is in-flight at a time.
      if (this._writing) {
        // Queue the write for later — will be drained when the current
        // _writeFunc callback fires.
        this._writeQueue.push({ chunk, chunkSize, callback });
      } else {
        this._writing = true;
        this._callWriteFunc(chunk, chunkSize, callback);
      }
    } else {
      // Async path: use Web WritableStream (external stream or subclass _write)
      const writer = this._getWriter();
      writer
        .write(chunk)
        .then(() => {
          this._writableLength -= chunkSize;
          if (this._needDrain && this._writableLength < this._highWaterMark) {
            this._needDrain = false;
            this.emit("drain");
          }
          callback?.(null);
        })
        .catch(err => {
          this._writableLength -= chunkSize;
          if (!this._destroyed) {
            this._errored = err;
            this.emit("error", err);
          }
          callback?.(err);
        });
    }

    // Return false if we've exceeded high water mark (for backpressure)
    return this._writableLength < this._highWaterMark;
  }

  /**
   * Call _writeFunc for a single chunk. When the callback fires (sync or async),
   * drain the next entry from _writeQueue, or run the pending end() if the
   * queue is empty.
   */
  private _callWriteFunc(
    chunk: T,
    chunkSize: number,
    callback?: (error?: Error | null) => void
  ): void {
    try {
      this._writeFunc!(chunk, this._defaultEncoding, err => {
        if (err) {
          this._writableLength -= chunkSize;
          if (!this._destroyed) {
            this._errored = err;
            this.emit("error", err);
          }
          callback?.(err);
          // On error, drain remaining queued writes with the error and
          // don't process pending end.
          this._writing = false;
          this._flushWriteQueueOnError(err);
          return;
        }

        this._writableLength -= chunkSize;
        if (this._needDrain && this._writableLength < this._highWaterMark) {
          this._needDrain = false;
          this.emit("drain");
        }
        callback?.(null);

        // Drain next queued write, or finalize if end() is pending.
        this._drainWriteQueue();
      });
    } catch (err) {
      this._writableLength -= chunkSize;
      const error = err instanceof Error ? err : new Error(String(err));
      if (!this._destroyed) {
        this._errored = error;
        this.emit("error", error);
      }
      callback?.(error);
      this._writing = false;
      this._flushWriteQueueOnError(error);
    }
  }

  /** Process the next queued write, or run pending end(). */
  private _drainWriteQueue(): void {
    const next = this._writeQueue.shift();
    if (next) {
      this._callWriteFunc(next.chunk, next.chunkSize, next.callback);
    } else {
      this._writing = false;
      // If end() was called while writes were in-flight, finalize now.
      if (this._pendingEnd) {
        const { cb } = this._pendingEnd;
        this._pendingEnd = null;
        this._doFinish(cb);
      }
    }
  }

  /** Discard queued writes after an error. */
  private _flushWriteQueueOnError(err: Error): void {
    const queue = this._writeQueue;
    this._writeQueue = [];
    for (const entry of queue) {
      this._writableLength -= entry.chunkSize;
      entry.callback?.(err);
    }
  }

  /**
   * Run _finalFunc and emit finish/close.
   * Events are deferred via queueMicrotask to match Node.js process.nextTick
   * behavior, so listeners registered after end() can still receive them.
   */
  private _doFinish(cb?: () => void): void {
    if (this._finalFunc) {
      this._finalFunc(err => {
        if (err) {
          this.emit("error", err);
          return;
        }
        this._finished = true;
        queueMicrotask(() => {
          this.emit("finish");
          this._closed = true;
          if (this._emitClose) {
            this.emit("close");
          }
          cb?.();
        });
      });
    } else {
      this._finished = true;
      queueMicrotask(() => {
        this.emit("finish");
        this._closed = true;
        if (this._emitClose) {
          this.emit("close");
        }
        cb?.();
      });
    }
  }

  private _getChunkSize(chunk: T): number {
    if (this._objectMode) {
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

    const { chunk, cb } = parseEndArgs<T>(chunkOrCallback, encodingOrCallback, callback);

    if (this._directWrite) {
      // Direct-write path: enqueue final chunk (if any), then wait for the
      // write queue to drain before running _finalFunc + emitting finish.
      if (chunk !== undefined) {
        this._doWrite(chunk);
      }

      // If writes are still in-flight or queued, defer finalization.
      if (this._writing || this._writeQueue.length > 0) {
        this._pendingEnd = { cb };
      } else {
        this._doFinish(cb);
      }
      return this;
    }

    // Async end path — uses Web WritableStream.
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
          if (this._emitClose) {
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

    // Set state synchronously (matches Node.js), defer event emission via queueMicrotask
    // to match Node.js process.nextTick behavior
    if (error && !this._errored) {
      this._errored = error;
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

    queueMicrotask(() => {
      if (error && this._errored === error) {
        this.emit("error", error);
      }
      this.emit("close");
    });
    return this;
  }

  /**
   * Get the underlying Web WritableStream (internal).
   * @internal
   */
  private get _webStream(): WritableStream<T> {
    if (!this._stream) {
      // Lazily create a Web WritableStream for sync-write Writables that need interop.
      this._stream = new WritableStream<T>({
        write: chunk =>
          new Promise<void>((resolve, reject) => {
            this._writeFunc!(chunk, this._defaultEncoding, err => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          }),
        close: async () => {
          if (this._finalFunc) {
            await new Promise<void>((resolve, reject) => {
              this._finalFunc!(err => {
                if (err) {
                  reject(err);
                } else {
                  resolve();
                }
              });
            });
          }
        },
        abort: reason => {
          this.emit("error", reason);
        }
      });
    }
    return this._stream;
  }

  get writable(): boolean {
    return !this._destroyed && !this._ended;
  }

  set writable(val: boolean) {
    if (!val) {
      this._ended = true;
    }
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

  set destroyed(val: boolean) {
    this._destroyed = val;
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
    return this._writableLength >= this._highWaterMark;
  }

  /** How many times cork() has been called without uncork() */
  get writableCorked(): number {
    return this._corked;
  }

  /** Whether the stream was destroyed before finishing */
  get writableAborted(): boolean {
    return this._destroyed && !this._finished;
  }

  /** Whether the stream is in object mode */
  get writableObjectMode(): boolean {
    return this._objectMode;
  }

  get writableHighWaterMark(): number {
    return this._highWaterMark;
  }

  /**
   * Get the internal buffer contents as an array (matches Node.js behavior)
   */
  get writableBuffer(): T[] {
    return this._corkedChunks.map(entry => entry.chunk);
  }

  /**
   * Pipe is not supported on Writable streams (matches Node.js behavior).
   * Node's Writable inherits pipe() from Stream, but it always throws.
   */
  pipe(): never {
    const err = new StreamStateError("pipe", "not readable");
    this.emit("error", err);
    throw err;
  }

  private _getWriter(): WritableStreamDefaultWriter<T> {
    if (!this._writer) {
      this._writer = this._webStream.getWriter();
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
    return nodeStream._webStream;
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
