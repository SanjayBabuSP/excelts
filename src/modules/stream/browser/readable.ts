/**
 * Browser Stream - Readable
 */

import type { ReadableStreamOptions, WritableLike } from "@stream/types";
import { StreamTypeError } from "@stream/errors";
import { EventEmitter } from "@utils/event-emitter";
import { getTextDecoder, textDecoder } from "@utils/binary";

import type { Writable } from "./writable";
import type { Transform } from "./transform";
import type { Duplex } from "./duplex";

// =============================================================================
// Readable Stream Wrapper
// =============================================================================

/**
 * A wrapper around Web ReadableStream that provides Node.js-like API
 */
export class Readable<T = Uint8Array> extends EventEmitter {
  private _stream: ReadableStream<T> | null;
  private _reader: ReadableStreamDefaultReader<T> | null = null;
  private _buffer: T[] = [];
  private _bufferIndex: number = 0;
  private _unshiftBuffer: T[] = [];
  private _bufferSize: number = 0;
  private _reading: boolean = false;
  private _ended: boolean = false;
  private _endEmitted: boolean = false;
  private _destroyed: boolean = false;
  private _errored: Error | null = null;
  private _closed: boolean = false;
  private _paused: boolean = true;
  private _flowing: boolean = false;
  private _pipeTo: WritableLike[] = [];
  private _pipeListeners: Map<
    WritableLike,
    {
      data: (chunk: T) => void;
      end: () => void;
      error: (err: Error) => void;
      drain?: () => void;
      eventTarget: any;
    }
  > = new Map();
  private _encoding: string | null = null;
  private _decoder: TextDecoder | null = null;
  private _didRead: boolean = false;
  private _aborted: boolean = false;
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
    this.readableHighWaterMark = options?.highWaterMark ?? 16384;
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

    pumpAsyncIterableToReadable(readable, toAsyncIterable(iterable));

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
    return nodeStream.webStream;
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
      if (this._bufferedLength() === 0) {
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
      const wasEmpty = this._bufferedLength() === 0;
      this._buffer.push(chunk);
      if (!this.objectMode) {
        this._bufferSize += this._getChunkSize(chunk);
      }

      // Emit readable event when buffer goes from empty to having data
      if (wasEmpty) {
        queueMicrotask(() => this.emit("readable"));
      }
      // Return false if buffer exceeds high water mark (backpressure signal)
      // Fast path for object mode - just count items
      if (this.objectMode) {
        return this._bufferedLength() < this.readableHighWaterMark;
      }
      // For binary mode, use tracked buffer size (O(1))
      return this._bufferSize < this.readableHighWaterMark;
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
   * Note: unshift is allowed even after end, as it's used to put back already read data
   */
  unshift(chunk: T): void {
    if (this._destroyed) {
      return;
    }
    this._bufferUnshift(chunk);
    if (!this.objectMode) {
      this._bufferSize += this._getChunkSize(chunk);
    }
  }

  /**
   * Read data from the stream
   */
  read(size?: number): T | null {
    this._didRead = true;

    if (this._bufferedLength() > 0) {
      if (this.objectMode || size === undefined) {
        const chunk = this._bufferShift();
        if (!this.objectMode) {
          this._bufferSize -= this._getChunkSize(chunk);
        }
        const decoded = this._applyEncoding(chunk);
        if (this._ended && this._bufferedLength() === 0) {
          queueMicrotask(() => this._emitEndOnce());
        }
        return decoded;
      }
      // For binary mode, handle size
      const chunk = this._bufferShift();
      if (!this.objectMode) {
        this._bufferSize -= this._getChunkSize(chunk);
      }
      const decoded = this._applyEncoding(chunk);
      if (this._ended && this._bufferedLength() === 0) {
        queueMicrotask(() => this._emitEndOnce());
      }
      return decoded;
    }
    return null;
  }

  private _bufferedLength(): number {
    return this._unshiftBuffer.length + (this._buffer.length - this._bufferIndex);
  }

  private _bufferPeek(): T | null {
    const unshiftLen = this._unshiftBuffer.length;
    if (unshiftLen > 0) {
      return this._unshiftBuffer[unshiftLen - 1]!;
    }
    return this._bufferIndex < this._buffer.length ? this._buffer[this._bufferIndex] : null;
  }

  private _bufferShift(): T {
    if (this._unshiftBuffer.length > 0) {
      return this._unshiftBuffer.pop()!;
    }
    const chunk = this._buffer[this._bufferIndex++]!;

    // Fast reset when emptied
    if (this._bufferIndex === this._buffer.length) {
      this._buffer.length = 0;
      this._bufferIndex = 0;
      return chunk;
    }

    // Occasionally compact to avoid unbounded growth of the unused prefix
    if (this._bufferIndex > 1024 && this._bufferIndex * 2 > this._buffer.length) {
      this._buffer = this._buffer.slice(this._bufferIndex);
      this._bufferIndex = 0;
    }

    return chunk;
  }

  private _bufferUnshift(chunk: T): void {
    if (this._bufferIndex === 0) {
      // Avoid O(n) Array.unshift() by using a small front stack.
      // Semantics: last unshifted chunk is returned first.
      this._unshiftBuffer.push(chunk);
      return;
    }

    this._bufferIndex--;
    this._buffer[this._bufferIndex] = chunk;
  }

  private _getChunkSize(chunk: T): number {
    // Keep semantics aligned with previous implementation:
    // - Uint8Array counts by byteLength
    // - other types count as 1
    return chunk instanceof Uint8Array ? chunk.byteLength : 1;
  }

  /**
   * Set encoding for string output
   */
  setEncoding(encoding: string): this {
    this._encoding = encoding;
    // Fast path: reuse cached utf-8 decoder; otherwise lazy-create on first decode.
    if (encoding === "utf-8" || encoding === "utf8") {
      this._decoder = textDecoder;
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
    this._paused = true;
    this._flowing = false;
    return this;
  }

  /**
   * Resume the stream
   */
  resume(): this {
    this._paused = false;
    this._flowing = true;

    // Emit any buffered data first
    while (this._bufferedLength() > 0 && this._flowing) {
      const chunk = this._bufferShift();
      if (!this.objectMode) {
        this._bufferSize -= this._getChunkSize(chunk);
      }
      this.emit("data", this._applyEncoding(chunk));
    }

    // If already ended, emit end event
    if (this._ended && this._bufferedLength() === 0) {
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
    // IMPORTANT:
    // Do not rely on `instanceof` here.
    // In bundled/minified builds, multiple copies of this module can exist,
    // causing `instanceof Transform/Writable/Duplex` to fail even when the object
    // is a valid destination.
    const dest = destination;

    // For event handling (drain, once, off), we need the object that emits events.
    // For write/end, we must call the destination's own write()/end() methods,
    // NOT the internal _writable, because Transform.write() has important logic
    // (like auto-consume) that _writable.write() bypasses.
    const eventTarget: any = dest;

    const hasWrite = typeof dest?.write === "function";
    const hasEnd = typeof dest?.end === "function";
    const hasOn = typeof eventTarget?.on === "function";
    const hasOnce = typeof eventTarget?.once === "function";
    const hasOff = typeof eventTarget?.off === "function";

    if (!hasWrite || !hasEnd || (!hasOnce && !hasOn) || (!hasOff && !eventTarget?.removeListener)) {
      throw new StreamTypeError("Writable", typeof dest);
    }

    this._pipeTo.push(dest);

    // Create listeners that we can later remove
    let drainListener: (() => void) | undefined;

    const removeDrainListener = (): void => {
      if (!drainListener) {
        return;
      }
      if (typeof eventTarget.off === "function") {
        eventTarget.off("drain", drainListener);
      } else if (typeof eventTarget.removeListener === "function") {
        eventTarget.removeListener("drain", drainListener);
      }
      drainListener = undefined;
    };

    const dataListener = (chunk: T): void => {
      // Call destination's write() method (not internal _writable.write())
      // This ensures Transform.write() logic runs properly
      const canWrite = dest.write(chunk);
      if (!canWrite) {
        this.pause();

        // Install a removable, once-style drain listener.
        if (!drainListener) {
          drainListener = () => {
            removeDrainListener();
            this.resume();
          };
          eventTarget.on("drain", drainListener);
          const entry = this._pipeListeners.get(dest);
          if (entry) {
            entry.drain = drainListener;
          }
        }
      }
    };

    const endListener = (): void => {
      dest.end();
    };

    const errorListener = (err: Error): void => {
      if (typeof dest.destroy === "function") {
        dest.destroy(err);
      } else {
        // Best-effort: forward error to the destination if it supports events.
        eventTarget.emit?.("error", err);
      }
    };

    // Store listeners for later removal in unpipe
    this._pipeListeners.set(dest, {
      data: dataListener,
      end: endListener,
      error: errorListener,
      eventTarget
    });

    this.on("data", dataListener);
    this.once("end", endListener);
    this.once("error", errorListener);

    this.resume();
    return destination;
  }

  /**
   * Unpipe from destination
   */
  unpipe(destination?: WritableLike): this {
    if (destination) {
      const idx = this._pipeTo.indexOf(destination);
      if (idx !== -1) {
        this._pipeTo.splice(idx, 1);
      }

      // Remove the listeners
      const listeners = this._pipeListeners.get(destination);
      if (listeners) {
        this.off("data", listeners.data);
        this.off("end", listeners.end);
        this.off("error", listeners.error);

        if (listeners.drain) {
          if (typeof listeners.eventTarget?.off === "function") {
            listeners.eventTarget.off("drain", listeners.drain);
          } else if (typeof listeners.eventTarget?.removeListener === "function") {
            listeners.eventTarget.removeListener("drain", listeners.drain);
          }
        }

        this._pipeListeners.delete(destination);
      }
    } else {
      // Unpipe all
      for (const target of this._pipeTo) {
        const listeners = this._pipeListeners.get(target);
        if (listeners) {
          this.off("data", listeners.data);
          this.off("end", listeners.end);
          this.off("error", listeners.error);

          if (listeners.drain) {
            if (typeof listeners.eventTarget?.off === "function") {
              listeners.eventTarget.off("drain", listeners.drain);
            } else if (typeof listeners.eventTarget?.removeListener === "function") {
              listeners.eventTarget.removeListener("drain", listeners.drain);
            }
          }

          this._pipeListeners.delete(target);
        }
      }
      this._pipeTo = [];
    }

    // Pause the stream after unpipe
    this.pause();

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

    if (error) {
      this._errored = error;
      this.emit("error", error);
    }

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

    this._closed = true;
    this.emit("close");
    return this;
  }

  /**
   * Get a Web ReadableStream view of this stream.
   *
   * For external Web Streams (_webStreamMode), returns the original stream.
   * For controllable streams, creates a ReadableStream that mirrors data/end/error events.
   */
  get webStream(): ReadableStream<T> {
    if (this._stream) {
      return this._stream;
    }

    // Create a Web ReadableStream that forwards data from Node-side events
    return new ReadableStream<T>({
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
  }

  get readable(): boolean {
    return !this._destroyed && !this._ended;
  }

  get readableEnded(): boolean {
    return this._ended;
  }

  get readableLength(): number {
    return this._bufferedLength();
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

  /** Whether the stream is in flowing mode */
  get readableFlowing(): boolean | null {
    if (!this._paused && !this._ended) {
      return this._flowing;
    }
    return this._flowing ? true : null;
  }

  /** Whether the stream was aborted */
  get readableAborted(): boolean {
    return this._aborted;
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
   * Get the internal buffer state (for debugging)
   * Returns array of objects with length and chunk info
   */
  get readableBuffer(): { length: number; head: T | null } {
    return {
      length: this._bufferedLength(),
      head: this._bufferPeek()
    };
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
          if (this._reader) {
            const reader = this._reader;
            this._reader = null;
            try {
              reader.releaseLock();
            } catch {
              // Ignore if a read is still pending
            }
          }
          break;
        }

        if (done) {
          this._ended = true;
          this._emitEndOnce();

          if (this._reader) {
            const reader = this._reader;
            this._reader = null;
            try {
              reader.releaseLock();
            } catch {
              // Ignore if a read is still pending
            }
          }
          break;
        }

        if (value !== undefined) {
          // In flowing mode, emit data directly without buffering
          // Only buffer if not flowing (paused mode)
          if (this._flowing) {
            this.emit("data", this._applyEncoding(value));
          } else {
            this._buffer.push(value);
            if (!this.objectMode) {
              this._bufferSize += this._getChunkSize(value);
            }
          }
        }
      }
    } catch (err) {
      this.emit("error", err);

      if (this._reader) {
        const reader = this._reader;
        this._reader = null;
        try {
          reader.releaseLock();
        } catch {
          // Ignore if a read is still pending
        }
      }
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
    while (this._bufferedLength() > 0) {
      const chunk = this._bufferShift();
      if (!this.objectMode) {
        this._bufferSize -= this._getChunkSize(chunk);
      }
      yield this._applyEncoding(chunk);
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

    const endHandler = (): void => {
      done = true;
      if (resolveNext) {
        resolveNext(null);
        resolveNext = null;
        rejectNext = null;
      }
    };

    const closeHandler = (): void => {
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
    this.on("end", endHandler);
    this.on("error", errorHandler);
    this.on("close", closeHandler);

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
      this.off("end", endHandler);
      this.off("error", errorHandler);
      this.off("close", closeHandler);
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
  (async () => {
    try {
      for await (const chunk of iterable) {
        if (!readable.push(chunk)) {
          // Simple backpressure: yield to consumer.
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      readable.push(null);
    } catch (err) {
      readable.destroy(err as Error);
    }
  })();
}
