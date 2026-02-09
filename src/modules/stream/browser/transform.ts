/**
 * Browser Stream - Transform
 */

import type { TransformStreamOptions } from "@stream/types";
import { StreamStateError } from "@stream/errors";
import { EventEmitter } from "@stream/event-emitter";

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
  readonly objectMode: boolean;

  private _destroyed: boolean = false;
  private _ended: boolean = false;
  private _errored: boolean = false;
  private _dataForwardingSetup: boolean = false;

  private _endTimer: ReturnType<typeof setTimeout> | null = null;

  private _webStream: TransformStream<TInput, TOutput> | null = null;

  private _sideForwardingCleanup: (() => void) | null = null;

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
  push(chunk: TOutput | null): boolean {
    return this._readable.push(chunk);
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
    this._transformImpl = options?.transform;
    this._flushImpl = options?.flush;

    this._readable = new Readable<TOutput>({
      objectMode: this.objectMode
    });

    this._writable = new Writable<TInput>({
      objectMode: this.objectMode,
      write: (chunk, _encoding, callback) => {
        this._runTransform(chunk)
          .then(() => callback(null))
          .catch(err => callback(err));
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

    registry.once(this._readable, "end", () => this.emit("end"));
    registry.add(this._readable, "error", err => this._emitErrorOnce(err));

    registry.once(this._writable, "finish", () => this.emit("finish"));
    registry.add(this._writable, "drain", () => this.emit("drain"));
    registry.add(this._writable, "error", err => this._emitErrorOnce(err));

    this._sideForwardingCleanup = () => registry.cleanup();
  }

  private _scheduleEnd(): void {
    if (this._destroyed || this._errored) {
      return;
    }
    if (this._writable.writableEnded) {
      return;
    }

    if (this._endTimer) {
      clearTimeout(this._endTimer);
    }

    // Defer closing to allow writes triggered during 'data' callbacks.
    this._endTimer = setTimeout(() => {
      this._endTimer = null;
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
    if (this._transformImpl) {
      return false;
    }
    const proto = Object.getPrototypeOf(this);
    return proto._transform !== Transform.prototype._transform;
  }

  private _hasSubclassFlush(): boolean {
    if (this._flushImpl) {
      return false;
    }
    const proto = Object.getPrototypeOf(this);
    return proto._flush !== Transform.prototype._flush;
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
    if (event === "data" && !this._dataForwardingSetup) {
      this._dataForwardingSetup = true;
      this._readable.on("data", chunk => this.emit("data", chunk));
    }
    return super.on(event, listener);
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

    const chunk = typeof chunkOrCallback === "function" ? undefined : chunkOrCallback;
    const cb: (() => void) | undefined =
      typeof chunkOrCallback === "function"
        ? (chunkOrCallback as () => void)
        : typeof encodingOrCallback === "function"
          ? (encodingOrCallback as () => void)
          : callback;

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
    destination: W
  ): W {
    return this._readable.pipe(destination) as W;
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
  destroy(error?: Error): void {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;

    if (this._sideForwardingCleanup) {
      this._sideForwardingCleanup();
      this._sideForwardingCleanup = null;
    }

    this._readable.destroy(error);
    this._writable.destroy(error);
    queueMicrotask(() => this.emit("close"));
  }

  /**
   * Get the underlying Web TransformStream
   */
  get webStream(): TransformStream<TInput, TOutput> {
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
    return this._readable.readableObjectMode ?? this._readable.objectMode;
  }

  get readableFlowing(): boolean | null {
    return this._readable.readableFlowing;
  }

  get destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * Async iterator support
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<TOutput> {
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
