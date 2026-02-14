/**
 * Browser Stream - Duplex
 */

import type { DuplexStreamOptions } from "@stream/types";
import { StreamTypeError } from "@stream/errors";
import { EventEmitter } from "@utils/event-emitter";
import { parseEndArgs } from "@stream/common/end-args";

import { Readable } from "./readable";
import { Writable } from "./writable";
import { addEmitterListener, createListenerRegistry } from "./helpers";

import { Transform } from "./transform";

// =============================================================================
// Duplex Stream
// =============================================================================

/**
 * A duplex stream that combines readable and writable
 */
export class Duplex<TRead = Uint8Array, TWrite = Uint8Array> extends EventEmitter {
  /** @internal */
  private readonly _readable: Readable<TRead>;
  /** @internal */
  private readonly _writable: Writable<TWrite>;
  allowHalfOpen: boolean;

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

      const onError = (err: Error): void => {
        duplex.emit("error", err);
      };
      const cleanupError = addEmitterListener(readable, "error", onError);
      addEmitterListener(readable, "end", cleanupError, { once: true });
      addEmitterListener(readable, "close", cleanupError, { once: true });
      addEmitterListener(sink, "finish", cleanupError, { once: true });
      readable.pipe(sink);
    };

    // If it has readable and/or writable properties
    if (
      typeof source === "object" &&
      source !== null &&
      "readable" in source &&
      "writable" in source
    ) {
      const pair = source as { readable?: Readable<R>; writable?: Writable<W> };

      // Create one duplex that can bridge both sides.
      // (Previous behavior returned a new writable-only Duplex and dropped the readable side.)
      const duplex = new Duplex<R, W>({
        readableObjectMode: pair.readable?.readableObjectMode,
        writableObjectMode: pair.writable?.writableObjectMode,
        write: pair.writable
          ? (chunk, encoding, callback) => {
              pair.writable!.write(chunk, encoding, callback);
            }
          : undefined,
        final: pair.writable
          ? callback => {
              pair.writable!.end(callback);
            }
          : undefined
      });

      if (pair.readable) {
        forwardReadableToDuplex(pair.readable, duplex);
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

    throw new StreamTypeError("Duplex-compatible source", typeof source);
  }

  /**
   * Create a Duplex from a Web ReadableWritablePair
   */
  static fromWeb<R = Uint8Array, W = Uint8Array>(
    pair: { readable: ReadableStream<R>; writable: WritableStream<W> },
    options?: DuplexStreamOptions
  ): Duplex<R, W> {
    const duplex = new Duplex<R, W>(options);

    const newReadable = new Readable<R>({
      stream: pair.readable,
      objectMode: duplex.readableObjectMode
    });
    const newWritable = new Writable<W>({
      stream: pair.writable,
      objectMode: duplex.writableObjectMode
    });

    if (duplex._sideForwardingCleanup) {
      duplex._sideForwardingCleanup();
      duplex._sideForwardingCleanup = null;
    }

    (duplex as any)._readable = newReadable;
    (duplex as any)._writable = newWritable;

    // Re-wire event forwarding (data forwarding remains lazy via Duplex.on)
    duplex._setupSideForwarding();

    return duplex;
  }

  /**
   * Convert a Node.js Duplex to Web ReadableWritablePair
   */
  static toWeb<R = Uint8Array, W = Uint8Array>(
    duplex: Duplex<R, W>
  ): { readable: ReadableStream<R>; writable: WritableStream<W> } {
    return {
      readable: Readable.toWeb(duplex._readable),
      writable: Writable.toWeb(duplex._writable)
    };
  }

  // Track if we've already set up data forwarding
  private _dataForwardingSetup: boolean = false;
  private _destroyed: boolean = false;
  private _emitClose: boolean;
  private _errored: Error | null = null;
  private _closed: boolean = false;

  private _sideForwardingCleanup: (() => void) | null = null;
  // User-provided construct function (Node.js compatibility)
  private _constructFunc?: (callback: (error?: Error | null) => void) => void;
  private _constructed: boolean = true;

  constructor(
    options?: DuplexStreamOptions & {
      allowHalfOpen?: boolean;
      objectMode?: boolean;
      emitClose?: boolean;
      autoDestroy?: boolean;
      read?: (this: Duplex<TRead, TWrite>, size?: number) => void;
      write?: (
        this: Duplex<TRead, TWrite>,
        chunk: TWrite,
        encoding: string,
        callback: (error?: Error | null) => void
      ) => void;
      writev?: (
        this: Duplex<TRead, TWrite>,
        chunks: Array<{ chunk: TWrite; encoding: string }>,
        callback: (error?: Error | null) => void
      ) => void;
      final?: (this: Duplex<TRead, TWrite>, callback: (error?: Error | null) => void) => void;
      destroy?: (
        this: Duplex<TRead, TWrite>,
        error: Error | null,
        callback: (error?: Error | null) => void
      ) => void;
      construct?: (this: Duplex<TRead, TWrite>, callback: (error?: Error | null) => void) => void;
    }
  ) {
    super();

    this.allowHalfOpen = options?.allowHalfOpen ?? true;
    this._emitClose = options?.emitClose ?? true;
    // Support shorthand objectMode option
    const objectMode = options?.objectMode ?? false;
    const readableObjMode = options?.readableObjectMode ?? objectMode;
    const writableObjMode = options?.writableObjectMode ?? objectMode;

    // HWM: if highWaterMark is explicitly provided it overrides per-side (matching Node)
    const hasGeneralHwm =
      options != null && Object.prototype.hasOwnProperty.call(options, "highWaterMark");
    const readableHwm = hasGeneralHwm ? options!.highWaterMark : options?.readableHighWaterMark;
    const writableHwm = hasGeneralHwm ? options!.highWaterMark : options?.writableHighWaterMark;

    this._readable = new Readable<TRead>({
      highWaterMark: readableHwm,
      objectMode: readableObjMode,
      read: options?.read?.bind(this),
      // Suppress child-level close/error — Duplex itself is the authority
      emitClose: false,
      autoDestroy: false
    });

    this._writable = new Writable<TWrite>({
      highWaterMark: writableHwm,
      objectMode: writableObjMode,
      write: options?.write?.bind(this),
      writev: options?.writev?.bind(this),
      final: options?.final?.bind(this),
      // Suppress child-level close/error — Duplex itself is the authority
      emitClose: false,
      autoDestroy: false
    });

    // Store user-provided destroy function
    if (options?.destroy) {
      this._destroy = options.destroy.bind(this);
    }

    // Store user-provided construct function
    if (options?.construct) {
      this._constructFunc = options.construct.bind(this);
    }

    this._setupSideForwarding();
  }

  private _setupSideForwarding(): void {
    if (this._sideForwardingCleanup) {
      this._sideForwardingCleanup();
      this._sideForwardingCleanup = null;
    }

    const registry = createListenerRegistry();

    // Forward non-data events (data forwarding is lazy to avoid premature flowing)
    registry.once(this._readable, "end", () => {
      this.emit("end");
      if (!this.allowHalfOpen) {
        this._writable.end();
      }
    });
    registry.add(this._readable, "error", err => this.emit("error", err));
    registry.add(this._readable, "readable", () => this.emit("readable"));

    registry.add(this._writable, "error", err => this.emit("error", err));
    registry.once(this._writable, "finish", () => this.emit("finish"));
    registry.add(this._writable, "drain", () => this.emit("drain"));
    registry.once(this._writable, "close", () => {
      if (!this.allowHalfOpen && !this._readable.destroyed) {
        this._readable.destroy();
      }
    });

    this._sideForwardingCleanup = () => registry.cleanup();
  }

  /**
   * Override on() to set up data forwarding lazily
   */
  override on(event: string | symbol, listener: (...args: any[]) => void): this {
    // Register the listener FIRST so that when _readable.on("data") triggers
    // resume() and synchronously drains buffered data, the forwarding handler
    // can find the listener already in place on this Duplex.
    super.on(event, listener);

    // Set up data forwarding when first external data listener is added
    if (event === "data" && !this._dataForwardingSetup) {
      this._dataForwardingSetup = true;
      this._readable.on("data", chunk => this.emit("data", chunk));
    }
    return this;
  }

  /**
   * Push data to readable side
   */
  push(chunk: TRead | null, encoding?: string): boolean {
    return this._readable.push(chunk, encoding);
  }

  /**
   * Put a chunk back at the front of the buffer (readable side)
   */
  unshift(chunk: TRead, encoding?: string): void {
    this._readable.unshift(chunk, encoding);
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
    const encoding = typeof encodingOrCallback === "string" ? encodingOrCallback : undefined;
    const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
    return encoding !== undefined
      ? this._writable.write(chunk, encoding, cb)
      : this._writable.write(chunk, cb);
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
    const { chunk, encoding, cb } = parseEndArgs<TWrite>(
      chunkOrCallback,
      encodingOrCallback,
      callback
    );

    if (cb) {
      this.once("finish", cb);
    }

    if (chunk !== undefined) {
      if (encoding !== undefined) {
        this._writable.write(chunk, encoding);
      } else {
        this._writable.write(chunk);
      }
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
  pipe<W extends Writable<TRead> | Transform<TRead, any>>(
    destination: W,
    options?: { end?: boolean }
  ): W {
    if (destination instanceof Transform) {
      this._readable.pipe((destination as any)._writable, options);
      return destination;
    }
    this._readable.pipe(destination, options);
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
    if (this._destroyed) {
      return this;
    }
    this._destroyed = true;
    if (this._sideForwardingCleanup) {
      this._sideForwardingCleanup();
      this._sideForwardingCleanup = null;
    }

    const afterDestroy = (finalError?: Error | null): void => {
      const err = finalError ?? error;
      if (err) {
        this._errored = err;
      }
      this._closed = true;
      // Destroy internal streams without their own error/close emission — the
      // Duplex itself is the authority for those events.
      this._readable.destroy();
      this._writable.destroy();
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

  /** Check if _destroy has been overridden by a subclass or constructor option. */
  private _hasDestroyHook(): boolean {
    return (
      Object.prototype.hasOwnProperty.call(this, "_destroy") ||
      Object.getPrototypeOf(this)._destroy !== Duplex.prototype._destroy
    );
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
        if (selfInitiated || this.writableFinished) {
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

  get destroyed(): boolean {
    return this._destroyed;
  }

  set destroyed(val: boolean) {
    this._destroyed = val;
  }

  get writableCorked(): number {
    return this._writable.writableCorked;
  }

  get writableNeedDrain(): boolean {
    return this._writable.writableNeedDrain;
  }

  get readableObjectMode(): boolean {
    return this._readable.readableObjectMode;
  }

  get writableObjectMode(): boolean {
    return this._writable.writableObjectMode;
  }

  get readableFlowing(): boolean | null {
    return this._readable.readableFlowing;
  }

  set readableFlowing(value: boolean | null) {
    this._readable.readableFlowing = value;
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
    return this._errored ?? this._readable.errored ?? this._writable.errored;
  }

  get closed(): boolean {
    return this._closed;
  }

  get readableBuffer(): TRead[] {
    return this._readable.readableBuffer;
  }

  get writableBuffer(): TWrite[] {
    return this._writable.writableBuffer;
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
  iterator(options?: { destroyOnReturn?: boolean }): AsyncIterableIterator<TRead> {
    return this._readable.iterator(options);
  }

  /**
   * Async iterator support
   */
  [Symbol.asyncIterator](): AsyncIterableIterator<TRead> {
    return this._readable[Symbol.asyncIterator]();
  }

  // =============================================================================
  // Functional / Higher-order Methods (forwarded to readable side)
  // =============================================================================

  map<U>(
    fn: (data: TRead, options: { signal: AbortSignal }) => U | Promise<U>,
    options?: { concurrency?: number; highWaterMark?: number; signal?: AbortSignal }
  ): Readable<U> {
    return this._readable.map(fn, options);
  }

  filter(
    fn: (data: TRead, options: { signal: AbortSignal }) => boolean | Promise<boolean>,
    options?: { concurrency?: number; highWaterMark?: number; signal?: AbortSignal }
  ): Readable<TRead> {
    return this._readable.filter(fn, options);
  }

  async forEach(
    fn: (data: TRead, options: { signal: AbortSignal }) => void | Promise<void>,
    options?: { concurrency?: number; signal?: AbortSignal }
  ): Promise<undefined> {
    return this._readable.forEach(fn, options);
  }

  async toArray(options?: { signal?: AbortSignal }): Promise<TRead[]> {
    return this._readable.toArray(options);
  }

  async some(
    fn: (data: TRead, options: { signal: AbortSignal }) => boolean | Promise<boolean>,
    options?: { concurrency?: number; signal?: AbortSignal }
  ): Promise<boolean> {
    return this._readable.some(fn, options);
  }

  async find(
    fn: (data: TRead, options: { signal: AbortSignal }) => boolean | Promise<boolean>,
    options?: { concurrency?: number; signal?: AbortSignal }
  ): Promise<TRead | undefined> {
    return this._readable.find(fn, options);
  }

  async every(
    fn: (data: TRead, options: { signal: AbortSignal }) => boolean | Promise<boolean>,
    options?: { concurrency?: number; signal?: AbortSignal }
  ): Promise<boolean> {
    return this._readable.every(fn, options);
  }

  flatMap<U>(
    fn: (
      data: TRead,
      options: { signal: AbortSignal }
    ) => Iterable<U> | AsyncIterable<U> | Readable<U> | Promise<Iterable<U> | AsyncIterable<U>>,
    options?: { concurrency?: number; signal?: AbortSignal }
  ): Readable<U> {
    return this._readable.flatMap(fn, options);
  }

  drop(limit: number, options?: { signal?: AbortSignal }): Readable<TRead> {
    return this._readable.drop(limit, options);
  }

  take(limit: number, options?: { signal?: AbortSignal }): Readable<TRead> {
    return this._readable.take(limit, options);
  }

  async reduce<U = TRead>(
    fn: (previous: U, data: TRead, options: { signal: AbortSignal }) => U | Promise<U>,
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
      | ((source: AsyncIterable<TRead>) => AsyncIterable<U>),
    options?: { signal?: AbortSignal }
  ): Readable<U> {
    return this._readable.compose(stream, options);
  }
}
