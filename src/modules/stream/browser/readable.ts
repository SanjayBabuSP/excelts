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
  /**
   * Allow duck-typed instanceof checks.
   * Node.js Duplex passes `instanceof Readable` via prototype chain.
   * Our browser Duplex composes a Readable, so we use Symbol.hasInstance
   * to check for key Readable-like methods/properties.
   */
  static [Symbol.hasInstance](instance: any): boolean {
    if (instance == null || typeof instance !== "object") {
      return false;
    }
    // Fast path: actual Readable prototype
    if (Object.prototype.isPrototypeOf.call(Readable.prototype, instance)) {
      return true;
    }
    // Duck-type: must have key Readable methods and the stream brand
    return (
      instance.__excelts_stream === true &&
      typeof instance.read === "function" &&
      typeof instance.pipe === "function" &&
      typeof instance.on === "function" &&
      "readableFlowing" in instance
    );
  }

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
  private _resumeScheduled: boolean = false;
  private _hasFlowed: boolean = false;
  private _pipes!: PipeManager<T>;
  private _encoding: string | null = null;
  private _decoder: TextDecoder | null = null;
  private _didRead: boolean = false;
  // Whether this stream uses push() mode (true) or Web Stream mode (false)
  private _pushMode: boolean = false;
  // Whether this stream was created from an external Web Stream (true) or is controllable (false)
  private _webStreamMode: boolean = false;
  private _objectMode: boolean;
  private _highWaterMark: number;
  private _autoDestroy: boolean;
  private _emitClose: boolean;
  // User-provided read function (Node.js compatibility)
  private _read?: (size?: number) => void;
  // User-provided construct function (Node.js compatibility)
  private _constructFunc?: (callback: (error?: Error | null) => void) => void;
  private _constructed: boolean = true;

  constructor(
    options?: ReadableStreamOptions & {
      stream?: ReadableStream<T>;
      autoDestroy?: boolean;
      emitClose?: boolean;
      signal?: AbortSignal;
      encoding?: string;
      read?: (this: Readable<T>, size?: number) => void;
      destroy?: (
        this: Readable<T>,
        error: Error | null,
        callback: (error?: Error | null) => void
      ) => void;
      construct?: (this: Readable<T>, callback: (error?: Error | null) => void) => void;
    }
  ) {
    super();
    this._objectMode = options?.objectMode ?? false;
    this._highWaterMark = options?.highWaterMark ?? getDefaultHighWaterMark(this._objectMode);
    this._buf = new ChunkBuffer<T>(this._objectMode);
    this._pipes = new PipeManager<T>(this);
    this._autoDestroy = options?.autoDestroy ?? true;
    this._emitClose = options?.emitClose ?? true;

    // Store user-provided read function
    if (options?.read) {
      this._read = options.read.bind(this);
      this._pushMode = true; // User will call push()
    }

    // Store user-provided destroy function
    if (options?.destroy) {
      this._destroy = options.destroy.bind(this);
    }

    // Store user-provided construct function
    if (options?.construct) {
      this._constructFunc = options.construct.bind(this);
    }

    if (options?.stream) {
      this._stream = options.stream;
      this._webStreamMode = true; // Created from external Web Stream
    } else {
      // Controllable stream - no need to eagerly create a Web ReadableStream.
      // The webStream getter will create one lazily when accessed.
      this._stream = null;
    }

    // M2: encoding constructor option — call setEncoding() if provided
    if (options?.encoding) {
      this.setEncoding(options.encoding);
    }

    // M1: signal constructor option — destroy stream when signal aborts
    if (options?.signal) {
      this._setupAbortSignal(options.signal);
    }

    // L2: _construct hook — if provided, delay _read until constructed
    this._maybeConstruct();
  }

  /**
   * Run _construct if provided (via options or subclass override).
   * Delays _read calls until the callback fires.
   */
  private _maybeConstruct(): void {
    const hasConstructHook = this._constructFunc || this._hasSubclassConstruct();
    if (!hasConstructHook) {
      return;
    }
    this._constructed = false;
    // Call _construct on next microtask (matches Node.js which uses process.nextTick)
    queueMicrotask(() => {
      const fn = this._constructFunc ?? (this as any)._construct.bind(this);
      fn(err => {
        if (err) {
          this.destroy(err);
          return;
        }
        this._constructed = true;
        // If _read was requested while not yet constructed, call it now
        if (this._read && this._flowing && !this._ended && !this._destroyed) {
          this._read(this._highWaterMark);
        }
      });
    });
  }

  /**
   * Check if a subclass defines _construct on its own prototype.
   * Node.js does NOT have _construct on any stream prototype — it only exists
   * when provided via constructor options or defined by a subclass.
   */
  private _hasSubclassConstruct(): boolean {
    let proto = Object.getPrototypeOf(this);
    while (proto && proto !== Readable.prototype && proto !== Object.prototype) {
      if (Object.prototype.hasOwnProperty.call(proto, "_construct")) {
        return true;
      }
      proto = Object.getPrototypeOf(proto);
    }
    return false;
  }

  /**
   * Wire up an AbortSignal to destroy this stream on abort.
   */
  private _setupAbortSignal(signal: AbortSignal): void {
    if (signal.aborted) {
      this.destroy(new Error("The operation was aborted"));
      return;
    }

    const onAbort = (): void => {
      cleanup();
      this.destroy(new Error("The operation was aborted"));
    };

    const onDone = (): void => {
      cleanup();
    };

    const cleanup = (): void => {
      signal.removeEventListener("abort", onAbort);
      this.off("close", onDone);
      this.off("end", onDone);
      this.off("error", onDone);
    };

    signal.addEventListener("abort", onAbort, { once: true });
    this.on("close", onDone);
    this.on("end", onDone);
    this.on("error", onDone);
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
   * Static wrap method - wraps an old-style stream into a Readable.
   * Matches Node.js Readable.wrap(stream, options).
   */
  static wrap<T>(src: any, options?: ReadableStreamOptions): Readable<T> {
    return new Readable<T>({
      objectMode: src.readableObjectMode ?? src.objectMode ?? true,
      ...options,
      destroy(err, callback) {
        if (typeof src.destroy === "function") {
          src.destroy(err ?? undefined);
        }
        callback(err);
      }
    }).wrap(src);
  }

  /**
   * Push data to the stream (when using controllable stream)
   */
  push(chunk: T | null, encoding?: string): boolean {
    if (this._destroyed) {
      return false;
    }

    // Mark as push mode when push() is called
    this._pushMode = true;

    // Handle string encoding (Node.js compatibility)
    if (chunk !== null && typeof chunk === "string" && encoding && !this._objectMode) {
      const encoder = new TextEncoder();
      chunk = encoder.encode(chunk) as any;
    }

    // Reject push() after EOF (matches Node.js ERR_STREAM_PUSH_AFTER_EOF)
    if (this._ended && chunk !== null) {
      const err = new Error("stream.push() after EOF") as Error & { code: string };
      err.code = "ERR_STREAM_PUSH_AFTER_EOF";
      queueMicrotask(() => this.emit("error", err));
      return false;
    }

    if (chunk === null) {
      // Prevent duplicate end handling
      if (this._ended) {
        return false;
      }
      this._ended = true;

      // Emit 'end' only after buffered data is fully drained.
      // This avoids premature 'end' when producers push null while paused.
      // Defer via queueMicrotask to match Node.js process.nextTick behavior —
      // synchronous code after push(null) should not see 'end' yet.
      if (this._buf.length === 0) {
        queueMicrotask(() => this._emitEndOnce());
      }
      // Note: Don't call destroy() here, let the stream be consumed naturally
      // The reader will return done:true when it finishes reading
      return false;
    }

    if (this._flowing) {
      // In flowing mode, emit data directly without buffering
      this._didRead = true;
      this.emit("data", this._applyEncoding(chunk));
      // Check if stream was paused during emit (backpressure from consumer)
      if (!this._flowing) {
        return false;
      }
      // After emitting data, call _read again if available (Node.js behavior)
      if (this._read && !this._ended) {
        queueMicrotask(() => {
          if (this._flowing && !this._ended && !this._destroyed) {
            this._read!(this._highWaterMark);
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
      if (this._objectMode) {
        return this._buf.length < this._highWaterMark;
      }
      // For binary mode, use tracked buffer size (O(1))
      return this._buf.byteSize < this._highWaterMark;
    }
  }

  private _emitEndOnce(): void {
    if (this._endEmitted || this._destroyed) {
      return;
    }
    this._endEmitted = true;
    this.emit("end");

    // Match Node.js autoDestroy behavior: automatically destroy after end
    if (this._autoDestroy) {
      this.destroy();
    }
  }

  /**
   * Put a chunk back at the front of the buffer
   */
  unshift(chunk: T, encoding?: string): void {
    if (this._destroyed) {
      return;
    }
    // Handle string encoding (Node.js compatibility)
    if (typeof chunk === "string" && encoding && !this._objectMode) {
      const encoder = new TextEncoder();
      chunk = encoder.encode(chunk) as any;
    }
    const wasEmpty = this._buf.length === 0;
    this._buf.unshift(chunk);
    // Node.js emits 'readable' when data is unshifted into an empty buffer
    // while in paused mode, so that consumers know data is available.
    if (wasEmpty && !this._flowing) {
      queueMicrotask(() => this.emit("readable"));
    }
  }

  /**
   * Read data from the stream.
   *
   * Node.js behavior:
   * - read() / read(undefined) — in object mode returns one object;
   *   in binary mode returns all buffered data as one chunk
   * - read(0) — returns null, may trigger internal _read()
   * - read(n) — returns exactly n bytes (binary) or null if not enough;
   *   in object mode returns one object (size ignored)
   */
  read(size?: number): T | null {
    this._didRead = true;

    // size === 0: return null but may trigger internal _read
    if (size === 0) {
      if (this._read && !this._ended && !this._destroyed && this._constructed) {
        const bufSize = this._objectMode ? this._buf.length : this._buf.byteSize;
        if (bufSize < this._highWaterMark) {
          this._read(this._highWaterMark);
        }
      }
      return null;
    }

    if (this._buf.length === 0) {
      return null;
    }

    // Object mode: always return a single object, ignore size
    if (this._objectMode) {
      const chunk = this._buf.shift();
      if (this._ended && this._buf.length === 0) {
        queueMicrotask(() => this._emitEndOnce());
      }
      // Node.js triggers _read() to refill buffer after consuming an object
      if (this._read && !this._ended && !this._destroyed && this._constructed) {
        if (this._buf.length < this._highWaterMark) {
          queueMicrotask(() => {
            if (!this._ended && !this._destroyed) {
              this._read!(this._highWaterMark);
            }
          });
        }
      }
      return chunk;
    }

    // Binary mode
    let result: T;

    if (size == null) {
      // read() with no size: return ALL buffered data as one chunk
      result = this._applyEncoding(this._buf.consumeAll());
    } else {
      // read(n): return exactly n bytes, or null if not enough
      if (this._buf.byteSize < size) {
        // Not enough data buffered
        if (this._ended) {
          // Stream ended — return whatever is available
          result = this._applyEncoding(this._buf.consumeAll());
        } else {
          // Trigger internal read to fill buffer
          if (this._read && this._constructed) {
            this._read(size);
          }
          return null;
        }
      } else {
        result = this._applyEncoding(this._buf.consumeBytes(size));
      }
    }

    // Trigger _read to refill buffer if below HWM
    if (this._read && !this._ended && !this._destroyed) {
      const bufSize = this._buf.byteSize;
      if (bufSize < this._highWaterMark) {
        queueMicrotask(() => {
          if (!this._ended && !this._destroyed) {
            this._read!(this._highWaterMark);
          }
        });
      }
    }

    if (this._ended && this._buf.length === 0) {
      queueMicrotask(() => this._emitEndOnce());
    }

    // Node.js re-emits 'readable' when there is still data in the buffer
    // after a read(), so consumers know more data is available.
    if (!this._flowing && this._buf.length > 0) {
      queueMicrotask(() => this.emit("readable"));
    }

    return result;
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
      // Pass {stream: true} to handle multi-byte characters that may span
      // chunk boundaries (matches Node.js StringDecoder behavior).
      return this._decoder.decode(chunk, { stream: true }) as any;
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
    } else {
      // Node.js: pause() on a fresh stream transitions readableFlowing
      // from null to false and sets isPaused() to true.
      this._paused = true;
      this._hasFlowed = true;
    }
    return this;
  }

  /**
   * Resume the stream
   */
  resume(): this {
    if (!this._flowing) {
      this._paused = false;
      this._flowing = true;
      this._hasFlowed = true;

      // Emit asynchronously to match Node.js process.nextTick timing
      // Use _resumeScheduled guard to prevent duplicate emissions when
      // resume() is called multiple times synchronously (e.g. on("data") + resume())
      if (!this._resumeScheduled) {
        this._resumeScheduled = true;
        queueMicrotask(() => {
          this._resumeScheduled = false;
          this.emit("resume");
        });
      }
    }

    // Drain buffered data asynchronously (matches Node.js process.nextTick behavior).
    // Node.js does NOT drain synchronously on resume() — it defers to nextTick
    // so that multiple resume()/pipe() calls can register before data flows.
    if (this._buf.length > 0) {
      queueMicrotask(() => {
        while (this._buf.length > 0 && this._flowing) {
          const chunk = this._buf.shift();
          this._didRead = true;
          this.emit("data", this._applyEncoding(chunk));
        }
        // After draining, check for end
        if (this._ended && this._buf.length === 0) {
          this._emitEndOnce();
        }
      });
    } else if (this._ended && this._buf.length === 0) {
      queueMicrotask(() => this._emitEndOnce());
    } else if (this._read) {
      // Call user-provided read function asynchronously
      // This allows multiple pipe() calls to register before data flows
      queueMicrotask(() => {
        if (this._flowing && !this._ended && !this._destroyed && this._constructed) {
          this._read!(this._highWaterMark);
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
    } else if (event === "readable") {
      // Node.js: adding a 'readable' listener on a fresh (not yet flowing) stream
      // sets readableFlowing to false. But if the stream is ALREADY flowing
      // (e.g., via on('data')), Node.js does NOT pause it — it stays flowing.
      if (!this._flowing) {
        this._hasFlowed = true;
        this._flowing = false;
      }
      if (this._buf.length > 0 || this._ended) {
        queueMicrotask(() => this.emit("readable"));
      }
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
  pipe<W extends Writable<T> | Transform<T, any> | Duplex<any, T>>(
    destination: W,
    options?: { end?: boolean }
  ): W {
    return this._pipes.pipe(destination, options) as W;
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

    // Node.js clears the readable buffer on destroy so that
    // readableLength returns 0 and no stale data is accessible.
    this._buf.clear();

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

    // If subclass overrides _destroy, call it and wait for callback before
    // emitting error/close (matches Node.js behavior).
    const afterDestroy = (finalError?: Error | null): void => {
      const err = finalError ?? error;
      if (err) {
        this._errored = err;
      }
      this._closed = true;
      queueMicrotask(() => {
        if (err) {
          this.emit("error", err);
        }
        if (this._emitClose) {
          this.emit("close");
        }
      });
    };

    if (this._hasDestroyHook()) {
      this._destroy(error ?? null, afterDestroy);
    } else {
      afterDestroy(error);
    }
    return this;
  }

  /**
   * Override in subclass to customise destroy behaviour.
   * Call `callback(err)` when cleanup is complete.
   */
  _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    callback(error);
  }

  /**
   * Reverse the effects of destroy() so the stream can potentially be reused.
   * Matches Node.js _undestroy() which resets destroyed and closed flags.
   */
  _undestroy(): void {
    this._destroyed = false;
    this._closed = false;
    this._errored = null;
  }

  /** Check if _destroy has been overridden by a subclass or constructor option. */
  private _hasDestroyHook(): boolean {
    return (
      Object.prototype.hasOwnProperty.call(this, "_destroy") ||
      Object.getPrototypeOf(this)._destroy !== Readable.prototype._destroy
    );
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

  private _readableOverride: boolean | undefined;

  get readable(): boolean {
    if (this._readableOverride !== undefined) {
      return this._readableOverride;
    }
    // Node.js: readable stays true while buffer has data, even after push(null).
    // It only becomes false after the 'end' event has been emitted (or on destroy).
    return !this._destroyed && !this._endEmitted;
  }

  set readable(val: boolean) {
    this._readableOverride = val;
  }

  get readableEnded(): boolean {
    // Node.js: readableEnded only becomes true after the 'end' event has been emitted,
    // not when push(null) is called.
    return this._endEmitted;
  }

  get readableLength(): number {
    return this._objectMode ? this._buf.length : this._buf.byteSize;
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

  set readableFlowing(value: boolean | null) {
    if (value === true) {
      this._flowing = true;
      this._hasFlowed = true;
    } else if (value === false) {
      this._flowing = false;
      this._hasFlowed = true;
    } else {
      // null: reset to initial state
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
    return this._objectMode;
  }

  get readableHighWaterMark(): number {
    return this._highWaterMark;
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
            this._didRead = true;
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

    const highWaterMark = this._highWaterMark;
    const lowWaterMark = Math.max(0, Math.floor(highWaterMark / 2));

    const chunkSizeForBackpressure = (chunk: any): number => {
      if (this._objectMode) {
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
      // Node.js destroys the stream when the async iterator exits early (break/return/throw)
      if (!this._destroyed) {
        this.destroy();
      }
    }
  }

  /**
   * Async dispose support (using await).
   * Destroys the stream and resolves after the 'close' event.
   */
  async [Symbol.asyncDispose](): Promise<void> {
    const selfInitiated = !this._destroyed;
    if (selfInitiated) {
      this.destroy();
    }
    return new Promise<void>((resolve, reject) => {
      const settle = (): void => {
        if (selfInitiated || this._ended) {
          resolve();
        } else {
          reject(new Error("Premature close"));
        }
      };
      if (this._closed) {
        settle();
      } else {
        this.once("close", settle);
      }
    });
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

  // =============================================================================
  // Functional / Higher-order Methods (Node.js Readable compatibility)
  // =============================================================================

  /**
   * Map each chunk through a function, returning a new Readable.
   */
  map<U>(
    fn: (data: T, options: { signal: AbortSignal }) => U | Promise<U>,
    options?: { concurrency?: number; highWaterMark?: number; signal?: AbortSignal }
  ): Readable<U> {
    const signal = options?.signal;
    _validateAbortSignal(signal);
    const ac = new AbortController();
    const innerSignal = ac.signal;

    const result = new Readable<U>({ objectMode: true });

    pumpAsyncIterableToReadable(
      result,
      (async function* (source: Readable<T>) {
        try {
          for await (const chunk of source) {
            _throwIfAborted(signal);
            const mapped = await fn(chunk, { signal: innerSignal });
            yield mapped;
          }
        } finally {
          ac.abort();
        }
      })(this)
    );

    if (signal) {
      const onAbort = () => {
        result.destroy(new _AbortError());
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }

    return result;
  }

  /**
   * Filter chunks by a predicate, returning a new Readable.
   */
  filter(
    fn: (data: T, options: { signal: AbortSignal }) => boolean | Promise<boolean>,
    options?: { concurrency?: number; highWaterMark?: number; signal?: AbortSignal }
  ): Readable<T> {
    const signal = options?.signal;
    _validateAbortSignal(signal);
    const ac = new AbortController();
    const innerSignal = ac.signal;

    const result = new Readable<T>({ objectMode: true });

    pumpAsyncIterableToReadable(
      result,
      (async function* (source: Readable<T>) {
        try {
          for await (const chunk of source) {
            _throwIfAborted(signal);
            const keep = await fn(chunk, { signal: innerSignal });
            if (keep) {
              yield chunk;
            }
          }
        } finally {
          ac.abort();
        }
      })(this)
    );

    if (signal) {
      const onAbort = () => {
        result.destroy(new _AbortError());
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }

    return result;
  }

  /**
   * Iterate all chunks. Returns a promise that resolves when the stream ends.
   */
  async forEach(
    fn: (data: T, options: { signal: AbortSignal }) => void | Promise<void>,
    options?: { concurrency?: number; signal?: AbortSignal }
  ): Promise<undefined> {
    const signal = options?.signal;
    _validateAbortSignal(signal);
    const ac = new AbortController();
    const innerSignal = ac.signal;

    try {
      for await (const chunk of this) {
        _throwIfAborted(signal);
        await fn(chunk, { signal: innerSignal });
      }
    } finally {
      ac.abort();
    }
    return undefined;
  }

  /**
   * Collect all chunks into an array.
   */
  async toArray(options?: { signal?: AbortSignal }): Promise<T[]> {
    const signal = options?.signal;
    _validateAbortSignal(signal);

    const result: T[] = [];
    for await (const chunk of this) {
      _throwIfAborted(signal);
      result.push(chunk);
    }
    return result;
  }

  /**
   * Returns true if any chunk passes the predicate. Short-circuits on first match.
   */
  async some(
    fn: (data: T, options: { signal: AbortSignal }) => boolean | Promise<boolean>,
    options?: { concurrency?: number; signal?: AbortSignal }
  ): Promise<boolean> {
    const signal = options?.signal;
    _validateAbortSignal(signal);
    const ac = new AbortController();
    const innerSignal = ac.signal;

    try {
      for await (const chunk of this) {
        _throwIfAborted(signal);
        const result = await fn(chunk, { signal: innerSignal });
        if (result) {
          this.destroy();
          return true;
        }
      }
      return false;
    } finally {
      ac.abort();
    }
  }

  /**
   * Find the first chunk matching the predicate. Short-circuits on match.
   */
  async find(
    fn: (data: T, options: { signal: AbortSignal }) => boolean | Promise<boolean>,
    options?: { concurrency?: number; signal?: AbortSignal }
  ): Promise<T | undefined> {
    const signal = options?.signal;
    _validateAbortSignal(signal);
    const ac = new AbortController();
    const innerSignal = ac.signal;

    try {
      for await (const chunk of this) {
        _throwIfAborted(signal);
        const result = await fn(chunk, { signal: innerSignal });
        if (result) {
          this.destroy();
          return chunk;
        }
      }
      return undefined;
    } finally {
      ac.abort();
    }
  }

  /**
   * Returns true if all chunks pass the predicate. Short-circuits on first failure.
   */
  async every(
    fn: (data: T, options: { signal: AbortSignal }) => boolean | Promise<boolean>,
    options?: { concurrency?: number; signal?: AbortSignal }
  ): Promise<boolean> {
    const signal = options?.signal;
    _validateAbortSignal(signal);
    const ac = new AbortController();
    const innerSignal = ac.signal;

    try {
      for await (const chunk of this) {
        _throwIfAborted(signal);
        const result = await fn(chunk, { signal: innerSignal });
        if (!result) {
          this.destroy();
          return false;
        }
      }
      return true;
    } finally {
      ac.abort();
    }
  }

  /**
   * Map each chunk to multiple outputs (flattening), returning a new Readable.
   */
  flatMap<U>(
    fn: (
      data: T,
      options: { signal: AbortSignal }
    ) => Iterable<U> | AsyncIterable<U> | Readable<U> | Promise<Iterable<U> | AsyncIterable<U>>,
    options?: { concurrency?: number; signal?: AbortSignal }
  ): Readable<U> {
    const signal = options?.signal;
    _validateAbortSignal(signal);
    const ac = new AbortController();
    const innerSignal = ac.signal;

    const result = new Readable<U>({ objectMode: true });

    pumpAsyncIterableToReadable(
      result,
      (async function* (source: Readable<T>) {
        try {
          for await (const chunk of source) {
            _throwIfAborted(signal);
            const mapped = await fn(chunk, { signal: innerSignal });

            // If it's a Readable, consume via async iterator
            if (mapped && typeof (mapped as any)[Symbol.asyncIterator] === "function") {
              for await (const item of mapped as AsyncIterable<U>) {
                yield item;
              }
            } else if (mapped && typeof (mapped as any)[Symbol.iterator] === "function") {
              for (const item of mapped as Iterable<U>) {
                yield item;
              }
            }
          }
        } finally {
          ac.abort();
        }
      })(this)
    );

    if (signal) {
      const onAbort = () => {
        result.destroy(new _AbortError());
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }

    return result;
  }

  /**
   * Skip the first `limit` chunks, returning a new Readable.
   */
  drop(limit: number, options?: { signal?: AbortSignal }): Readable<T> {
    const signal = options?.signal;
    _validateAbortSignal(signal);
    _validateNonNegativeInteger(limit, "limit");

    const result = new Readable<T>({ objectMode: true });

    pumpAsyncIterableToReadable(
      result,
      (async function* (source: Readable<T>) {
        let count = 0;
        for await (const chunk of source) {
          _throwIfAborted(signal);
          if (count >= limit) {
            yield chunk;
          }
          count++;
        }
      })(this)
    );

    if (signal) {
      const onAbort = () => {
        result.destroy(new _AbortError());
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }

    return result;
  }

  /**
   * Take only the first `limit` chunks, returning a new Readable.
   */
  take(limit: number, options?: { signal?: AbortSignal }): Readable<T> {
    const signal = options?.signal;
    _validateAbortSignal(signal);
    _validateNonNegativeInteger(limit, "limit");

    const result = new Readable<T>({ objectMode: true });

    pumpAsyncIterableToReadable(
      result,
      (async function* (source: Readable<T>) {
        let count = 0;
        for await (const chunk of source) {
          _throwIfAborted(signal);
          if (count >= limit) {
            break;
          }
          yield chunk;
          count++;
        }
      })(this)
    );

    if (signal) {
      const onAbort = () => {
        result.destroy(new _AbortError());
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }

    return result;
  }

  /**
   * Reduce the stream to a single value.
   */
  async reduce<U = T>(
    fn: (previous: U, data: T, options: { signal: AbortSignal }) => U | Promise<U>,
    initial?: U,
    options?: { signal?: AbortSignal }
  ): Promise<U> {
    const signal = options?.signal;
    _validateAbortSignal(signal);
    const ac = new AbortController();
    const innerSignal = ac.signal;

    let accumulator: U;
    const hasInitial = arguments.length >= 2;
    let first = true;

    try {
      for await (const chunk of this) {
        _throwIfAborted(signal);
        if (first && !hasInitial) {
          accumulator = chunk as any as U;
          first = false;
          continue;
        }
        if (first) {
          accumulator = initial!;
          first = false;
        }
        accumulator = await fn(accumulator!, chunk, { signal: innerSignal });
      }

      if (first && !hasInitial) {
        throw new TypeError("Reduce of an empty stream requires an initial value");
      }
      if (first) {
        return initial!;
      }
      return accumulator!;
    } finally {
      ac.abort();
    }
  }

  /**
   * Compose this readable with a stream/transform, returning a Duplex.
   * Matches Node.js behavior where compose() returns a Duplex.
   */
  compose<U>(
    stream: WritableLike | ((source: AsyncIterable<T>) => AsyncIterable<U>),
    _options?: { signal?: AbortSignal }
  ): Readable<U> {
    // If it's an async generator function, pipe through it
    if (typeof stream === "function") {
      const result = new Readable<U>({ objectMode: true });
      pumpAsyncIterableToReadable(result, stream(this) as AsyncIterable<U>);
      if (_DuplexFromFactory) {
        return _DuplexFromFactory(result);
      }
      return result;
    }

    // If it's a transform/duplex with pipe support, pipe this into it and
    // return its readable side wrapped as a Duplex.
    const target = stream as any;
    this.pipe(target);
    // If the target is already a Duplex-like, return it directly.
    if (target._readable && target._writable) {
      return target;
    }
    // If the target has a _readable (Transform/Duplex), wrap it.
    if (target._readable) {
      if (_DuplexFromFactory) {
        return _DuplexFromFactory(target._readable);
      }
      return target._readable as Readable<U>;
    }
    if (_DuplexFromFactory) {
      return _DuplexFromFactory(target);
    }
    return target as Readable<U>;
  }
}

// Node.js: `Readable.prototype.addListener === Readable.prototype.on` (same function).
// Readable overrides `on` from EventEmitter, so we must re-alias `addListener`.
Readable.prototype.addListener = Readable.prototype.on;

// =============================================================================
// Internal helpers – Functional method utilities
// =============================================================================

class _AbortError extends Error {
  override name = "AbortError";
  code = "ABORT_ERR";
  constructor() {
    super("The operation was aborted");
  }
}

function _validateAbortSignal(signal: AbortSignal | undefined): void {
  if (signal !== undefined && !(signal instanceof AbortSignal)) {
    throw new TypeError("options.signal must be an AbortSignal");
  }
}

function _throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new _AbortError();
  }
}

function _validateNonNegativeInteger(value: number, name: string): void {
  if (
    typeof value !== "number" ||
    Number.isNaN(value) ||
    value < 0 ||
    Math.floor(value) !== value
  ) {
    throw new RangeError(
      `The value of "${name}" must be a non-negative integer. Received ${value}`
    );
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

// =============================================================================
// Late-binding injection for Duplex (avoids circular import)
// =============================================================================

let _DuplexFromFactory: ((source: any) => any) | null = null;

/** @internal — called from index.browser.ts to break circular dependency */
export function _injectDuplexFrom(factory: (source: any) => any): void {
  _DuplexFromFactory = factory;
}
