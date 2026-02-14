/**
 * Browser Stream - Readable
 */

import type { ReadableStreamOptions, WritableLike } from "@stream/types";
import { EventEmitter } from "@utils/event-emitter";
import { getTextDecoder } from "@utils/binary";
import { getDefaultHighWaterMark } from "@stream/common/utils";

import type { Writable } from "./writable";
import type { Transform } from "./transform";
import type { Duplex } from "./duplex";
import { ChunkBuffer } from "./chunk-buffer";
import { PipeManager } from "./pipe-manager";

// =============================================================================
// Readable Stream Wrapper
// =============================================================================

/**
 * A wrapper around Web ReadableStream that provides Node.js-like API
 */
export class Readable<T = Uint8Array> extends EventEmitter {
  private _stream: ReadableStream<T> | null;
  private _reader: ReadableStreamDefaultReader<T> | null = null;
  private _buf!: ChunkBuffer<T>;
  private _reading: boolean = false;
  private _ended: boolean = false;
  private _endEmitted: boolean = false;
  private _destroyed: boolean = false;
  private _errored: Error | null = null;
  private _closed: boolean = false;
  private _paused: boolean = false;
  private _flowing: boolean = false;
  private _hasFlowed: boolean = false;
  private _pipes!: PipeManager<T>;
  private _encoding: string | null = null;
  private _decoder: TextDecoder | null = null;
  private _didRead: boolean = false;
  // Whether this stream uses push() mode (true) or Web Stream mode (false)
  private _pushMode: boolean = false;
  // Whether this stream was created from an external Web Stream (true) or is controllable (false)
  private _webStreamMode: boolean = false;
  readonly objectMode: boolean;
  readonly readableHighWaterMark: number;
  readonly autoDestroy: boolean;
  readonly emitClose: boolean;
  // User-provided read function (Node.js compatibility)
  private _read?: (size?: number) => void;

  constructor(
    options?: ReadableStreamOptions & {
      stream?: ReadableStream<T>;
      autoDestroy?: boolean;
      emitClose?: boolean;
      read?: (this: Readable<T>, size?: number) => void;
    }
  ) {
    super();
    this.objectMode = options?.objectMode ?? false;
    this.readableHighWaterMark = options?.highWaterMark ?? getDefaultHighWaterMark(this.objectMode);
    this._buf = new ChunkBuffer<T>(this.objectMode);
    this._pipes = new PipeManager<T>(this);
    this.autoDestroy = options?.autoDestroy ?? true;
    this.emitClose = options?.emitClose ?? true;

    // Store user-provided read function
    if (options?.read) {
      this._read = options.read.bind(this);
      this._pushMode = true; // User will call push()
    }

    if (options?.stream) {
      this._stream = options.stream;
      this._webStreamMode = true; // Created from external Web Stream
    } else {
      // Controllable stream - no need to eagerly create a Web ReadableStream.
      // The webStream getter will create one lazily when accessed.
      this._stream = null;
    }
  }

  /**
   * Create a Readable from an iterable (static factory method)
   */
  static from<T>(
    iterable: Iterable<T> | AsyncIterable<T>,
    options?: ReadableStreamOptions
  ): Readable<T> {
    const readable = new Readable<T>({ ...options, objectMode: options?.objectMode ?? true });

    // Node.js treats strings as a single chunk, not as Iterable<char>.
    // Match that behavior by wrapping strings in an array.
    const source =
      typeof iterable === "string"
        ? toAsyncIterable([iterable] as Iterable<T>)
        : toAsyncIterable(iterable);
    pumpAsyncIterableToReadable(readable, source);

    return readable;
  }

  /**
   * Check if a stream has been disturbed (read from)
   */
  static isDisturbed(stream: Readable<any>): boolean {
    return stream._didRead || stream._ended || stream._destroyed;
  }

  /**
   * Convert a Web ReadableStream to Node.js Readable
   */
  static fromWeb<T>(webStream: ReadableStream<T>, options?: ReadableStreamOptions): Readable<T> {
    return new Readable<T>({ ...options, stream: webStream });
  }

  /**
   * Convert a Node.js Readable to Web ReadableStream
   */
  static toWeb<T>(nodeStream: Readable<T>): ReadableStream<T> {
    return nodeStream._webStream;
  }

  /**
   * Push data to the stream (when using controllable stream)
   */
  push(chunk: T | null): boolean {
    if (this._destroyed) {
      return false;
    }

    // Mark as push mode when push() is called
    this._pushMode = true;

    if (chunk === null) {
      // Prevent duplicate end handling
      if (this._ended) {
        return false;
      }
      this._ended = true;

      // Emit 'end' only after buffered data is fully drained.
      // This avoids premature 'end' when producers push null while paused.
      if (this._buf.length === 0) {
        this._emitEndOnce();
      }
      // Note: Don't call destroy() here, let the stream be consumed naturally
      // The reader will return done:true when it finishes reading
      return false;
    }

    if (this._flowing) {
      // In flowing mode, emit data directly without buffering
      this.emit("data", this._applyEncoding(chunk));
      // Check if stream was paused during emit (backpressure from consumer)
      if (!this._flowing) {
        return false;
      }
      // After emitting data, call _read again if available (Node.js behavior)
      if (this._read && !this._ended) {
        queueMicrotask(() => {
          if (this._flowing && !this._ended && !this._destroyed) {
            this._read!(this.readableHighWaterMark);
          }
        });
      }
      // In flowing mode, return true (no backpressure since data is immediately consumed)
      return true;
    } else {
      // In paused mode, buffer for later
      const wasEmpty = this._buf.length === 0;
      this._buf.push(chunk);

      // Emit readable event when buffer goes from empty to having data
      if (wasEmpty) {
        queueMicrotask(() => this.emit("readable"));
      }
      // Return false if buffer exceeds high water mark (backpressure signal)
      // Fast path for object mode - just count items
      if (this.objectMode) {
        return this._buf.length < this.readableHighWaterMark;
      }
      // For binary mode, use tracked buffer size (O(1))
      return this._buf.byteSize < this.readableHighWaterMark;
    }
  }

  private _emitEndOnce(): void {
    if (this._endEmitted) {
      return;
    }
    this._endEmitted = true;
    this.emit("end");

    // Match Node.js autoDestroy behavior: automatically destroy after end
    if (this.autoDestroy) {
      this.destroy();
    }
  }

  /**
   * Put a chunk back at the front of the buffer
   */
  unshift(chunk: T): void {
    if (this._destroyed) {
      return;
    }
    this._buf.unshift(chunk);
  }

  /**
   * Read data from the stream
   */
  read(_size?: number): T | null {
    this._didRead = true;

    if (this._buf.length > 0) {
      const chunk = this._buf.shift();
      const decoded = this._applyEncoding(chunk);
      if (this._ended && this._buf.length === 0) {
        queueMicrotask(() => this._emitEndOnce());
      }
      return decoded;
    }
    return null;
  }

  /**
   * Set encoding for string output
   */
  setEncoding(encoding: string): this {
    this._encoding = encoding;
    // Fast path: reuse cached utf-8 decoder; otherwise lazy-create on first decode.
    if (encoding === "utf-8" || encoding === "utf8") {
      this._decoder = getTextDecoder("utf-8");
    } else {
      this._decoder = null;
    }
    return this;
  }

  private _applyEncoding(chunk: T): T {
    if (this._encoding && chunk instanceof Uint8Array) {
      // Use cached decoder instances (module-level for utf-8, cached per encoding otherwise).
      if (!this._decoder) {
        this._decoder = getTextDecoder(this._encoding);
      }
      return this._decoder.decode(chunk) as any;
    }
    return chunk;
  }

  /**
   * Wrap an old-style stream
   */
  wrap(stream: any): this {
    stream.on("data", (chunk: T) => {
      if (!this.push(chunk)) {
        stream.pause();
      }
    });
    stream.on("end", () => this.push(null));
    stream.on("error", (err: Error) => this.destroy(err));
    stream.on("close", () => this.destroy());
    return this;
  }

  /**
   * Pause the stream
   */
  pause(): this {
    if (this._flowing) {
      this._paused = true;
      this._flowing = false;
      this.emit("pause");
    }
    return this;
  }

  /**
   * Resume the stream
   */
  resume(): this {
    if (!this._flowing) {
      const wasPaused = this._paused;
      this._paused = false;
      this._flowing = true;
      this._hasFlowed = true;

      if (wasPaused) {
        // Emit asynchronously to match Node.js process.nextTick timing
        queueMicrotask(() => this.emit("resume"));
      }
    }

    // Emit any buffered data first
    while (this._buf.length > 0 && this._flowing) {
      const chunk = this._buf.shift();
      this.emit("data", this._applyEncoding(chunk));
    }

    // If already ended, emit end event
    if (this._ended && this._buf.length === 0) {
      this._emitEndOnce();
    } else if (this._read) {
      // Call user-provided read function asynchronously
      // This allows multiple pipe() calls to register before data flows
      queueMicrotask(() => {
        if (this._flowing && !this._ended && !this._destroyed) {
          this._read!(this.readableHighWaterMark);
        }
      });
    } else if (this._webStreamMode && !this._pushMode) {
      // Only start reading from underlying Web Stream if:
      // 1. Stream was created from external Web Stream (_webStreamMode)
      // 2. Not in push mode (no one called push() yet)
      this._startReading();
    }

    return this;
  }

  /**
   * Override on() to automatically resume when 'data' listener is added
   * This matches Node.js behavior where adding a 'data' listener puts
   * the stream into flowing mode.
   */
  override on(event: string | symbol, listener: (...args: any[]) => void): this {
    super.on(event, listener);

    // When a 'data' listener is added, switch to flowing mode
    if (event === "data") {
      this.resume();
    }

    return this;
  }

  /**
   * Check if paused
   */
  isPaused(): boolean {
    return this._paused;
  }

  /**
   * Pipe to a writable stream, transform stream, or duplex stream
   */
  pipe<W extends Writable<T> | Transform<T, any> | Duplex<any, T>>(destination: W): W {
    return this._pipes.pipe(destination) as W;
  }

  /**
   * Unpipe from destination
   */
  unpipe(destination?: WritableLike): this {
    this._pipes.unpipe(destination);
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

    // Ensure we detach from destinations to avoid leaking listeners.
    this.unpipe();

    if (this._reader) {
      const reader = this._reader;
      this._reader = null;
      reader
        .cancel()
        .catch(() => {})
        .finally(() => {
          try {
            reader.releaseLock();
          } catch {
            // Ignore if a read is still pending
          }
        });
    }

    // Set state synchronously (matches Node.js), defer event emission via queueMicrotask
    // to match Node.js process.nextTick behavior
    if (error) {
      this._errored = error;
    }
    this._closed = true;

    queueMicrotask(() => {
      if (error) {
        this.emit("error", error);
      }
      this.emit("close");
    });
    return this;
  }

  /**
   * Get a Web ReadableStream view of this stream (internal).
   *
   * For external Web Streams (_webStreamMode), returns the original stream.
   * For controllable streams, creates a ReadableStream that mirrors data/end/error events.
   * @internal
   */
  private get _webStream(): ReadableStream<T> {
    if (this._stream) {
      return this._stream;
    }

    // Create a Web ReadableStream that forwards data from Node-side events.
    // Cache it on `_stream` so subsequent accesses return the same instance
    // instead of duplicating listeners and data.
    const ws = new ReadableStream<T>({
      start: controller => {
        this.on("data", (chunk: T) => {
          try {
            controller.enqueue(chunk);
          } catch {
            // Controller may be closed
          }
        });
        this.on("end", () => {
          try {
            controller.close();
          } catch {
            // Controller may already be closed
          }
        });
        this.on("error", (err: Error) => {
          try {
            controller.error(err);
          } catch {
            // Controller may already be errored/closed
          }
        });
        // Start flowing if not already
        if (!this._flowing) {
          this.resume();
        }
      }
    });
    this._stream = ws;
    return ws;
  }

  get readable(): boolean {
    return !this._destroyed && !this._ended;
  }

  set readable(val: boolean) {
    // Node.js allows overriding the readable state directly
    if (!val) {
      this._ended = true;
    }
  }

  get readableEnded(): boolean {
    return this._ended;
  }

  get readableLength(): number {
    return this.objectMode ? this._buf.length : this._buf.byteSize;
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

  /** Whether the stream is in flowing mode */
  get readableFlowing(): boolean | null {
    if (this._flowing) {
      return true;
    }
    // Distinguish between "never flowed" (null) and "paused after flowing" (false)
    return this._hasFlowed ? false : null;
  }

  set readableFlowing(val: boolean | null) {
    if (val === true) {
      this._flowing = true;
      this._hasFlowed = true;
    } else if (val === false) {
      this._flowing = false;
      this._hasFlowed = true;
    } else {
      // null — reset to "never flowed"
      this._flowing = false;
      this._hasFlowed = false;
    }
  }

  /** Whether the stream was aborted (destroyed before 'end' was emitted) */
  get readableAborted(): boolean {
    return this._destroyed && !this._endEmitted;
  }

  /** Whether read() has ever been called */
  get readableDidRead(): boolean {
    return this._didRead;
  }

  /** Current encoding or null */
  get readableEncoding(): string | null {
    return this._encoding;
  }

  /** Returns array of objects containing info about buffered data */
  get readableObjectMode(): boolean {
    return this.objectMode;
  }

  /**
   * Get the internal buffer contents as an array (matches Node.js BufferList behavior)
   */
  get readableBuffer(): T[] {
    return this._buf.toArray();
  }

  /**
   * Release the internal reader lock, clearing _reader.
   * Safe to call even when no reader is held.
   */
  private _releaseReader(): void {
    if (this._reader) {
      const reader = this._reader;
      this._reader = null;
      try {
        reader.releaseLock();
      } catch {
        // Ignore if a read is still pending
      }
    }
  }

  private async _startReading(): Promise<void> {
    if (this._reading || this._destroyed || !this._flowing) {
      return;
    }

    this._reading = true;

    try {
      if (!this._reader) {
        this._reader = this._stream!.getReader();
      }

      while (this._flowing && !this._destroyed && !this._pushMode) {
        const { done, value } = await this._reader.read();

        // Check _pushMode again after async read - if push() was called, stop reading
        if (this._pushMode) {
          this._releaseReader();
          break;
        }

        if (done) {
          this._ended = true;
          this._emitEndOnce();
          this._releaseReader();
          break;
        }

        if (value !== undefined) {
          // In flowing mode, emit data directly without buffering
          // Only buffer if not flowing (paused mode)
          if (this._flowing) {
            this.emit("data", this._applyEncoding(value));
          } else {
            this._buf.push(value);
          }
        }
      }
    } catch (err) {
      this.emit("error", err);
      this._releaseReader();
    } finally {
      this._reading = false;
    }
  }

  /**
   * Async iterator support
   * Uses a unified event-queue iterator with simple backpressure.
   * This matches Node's behavior more closely (iterator drives flowing mode).
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    // First yield any buffered data
    while (this._buf.length > 0) {
      yield this._applyEncoding(this._buf.shift());
    }

    if (this._ended) {
      return;
    }

    const highWaterMark = this.readableHighWaterMark;
    const lowWaterMark = Math.max(0, Math.floor(highWaterMark / 2));

    const chunkSizeForBackpressure = (chunk: any): number => {
      if (this.objectMode) {
        return 1;
      }
      if (chunk instanceof Uint8Array) {
        return chunk.byteLength;
      }
      if (typeof chunk === "string") {
        return chunk.length;
      }
      return 1;
    };

    const dataQueue: any[] = [];
    let dataQueueIndex = 0;
    let queuedSize = 0;

    let resolveNext: ((value: any | null) => void) | null = null;
    let rejectNext: ((error: Error) => void) | null = null;
    let done = false;
    let pausedByIterator = false;
    let streamError: Error | null = null;

    const dataHandler = (chunk: any): void => {
      // data events are already encoding-aware; do not decode again here.
      if (resolveNext) {
        resolveNext(chunk);
        resolveNext = null;
        rejectNext = null;
      } else {
        dataQueue.push(chunk);
      }

      queuedSize += chunkSizeForBackpressure(chunk);
      if (!pausedByIterator && queuedSize >= highWaterMark) {
        pausedByIterator = true;
        this.pause();
      }
    };

    const doneHandler = (): void => {
      done = true;
      if (resolveNext) {
        resolveNext(null);
        resolveNext = null;
        rejectNext = null;
      }
    };

    const errorHandler = (err: Error): void => {
      done = true;
      streamError = err;
      if (rejectNext) {
        rejectNext(err);
        resolveNext = null;
        rejectNext = null;
      }
    };

    this.on("data", dataHandler);
    this.on("end", doneHandler);
    this.on("error", errorHandler);
    this.on("close", doneHandler);

    try {
      // Iterator consumption should drive the stream.
      this.resume();

      while (true) {
        if (streamError) {
          throw streamError;
        }

        if (dataQueueIndex < dataQueue.length) {
          const chunk = dataQueue[dataQueueIndex++]!;
          queuedSize -= chunkSizeForBackpressure(chunk);

          if (dataQueueIndex >= 1024 && dataQueueIndex * 2 >= dataQueue.length) {
            dataQueue.splice(0, dataQueueIndex);
            dataQueueIndex = 0;
          }

          if (pausedByIterator && queuedSize <= lowWaterMark && !done && !this._destroyed) {
            pausedByIterator = false;
            this.resume();
          }

          yield chunk as T;
          continue;
        }

        if (done) {
          break;
        }

        const chunk = await new Promise<any | null>((resolve, reject) => {
          resolveNext = resolve;
          rejectNext = reject;
        });

        if (chunk !== null) {
          queuedSize -= chunkSizeForBackpressure(chunk);
          if (pausedByIterator && queuedSize <= lowWaterMark && !done && !this._destroyed) {
            pausedByIterator = false;
            this.resume();
          }
          yield chunk as T;
        }
      }
    } finally {
      this.off("data", dataHandler);
      this.off("end", doneHandler);
      this.off("error", errorHandler);
      this.off("close", doneHandler);
    }
  }

  /**
   * Explicit iterator method (same as Symbol.asyncIterator)
   */
  iterator(options?: { destroyOnReturn?: boolean }): AsyncIterableIterator<T> {
    const destroyOnReturn = options?.destroyOnReturn ?? true;
    const iterator = this[Symbol.asyncIterator]();

    if (!destroyOnReturn) {
      return iterator;
    }

    // Wrap to handle early return
    return {
      next: async () => {
        return iterator.next();
      },
      return: async (value?: any) => {
        this.destroy();
        return { done: true, value };
      },
      [Symbol.asyncIterator]() {
        return this;
      }
    };
  }
}

// =============================================================================
// Internal helpers
// =============================================================================

export function toAsyncIterable<T>(iterable: Iterable<T> | AsyncIterable<T>): AsyncIterable<T> {
  if (iterable && typeof iterable[Symbol.asyncIterator] === "function") {
    return iterable as AsyncIterable<T>;
  }
  return (async function* (): AsyncIterable<T> {
    for (const item of iterable as Iterable<T>) {
      yield item;
    }
  })();
}

export function pumpAsyncIterableToReadable<T>(
  readable: Readable<T>,
  iterable: AsyncIterable<T>
): void {
  const iterator = iterable[Symbol.asyncIterator]();
  let reading = false;

  // Pull-based: advance the iterator one chunk per _read() call,
  // matching Node.js Readable.from() behavior.
  (readable as any)._read = function () {
    if (reading) {
      return;
    }
    reading = true;

    (async () => {
      try {
        if (readable.destroyed) {
          return;
        }
        const { value, done } = await iterator.next();
        if (done) {
          readable.push(null);
          return;
        }
        readable.push(value);
      } catch (err) {
        readable.destroy(err as Error);
      } finally {
        reading = false;
      }
    })();
  };
  (readable as any)._pushMode = true;
}
