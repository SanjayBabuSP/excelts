/**
 * Browser Stream - Transform
 */

import type { TransformStreamOptions } from "@stream/types";
import { StreamStateError } from "@stream/errors";
import { EventEmitter } from "@utils/event-emitter";
import { parseEndArgs } from "@stream/common/end-args";

import { Readable } from "./readable";
import { Writable } from "./writable";
import { createListenerRegistry } from "./helpers";

import type { Duplex } from "./duplex";

// =============================================================================
// Transform Stream Wrapper
// =============================================================================

/**
 * A wrapper around Web TransformStream that provides Node.js-like API
 */
export class Transform<TInput = Uint8Array, TOutput = Uint8Array> extends EventEmitter {
  /** @internal - for pipe() support */
  readonly _readable: Readable<TOutput>;
  /** @internal - for pipe() support */
  readonly _writable: Writable<TInput>;
  private _objectMode: boolean;
  allowHalfOpen: boolean;

  private _destroyed: boolean = false;
  private _ended: boolean = false;
  private _errored: boolean = false;
  private _dataForwardingSetup: boolean = false;

  private _endGeneration: number = 0;

  private _webStream: TransformStream<TInput, TOutput> | null = null;

  private _sideForwardingCleanup: (() => void) | null = null;

  /** Cached result of _hasSubclassTransform (called per-chunk, so worth caching) */
  private _isSubclassTransform: boolean | undefined;

  private _transformImpl:
    | ((chunk: TInput) => TOutput | Promise<TOutput>)
    | ((
        this: Transform<TInput, TOutput>,
        chunk: TInput,
        encoding: string,
        callback: (error?: Error | null, data?: TOutput) => void
      ) => void)
    | undefined;

  private _flushImpl:
    | (() => TOutput | void | Promise<TOutput | void>)
    | ((
        this: Transform<TInput, TOutput>,
        callback: (error?: Error | null, data?: TOutput) => void
      ) => void)
    | undefined;

  /**
   * Push data to the readable side (Node.js compatibility).
   * Intended to be called from within transform/flush.
   */
  push(chunk: TOutput | null, encoding?: string): boolean {
    return this._readable.push(chunk, encoding);
  }

  constructor(
    options?: TransformStreamOptions & {
      allowHalfOpen?: boolean;
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
    this._objectMode = options?.objectMode ?? false;
    this.allowHalfOpen = options?.allowHalfOpen ?? true;
    this._transformImpl = options?.transform;
    this._flushImpl = options?.flush;

    this._readable = new Readable<TOutput>({
      objectMode: this._objectMode
    });

    this._writable = new Writable<TInput>({
      objectMode: this._objectMode,
      write: (chunk, _encoding, callback) => {
        // Try synchronous transform first.  If the transform completes
        // synchronously we MUST call the callback synchronously so that
        // the Writable write-queue drains in the same microtask, preventing
        // _scheduleEnd from racing ahead of dynamically-added writes.
        const maybePromise = this._runTransformSync(chunk);
        if (maybePromise === undefined) {
          // Completed synchronously
          callback(null);
        } else {
          // Async – wait for the promise
          maybePromise.then(
            () => callback(null),
            err => callback(err)
          );
        }
      },
      final: callback => {
        this._runFlush()
          .then(() => {
            this._readable.push(null);
            callback(null);
          })
          .catch(err => callback(err));
      }
    });

    this._setupSideForwarding();
  }

  _setupSideForwarding(): void {
    if (this._sideForwardingCleanup) {
      this._sideForwardingCleanup();
      this._sideForwardingCleanup = null;
    }

    const registry = createListenerRegistry();

    registry.once(this._readable, "end", () => {
      this.emit("end");
      if (!this.allowHalfOpen) {
        this._writable.end();
      }
    });
    registry.add(this._readable, "error", err => this._emitErrorOnce(err));

    registry.once(this._writable, "finish", () => this.emit("finish"));
    registry.add(this._writable, "drain", () => this.emit("drain"));
    registry.add(this._writable, "error", err => this._emitErrorOnce(err));
    registry.once(this._writable, "close", () => {
      if (!this.allowHalfOpen && !this._readable.destroyed) {
        this._readable.destroy();
      }
    });

    this._sideForwardingCleanup = () => registry.cleanup();
  }

  private _scheduleEnd(): void {
    if (this._destroyed || this._errored) {
      return;
    }
    if (this._writable.writableEnded) {
      return;
    }

    const gen = ++this._endGeneration;

    // Defer to the next macrotask so that all microtasks (Promise .then()
    // chains, pipe end propagation, etc.) settle before we close the writable.
    // Using queueMicrotask here would race ahead of async pipe chains and
    // cause hangs in complex pipe topologies (e.g. archive unzip).
    setTimeout(() => {
      if (gen !== this._endGeneration) {
        return;
      }
      if (this._destroyed || this._errored || this._writable.writableEnded) {
        return;
      }
      this._writable.end();
    }, 0);
  }

  private _emitErrorOnce(err: any): void {
    if (this._errored) {
      return;
    }
    this._errored = true;
    const error = err instanceof Error ? err : new Error(String(err));
    this.emit("error", error);
    if (!this._destroyed) {
      this._destroyed = true;
      this._readable.destroy(error);
      this._writable.destroy(error);
      queueMicrotask(() => this.emit("close"));
    }
  }

  private _hasSubclassTransform(): boolean {
    if (this._isSubclassTransform !== undefined) {
      return this._isSubclassTransform;
    }
    if (this._transformImpl) {
      this._isSubclassTransform = false;
      return false;
    }
    const proto = Object.getPrototypeOf(this);
    this._isSubclassTransform = proto._transform !== Transform.prototype._transform;
    return this._isSubclassTransform;
  }

  private _hasSubclassFlush(): boolean {
    if (this._flushImpl) {
      return false;
    }
    const proto = Object.getPrototypeOf(this);
    return proto._flush !== Transform.prototype._flush;
  }

  /**
   * Run the transform function.  Returns `undefined` when the transform
   * completed synchronously, or a `Promise<void>` when it is async.
   * Keeping the sync path truly synchronous is critical so that the Writable
   * write-queue callback fires synchronously and _scheduleEnd cannot race
   * ahead of writes added during 'data' callbacks.
   */
  private _runTransformSync(chunk: TInput): Promise<void> | undefined {
    if (this._destroyed || this._errored) {
      throw new StreamStateError("write", this._errored ? "stream errored" : "stream destroyed");
    }

    try {
      if (this._hasSubclassTransform()) {
        return new Promise<void>((resolve, reject) => {
          this._transform(chunk, "utf8", (err?: Error | null, data?: TOutput) => {
            if (err) {
              reject(err);
              return;
            }
            if (data !== undefined) {
              this.push(data);
            }
            resolve();
          });
        });
      }

      const userTransform = this._transformImpl;
      if (!userTransform) {
        this.push(chunk as any as TOutput);
        return undefined; // sync
      }

      const paramCount = userTransform.length;

      if (paramCount >= 3) {
        return new Promise<void>((resolve, reject) => {
          (
            userTransform as (
              this: Transform<TInput, TOutput>,
              chunk: TInput,
              encoding: string,
              callback: (error?: Error | null, data?: TOutput) => void
            ) => void
          ).call(this, chunk, "utf8", (err?: Error | null, data?: TOutput) => {
            if (err) {
              reject(err);
              return;
            }
            if (data !== undefined) {
              this.push(data);
            }
            resolve();
          });
        });
      }

      if (paramCount === 2) {
        return new Promise<void>((resolve, reject) => {
          (
            userTransform as (
              this: Transform<TInput, TOutput>,
              chunk: TInput,
              callback: (error?: Error | null, data?: TOutput) => void
            ) => void
          ).call(this, chunk, (err?: Error | null, data?: TOutput) => {
            if (err) {
              reject(err);
              return;
            }
            if (data !== undefined) {
              this.push(data);
            }
            resolve();
          });
        });
      }

      // paramCount 0 or 1: simple function, may return sync or async
      const result = (userTransform as (chunk: TInput) => TOutput | Promise<TOutput>).call(
        this,
        chunk
      );

      if (result && typeof (result as any).then === "function") {
        return (result as Promise<TOutput>).then(awaited => {
          if (awaited !== undefined) {
            this.push(awaited);
          }
        });
      }

      if (result !== undefined) {
        this.push(result as TOutput);
      }
      return undefined; // sync
    } catch (err) {
      this._emitErrorOnce(err);
      throw err;
    }
  }

  private async _runTransform(chunk: TInput): Promise<void> {
    if (this._destroyed || this._errored) {
      throw new StreamStateError("write", this._errored ? "stream errored" : "stream destroyed");
    }

    try {
      if (this._hasSubclassTransform()) {
        await new Promise<void>((resolve, reject) => {
          this._transform(chunk, "utf8", (err?: Error | null, data?: TOutput) => {
            if (err) {
              reject(err);
              return;
            }
            if (data !== undefined) {
              this.push(data);
            }
            resolve();
          });
        });
        return;
      }

      const userTransform = this._transformImpl;
      if (!userTransform) {
        this.push(chunk as any as TOutput);
        return;
      }

      const paramCount = userTransform.length;

      if (paramCount >= 3) {
        await new Promise<void>((resolve, reject) => {
          (
            userTransform as (
              this: Transform<TInput, TOutput>,
              chunk: TInput,
              encoding: string,
              callback: (error?: Error | null, data?: TOutput) => void
            ) => void
          ).call(this, chunk, "utf8", (err?: Error | null, data?: TOutput) => {
            if (err) {
              reject(err);
              return;
            }
            if (data !== undefined) {
              this.push(data);
            }
            resolve();
          });
        });
        return;
      }

      if (paramCount === 2) {
        await new Promise<void>((resolve, reject) => {
          (
            userTransform as (
              this: Transform<TInput, TOutput>,
              chunk: TInput,
              callback: (error?: Error | null, data?: TOutput) => void
            ) => void
          ).call(this, chunk, (err?: Error | null, data?: TOutput) => {
            if (err) {
              reject(err);
              return;
            }
            if (data !== undefined) {
              this.push(data);
            }
            resolve();
          });
        });
        return;
      }

      const result = (userTransform as (chunk: TInput) => TOutput | Promise<TOutput>).call(
        this,
        chunk
      );

      if (result && typeof result.then === "function") {
        const awaited = await result;
        if (awaited !== undefined) {
          this.push(awaited);
        }
        return;
      }

      if (result !== undefined) {
        this.push(result);
      }
    } catch (err) {
      this._emitErrorOnce(err);
      throw err;
    }
  }

  private async _runFlush(): Promise<void> {
    if (this._destroyed || this._errored) {
      return;
    }

    try {
      if (this._hasSubclassFlush()) {
        await new Promise<void>((resolve, reject) => {
          this._flush((err?: Error | null, data?: TOutput) => {
            if (err) {
              reject(err);
              return;
            }
            if (data !== undefined) {
              this.push(data);
            }
            resolve();
          });
        });
        return;
      }

      const userFlush = this._flushImpl;
      if (!userFlush) {
        return;
      }

      const paramCount = userFlush.length;
      if (paramCount >= 1) {
        await new Promise<void>((resolve, reject) => {
          (
            userFlush as (
              this: Transform<TInput, TOutput>,
              callback: (error?: Error | null, data?: TOutput) => void
            ) => void
          ).call(this, (err?: Error | null, data?: TOutput) => {
            if (err) {
              reject(err);
              return;
            }
            if (data !== undefined) {
              this.push(data);
            }
            resolve();
          });
        });
        return;
      }

      const result = (userFlush as () => TOutput | void | Promise<TOutput | void>).call(this);
      if (result && typeof result.then === "function") {
        const awaited = await result;
        if (awaited !== undefined && awaited !== null) {
          this.push(awaited as TOutput);
        }
        return;
      }

      if (result !== undefined && result !== null) {
        this.push(result as TOutput);
      }
    } catch (err) {
      this._emitErrorOnce(err);
      throw err;
    }
  }

  /**
   * Override on() to lazily forward readable 'data' events.
   * Avoids starting flowing mode unless requested.
   */
  override on(event: string | symbol, listener: (...args: any[]) => void): this {
    // Register the listener FIRST so that when _readable.on("data") triggers
    // resume() and synchronously drains buffered data, the forwarding handler
    // can find the listener already in place on this Transform.
    super.on(event, listener);

    if (event === "data" && !this._dataForwardingSetup) {
      this._dataForwardingSetup = true;
      this._readable.on("data", chunk => this.emit("data", chunk));
    }
    return this;
  }

  /**
   * Write to the writable side
   */
  write(chunk: TInput, callback?: (error?: Error | null) => void): boolean;
  write(chunk: TInput, encoding?: string, callback?: (error?: Error | null) => void): boolean;
  write(
    chunk: TInput,
    encodingOrCallback?: string | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void
  ): boolean {
    const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;

    // If end() has been requested, keep the close deferred as long as writes continue.
    if (this._ended && !this._writable.writableEnded) {
      this._scheduleEnd();
    }

    return this._writable.write(chunk, cb);
  }

  /**
   * End the transform stream.
   * Defers closing via _scheduleEnd to allow writes triggered during
   * 'data' callbacks to complete before the writable side is ended.
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

    const { chunk, cb } = parseEndArgs<TInput>(chunkOrCallback, encodingOrCallback, callback);

    if (cb) {
      this.once("finish", cb);
    }

    if (chunk !== undefined) {
      this._writable.write(chunk);
    }

    this._scheduleEnd();
    return this;
  }

  /**
   * Read from the transform stream
   */
  read(size?: number): TOutput | null {
    return this._readable.read(size);
  }

  /**
   * Pipe readable side to destination
   */
  pipe<W extends Writable<TOutput> | Transform<TOutput, any> | Duplex<any, TOutput>>(
    destination: W,
    options?: { end?: boolean }
  ): W {
    return this._readable.pipe(destination, options) as W;
  }

  /**
   * Unpipe from destination
   */
  unpipe(destination?: any): this {
    this._readable.unpipe(destination);
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
  destroy(error?: Error): this {
    if (this._destroyed) {
      return this;
    }
    this._destroyed = true;

    // Invalidate any pending _scheduleEnd
    this._endGeneration++;

    if (this._sideForwardingCleanup) {
      this._sideForwardingCleanup();
      this._sideForwardingCleanup = null;
    }

    this._readable.destroy(error);
    this._writable.destroy(error);
    queueMicrotask(() => this.emit("close"));
    return this;
  }

  /**
   * Get the underlying Web TransformStream (internal).
   * @internal
   */
  private _getWebStream(): TransformStream<TInput, TOutput> {
    if (this._webStream) {
      return this._webStream;
    }

    // Web Streams interop layer.
    const iterator = this[Symbol.asyncIterator]();

    const readable = new ReadableStream<TOutput>({
      pull: async controller => {
        const { done, value } = await iterator.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(value);
      },
      cancel: reason => {
        this.destroy(reason instanceof Error ? reason : new Error(String(reason)));
      }
    });

    const writable = new WritableStream<TInput>({
      write: chunk =>
        new Promise<void>((resolve, reject) => {
          this.write(chunk, err => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        }),
      close: () =>
        new Promise<void>(resolve => {
          this.end(() => resolve());
        }),
      abort: reason => {
        this.destroy(reason instanceof Error ? reason : new Error(String(reason)));
      }
    });

    this._webStream = { readable, writable };
    return this._webStream;
  }

  get readable(): boolean {
    return this._readable.readable;
  }

  set readable(val: boolean) {
    this._readable.readable = val;
  }

  get writable(): boolean {
    return this._writable.writable;
  }

  set writable(val: boolean) {
    this._writable.writable = val;
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
    return this._readable.readableObjectMode;
  }

  get readableFlowing(): boolean | null {
    return this._readable.readableFlowing;
  }

  set readableFlowing(val: boolean | null) {
    this._readable.readableFlowing = val;
  }

  get destroyed(): boolean {
    return this._destroyed;
  }

  set destroyed(val: boolean) {
    this._destroyed = val;
  }

  // =========================================================================
  // Delegated methods (Node.js Transform compatibility)
  // =========================================================================

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
   * Set encoding for the readable side
   */
  setEncoding(encoding: string): this {
    this._readable.setEncoding(encoding);
    return this;
  }

  /**
   * Set default encoding for the writable side
   */
  setDefaultEncoding(encoding: string): this {
    this._writable.setDefaultEncoding(encoding);
    return this;
  }

  /**
   * Put a chunk back at the front of the readable buffer
   */
  unshift(chunk: TOutput, encoding?: string): void {
    this._readable.unshift(chunk, encoding);
  }

  /**
   * Wrap a legacy stream
   */
  wrap(stream: any): this {
    this._readable.wrap(stream);
    return this;
  }

  /**
   * Create an async iterator with options
   */
  iterator(options?: { destroyOnReturn?: boolean }): AsyncIterableIterator<TOutput> {
    return this._readable.iterator(options);
  }

  // =========================================================================
  // Delegated getters (Node.js Transform compatibility)
  // =========================================================================

  get writableCorked(): number {
    return this._writable.writableCorked;
  }

  get writableNeedDrain(): boolean {
    return this._writable.writableNeedDrain;
  }

  get writableObjectMode(): boolean {
    return this._writable.writableObjectMode;
  }

  get readableAborted(): boolean {
    return this._readable.readableAborted;
  }

  get readableDidRead(): boolean {
    return this._readable.readableDidRead;
  }

  get readableEncoding(): string | null {
    return this._readable.readableEncoding;
  }

  get errored(): Error | null {
    return this._readable.errored ?? this._writable.errored;
  }

  get closed(): boolean {
    return this._readable.closed && this._writable.closed;
  }

  get readableBuffer(): TOutput[] {
    return this._readable.readableBuffer;
  }

  get writableBuffer(): TInput[] {
    return this._writable.writableBuffer;
  }

  /**
   * Async iterator support
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<TOutput> {
    yield* this._readable[Symbol.asyncIterator]();
  }

  // =============================================================================
  // Functional / Higher-order Methods (forwarded to readable side)
  // =============================================================================

  map<U>(
    fn: (data: TOutput, options: { signal: AbortSignal }) => U | Promise<U>,
    options?: { concurrency?: number; highWaterMark?: number; signal?: AbortSignal }
  ): Readable<U> {
    return this._readable.map(fn, options);
  }

  filter(
    fn: (data: TOutput, options: { signal: AbortSignal }) => boolean | Promise<boolean>,
    options?: { concurrency?: number; highWaterMark?: number; signal?: AbortSignal }
  ): Readable<TOutput> {
    return this._readable.filter(fn, options);
  }

  async forEach(
    fn: (data: TOutput, options: { signal: AbortSignal }) => void | Promise<void>,
    options?: { concurrency?: number; signal?: AbortSignal }
  ): Promise<undefined> {
    return this._readable.forEach(fn, options);
  }

  async toArray(options?: { signal?: AbortSignal }): Promise<TOutput[]> {
    return this._readable.toArray(options);
  }

  async some(
    fn: (data: TOutput, options: { signal: AbortSignal }) => boolean | Promise<boolean>,
    options?: { concurrency?: number; signal?: AbortSignal }
  ): Promise<boolean> {
    return this._readable.some(fn, options);
  }

  async find(
    fn: (data: TOutput, options: { signal: AbortSignal }) => boolean | Promise<boolean>,
    options?: { concurrency?: number; signal?: AbortSignal }
  ): Promise<TOutput | undefined> {
    return this._readable.find(fn, options);
  }

  async every(
    fn: (data: TOutput, options: { signal: AbortSignal }) => boolean | Promise<boolean>,
    options?: { concurrency?: number; signal?: AbortSignal }
  ): Promise<boolean> {
    return this._readable.every(fn, options);
  }

  flatMap<U>(
    fn: (
      data: TOutput,
      options: { signal: AbortSignal }
    ) => Iterable<U> | AsyncIterable<U> | Readable<U> | Promise<Iterable<U> | AsyncIterable<U>>,
    options?: { concurrency?: number; signal?: AbortSignal }
  ): Readable<U> {
    return this._readable.flatMap(fn, options);
  }

  drop(limit: number, options?: { signal?: AbortSignal }): Readable<TOutput> {
    return this._readable.drop(limit, options);
  }

  take(limit: number, options?: { signal?: AbortSignal }): Readable<TOutput> {
    return this._readable.take(limit, options);
  }

  async reduce<U = TOutput>(
    fn: (previous: U, data: TOutput, options: { signal: AbortSignal }) => U | Promise<U>,
    initial?: U,
    options?: { signal?: AbortSignal }
  ): Promise<U> {
    if (arguments.length >= 2) {
      return this._readable.reduce(fn, initial, options);
    }
    return this._readable.reduce(fn);
  }

  compose<U>(
    stream:
      | import("@stream/types").WritableLike
      | ((source: AsyncIterable<TOutput>) => AsyncIterable<U>),
    options?: { signal?: AbortSignal }
  ): Readable<U> {
    return this._readable.compose(stream, options);
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
    transform._webStream = webStream;

    // Replace internal streams with the ones from the web stream
    const newReadable = Readable.fromWeb(webStream.readable, { objectMode: options?.objectMode });
    const newWritable = Writable.fromWeb(webStream.writable, { objectMode: options?.objectMode });

    if (transform._sideForwardingCleanup) {
      transform._sideForwardingCleanup();
      transform._sideForwardingCleanup = null;
    }

    (transform as any)._readable = newReadable;
    (transform as any)._writable = newWritable;

    // Re-connect event forwarding (data forwarding remains lazy via Transform.on)
    transform._setupSideForwarding();

    return transform;
  }

  /**
   * Convert a Node.js Transform to Web TransformStream
   */
  static toWeb<TIn = Uint8Array, TOut = Uint8Array>(
    nodeStream: Transform<TIn, TOut>
  ): TransformStream<TIn, TOut> {
    return nodeStream._getWebStream();
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
