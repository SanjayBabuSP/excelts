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
  /** @internal - for pipe() support */
  readonly _readable: Readable<TRead>;
  /** @internal - for pipe() support */
  readonly _writable: Writable<TWrite>;
  readonly allowHalfOpen: boolean;

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

  private _sideForwardingCleanup: (() => void) | null = null;

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
    const readableObjMode = options?.readableObjectMode ?? objectMode;
    const writableObjMode = options?.writableObjectMode ?? objectMode;

    this._readable = new Readable<TRead>({
      highWaterMark: options?.readableHighWaterMark ?? options?.highWaterMark,
      objectMode: readableObjMode,
      read: options?.read?.bind(this)
    });

    this._writable = new Writable<TWrite>({
      highWaterMark: options?.writableHighWaterMark ?? options?.highWaterMark,
      objectMode: writableObjMode,
      write: options?.write?.bind(this),
      final: options?.final?.bind(this)
    });

    this._setupSideForwarding();
  }

  _setupSideForwarding(): void {
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
    const { chunk, cb } = parseEndArgs<TWrite>(chunkOrCallback, encodingOrCallback, callback);

    if (cb) {
      this.once("finish", cb);
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
    if (this._destroyed) {
      return this;
    }
    this._destroyed = true;
    if (this._sideForwardingCleanup) {
      this._sideForwardingCleanup();
      this._sideForwardingCleanup = null;
    }
    this._readable.destroy(error);
    this._writable.destroy(error);
    return this;
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

  set readableFlowing(val: boolean | null) {
    this._readable.readableFlowing = val;
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
}
