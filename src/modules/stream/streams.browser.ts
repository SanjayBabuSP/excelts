/**
 * Native Stream Implementation - Browser
 *
 * Uses Web Streams API (ReadableStream, WritableStream, TransformStream)
 * for true native streaming in browsers.
 *
 * Supported browsers:
 * - Chrome >= 89
 * - Firefox >= 102
 * - Safari >= 14.1
 * - Edge >= 89
 */

import type {
  TransformStreamOptions,
  ReadableStreamOptions,
  WritableStreamOptions,
  DuplexStreamOptions,
  PullStreamOptions,
  BufferedStreamOptions,
  DataChunk,
  ICollector,
  IDuplex,
  IEventEmitter,
  IPassThrough,
  IReadable,
  ITransform,
  IWritable,
  PipelineStreamLike,
  ReadableLike,
  WritableLike
} from "@stream/types";

import type { Writable as NodeWritable } from "stream";

import { EventEmitter } from "@stream/event-emitter";
import {
  PullStream as StandalonePullStream,
  type PullStreamOptions as StandalonePullStreamOptions
} from "@stream/pull-stream";
import {
  BufferedStream as StandaloneBufferedStream,
  StringChunk as StandaloneStringChunk,
  BufferChunk as StandaloneBufferChunk
} from "@stream/buffered-stream";

import { concatUint8Arrays, getTextDecoder, textDecoder } from "@stream/shared";

// =============================================================================
// Readable Stream Wrapper
// =============================================================================

/**
 * A wrapper around Web ReadableStream that provides Node.js-like API
 */
export class Readable<T = Uint8Array> extends EventEmitter {
  private _stream: ReadableStream<T>;
  private _reader: ReadableStreamDefaultReader<T> | null = null;
  private _buffer: T[] = [];
  private _bufferIndex: number = 0;
  private _unshiftBuffer: T[] = [];
  private _bufferSize: number = 0;
  private _reading: boolean = false;
  private _ended: boolean = false;
  private _destroyed: boolean = false;
  private _errored: Error | null = null;
  private _closed: boolean = false;
  private _paused: boolean = true;
  private _flowing: boolean = false;
  private _pipeTo: WritableLike[] = [];
  private _pipeListeners: Map<
    WritableLike,
    { data: (chunk: T) => void; end: () => void; error: (err: Error) => void }
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
      // Create a controllable stream
      let controller: ReadableStreamDefaultController<T>;
      this._stream = new ReadableStream<T>({
        start: ctrl => {
          controller = ctrl;
        },
        pull: async () => {
          // Signal that more data can be pushed
          this.emit("drain");
        },
        cancel: reason => {
          this._ended = true;
          this._aborted = true;
          if (this.emitClose) {
            this.emit("close");
          }
        }
      });

      // Expose controller for push/end
      (this as any)._controller = controller!;
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

    (async () => {
      try {
        for await (const chunk of iterable as AsyncIterable<T>) {
          if (!readable.push(chunk)) {
            // Backpressure
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
        readable.push(null);
      } catch (err) {
        readable.destroy(err as Error);
      }
    })();

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

    const controller = (this as any)._controller as ReadableStreamDefaultController<T> | undefined;

    if (chunk === null) {
      // Prevent duplicate end handling
      if (this._ended) {
        return false;
      }
      this._ended = true;
      if (controller) {
        try {
          controller.close();
        } catch {
          // Controller may already be closed
        }
      }
      this.emit("end");
      // Note: Don't call destroy() here, let the stream be consumed naturally
      // The reader will return done:true when it finishes reading
      return false;
    }

    if (this._flowing) {
      // In flowing mode, emit data directly without buffering or enqueueing
      // const chunkStr = chunk instanceof Uint8Array ? new TextDecoder().decode(chunk.slice(0, 50)) : String(chunk).slice(0, 50);
      // console.log(`[Readable#${this._id}.push FLOWING] emit data size:${(chunk as any).length || (chunk as any).byteLength} start:"${chunkStr}"`);
      this.emit("data", chunk);
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
      // const chunkStrBuf = chunk instanceof Uint8Array ? new TextDecoder().decode((chunk as Uint8Array).slice(0, 50)) : String(chunk).slice(0, 50);
      // console.log(`[Readable#${this._id}.push PAUSED->BUFFER] buffer len:${this._buffer.length}->${this._buffer.length + 1} start:"${chunkStrBuf}"`);
      this._buffer.push(chunk);
      if (!this.objectMode) {
        this._bufferSize += this._getChunkSize(chunk);
      }
      // NOTE: Do NOT enqueue to Web Stream controller here!
      // In push mode, _buffer is the only source of data for data events.
      // Web Stream is only used for async iteration when not in push mode.
      // Enqueueing here would cause data duplication when _startReading is also running.

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
        return this._applyEncoding(chunk);
      }
      // For binary mode, handle size
      const chunk = this._bufferShift();
      if (!this.objectMode) {
        this._bufferSize -= this._getChunkSize(chunk);
      }
      return this._applyEncoding(chunk);
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
      this.emit("data", chunk);
    }

    // If already ended, emit end event
    if (this._ended && this._bufferedLength() === 0) {
      this.emit("end");
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
    const dest: any = destination as any;

    // Get the actual writable target.
    // Prefer internal `_writable` (Transform/Duplex wrappers), else treat the destination as writable-like.
    const candidate: any = dest?._writable ?? dest;
    const hasWrite = typeof candidate?.write === "function";
    const hasEnd = typeof candidate?.end === "function";
    const hasOn = typeof candidate?.on === "function";
    const hasOnce = typeof candidate?.once === "function";
    const hasOff = typeof candidate?.off === "function";

    if (!hasWrite || !hasEnd || (!hasOnce && !hasOn) || (!hasOff && !candidate?.removeListener)) {
      throw new Error("Readable.pipe: invalid destination");
    }

    const target: WritableLike = candidate;

    this._pipeTo.push(target);

    // Create listeners that we can later remove
    const dataListener = (chunk: T): void => {
      const canWrite = target.write(chunk);
      if (!canWrite) {
        this.pause();
        if (typeof (target as any).once === "function") {
          (target as any).once("drain", () => this.resume());
        } else {
          const resumeOnce = (): void => {
            if (typeof (target as any).off === "function") {
              (target as any).off("drain", resumeOnce);
            } else if (typeof (target as any).removeListener === "function") {
              (target as any).removeListener("drain", resumeOnce);
            }
            this.resume();
          };
          (target as any).on("drain", resumeOnce);
        }
      }
    };

    const endListener = (): void => {
      target.end();
    };

    const errorListener = (err: Error): void => {
      if (typeof (target as any).destroy === "function") {
        (target as any).destroy(err);
      } else {
        // Best-effort: forward error to the destination if it supports events.
        (target as any).emit?.("error", err);
      }
    };

    // Store listeners for later removal in unpipe
    this._pipeListeners.set(target, {
      data: dataListener,
      end: endListener,
      error: errorListener
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

    if (error) {
      this._errored = error;
      this.emit("error", error);
    }

    if (this._reader) {
      this._reader.cancel().catch(() => {});
    }

    this._closed = true;
    this.emit("close");
    return this;
  }

  /**
   * Get the underlying Web ReadableStream
   */
  get webStream(): ReadableStream<T> {
    return this._stream;
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
        this._reader = this._stream.getReader();
      }

      while (this._flowing && !this._destroyed && !this._pushMode) {
        const { done, value } = await this._reader.read();

        // Check _pushMode again after async read - if push() was called, stop reading
        if (this._pushMode) {
          break;
        }

        if (done) {
          this._ended = true;
          this.emit("end");
          break;
        }

        if (value !== undefined) {
          // In flowing mode, emit data directly without buffering
          // Only buffer if not flowing (paused mode)
          if (this._flowing) {
            this.emit("data", value);
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
    } finally {
      this._reading = false;
    }
  }

  /**
   * Async iterator support
   * Uses Web Stream reader for non-push mode, event-based for push mode
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    // First yield any buffered data
    while (this._bufferedLength() > 0) {
      const chunk = this._bufferShift();
      if (!this.objectMode) {
        this._bufferSize -= this._getChunkSize(chunk);
      }
      yield chunk;
    }

    // If already ended, we're done
    if (this._ended) {
      return;
    }

    // For controllable streams (not created from external Web Stream),
    // use event-based iteration since data comes from push() calls
    if (!this._webStreamMode) {
      // Create a promise-based queue for incoming data
      const dataQueue: T[] = [];
      let resolveNext: ((value: T | null) => void) | null = null;
      let rejectNext: ((error: Error) => void) | null = null;
      let done = false;
      let streamError: Error | null = null;
      let dataQueueIndex = 0;

      const dataHandler = (chunk: T): void => {
        if (resolveNext) {
          resolveNext(chunk);
          resolveNext = null;
          rejectNext = null;
        } else {
          dataQueue.push(chunk);
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

      const errorHandler = (err: Error): void => {
        done = true;
        streamError = err;
        if (rejectNext) {
          rejectNext(err);
          resolveNext = null;
          rejectNext = null;
        }
      };

      const closeHandler = (): void => {
        // If stream closed without end event (e.g., after destroy()),
        // treat it as done
        done = true;
        if (resolveNext) {
          resolveNext(null);
          resolveNext = null;
          rejectNext = null;
        }
      };

      this.on("data", dataHandler);
      this.on("end", endHandler);
      this.on("error", errorHandler);
      this.on("close", closeHandler);

      try {
        // Enter flowing mode
        this.resume();

        while (!done || dataQueueIndex < dataQueue.length) {
          // Check for error before processing
          if (streamError) {
            throw streamError;
          }
          if (dataQueueIndex < dataQueue.length) {
            const chunk = dataQueue[dataQueueIndex++]!;
            if (dataQueueIndex >= 1024 && dataQueueIndex * 2 >= dataQueue.length) {
              dataQueue.splice(0, dataQueueIndex);
              dataQueueIndex = 0;
            }
            yield chunk;
          } else if (!done) {
            const chunk = await new Promise<T | null>((resolve, reject) => {
              resolveNext = resolve;
              rejectNext = reject;
            });
            if (chunk !== null) {
              yield chunk;
            }
          }
        }
        // Check for error after loop
        if (streamError) {
          throw streamError;
        }
      } finally {
        this.off("data", dataHandler);
        this.off("end", endHandler);
        this.off("error", errorHandler);
        this.off("close", closeHandler);
      }
      return;
    }

    // For Web Stream mode, use the underlying reader
    if (!this._reader) {
      this._reader = this._stream.getReader();
    }

    try {
      while (true) {
        const { done, value } = await this._reader.read();
        if (done) {
          break;
        }
        yield value;
      }
    } finally {
      this._reader.releaseLock();
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

  // =========================================================================
  // Async Iterator Helper Methods (Node.js 16.6+)
  // =========================================================================

  /**
   * Map each chunk through an async function
   */
  async *map<R>(
    fn: (data: T, options?: { signal?: AbortSignal }) => R | Promise<R>,
    options?: { concurrency?: number; signal?: AbortSignal }
  ): AsyncGenerator<R, void, unknown> {
    const signal = options?.signal;
    for await (const chunk of this) {
      if (signal?.aborted) {
        throw new Error("AbortError");
      }
      yield await fn(chunk, { signal });
    }
  }

  /**
   * Filter chunks through an async predicate
   */
  async *filter(
    fn: (data: T, options?: { signal?: AbortSignal }) => boolean | Promise<boolean>,
    options?: { concurrency?: number; signal?: AbortSignal }
  ): AsyncGenerator<T, void, unknown> {
    const signal = options?.signal;
    for await (const chunk of this) {
      if (signal?.aborted) {
        throw new Error("AbortError");
      }
      if (await fn(chunk, { signal })) {
        yield chunk;
      }
    }
  }

  /**
   * FlatMap each chunk
   */
  async *flatMap<R>(
    fn: (data: T, options?: { signal?: AbortSignal }) => AsyncIterable<R> | Iterable<R>,
    options?: { concurrency?: number; signal?: AbortSignal }
  ): AsyncGenerator<R, void, unknown> {
    const signal = options?.signal;
    for await (const chunk of this) {
      if (signal?.aborted) {
        throw new Error("AbortError");
      }
      const result = await fn(chunk, { signal });
      for await (const item of result) {
        yield item;
      }
    }
  }

  /**
   * Take the first n chunks
   */
  async *take(limit: number, options?: { signal?: AbortSignal }): AsyncGenerator<T, void, unknown> {
    const signal = options?.signal;
    let count = 0;
    for await (const chunk of this) {
      if (signal?.aborted) {
        throw new Error("AbortError");
      }
      if (count >= limit) {
        break;
      }
      yield chunk;
      count++;
    }
  }

  /**
   * Drop the first n chunks
   */
  async *drop(limit: number, options?: { signal?: AbortSignal }): AsyncGenerator<T, void, unknown> {
    const signal = options?.signal;
    let count = 0;
    for await (const chunk of this) {
      if (signal?.aborted) {
        throw new Error("AbortError");
      }
      if (count >= limit) {
        yield chunk;
      }
      count++;
    }
  }

  /**
   * Reduce all chunks to a single value
   */
  async reduce(
    fn: (previous: T, data: T, options?: { signal?: AbortSignal }) => T | Promise<T>,
    initial?: T,
    options?: { signal?: AbortSignal }
  ): Promise<T>;
  async reduce<R>(
    fn: (previous: R, data: T, options?: { signal?: AbortSignal }) => R | Promise<R>,
    initial: R,
    options?: { signal?: AbortSignal }
  ): Promise<R>;
  async reduce<R>(
    fn: (previous: R, data: T, options?: { signal?: AbortSignal }) => R | Promise<R>,
    initial?: R,
    options?: { signal?: AbortSignal }
  ): Promise<R> {
    const signal = options?.signal;
    let accumulator: R | undefined = initial;
    let first = true;

    for await (const chunk of this) {
      if (signal?.aborted) {
        throw new Error("AbortError");
      }
      if (first && accumulator === undefined) {
        accumulator = chunk as any as R;
        first = false;
      } else {
        accumulator = await fn(accumulator as R, chunk, { signal });
      }
    }

    if (accumulator === undefined) {
      throw new TypeError("Reduce of empty stream with no initial value");
    }

    return accumulator;
  }

  /**
   * Check if every chunk passes a predicate
   */
  async every(
    fn: (data: T, options?: { signal?: AbortSignal }) => boolean | Promise<boolean>,
    options?: { concurrency?: number; signal?: AbortSignal }
  ): Promise<boolean> {
    const signal = options?.signal;
    for await (const chunk of this) {
      if (signal?.aborted) {
        throw new Error("AbortError");
      }
      if (!(await fn(chunk, { signal }))) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if some chunk passes a predicate
   */
  async some(
    fn: (data: T, options?: { signal?: AbortSignal }) => boolean | Promise<boolean>,
    options?: { concurrency?: number; signal?: AbortSignal }
  ): Promise<boolean> {
    const signal = options?.signal;
    for await (const chunk of this) {
      if (signal?.aborted) {
        throw new Error("AbortError");
      }
      if (await fn(chunk, { signal })) {
        return true;
      }
    }
    return false;
  }

  /**
   * Find first chunk that passes predicate
   */
  async find(
    fn: (data: T, options?: { signal?: AbortSignal }) => boolean | Promise<boolean>,
    options?: { signal?: AbortSignal }
  ): Promise<T | undefined> {
    const signal = options?.signal;
    for await (const chunk of this) {
      if (signal?.aborted) {
        throw new Error("AbortError");
      }
      if (await fn(chunk, { signal })) {
        return chunk;
      }
    }
    return undefined;
  }

  /**
   * Execute function for each chunk (like forEach)
   */
  async forEach(
    fn: (data: T, options?: { signal?: AbortSignal }) => void | Promise<void>,
    options?: { concurrency?: number; signal?: AbortSignal }
  ): Promise<void> {
    const signal = options?.signal;
    for await (const chunk of this) {
      if (signal?.aborted) {
        throw new Error("AbortError");
      }
      await fn(chunk, { signal });
    }
  }

  /**
   * Collect all chunks into an array
   */
  async toArray(options?: { signal?: AbortSignal }): Promise<T[]> {
    const signal = options?.signal;
    const result: T[] = [];
    for await (const chunk of this) {
      if (signal?.aborted) {
        throw new Error("AbortError");
      }
      result.push(chunk);
    }
    return result;
  }

  /**
   * Yield [index, value] pairs
   */
  async *asIndexedPairs(options?: {
    signal?: AbortSignal;
  }): AsyncGenerator<[number, T], void, unknown> {
    const signal = options?.signal;
    let index = 0;
    for await (const chunk of this) {
      if (signal?.aborted) {
        throw new Error("AbortError");
      }
      yield [index++, chunk];
    }
  }

  /**
   * Compose this stream with another iterable/stream
   */
  compose<R>(stream: (source: AsyncIterable<T>) => AsyncIterable<R>): Readable<R>;
  compose<R>(stream: Duplex<R, T>): Duplex<R, T>;
  compose<R>(
    stream: Duplex<R, T> | ((source: AsyncIterable<T>) => AsyncIterable<R>)
  ): Readable<R> | Duplex<R, T> {
    if (typeof stream === "function") {
      // It's an async generator function
      const output = stream(this);
      return Readable.from(output);
    }
    // It's a Duplex stream
    this.pipe(stream);
    return stream;
  }
}

// =============================================================================
// Writable Stream Wrapper
// =============================================================================

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
  private _corked: number = 0;
  private _corkedChunks: Array<{ chunk: T; callback?: (error?: Error | null) => void }> = [];
  private _defaultEncoding: string = "utf8";
  private _aborted: boolean = false;
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

  constructor(
    options?: WritableStreamOptions & {
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
  ) {
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
    } else {
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

    return this._doWrite(chunk, cb);
  }

  private _doWrite(chunk: T, callback?: (error?: Error | null) => void): boolean {
    // Track pending writes for writableLength
    const chunkSize = this._getChunkSize(chunk);
    this._pendingWrites++;
    this._writableLength += chunkSize;

    this._getWriter()
      .write(chunk)
      .then(() => {
        this._pendingWrites--;
        this._writableLength -= chunkSize;
        this.emit("drain");
        callback?.(null);
      })
      .catch(err => {
        this._pendingWrites--;
        this._writableLength -= chunkSize;
        this.emit("error", err);
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
        if (chunk !== undefined) {
          await this._getWriter().write(chunk);
        }
        await this._getWriter().close();
        this._finished = true;
        this.emit("finish");
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

    if (error) {
      this._errored = error;
      this.emit("error", error);
    }

    if (this._writer) {
      this._writer.abort(error).catch(() => {});
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
export function normalizeWritable<T = Uint8Array>(
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

// =============================================================================
// Transform Stream Wrapper
// =============================================================================

/**
 * A wrapper around Web TransformStream that provides Node.js-like API
 */
export class Transform<TInput = Uint8Array, TOutput = Uint8Array> extends EventEmitter {
  private _stream: TransformStream<TInput, TOutput>;
  /** @internal - for pipe() support */
  readonly _readable: Readable<TOutput>;
  /** @internal - for pipe() support */
  readonly _writable: Writable<TInput>;
  readonly objectMode: boolean;
  private _ended: boolean = false;
  private _destroyed: boolean = false;
  private _errored: boolean = false;
  // Buffer for Node.js style push() calls during transform
  private _pushBuffer: TOutput[] = [];
  // Controller for enqueueing pushed data (set during transform execution)
  private _transformController: TransformStreamDefaultController<TOutput> | null = null;
  // Buffer for writes that occur after end() but before writable is closed
  private _pendingEndWrites: { chunk: TInput; callback?: (error?: Error | null) => void }[] = [];
  // Whether end() has been called but writable not yet closed
  private _endPending: boolean = false;

  /**
   * Push data to the readable side (Node.js compatibility)
   * Can be called from within transform callback
   */
  push(chunk: TOutput | null): boolean {
    if (chunk === null) {
      return false;
    }
    if (this._transformController) {
      // If we're in a transform callback, enqueue directly
      this._transformController.enqueue(chunk);
    } else {
      // Otherwise buffer for later
      this._pushBuffer.push(chunk);
    }
    return true;
  }

  constructor(
    options?: TransformStreamOptions & {
      transform?:
        | ((chunk: TInput) => TOutput | Promise<TOutput>)
        | ((
            this: Transform<TInput, TOutput>,
            chunk: TInput,
            encoding: string,
            callback: (error?: Error | null, data?: TOutput) => void
          ) => void);
      flush?:
        | (() => TOutput | void | Promise<TOutput | void>)
        | ((
            this: Transform<TInput, TOutput>,
            callback: (error?: Error | null, data?: TOutput) => void
          ) => void);
    }
  ) {
    super();
    this.objectMode = options?.objectMode ?? false;

    const userTransform = options?.transform;
    const userFlush = options?.flush;

    // Determine if transform function is Node.js style (has 3 params) or simple style
    const isNodeStyleTransform = userTransform && userTransform.length >= 3;
    const isNodeStyleFlush = userFlush && userFlush.length >= 1;

    // Create bound references for use in TransformStream callbacks
    const setController = (ctrl: TransformStreamDefaultController<TOutput> | null): void => {
      this._transformController = ctrl;
    };
    const emitEvent = (event: string, ...args: any[]): boolean => {
      if (event === "error") {
        // Only emit error once to prevent duplicate events
        if (this._errored) {
          return false;
        }
        this._errored = true;
        // Also destroy the writable to prevent further writes
        this._writable.destroy(args[0] as Error);
      }
      return this.emit(event, ...args);
    };
    const getInstance = (): Transform<TInput, TOutput> => this;

    // Check if subclass overrides _transform (for Node.js compatibility)
    // We need to check this at runtime since the subclass constructor runs after super()
    const hasSubclassTransform = (): boolean => {
      // If userTransform was provided in options, use that
      if (userTransform) {
        return false;
      }
      // Check if _transform is overridden (not the base class no-op)
      const proto = Object.getPrototypeOf(this);
      return proto._transform !== Transform.prototype._transform;
    };

    const hasSubclassFlush = (): boolean => {
      if (userFlush) {
        return false;
      }
      const proto = Object.getPrototypeOf(this);
      return proto._flush !== Transform.prototype._flush;
    };

    this._stream = new TransformStream<TInput, TOutput>({
      transform: async (chunk, controller) => {
        // Skip processing if already errored
        if (this._errored) {
          return;
        }

        try {
          // Set controller for push() to use
          setController(controller);

          // Check for subclass _transform override first
          if (hasSubclassTransform()) {
            // Call subclass _transform method (Node.js style)
            await new Promise<void>((resolve, reject) => {
              const transformFn = this._transform as unknown as (...args: any[]) => void;
              const callback = (err?: Error | null, data?: TOutput) => {
                if (err) {
                  reject(err);
                } else {
                  if (data !== undefined) {
                    controller.enqueue(data);
                  }
                  resolve();
                }
              };

              const args =
                transformFn.length >= 3 ? [chunk, "utf8", callback] : [chunk, callback];
              transformFn.apply(this, args);
            });
          } else if (userTransform) {
            if (isNodeStyleTransform) {
              // Node.js style: transform(chunk, encoding, callback)
              await new Promise<void>((resolve, reject) => {
                const transformFn = userTransform as unknown as (...args: any[]) => void;
                const callback = (err?: Error | null, data?: TOutput) => {
                  if (err) {
                    reject(err);
                  } else {
                    // If data provided via callback, enqueue it
                    if (data !== undefined) {
                      controller.enqueue(data);
                    }
                    resolve();
                  }
                };

                const args =
                  transformFn.length >= 3 ? [chunk, "utf8", callback] : [chunk, callback];
                transformFn.apply(getInstance(), args);
              });
            } else {
              // Simple style: transform(chunk) => result
              const result = await (userTransform as (chunk: TInput) => TOutput | Promise<TOutput>)(
                chunk
              );
              if (result !== undefined) {
                controller.enqueue(result);
              }
            }
          } else {
            // Default: pass through
            controller.enqueue(chunk as any as TOutput);
          }
        } catch (err) {
          controller.error(err);
          emitEvent("error", err);
        } finally {
          setController(null);
        }
      },
      flush: async controller => {
        try {
          setController(controller);

          // Check for subclass _flush override first
          if (hasSubclassFlush()) {
            await new Promise<void>((resolve, reject) => {
              this._flush((err?: Error | null, data?: TOutput) => {
                if (err) {
                  reject(err);
                } else {
                  if (data !== undefined) {
                    controller.enqueue(data);
                  }
                  resolve();
                }
              });
            });
          } else if (userFlush) {
            if (isNodeStyleFlush) {
              // Node.js style: flush(callback)
              await new Promise<void>((resolve, reject) => {
                (userFlush as any).call(getInstance(), (err?: Error | null, data?: TOutput) => {
                  if (err) {
                    reject(err);
                  } else {
                    if (data !== undefined) {
                      controller.enqueue(data);
                    }
                    resolve();
                  }
                });
              });
            } else {
              // Simple style: flush() => result
              const result = await (userFlush as () => TOutput | void | Promise<TOutput | void>)();
              if (result !== undefined && result !== null) {
                controller.enqueue(result as TOutput);
              }
            }
          }
          // No flush defined - nothing to do
        } catch (err) {
          controller.error(err);
          emitEvent("error", err);
        } finally {
          setController(null);
        }
      }
    });

    this._readable = new Readable<TOutput>({
      stream: this._stream.readable,
      objectMode: this.objectMode
    });

    this._writable = new Writable<TInput>({
      stream: this._stream.writable,
      objectMode: this.objectMode
    });

    // Forward non-data events (data forwarding is lazy to avoid premature flowing)
    this._readable.on("end", () => this.emit("end"));
    // Only forward errors if not already errored (to prevent duplicate events)
    this._readable.on("error", err => {
      if (!this._errored) {
        this._errored = true;
        this.emit("error", err);
      }
    });
    this._writable.on("finish", () => this.emit("finish"));
    this._writable.on("drain", () => this.emit("drain"));
    // Only forward errors if not already errored (to prevent duplicate events)
    this._writable.on("error", err => {
      if (!this._errored) {
        this._errored = true;
        this.emit("error", err);
      }
    });
  }

  // Track if we've already set up data forwarding
  private _dataForwardingSetup: boolean = false;

  /**
   * Override on to start flowing when data listener is added
   */
  on(event: string | symbol, listener: (...args: any[]) => void): this {
    // Set up data forwarding when first external data listener is added
    if (event === "data" && !this._dataForwardingSetup) {
      this._dataForwardingSetup = true;
      this._readable.on("data", data => this.emit("data", data));
    }

    super.on(event, listener);

    // When data listener is added, mark as having consumer
    // and start the readable in flowing mode
    if (event === "data") {
      this._hasDataConsumer = true;
      this._readable.resume();
    }
    return this;
  }

  /** @internal - whether we have a data event consumer */
  private _hasDataConsumer: boolean = false;

  /**
   * Write data to the transform stream
   * Note: Automatically starts consuming readable if no consumer to allow
   * transform function to execute (Web Streams backpressure compatibility)
   */
  write(chunk: TInput, callback?: (error?: Error | null) => void): boolean;
  write(chunk: TInput, encoding?: string, callback?: (error?: Error | null) => void): boolean;
  write(
    chunk: TInput,
    encodingOrCallback?: string | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void
  ): boolean {
    const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
    if (this._destroyed || this._errored) {
      const err = new Error(
        this._errored ? "Cannot write after stream errored" : "Cannot write after stream destroyed"
      );
      queueMicrotask(() => this.emit("error", err));
      cb?.(err);
      return false;
    }

    // Ensure readable is being consumed to allow transform to execute
    // This matches Node.js behavior where transform executes immediately on write
    // Only auto-consume if no explicit consumer (data listener or pipe)
    if (!this._readableConsuming && !this._hasDataConsumer) {
      this._readableConsuming = true;
      this._startAutoConsume();
    }

    // If end() was called but writable not yet closed, buffer the write
    // This allows writes during data event handlers to be processed
    if (this._endPending) {
      this._pendingEndWrites.push({ chunk, callback: cb });
      return true;
    }

    return this._writable.write(chunk, cb);
  }

  /** @internal - whether we're auto-consuming the readable */
  private _readableConsuming: boolean = false;
  /** @internal - buffer for auto-consumed data */
  private _autoConsumedBuffer: TOutput[] = [];
  private _autoConsumedBufferIndex: number = 0;
  /** @internal - whether auto-consume has ended */
  private _autoConsumeEnded: boolean = false;
  /** @internal - promise that resolves when auto-consume finishes */
  private _autoConsumePromise: Promise<void> | null = null;

  /** @internal - auto-consume readable to allow transform to execute */
  private _startAutoConsume(): void {
    this._autoConsumePromise = (async () => {
      try {
        for await (const chunk of this._readable) {
          // Buffer the data for later retrieval
          this._autoConsumedBuffer.push(chunk);
          // Also emit data event for listeners
          this.emit("data", chunk);
        }
        this._autoConsumeEnded = true;
        this.emit("end");
      } catch (err) {
        this.emit("error", err);
      }
    })();
  }

  /**
   * End the transform stream
   * Delays closing to allow writes during data events to complete
   */
  end(callback?: () => void): this;
  end(chunk: TInput, callback?: () => void): this;
  end(chunk: TInput, encoding?: string, callback?: () => void): this;
  end(
    chunkOrCallback?: TInput | (() => void),
    encodingOrCallback?: string | (() => void),
    callback?: () => void
  ): this {
    if (this._ended) {
      return this;
    }
    this._ended = true;
    this._endPending = true;

    const chunk = typeof chunkOrCallback === "function" ? undefined : chunkOrCallback;
    const cb: (() => void) | undefined =
      typeof chunkOrCallback === "function"
        ? (chunkOrCallback as () => void)
        : typeof encodingOrCallback === "function"
          ? (encodingOrCallback as () => void)
          : callback;

    if (cb) {
      this.once("finish", cb as any);
    }

    if (chunk !== undefined) {
      this._writable.write(chunk);
    }

    // Use setTimeout(0) instead of queueMicrotask to ensure all transform
    // processing and data events complete before we close the writable.
    // Microtasks run before the TransformStream processes data.
    setTimeout(() => {
      // Process any writes that occurred during data events
      for (const { chunk: pendingChunk, callback } of this._pendingEndWrites) {
        this._writable.write(pendingChunk, callback);
      }
      this._pendingEndWrites = [];
      this._endPending = false;
      this._writable.end();
    }, 0);
    return this;
  }

  /**
   * Read from the transform stream
   */
  read(size?: number): TOutput | null {
    return this._readable.read(size);
  }

  /**
   * Pipe to another stream (writable, transform, or duplex)
   */
  pipe<W extends Writable<TOutput> | Transform<TOutput, any> | Duplex<any, TOutput>>(
    destination: W
  ): W {
    // Mark as having consumer to prevent auto-consume conflict
    this._hasDataConsumer = true;
    return this._readable.pipe(destination as any) as W;
  }

  /**
   * Unpipe from destination
   */
  unpipe(destination?: any): this {
    this._readable.unpipe(destination as any);
    return this;
  }

  /**
   * Check if paused
   */
  isPaused(): boolean {
    return this._readable.isPaused();
  }

  /**
   * Resume reading from the readable side
   */
  resume(): this {
    this._readable.resume();
    return this;
  }

  /**
   * Pause reading from the readable side
   */
  pause(): this {
    this._readable.pause();
    return this;
  }

  /**
   * Destroy the stream
   */
  destroy(error?: Error): void {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;
    this._readable.destroy(error);
    this._writable.destroy(error);
    queueMicrotask(() => this.emit("close"));
  }

  /**
   * Get the underlying Web TransformStream
   */
  get webStream(): TransformStream<TInput, TOutput> {
    return this._stream;
  }

  get readable(): boolean {
    return this._readable.readable;
  }

  get writable(): boolean {
    return this._writable.writable;
  }

  get readableEnded(): boolean {
    return this._readable.readableEnded;
  }

  get writableEnded(): boolean {
    return this._writable.writableEnded;
  }

  get writableFinished(): boolean {
    return this._writable.writableFinished;
  }

  get readableLength(): number {
    return this._readable.readableLength;
  }

  get writableLength(): number {
    return this._writable.writableLength;
  }

  get readableHighWaterMark(): number {
    return this._readable.readableHighWaterMark;
  }

  get writableHighWaterMark(): number {
    return this._writable.writableHighWaterMark;
  }

  get readableObjectMode(): boolean {
    return (this._readable as any).readableObjectMode ?? this._readable.objectMode;
  }

  get readableFlowing(): boolean | null {
    return (this._readable as any).readableFlowing;
  }

  get destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * Async iterator support
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<TOutput> {
    // If auto-consume is running, wait for it to finish and use its buffer
    if (this._autoConsumePromise) {
      await this._autoConsumePromise;
      // Yield all buffered data
      while (this._autoConsumedBufferIndex < this._autoConsumedBuffer.length) {
        yield this._autoConsumedBuffer[this._autoConsumedBufferIndex++]!;
      }
      // Reset when drained to avoid prefix growth
      this._autoConsumedBuffer.length = 0;
      this._autoConsumedBufferIndex = 0;
      return;
    }

    // Otherwise delegate to readable's iterator
    yield* this._readable[Symbol.asyncIterator]();
  }

  // =========================================================================
  // Static Methods (Node.js compatibility)
  // =========================================================================

  /**
   * Convert a Web TransformStream to Node.js Transform
   */
  static fromWeb<TIn = Uint8Array, TOut = Uint8Array>(
    webStream: TransformStream<TIn, TOut>,
    options?: TransformStreamOptions
  ): Transform<TIn, TOut> {
    const transform = new Transform<TIn, TOut>(options);
    // Connect the web stream - set the internal _stream property
    (transform as any)._stream = webStream;

    // Replace internal streams with the ones from the web stream
    const newReadable = Readable.fromWeb(webStream.readable, { objectMode: options?.objectMode });
    const newWritable = Writable.fromWeb(webStream.writable, { objectMode: options?.objectMode });

    // Remove old event listeners before replacing
    (transform as any)._readable.removeAllListeners();
    (transform as any)._writable.removeAllListeners();

    (transform as any)._readable = newReadable;
    (transform as any)._writable = newWritable;

    // Re-connect event forwarding
    newReadable.on("data", (data: TOut) => transform.emit("data", data));
    newReadable.on("end", () => transform.emit("end"));
    newReadable.on("error", (err: Error) => transform.emit("error", err));
    newWritable.on("finish", () => transform.emit("finish"));
    newWritable.on("drain", () => transform.emit("drain"));
    newWritable.on("error", (err: Error) => transform.emit("error", err));

    return transform;
  }

  /**
   * Convert a Node.js Transform to Web TransformStream
   */
  static toWeb<TIn = Uint8Array, TOut = Uint8Array>(
    nodeStream: Transform<TIn, TOut>
  ): TransformStream<TIn, TOut> {
    return nodeStream.webStream;
  }

  // =========================================================================
  // Base Class Methods (for subclass override detection)
  // =========================================================================

  /**
   * Base transform method - can be overridden by subclasses.
   * Default behavior: pass through chunk unchanged.
   */
  _transform(
    chunk: TInput,
    encoding: string,
    callback: (error?: Error | null, data?: TOutput) => void
  ): void {
    // Default: pass through unchanged
    callback(null, chunk as any as TOutput);
  }

  /**
   * Base flush method - can be overridden by subclasses.
   * Called when the stream ends to allow final processing.
   */
  _flush(callback: (error?: Error | null, data?: TOutput) => void): void {
    // Default: no-op
    callback();
  }
}

// =============================================================================
// Duplex Stream
// =============================================================================

/**
 * A duplex stream that combines readable and writable
 */
export class Duplex<TRead = Uint8Array, TWrite = Uint8Array> extends EventEmitter {
  /** @internal - for pipe() support */
  readonly _readable: Readable<TRead>;
  /** @internal - for pipe() support */
  readonly _writable: Writable<TWrite>;
  readonly allowHalfOpen: boolean;
  readonly readableObjectMode: boolean;
  readonly writableObjectMode: boolean;

  /**
   * Create a Duplex stream from various sources
   */
  static from<R = Uint8Array, W = Uint8Array>(
    source:
      | Duplex<R, W>
      | Readable<R>
      | Writable<W>
      | AsyncIterable<R>
      | Iterable<R>
      | {
          readable?: Readable<R>;
          writable?: Writable<W>;
        }
  ): Duplex<R, W> {
    // If it's already a Duplex, return as-is
    if (source instanceof Duplex) {
      return source;
    }

    const forwardReadableToDuplex = (readable: Readable<R>, duplex: Duplex<R, W>): void => {
      const sink = new Writable<R>({
        objectMode: duplex.readableObjectMode,
        write(chunk, _encoding, callback) {
          duplex.push(chunk);
          callback();
        },
        final(callback) {
          duplex.push(null);
          callback();
        }
      });

      readable.on("error", err => duplex.emit("error", err));
      readable.pipe(sink);
    };

    // If it has readable and/or writable properties
    if (
      typeof source === "object" &&
      source !== null &&
      "readable" in source &&
      "writable" in source
    ) {
      const duplex = new Duplex<R, W>();
      const pair = source as { readable?: Readable<R>; writable?: Writable<W> };

      if (pair.readable) {
        forwardReadableToDuplex(pair.readable, duplex);
      }

      if (pair.writable) {
        return new Duplex<R, W>({
          objectMode: duplex.writableObjectMode,
          write(chunk, encoding, callback) {
            pair.writable!.write(chunk, encoding, callback);
          },
          final(callback) {
            pair.writable!.end(callback);
          }
        });
      }

      return duplex;
    }

    // If it's an iterable
    if (
      typeof source === "object" &&
      source !== null &&
      (Symbol.asyncIterator in (source as object) || Symbol.iterator in (source as object))
    ) {
      const readable = Readable.from(source as AsyncIterable<R> | Iterable<R>);
      const duplex = new Duplex<R, W>();
      forwardReadableToDuplex(readable, duplex);
      return duplex;
    }

    // If it's a Readable
    if (source instanceof Readable) {
      const duplex = new Duplex<R, W>();
      forwardReadableToDuplex(source, duplex);
      return duplex;
    }

    // If it's a Writable
    if (source instanceof Writable) {
      return new Duplex<R, W>({
        objectMode: true,
        write(chunk, encoding, callback) {
          source.write(chunk as W, encoding, callback);
        },
        final(callback) {
          source.end(callback);
        }
      });
    }

    throw new Error("Duplex.from: unsupported source type");
  }

  /**
   * Create a Duplex from a Web ReadableWritablePair
   */
  static fromWeb<R = Uint8Array, W = Uint8Array>(
    pair: { readable: ReadableStream<R>; writable: WritableStream<W> },
    options?: DuplexStreamOptions
  ): Duplex<R, W> {
    const duplex = new Duplex<R, W>(options);

    // Replace internal streams
    (duplex as any)._readable = new Readable<R>({ stream: pair.readable });
    (duplex as any)._writable = new Writable<W>({ stream: pair.writable });

    return duplex;
  }

  /**
   * Convert a Node.js Duplex to Web ReadableWritablePair
   */
  static toWeb<R = Uint8Array, W = Uint8Array>(
    duplex: Duplex<R, W>
  ): { readable: ReadableStream<R>; writable: WritableStream<W> } {
    return {
      readable: duplex._readable.webStream,
      writable: duplex._writable.webStream
    };
  }

  // Track if we've already set up data forwarding
  private _dataForwardingSetup: boolean = false;

  constructor(
    options?: DuplexStreamOptions & {
      allowHalfOpen?: boolean;
      objectMode?: boolean;
      read?: (this: Duplex<TRead, TWrite>, size?: number) => void;
      write?: (
        this: Duplex<TRead, TWrite>,
        chunk: TWrite,
        encoding: string,
        callback: (error?: Error | null) => void
      ) => void;
      final?: (this: Duplex<TRead, TWrite>, callback: (error?: Error | null) => void) => void;
    }
  ) {
    super();

    this.allowHalfOpen = options?.allowHalfOpen ?? true;
    // Support shorthand objectMode option
    const objectMode = options?.objectMode ?? false;
    this.readableObjectMode = options?.readableObjectMode ?? objectMode;
    this.writableObjectMode = options?.writableObjectMode ?? objectMode;

    this._readable = new Readable<TRead>({
      highWaterMark: options?.readableHighWaterMark,
      objectMode: this.readableObjectMode,
      read: options?.read?.bind(this as any)
    });

    this._writable = new Writable<TWrite>({
      highWaterMark: options?.writableHighWaterMark,
      objectMode: this.writableObjectMode,
      write: options?.write?.bind(this as any),
      final: options?.final?.bind(this as any)
    });

    // Forward non-data events (data forwarding is lazy to avoid premature flowing)
    this._readable.on("end", () => {
      this.emit("end");
      // If not allowHalfOpen, end the writable side too
      if (!this.allowHalfOpen) {
        this._writable.end();
      }
    });
    this._readable.on("error", err => this.emit("error", err));
    this._writable.on("finish", () => this.emit("finish"));
    this._writable.on("drain", () => this.emit("drain"));
    this._writable.on("close", () => {
      // If not allowHalfOpen, destroy the readable side too
      if (!this.allowHalfOpen && !this._readable.destroyed) {
        this._readable.destroy();
      }
    });
  }

  /**
   * Override on() to set up data forwarding lazily
   */
  override on(event: string | symbol, listener: (...args: any[]) => void): this {
    // Set up data forwarding when first external data listener is added
    if (event === "data" && !this._dataForwardingSetup) {
      this._dataForwardingSetup = true;
      this._readable.on("data", chunk => this.emit("data", chunk));
    }
    return super.on(event, listener);
  }

  /**
   * Push data to readable side
   */
  push(chunk: TRead | null): boolean {
    return this._readable.push(chunk);
  }

  /**
   * Put a chunk back at the front of the buffer (readable side)
   */
  unshift(chunk: TRead): void {
    this._readable.unshift(chunk);
  }

  /**
   * Read from readable side
   */
  read(size?: number): TRead | null {
    return this._readable.read(size);
  }

  /**
   * Write to writable side
   */
  write(chunk: TWrite, callback?: (error?: Error | null) => void): boolean;
  write(chunk: TWrite, encoding?: string, callback?: (error?: Error | null) => void): boolean;
  write(
    chunk: TWrite,
    encodingOrCallback?: string | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void
  ): boolean {
    const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
    return this._writable.write(chunk, cb);
  }

  /**
   * End writable side
   */
  end(callback?: () => void): this;
  end(chunk: TWrite, callback?: () => void): this;
  end(chunk: TWrite, encoding?: string, callback?: () => void): this;
  end(
    chunkOrCallback?: TWrite | (() => void),
    encodingOrCallback?: string | (() => void),
    callback?: () => void
  ): this {
    const chunk = typeof chunkOrCallback === "function" ? undefined : chunkOrCallback;
    const cb: (() => void) | undefined =
      typeof chunkOrCallback === "function"
        ? (chunkOrCallback as () => void)
        : typeof encodingOrCallback === "function"
          ? (encodingOrCallback as () => void)
          : callback;

    if (cb) {
      this.once("finish", cb as any);
    }

    if (chunk !== undefined) {
      this._writable.write(chunk);
    }
    this._writable.end();
    return this;
  }

  /**
   * Cork the writable side
   */
  cork(): void {
    this._writable.cork();
  }

  /**
   * Uncork the writable side
   */
  uncork(): void {
    this._writable.uncork();
  }

  /**
   * Set encoding for readable side
   */
  setEncoding(encoding: string): this {
    this._readable.setEncoding(encoding);
    return this;
  }

  /**
   * Set default encoding for writable side
   */
  setDefaultEncoding(encoding: string): this {
    this._writable.setDefaultEncoding(encoding);
    return this;
  }

  /**
   * Pipe readable side to destination
   */
  pipe<W extends Writable<TRead> | Transform<TRead, any>>(destination: W): W {
    if (destination instanceof Transform) {
      this._readable.pipe(destination._writable);
      return destination;
    }
    this._readable.pipe(destination);
    return destination;
  }

  /**
   * Unpipe from destination
   */
  unpipe(destination?: Writable<TRead>): this {
    this._readable.unpipe(destination);
    return this;
  }

  /**
   * Pause the readable side
   */
  pause(): this {
    this._readable.pause();
    return this;
  }

  /**
   * Resume the readable side
   */
  resume(): this {
    this._readable.resume();
    return this;
  }

  /**
   * Check if paused
   */
  isPaused(): boolean {
    return this._readable.isPaused();
  }

  /**
   * Destroy both sides
   */
  destroy(error?: Error): this {
    this._readable.destroy(error);
    this._writable.destroy(error);
    return this;
  }

  get readable(): boolean {
    return this._readable.readable;
  }

  get writable(): boolean {
    return this._writable.writable;
  }

  get readableEnded(): boolean {
    return this._readable.readableEnded;
  }

  get writableEnded(): boolean {
    return this._writable.writableEnded;
  }

  get writableFinished(): boolean {
    return this._writable.writableFinished;
  }

  get readableLength(): number {
    return this._readable.readableLength;
  }

  get writableLength(): number {
    return this._writable.writableLength;
  }

  get readableHighWaterMark(): number {
    return this._readable.readableHighWaterMark;
  }

  get writableHighWaterMark(): number {
    return this._writable.writableHighWaterMark;
  }

  get destroyed(): boolean {
    return this._readable.destroyed && this._writable.destroyed;
  }

  get writableCorked(): number {
    return this._writable.writableCorked;
  }

  get writableNeedDrain(): boolean {
    return this._writable.writableNeedDrain;
  }

  /**
   * Async iterator support
   */
  [Symbol.asyncIterator](): AsyncIterableIterator<TRead> {
    return this._readable[Symbol.asyncIterator]();
  }
}

// =============================================================================
// PassThrough Stream
// =============================================================================

/**
 * A passthrough stream that passes data through unchanged
 */
export class PassThrough<T = Uint8Array> extends Transform<T, T> {
  constructor(options?: TransformStreamOptions) {
    super({
      ...options,
      transform: chunk => chunk
    });
  }
}

// =============================================================================
// Collector Stream
// =============================================================================

/**
 * A writable stream that collects all chunks
 */
export class Collector<T = Uint8Array> extends Writable<T> {
  public chunks: T[] = [];

  constructor(options?: WritableStreamOptions) {
    const collectedChunks: T[] = [];

    super({
      ...options,
      stream: new WritableStream<T>({
        write: chunk => {
          collectedChunks.push(chunk);
        },
        close: () => {
          // Finished
        }
      })
    });

    this.chunks = collectedChunks;
  }

  // Override write to be synchronous - Collector doesn't need async behavior
  // This makes behavior consistent with Node.js Collector
  override write(chunk: T, callback?: (error?: Error | null) => void): boolean;
  override write(chunk: T, encoding?: string, callback?: (error?: Error | null) => void): boolean;
  override write(
    chunk: T,
    encodingOrCallback?: string | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void
  ): boolean {
    if (this.writableEnded || this.writableFinished) {
      const err = new Error("write after end");
      this.emit("error", err);
      return false;
    }

    const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;

    // Synchronously push to chunks
    this.chunks.push(chunk);
    cb?.(null);
    return true;
  }

  /**
   * Get all collected data as a single Uint8Array (for binary mode)
   */
  toUint8Array(): Uint8Array {
    const chunks = this.chunks;
    const len = chunks.length;
    if (len === 0) {
      return new Uint8Array(0);
    }
    if (len === 1 && chunks[0] instanceof Uint8Array) {
      return chunks[0];
    }

    // If chunks are Uint8Arrays, concatenate them
    if (chunks[0] instanceof Uint8Array) {
      return concatUint8Arrays(chunks as Uint8Array[]);
    }

    throw new Error("Collector contains non-binary data");
  }

  /**
   * Get all collected data as a string
   */
  override toString(): string {
    const chunks = this.chunks;
    const len = chunks.length;
    if (len === 0) {
      return "";
    }

    const first = chunks[0];
    if (typeof first === "string") {
      if (len === 1) {
        return first;
      }
      return (chunks as string[]).join("");
    }

    return textDecoder.decode(this.toUint8Array());
  }

  get isFinished(): boolean {
    // Use inherited writable property
    return this.writableFinished;
  }
}

// =============================================================================
// PullStream / BufferedStream / DataChunk helpers
// =============================================================================

export class PullStream extends StandalonePullStream {
  // Keep constructor signature aligned with streams.browser.ts public API
  constructor(options?: PullStreamOptions | StandalonePullStreamOptions) {
    super(options as any);
  }
}

export class StringChunk extends StandaloneStringChunk implements DataChunk {}
export class BufferChunk extends StandaloneBufferChunk implements DataChunk {}
export class BufferedStream extends StandaloneBufferedStream {
  constructor(options?: BufferedStreamOptions) {
    super(options);
  }
}

// =============================================================================
// Stream Creation Functions
// =============================================================================

/**
 * Create a readable stream with custom read implementation
 */
export function createReadable<T = Uint8Array>(
  options?: ReadableStreamOptions & {
    read?: (size: number) => void;
    destroy?: (error: Error | null, callback: (error: Error | null) => void) => void;
  }
): IReadable<T> {
  const readable = new Readable<T>(options);

  // Override read behavior if provided
  if (options?.read) {
    const originalRead = readable.read.bind(readable);
    readable.read = function (size?: number): T | null {
      options.read!(size ?? 16384);
      return originalRead(size);
    };
  }

  return readable;
}

/**
 * Create a readable stream from an async iterable
 */
export function createReadableFromAsyncIterable<T>(
  iterable: AsyncIterable<T>,
  options?: ReadableStreamOptions
): IReadable<T> {
  const readable = new Readable<T>({ ...options, objectMode: options?.objectMode ?? true });

  (async () => {
    try {
      for await (const chunk of iterable) {
        if (!readable.push(chunk)) {
          // Backpressure - wait a bit
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      readable.push(null);
    } catch (err) {
      readable.destroy(err as Error);
    }
  })();

  return readable;
}

/**
 * Create a readable stream from an array
 */
export function createReadableFromArray<T>(
  data: T[],
  options?: ReadableStreamOptions
): IReadable<T> {
  let index = 0;
  const readable = new Readable<T>({
    ...options,
    objectMode: options?.objectMode ?? true,
    read() {
      // Push data when read is called
      while (index < data.length) {
        if (!this.push(data[index++])) {
          // Backpressure - wait for next read
          return;
        }
      }
      // All data pushed, end the stream
      this.push(null);
    }
  });

  return readable;
}

/**
 * Create a writable stream with custom write implementation
 */
export function createWritable<T = Uint8Array>(
  options?: WritableStreamOptions & {
    write?: (chunk: T, encoding: string, callback: (error?: Error | null) => void) => void;
    final?: (callback: (error?: Error | null) => void) => void;
    destroy?: (error: Error | null, callback: (error: Error | null) => void) => void;
  }
): IWritable<T> {
  // Create a custom WritableStream with user's handlers
  const stream = new WritableStream<T>({
    write: async chunk => {
      if (options?.write) {
        return new Promise<void>((resolve, reject) => {
          options.write!(chunk, "utf8", err => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      }
    },
    close: async () => {
      if (options?.final) {
        return new Promise<void>((resolve, reject) => {
          options.final!(err => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      }
    }
  });

  return new Writable<T>({ ...options, stream });
}

/**
 * Create a transform stream from a transform function
 */
export function createTransform<TInput = Uint8Array, TOutput = Uint8Array>(
  transformFn: (chunk: TInput, encoding?: string) => TOutput | Promise<TOutput>,
  options?: TransformStreamOptions & {
    flush?: () => TOutput | Promise<TOutput> | void;
  }
): ITransform<TInput, TOutput> {
  return new Transform<TInput, TOutput>({
    ...options,
    transform: transformFn,
    flush: options?.flush
  });
}

/**
 * Create a collector stream
 */
export function createCollector<T = Uint8Array>(options?: WritableStreamOptions): ICollector<T> {
  return new Collector<T>(options);
}

/**
 * Create a passthrough stream
 */
export function createPassThrough<T = any>(options?: TransformStreamOptions): IPassThrough<T> {
  return new PassThrough(options);
}

/**
 * Create a pull stream
 */
export function createPullStream(options?: PullStreamOptions): PullStream {
  return new PullStream(options);
}

/**
 * Create a buffered stream
 */
export function createBufferedStream(options?: BufferedStreamOptions): BufferedStream {
  return new BufferedStream(options);
}

// =============================================================================
// Pipeline Options (Node.js compatible)
// =============================================================================

export interface PipelineOptions {
  /** AbortSignal to cancel the pipeline */
  signal?: AbortSignal;
  /** Whether to call end() on the destination when source ends */
  end?: boolean;
}

// =============================================================================
// Pipeline
// =============================================================================

type PipelineStream = PipelineStreamLike;
type PipelineCallback = (err?: Error | null) => void;

const isReadableStream = (value: unknown): value is ReadableStream<any> =>
  !!value && typeof value === "object" && typeof (value as any).getReader === "function";

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> => {
  if (!value || (typeof value !== "object" && typeof value !== "function")) {
    return false;
  }
  return typeof (value as any)[Symbol.asyncIterator] === "function";
};

const isWritableStream = (value: unknown): value is WritableStream<any> =>
  !!value && typeof value === "object" && typeof (value as any).getWriter === "function";

const isTransformStream = (value: unknown): value is TransformStream<any, any> =>
  !!value &&
  typeof value === "object" &&
  !!(value as any).readable &&
  !!(value as any).writable &&
  isReadableStream((value as any).readable) &&
  isWritableStream((value as any).writable);

const isPipelineOptions = (value: unknown): value is PipelineOptions => {
  if (!value || typeof value !== "object") {
    return false;
  }
  // IMPORTANT:
  // Do NOT use `"end" in obj` here because streams have `.end()` and would be
  // misclassified as options, breaking argument parsing and potentially hanging.
  if (
    typeof (value as any).pipe === "function" ||
    typeof (value as any).write === "function" ||
    typeof (value as any).end === "function" ||
    typeof (value as any).getReader === "function" ||
    typeof (value as any).getWriter === "function"
  ) {
    return false;
  }

  return (
    Object.prototype.hasOwnProperty.call(value, "signal") ||
    Object.prototype.hasOwnProperty.call(value, "end")
  );
};

const toBrowserPipelineStream = (stream: PipelineStream): any => {
  if (
    stream instanceof Readable ||
    stream instanceof Writable ||
    stream instanceof Transform ||
    stream instanceof Duplex
  ) {
    return stream;
  }

  if (isTransformStream(stream)) {
    return Transform.fromWeb(stream as any);
  }
  if (isReadableStream(stream)) {
    return Readable.fromWeb(stream as any);
  }
  if (isWritableStream(stream)) {
    return Writable.fromWeb(stream as any);
  }

  return stream;
};

/**
 * Pipeline streams together with proper error handling and cleanup.
 * Supports both callback and promise-based usage like Node.js.
 *
 * @example
 * // Promise usage
 * await pipeline(source, transform, destination);
 *
 * @example
 * // With options
 * await pipeline(source, transform, destination, { signal: controller.signal });
 *
 * @example
 * // Callback usage
 * pipeline(source, transform, destination, (err) => {
 *   if (err) console.error('Pipeline failed', err);
 * });
 */
export function pipeline(
  ...args: [...PipelineStream[], PipelineOptions | PipelineCallback] | PipelineStream[]
): Promise<void> {
  // Parse arguments
  let streams: PipelineStream[];
  let options: PipelineOptions = {};
  let callback: PipelineCallback | undefined;

  const lastArg = args[args.length - 1];

  if (typeof lastArg === "function") {
    // Callback style: pipeline(s1, s2, s3, callback)
    callback = lastArg as PipelineCallback;
    streams = args.slice(0, -1) as PipelineStream[];
  } else if (isPipelineOptions(lastArg)) {
    // Options style: pipeline(s1, s2, s3, { signal })
    options = lastArg as PipelineOptions;
    streams = args.slice(0, -1) as PipelineStream[];
  } else {
    // No callback or options: pipeline(s1, s2, s3)
    streams = args as PipelineStream[];
  }

  const promise = new Promise<void>((resolve, reject) => {
    if (streams.length < 2) {
      const err = new Error("Pipeline requires at least 2 streams");
      reject(err);
      return;
    }

    const normalized = streams.map(toBrowserPipelineStream);
    const source = normalized[0] as any;
    const destination = normalized[normalized.length - 1] as any;
    const transforms = normalized.slice(1, -1) as any[];

    let completed = false;
    const allStreams = [source, ...transforms, destination];

    const cleanup = (error?: Error): void => {
      if (completed) {
        return;
      }
      completed = true;

      // Destroy all streams on error
      if (error) {
        for (const stream of allStreams) {
          if (typeof stream.destroy === "function") {
            stream.destroy(error);
          }
        }
        reject(error);
      } else {
        resolve();
      }
    };

    // Handle abort signal
    if (options.signal) {
      if (options.signal.aborted) {
        cleanup(new Error("Pipeline aborted"));
        return;
      }
      options.signal.addEventListener("abort", () => {
        cleanup(new Error("Pipeline aborted"));
      });
    }

    // Chain the streams
    let current: any = source;
    for (const transform of transforms) {
      current.pipe(transform);
      current = transform;
    }

    // Pipe to destination
    if (options.end !== false) {
      current.pipe(destination);
    } else {
      // Don't end destination
      current.on("data", chunk => destination.write(chunk));
    }

    // Handle completion
    destination.on("finish", () => cleanup());

    // Handle errors on all streams
    for (const stream of allStreams) {
      stream.on("error", (err: Error) => cleanup(err));
    }
  });

  // If callback provided, use it
  if (callback) {
    promise.then(() => callback!(null)).catch(err => callback!(err));
  }

  return promise;
}

// =============================================================================
// Finished Options (Node.js compatible)
// =============================================================================

export interface FinishedOptions {
  /** Check for readable stream completion */
  readable?: boolean;
  /** Check for writable stream completion */
  writable?: boolean;
  /** Resolve on error instead of reject */
  error?: boolean;
  /** AbortSignal to cancel waiting */
  signal?: AbortSignal;
}

/**
 * Wait for a stream to finish, close, or error.
 * Node.js compatible with support for options and callbacks.
 *
 * @example
 * // Promise usage
 * await finished(stream);
 *
 * @example
 * // With options
 * await finished(stream, { readable: false }); // Only wait for writable side
 *
 * @example
 * // Callback usage
 * finished(stream, (err) => {
 *   if (err) console.error('Stream error', err);
 * });
 */
export function finished(
  stream: PipelineStream,
  optionsOrCallback?: FinishedOptions | ((err?: Error | null) => void),
  callback?: (err?: Error | null) => void
): Promise<void> {
  let options: FinishedOptions = {};
  let cb: ((err?: Error | null) => void) | undefined;

  if (typeof optionsOrCallback === "function") {
    cb = optionsOrCallback;
  } else if (optionsOrCallback) {
    options = optionsOrCallback;
    cb = callback;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const normalizedStream = toBrowserPipelineStream(stream);
    let resolved = false;

    const done = (err?: Error | null): void => {
      if (resolved) {
        return;
      }
      resolved = true;

      if (err && !options.error) {
        reject(err);
      } else {
        resolve();
      }
    };

    // Handle abort signal
    if (options.signal) {
      if (options.signal.aborted) {
        done(new Error("Aborted"));
        return;
      }
      options.signal.addEventListener("abort", () => {
        done(new Error("Aborted"));
      });
    }

    const checkReadable = options.readable !== false;
    const checkWritable = options.writable !== false;

    // Already finished?
    if (checkReadable && (normalizedStream as any).readableEnded) {
      done();
      return;
    }

    if (checkWritable && (normalizedStream as any).writableFinished) {
      done();
      return;
    }

    // Listen for events
    if (checkWritable) {
      normalizedStream.on("finish", () => done());
    }

    if (checkReadable) {
      normalizedStream.on("end", () => done());
    }

    normalizedStream.on("error", (err: Error) => done(err));
    normalizedStream.on("close", () => done());
  });

  // If callback provided, use it
  if (cb) {
    promise.then(() => cb!(null)).catch(err => cb!(err));
  }

  return promise;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert a stream to a promise that resolves when finished
 */
export async function streamToPromise(stream: PipelineStream): Promise<void> {
  return finished(stream);
}

/**
 * Collect all data from a readable stream into a Uint8Array
 * (Browser equivalent of Node.js streamToBuffer)
 */
export async function streamToUint8Array(
  stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>
): Promise<Uint8Array> {
  let iterable: AsyncIterable<Uint8Array>;
  if (isReadableStream(stream)) {
    iterable = Readable.fromWeb(stream as any);
  } else if (isAsyncIterable(stream)) {
    iterable = stream;
  } else {
    throw new Error("streamToUint8Array: unsupported stream type");
  }

  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  for await (const chunk of iterable) {
    chunks.push(chunk);
    totalLength += chunk.length;
  }

  // Fast paths
  const len = chunks.length;
  if (len === 0) {
    return new Uint8Array(0);
  }
  if (len === 1) {
    return chunks[0];
  }

  // Use precalculated total length
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (let i = 0; i < len; i++) {
    result.set(chunks[i], offset);
    offset += chunks[i].length;
  }
  return result;
}

/**
 * Alias for streamToUint8Array (Node.js compatibility)
 */
export const streamToBuffer = streamToUint8Array;

/**
 * Collect all data from a readable stream into a string
 */
export async function streamToString(
  stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>,
  encoding?: string
): Promise<string> {
  const buffer = await streamToUint8Array(stream as any);
  return getTextDecoder(encoding).decode(buffer);
}

/**
 * Drain a stream (consume all data without processing)
 */
export async function drainStream(
  stream: AsyncIterable<unknown> | ReadableStream<unknown>
): Promise<void> {
  let iterable: AsyncIterable<unknown>;
  if (isReadableStream(stream)) {
    iterable = Readable.fromWeb(stream as any);
  } else if (isAsyncIterable(stream)) {
    iterable = stream;
  } else {
    throw new Error("drainStream: unsupported stream type");
  }

  for await (const _chunk of iterable) {
    // Consume data
  }
}

/**
 * Copy from a readable stream to a writable stream
 */
export async function copyStream(
  source: PipelineStreamLike,
  destination: PipelineStreamLike
): Promise<void> {
  return pipeline(source as any, destination as any);
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if an object is a transform stream
 */
export function isTransform(obj: unknown): obj is ITransform<any, any> {
  if (obj == null) {
    return false;
  }
  if (obj instanceof Transform) {
    return true;
  }
  const o = obj as Record<string, unknown>;
  return (
    typeof o.read === "function" &&
    typeof o.pipe === "function" &&
    typeof o.write === "function" &&
    typeof o.end === "function" &&
    typeof (o as any)._transform === "function"
  );
}

/**
 * Check if an object is a duplex stream
 * Note: In Node.js, Transform extends Duplex, so Transform is also a Duplex
 */
export function isDuplex(obj: unknown): obj is IDuplex<any, any> {
  if (obj == null) {
    return false;
  }
  if (obj instanceof Duplex || obj instanceof Transform) {
    return true;
  }
  const o = obj as Record<string, unknown>;
  return (
    typeof o.read === "function" &&
    typeof o.pipe === "function" &&
    typeof o.write === "function" &&
    typeof o.end === "function"
  );
}

/**
 * Check if an object is any kind of stream
 */
export function isStream(obj: unknown): obj is ReadableLike | WritableLike {
  if (obj == null) {
    return false;
  }
  if (obj instanceof Readable || obj instanceof Writable) {
    return true;
  }
  const o = obj as Record<string, unknown>;
  return (
    (typeof o.read === "function" && typeof o.pipe === "function") ||
    (typeof o.write === "function" && typeof o.end === "function")
  );
}

// =============================================================================
// Additional Utility Functions (Node.js Compatibility)
// =============================================================================

/**
 * Add abort signal handling to any stream
 */
export function addAbortSignal<
  T extends (ReadableLike | WritableLike) & { destroy(error?: Error): any }
>(signal: AbortSignal, stream: T): T {
  if (signal.aborted) {
    stream.destroy(new Error("Aborted"));
    return stream;
  }

  const onAbort = (): void => {
    stream.destroy(new Error("Aborted"));
  };

  signal.addEventListener("abort", onAbort, { once: true });

  // Clean up when stream is destroyed
  stream.on("close", () => {
    signal.removeEventListener("abort", onAbort);
  });

  return stream;
}

/**
 * Create a duplex stream from a pair of readable and writable streams
 */
export function createDuplex<TRead = Uint8Array, TWrite = Uint8Array>(
  options?: DuplexStreamOptions & {
    readable?: unknown;
    writable?: unknown;
    allowHalfOpen?: boolean;
    objectMode?: boolean;
    read?: (this: any, size: number) => void;
    write?: (
      this: any,
      chunk: TWrite,
      encoding: string,
      callback: (error?: Error | null) => void
    ) => void;
    final?: (this: any, callback: (error?: Error | null) => void) => void;
    destroy?: (this: any, error: Error | null, callback: (error: Error | null) => void) => void;
  }
): IDuplex<TRead, TWrite> {
  const readableObjectMode = options?.readableObjectMode ?? options?.objectMode;
  const writableObjectMode = options?.writableObjectMode ?? options?.objectMode;

  const duplex = new Duplex<TRead, TWrite>({
    allowHalfOpen: options?.allowHalfOpen,
    readableHighWaterMark: options?.readableHighWaterMark,
    writableHighWaterMark: options?.writableHighWaterMark,
    readableObjectMode,
    writableObjectMode
  });

  // If custom readable/writable provided, pipe them
  if ((options as any)?.readable) {
    const readable: any = (options as any).readable;
    readable.on?.("data", (chunk: any) => duplex.push(chunk));
    readable.on?.("end", () => duplex.push(null));
    readable.on?.("error", (err: any) => duplex.destroy(err));
  }

  if ((options as any)?.writable) {
    const writable: any = (options as any).writable;
    duplex.on("data", (chunk: TWrite) => writable.write?.(chunk as any));
    duplex.on("finish", () => writable.end?.());
  }

  // If custom read/write/final provided, override methods
  if (options?.write) {
    const _originalWrite = duplex.write.bind(duplex); // Keep bound reference for potential future use
    duplex.write = function (
      chunk: TWrite,
      encodingOrCallback?: string | ((error?: Error | null) => void),
      callback?: (error?: Error | null) => void
    ): boolean {
      const encoding = typeof encodingOrCallback === "string" ? encodingOrCallback : "utf8";
      const cb =
        typeof encodingOrCallback === "function" ? encodingOrCallback : (callback ?? (() => {}));

      options.write!.call(duplex, chunk, encoding, cb);
      return true;
    };
  }

  if (options?.final) {
    const originalEnd = duplex.end.bind(duplex);
    duplex.end = function (
      chunkOrCallback?: TWrite | (() => void),
      encodingOrCallback?: string | (() => void),
      callback?: () => void
    ): Duplex<TRead, TWrite> {
      const cb =
        typeof chunkOrCallback === "function"
          ? chunkOrCallback
          : typeof encodingOrCallback === "function"
            ? encodingOrCallback
            : (callback ?? (() => {}));

      if (chunkOrCallback !== undefined && typeof chunkOrCallback !== "function") {
        duplex.write(chunkOrCallback);
      }

      // Call custom final handler
      options.final!.call(duplex, (err?: Error | null) => {
        if (err) {
          duplex.emit("error", err);
        } else {
          duplex.emit("finish");
        }
        // Call original end to properly close writable side
        originalEnd();
        (cb as () => void)();
      });

      return duplex;
    };
  }

  if (options?.destroy) {
    const originalDestroy = duplex.destroy.bind(duplex);
    duplex.destroy = function (error?: Error): Duplex<TRead, TWrite> {
      options.destroy!.call(duplex, error ?? null, (err: Error | null) => {
        if (err) {
          duplex.emit("error", err);
          originalDestroy(err as any);
        } else {
          originalDestroy(error);
        }
      });
      return duplex;
    };
  }

  return duplex;
}

/**
 * Create a readable stream from a generator function
 */
export function createReadableFromGenerator<T>(
  generator: () => AsyncGenerator<T, void, unknown>,
  options?: ReadableStreamOptions
): IReadable<T> {
  const readable = new Readable<T>({ ...options, objectMode: options?.objectMode ?? true });

  (async () => {
    try {
      for await (const chunk of generator()) {
        if (!readable.push(chunk)) {
          // Backpressure
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      readable.push(null);
    } catch (err) {
      readable.destroy(err as Error);
    }
  })();

  return readable;
}

/**
 * Create a readable stream from a Promise
 */
export function createReadableFromPromise<T>(
  promise: Promise<T>,
  options?: ReadableStreamOptions
): IReadable<T> {
  const readable = new Readable<T>({ ...options, objectMode: options?.objectMode ?? true });

  promise
    .then(value => {
      readable.push(value);
      readable.push(null);
    })
    .catch(err => {
      readable.destroy(err);
    });

  return readable;
}

/**
 * Compose multiple transform streams into one
 * Data flows through each transform in sequence
 */
export function compose<T = any, R = any>(
  ...transforms: Array<ITransform<any, any>>
): Transform<T, R> {
  const len = transforms.length;

  if (len === 0) {
    return new Transform<T, R>({
      objectMode: true,
      transform: chunk => chunk as any as R
    });
  }

  const isNativeTransform = (stream: ITransform<any, any>): stream is Transform<any, any> =>
    stream instanceof Transform;

  if (len === 1 && isNativeTransform(transforms[0]!)) {
    return transforms[0];
  }

  // Chain the transforms: first → second → ... → last
  const first = transforms[0] as any;
  const last = transforms[len - 1] as any;

  // Pipe all transforms together
  for (let i = 0; i < len - 1; i++) {
    transforms[i].pipe(transforms[i + 1] as any);
  }

  class ComposedTransform extends Transform<T, R> {
    private _dataForwarding: boolean = false;
    private _endForwarding: boolean = false;

    override on(event: string | symbol, listener: (...args: any[]) => void): this {
      if (event === "data" && !this._dataForwarding) {
        this._dataForwarding = true;
        last.on("data", (chunk: R) => this.emit("data", chunk));
      }
      if (event === "end" && !this._endForwarding) {
        this._endForwarding = true;
        last.on("end", () => this.emit("end"));
      }
      return super.on(event, listener);
    }

    override write(
      chunk: T,
      encodingOrCallback?: string | ((error?: Error | null) => void),
      callback?: (error?: Error | null) => void
    ): boolean {
      if (typeof encodingOrCallback === "function") {
        return first.write(chunk as any, encodingOrCallback);
      }
      return first.write(chunk as any, encodingOrCallback, callback);
    }

    override end(
      chunkOrCallback?: T | (() => void),
      encodingOrCallback?: string | (() => void),
      callback?: () => void
    ): this {
      if (typeof chunkOrCallback === "function") {
        first.end(chunkOrCallback);
        return this;
      }
      if (typeof encodingOrCallback === "function") {
        first.end(chunkOrCallback as any, encodingOrCallback);
        return this;
      }
      first.end(chunkOrCallback as any, encodingOrCallback as any, callback as any);
      return this;
    }

    override pipe<W extends Writable<R> | Transform<R, any> | Duplex<any, R>>(destination: W): W {
      return last.pipe(destination as any) as W;
    }

    override destroy(error?: Error): void {
      for (const t of transforms) {
        t.destroy(error);
      }
      super.destroy(error);
    }

    read(size?: number): R | null {
      return typeof last.read === "function" ? (last.read(size) as R | null) : null;
    }

    async *[Symbol.asyncIterator](): AsyncIterableIterator<R> {
      const it = (last as any)?.[Symbol.asyncIterator]?.();
      if (it) {
        for await (const chunk of it as AsyncIterable<R>) {
          yield chunk;
        }
        return;
      }
      yield* super[Symbol.asyncIterator]();
    }
  }

  const composed = new ComposedTransform({
    objectMode: first?.objectMode ?? true,
    transform: chunk => chunk as any as R
  });

  // Forward errors from any transform
  for (const t of transforms as any[]) {
    t.on("error", (err: Error) => {
      composed.emit("error", err);
    });
  }

  // Reflect underlying readability/writability like the previous duck-typed wrapper
  Object.defineProperty(composed, "readable", {
    get: () => last.readable
  });
  Object.defineProperty(composed, "writable", {
    get: () => first.writable
  });

  return composed;
}

/**
 * Wait for multiple streams to finish
 */
export async function finishedAll(streams: ReadonlyArray<PipelineStreamLike>): Promise<void> {
  const len = streams.length;
  if (len === 0) {
    return;
  }
  if (len === 1) {
    await finished(streams[0]);
    return;
  }
  // Pre-allocate promise array
  const promises = new Array<Promise<void>>(len);
  for (let i = 0; i < len; i++) {
    promises[i] = finished(streams[i]);
  }
  await Promise.all(promises);
}

// Reusable empty push callback for createEmptyReadable
const pushNull = (readable: Readable<any>): void => {
  readable.push(null);
};

/**
 * Create a readable stream that emits nothing and immediately ends
 */
export function createEmptyReadable<T = Uint8Array>(options?: ReadableStreamOptions): IReadable<T> {
  const readable = new Readable<T>(options);
  queueMicrotask(() => pushNull(readable));
  return readable;
}

// Reusable null write handler
const nullWriteHandler: UnderlyingSink<any> = {
  write: () => {
    // Discard
  }
};

/**
 * Create a writable stream that discards all data (like /dev/null)
 */
export function createNullWritable<T = any>(options?: WritableStreamOptions): IWritable<T> {
  return new Writable<T>({
    ...options,
    stream: new WritableStream<T>(nullWriteHandler)
  });
}

/**
 * Promisified version of once for events
 */
export function once(
  emitter: IEventEmitter,
  event: string,
  options?: { signal?: AbortSignal }
): Promise<any[]> {
  return new Promise((resolve, reject) => {
    let onAbort: (() => void) | undefined;
    let resolved = false;

    const cleanup = (): void => {
      if (resolved) {
        return;
      }
      resolved = true;
      emitter.off(event, onEvent);
      emitter.off("error", onError);
      if (onAbort && options?.signal) {
        options.signal.removeEventListener("abort", onAbort);
      }
    };

    const onEvent = (...args: any[]): void => {
      cleanup();
      resolve(args);
    };

    const onError = (err: Error): void => {
      cleanup();
      reject(err);
    };

    emitter.once(event, onEvent);
    emitter.once("error", onError);

    if (options?.signal) {
      if (options.signal.aborted) {
        cleanup();
        reject(new Error("Aborted"));
        return;
      }
      onAbort = () => {
        cleanup();
        reject(new Error("Aborted"));
      };
      options.signal.addEventListener("abort", onAbort);
    }
  });
}

/**
 * Convert a callback-based stream operation to a promise
 */
export function promisify<T>(
  fn: (callback: (error?: Error | null, result?: T) => void) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    fn((error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result as T);
      }
    });
  });
}

// =============================================================================
// Default High Water Mark Management
// =============================================================================

let _defaultHighWaterMark = 16384; // 16KB default
let _defaultHighWaterMarkObjectMode = 16; // 16 objects default

/**
 * Get the default high water mark for streams
 */
export function getDefaultHighWaterMark(objectMode: boolean): number {
  return objectMode ? _defaultHighWaterMarkObjectMode : _defaultHighWaterMark;
}

/**
 * Set the default high water mark for streams
 */
export function setDefaultHighWaterMark(objectMode: boolean, value: number): void {
  if (objectMode) {
    _defaultHighWaterMarkObjectMode = value;
  } else {
    _defaultHighWaterMark = value;
  }
}

// =============================================================================
// Stream State Inspection Functions
// =============================================================================

/**
 * Check if a stream has been destroyed
 */
export function isDestroyed(stream: { destroyed?: boolean } | null | undefined): boolean {
  return !!(stream as any)?.destroyed;
}

/**
 * Check if a readable stream has been disturbed (read from)
 */
export function isDisturbed(stream: unknown): boolean {
  if (stream instanceof Readable) {
    return Readable.isDisturbed(stream);
  }
  if (stream instanceof Duplex) {
    return Readable.isDisturbed((stream as any)._readable);
  }

  const s = stream as any;
  return (
    s?.readableDidRead === true ||
    s?._didRead === true ||
    s?._ended === true ||
    s?._destroyed === true
  );
}

/**
 * Check if a stream has an error
 */
export function isErrored(stream: { errored?: unknown } | null | undefined): boolean {
  const err = (stream as any)?.errored;
  return err !== null && err !== undefined;
}

/**
 * Check if a stream is readable
 */
export function isReadable(stream: unknown): stream is ReadableLike {
  if (stream == null) {
    return false;
  }
  if (stream instanceof Readable || stream instanceof Transform) {
    return true;
  }
  if (stream instanceof Duplex) {
    return (stream as any)._readable instanceof Readable;
  }
  const o = stream as Record<string, unknown>;
  return typeof o.read === "function" && typeof o.pipe === "function";
}

/**
 * Check if a stream is writable
 */
export function isWritable(stream: unknown): stream is WritableLike {
  if (stream == null) {
    return false;
  }
  if (stream instanceof Writable || stream instanceof Transform) {
    return true;
  }
  if (stream instanceof Duplex) {
    return (stream as any)._writable instanceof Writable;
  }
  const o = stream as Record<string, unknown>;
  return typeof o.write === "function" && typeof o.end === "function";
}

// =============================================================================
// Duplex Pair
// =============================================================================

/**
 * Create a pair of connected Duplex streams
 * Data written to one stream can be read from the other
 */
export function duplexPair<T = Uint8Array>(
  options?: DuplexStreamOptions
): [Duplex<T, T>, Duplex<T, T>] {
  const stream1 = new Duplex<T, T>(options);
  const stream2 = new Duplex<T, T>(options);

  // Override write to push to the other stream's readable
  stream1.write = function (chunk: T): boolean {
    // Push to stream2's readable side
    stream2.push(chunk);
    return true;
  };

  stream2.write = function (chunk: T): boolean {
    // Push to stream1's readable side
    stream1.push(chunk);
    return true;
  };

  // Override end to signal EOF to the other stream
  const originalEnd1 = stream1.end.bind(stream1);
  const originalEnd2 = stream2.end.bind(stream2);

  stream1.end = function (chunk?: T | (() => void)): any {
    if (chunk !== undefined && typeof chunk !== "function") {
      stream2.push(chunk);
    }
    stream2.push(null);
    return originalEnd1(typeof chunk === "function" ? chunk : undefined);
  };

  stream2.end = function (chunk?: T | (() => void)): any {
    if (chunk !== undefined && typeof chunk !== "function") {
      stream1.push(chunk);
    }
    stream1.push(null);
    return originalEnd2(typeof chunk === "function" ? chunk : undefined);
  };

  return [stream1, stream2];
}

// =============================================================================
// Stream Consumers (like stream.consumers in Node.js)
// =============================================================================

// Helper function to collect stream chunks with total length tracking
async function collectStreamChunks(
  stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>
): Promise<{ chunks: Uint8Array[]; totalLength: number }> {
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  let iterable: AsyncIterable<Uint8Array>;
  if (isReadableStream(stream)) {
    iterable = Readable.fromWeb(stream as any);
  } else if (isAsyncIterable(stream)) {
    iterable = stream;
  } else {
    throw new Error("collectStreamChunks: unsupported stream type");
  }

  for await (const chunk of iterable) {
    chunks.push(chunk);
    totalLength += chunk.length;
  }
  return { chunks, totalLength };
}

// Helper to concatenate with known length (faster)
function concatWithLength(chunks: Uint8Array[], totalLength: number): Uint8Array {
  const len = chunks.length;
  if (len === 0) {
    return new Uint8Array(0);
  }
  if (len === 1) {
    return chunks[0];
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (let i = 0; i < len; i++) {
    result.set(chunks[i], offset);
    offset += chunks[i].length;
  }
  return result;
}

export const consumers = {
  /**
   * Consume entire stream as ArrayBuffer
   */
  async arrayBuffer(
    stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>
  ): Promise<ArrayBuffer> {
    const { chunks, totalLength } = await collectStreamChunks(stream);
    const combined = concatWithLength(chunks, totalLength);
    return combined.buffer.slice(
      combined.byteOffset,
      combined.byteOffset + combined.byteLength
    ) as ArrayBuffer;
  },

  /**
   * Consume entire stream as Blob
   */
  async blob(
    stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>,
    options?: BlobPropertyBag
  ): Promise<Blob> {
    const { chunks } = await collectStreamChunks(stream);
    return new Blob(chunks as any, options);
  },

  /**
   * Consume entire stream as Buffer (Uint8Array in browser)
   */
  async buffer(
    stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>
  ): Promise<Uint8Array> {
    const { chunks, totalLength } = await collectStreamChunks(stream);
    return concatWithLength(chunks, totalLength);
  },

  /**
   * Consume entire stream as JSON
   */
  async json(stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>): Promise<any> {
    const text = await consumers.text(stream);
    return JSON.parse(text);
  },

  /**
   * Consume entire stream as text
   */
  async text(
    stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>,
    encoding?: string
  ): Promise<string> {
    const { chunks, totalLength } = await collectStreamChunks(stream);
    const combined = concatWithLength(chunks, totalLength);
    const decoder = encoding ? getTextDecoder(encoding) : textDecoder;
    return decoder.decode(combined);
  }
};

// =============================================================================
// Promises API (like stream/promises in Node.js)
// =============================================================================

export const promises = {
  pipeline,
  finished
};
