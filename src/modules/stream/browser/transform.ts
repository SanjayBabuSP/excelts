/**
 * Browser Stream - Transform
 */

import type { DuplexStreamOptions, WritableLike } from "@stream/types";
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
  /**
   * Allow duck-typed instanceof checks.
   * Makes `transform instanceof Transform` return true, and also
   * `transform instanceof Duplex` via Duplex's own Symbol.hasInstance.
   */
  static [Symbol.hasInstance](instance: any): boolean {
    if (instance == null || typeof instance !== "object") {
      return false;
    }
    // Fast path: actual Transform prototype
    if (Object.prototype.isPrototypeOf.call(Transform.prototype, instance)) {
      return true;
    }
    // Duck-type: must have Duplex characteristics + _transform method
    return (
      instance.__excelts_stream === true &&
      typeof instance.read === "function" &&
      typeof instance.pipe === "function" &&
      typeof instance.write === "function" &&
      typeof instance.end === "function" &&
      typeof instance.on === "function" &&
      typeof instance._transform === "function" &&
      "readableFlowing" in instance &&
      "writableFinished" in instance
    );
  }

  /** @internal */
  private readonly _readable: Readable<TOutput>;
  /** @internal */
  private readonly _writable: Writable<TInput>;
  private _objectMode: boolean;
  allowHalfOpen: boolean;

  private _destroyed: boolean = false;
  private _closed: boolean = false;
  private _ended: boolean = false;
  private _errored: Error | null = null;
  private _dataForwardingSetup: boolean = false;
  private _emitClose: boolean;
  private _autoDestroy: boolean;

  private _endGeneration: number = 0;
  private _endCallback: (() => void) | null = null;

  private _webStream: TransformStream<TInput, TOutput> | null = null;

  private _sideForwardingCleanup: (() => void) | null = null;
  // User-provided construct function (Node.js compatibility)
  private _constructFunc?: (callback: (error?: Error | null) => void) => void;
  private _constructed: boolean = true;

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
    options?: DuplexStreamOptions & {
      emitClose?: boolean;
      autoDestroy?: boolean;
      encoding?: string;
      decodeStrings?: boolean;
      defaultEncoding?: string;
      signal?: AbortSignal;
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
      write?: (
        this: Transform<TInput, TOutput>,
        chunk: TInput,
        encoding: string,
        callback: (error?: Error | null) => void
      ) => void;
      writev?: (
        this: Transform<TInput, TOutput>,
        chunks: Array<{ chunk: TInput; encoding: string }>,
        callback: (error?: Error | null) => void
      ) => void;
      final?: (this: Transform<TInput, TOutput>, callback: (error?: Error | null) => void) => void;
      destroy?: (
        this: Transform<TInput, TOutput>,
        error: Error | null,
        callback: (error?: Error | null) => void
      ) => void;
      construct?: (
        this: Transform<TInput, TOutput>,
        callback: (error?: Error | null) => void
      ) => void;
    }
  ) {
    super();

    // ObjectMode: per-side overrides general (matching Node)
    const objectMode = options?.objectMode ?? false;
    const readableObjMode = options?.readableObjectMode ?? objectMode;
    const writableObjMode = options?.writableObjectMode ?? objectMode;
    this._objectMode = objectMode;
    this.allowHalfOpen = options?.allowHalfOpen ?? true;
    this._emitClose = options?.emitClose ?? true;
    this._autoDestroy = options?.autoDestroy ?? true;
    this._transformImpl = options?.transform;
    this._flushImpl = options?.flush;

    // HWM: if highWaterMark is explicitly provided it overrides per-side (matching Node)
    const hasGeneralHwm =
      options != null && Object.prototype.hasOwnProperty.call(options, "highWaterMark");
    const readableHwm = hasGeneralHwm ? options!.highWaterMark : options?.readableHighWaterMark;
    const writableHwm = hasGeneralHwm ? options!.highWaterMark : options?.writableHighWaterMark;

    // Store user-provided destroy function
    if (options?.destroy) {
      this._destroy = options.destroy.bind(this);
    }

    // Store user-provided construct function
    if (options?.construct) {
      this._constructFunc = options.construct.bind(this);
    }

    // When Transform has a construct hook, propagate delay to child streams
    // so that reads/writes are queued until the Transform-level construct fires.
    let readableConstructCb: ((error?: Error | null) => void) | undefined;
    let writableConstructCb: ((error?: Error | null) => void) | undefined;
    const hasConstruct = this._hasConstructHook();

    this._readable = new Readable<TOutput>({
      highWaterMark: readableHwm,
      objectMode: readableObjMode,
      encoding: options?.encoding,
      // Suppress child-level close/error — Transform itself is the authority
      emitClose: false,
      autoDestroy: false,
      // Propagate construct delay to child readable
      construct: hasConstruct
        ? cb => {
            readableConstructCb = cb;
          }
        : undefined
    });

    // Determine write/final handlers.
    // If a `write` option is provided, it replaces the transform-based write (matching Node).
    const writeHandler = options?.write
      ? (chunk: TInput, encoding: string, callback: (error?: Error | null) => void) => {
          options.write!.call(this, chunk, encoding, callback);
        }
      : (chunk: TInput, encoding: string, callback: (error?: Error | null) => void) => {
          // Try synchronous transform first.  If the transform completes
          // synchronously we MUST call the callback synchronously so that
          // the Writable write-queue drains in the same microtask, preventing
          // _scheduleEnd from racing ahead of dynamically-added writes.
          const maybePromise = this._runTransformSync(chunk, encoding);
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
        };

    const finalHandler = options?.final
      ? (callback: (error?: Error | null) => void) => {
          options.final!.call(this, (err?: Error | null) => {
            if (err) {
              callback(err);
              return;
            }
            // Even with a custom _final, the readable side must end (push null).
            // Node.js Transform always ends the readable side when the writable
            // side finishes, regardless of custom _final.
            this._readable.push(null);
            callback(null);
          });
        }
      : (callback: (error?: Error | null) => void) => {
          this._runFlush()
            .then(() => {
              this._readable.push(null);
              callback(null);
            })
            .catch(err => callback(err));
        };

    this._writable = new Writable<TInput>({
      highWaterMark: writableHwm,
      objectMode: writableObjMode,
      // Suppress child-level close/error — Transform itself is the authority
      emitClose: false,
      autoDestroy: false,
      write: writeHandler,
      writev: options?.writev?.bind(this),
      final: finalHandler,
      decodeStrings: options?.decodeStrings,
      defaultEncoding: options?.defaultEncoding,
      // Propagate construct delay to child writable
      construct: hasConstruct
        ? cb => {
            writableConstructCb = cb;
          }
        : undefined
    });

    // Prevent unhandled error throws on child streams.
    // Errors are forwarded to the Transform via _setupSideForwarding; these
    // noop listeners act as safety nets after forwarding cleanup.
    const noop = (): void => {};
    this._readable.on("error", noop);
    this._writable.on("error", noop);

    this._setupSideForwarding();

    // signal option — destroy the Transform when signal aborts (matching Node)
    if (options?.signal) {
      this._setupAbortSignal(options.signal);
    }

    // R7-3: _construct hook — if provided, delay reads/writes until constructed
    if (hasConstruct) {
      this._constructed = false;
      queueMicrotask(() => {
        const fn = this._constructFunc ?? (this as any)._construct.bind(this);
        fn((err?: Error | null) => {
          if (err) {
            readableConstructCb?.(err);
            writableConstructCb?.(err);
            this.destroy(err);
            return;
          }
          this._constructed = true;
          // Unblock child streams by firing their construct callbacks
          readableConstructCb?.();
          writableConstructCb?.();
        });
      });
    }
  }

  private _setupAbortSignal(signal: AbortSignal): void {
    if (signal.aborted) {
      this.destroy(new Error("The operation was aborted"));
      return;
    }

    const onAbort = (): void => {
      this.destroy(new Error("The operation was aborted"));
    };

    const cleanup = (): void => {
      signal.removeEventListener("abort", onAbort);
    };

    signal.addEventListener("abort", onAbort, { once: true });
    this.once("close", cleanup);
  }

  private _setupSideForwarding(): void {
    if (this._sideForwardingCleanup) {
      this._sideForwardingCleanup();
      this._sideForwardingCleanup = null;
    }

    const registry = createListenerRegistry();

    // Auto-destroy: when both sides finish, destroy the Transform (matching Node.js).
    let readableEnded = false;
    let writableFinished = false;
    const maybeAutoDestroy = (): void => {
      if (this._autoDestroy && readableEnded && writableFinished && !this._destroyed) {
        this.destroy();
      }
    };

    registry.once(this._readable, "end", () => {
      this.emit("end");
      readableEnded = true;
      if (!this.allowHalfOpen) {
        this._writable.end();
      }
      maybeAutoDestroy();
    });
    registry.add(this._readable, "error", err => this._emitErrorOnce(err));
    // Use EventEmitter.prototype.on directly to register "readable" forwarding,
    // bypassing Readable's on() override which sets readableFlowing = false.
    const readableForwarder = (): void => {
      this.emit("readable");
    };
    EventEmitter.prototype.on.call(this._readable, "readable", readableForwarder);
    registry.add(this._readable, "pause", () => this.emit("pause"));
    registry.add(this._readable, "resume", () => this.emit("resume"));

    registry.once(this._writable, "finish", () => {
      this.emit("finish");
      writableFinished = true;
      maybeAutoDestroy();
    });
    registry.add(this._writable, "drain", () => this.emit("drain"));
    registry.add(this._writable, "error", err => this._emitErrorOnce(err));
    registry.once(this._writable, "close", () => {
      if (!this.allowHalfOpen && !this._readable.destroyed) {
        this._readable.destroy();
      }
    });

    this._sideForwardingCleanup = () => {
      registry.cleanup();
      this._readable.off("readable", readableForwarder);
    };
  }

  private _scheduleEnd(): void {
    if (this._destroyed || this._errored) {
      return;
    }
    if (this._writable.writableEnded) {
      return;
    }

    const gen = ++this._endGeneration;

    // Defer to the next microtask so that synchronous code following the
    // readable push(null) can still register listeners or write data.
    // Node.js uses process.nextTick here; queueMicrotask is the closest
    // browser equivalent.
    queueMicrotask(() => {
      if (gen !== this._endGeneration) {
        return;
      }
      if (this._destroyed || this._errored || this._writable.writableEnded) {
        return;
      }
      this._writable.end();
    });
  }

  private _emitErrorOnce(err: any): void {
    if (this._errored) {
      return;
    }
    const error = err instanceof Error ? err : new Error(String(err));
    this._errored = error;
    // Use destroy() so that _destroy hooks, cleanup, and close emission
    // all go through the standard path (matching Node.js behavior).
    // destroy() will emit both the error and the close event.
    if (!this._destroyed) {
      this.destroy(error);
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
    // Walk the prototype chain to find a subclass-defined _flush.
    // Node.js does NOT have _flush on Transform.prototype (it's undefined).
    let proto = Object.getPrototypeOf(this);
    while (proto && proto !== Transform.prototype && proto !== Object.prototype) {
      if (Object.prototype.hasOwnProperty.call(proto, "_flush")) {
        return true;
      }
      proto = Object.getPrototypeOf(proto);
    }
    return false;
  }

  /**
   * Run the transform function.  Returns `undefined` when the transform
   * completed synchronously, or a `Promise<void>` when it is async.
   * Keeping the sync path truly synchronous is critical so that the Writable
   * write-queue callback fires synchronously and _scheduleEnd cannot race
   * ahead of writes added during 'data' callbacks.
   */
  private _runTransformSync(chunk: TInput, encoding: string): Promise<void> | undefined {
    if (this._destroyed || this._errored) {
      throw new StreamStateError("write", this._errored ? "stream errored" : "stream destroyed");
    }

    if (this._hasSubclassTransform()) {
      return new Promise<void>((resolve, reject) => {
        this._transform(chunk, encoding, (err?: Error | null, data?: TOutput) => {
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

    // Node.js always invokes the user transform as (chunk, encoding, callback),
    // regardless of declared parameter count. Users may access the callback via
    // `arguments[2]` even when the function signature omits it.
    // We also support a convenience shorthand where the return value (or promise)
    // is used, but ONLY if the callback was not called.
    let sync = true;
    let syncDone = false;
    let syncErr: Error | null = null;
    let syncData: TOutput | undefined;

    let resolveAsync: (() => void) | null = null;
    let rejectAsync: ((err: any) => void) | null = null;
    const promise = new Promise<void>((resolve, reject) => {
      resolveAsync = resolve;
      rejectAsync = reject;
    });

    const out = (
      userTransform as (
        this: Transform<TInput, TOutput>,
        chunk: TInput,
        encoding: string,
        callback: (error?: Error | null, data?: TOutput) => void
      ) => any
    ).call(this, chunk, encoding, (err?: Error | null, data?: TOutput) => {
      if (sync) {
        syncDone = true;
        syncErr = err ?? null;
        syncData = data;
        return;
      }

      if (err) {
        rejectAsync?.(err);
        return;
      }
      if (data !== undefined) {
        this.push(data);
      }
      resolveAsync?.();
    });

    sync = false;

    if (syncDone) {
      // Callback was called synchronously — ignore return value (Node.js behavior).
      if (syncErr) {
        throw syncErr;
      }
      if (syncData !== undefined) {
        this.push(syncData);
      }
      return undefined;
    }

    // Callback was NOT called synchronously. Check if the function returned
    // a value/promise (convenience shorthand for our browser shim).
    if (out && typeof (out as any).then === "function") {
      return (out as Promise<TOutput>).then(data => {
        if (data !== undefined) {
          this.push(data);
        }
      });
    }
    if (out !== undefined) {
      this.push(out as TOutput);
      return undefined;
    }

    // If the function declares fewer than 3 parameters, it's a shorthand
    // transform that doesn't know about the callback. When it returns
    // undefined (e.g. filtering), treat as synchronous completion instead
    // of waiting for a callback that will never be called.
    if ((userTransform as any).length < 3) {
      return undefined;
    }

    // Callback not yet called, no return value — wait for async callback.
    return promise;
  }

  private async _runTransform(chunk: TInput, encoding: string): Promise<void> {
    if (this._destroyed || this._errored) {
      throw new StreamStateError("write", this._errored ? "stream errored" : "stream destroyed");
    }

    if (this._hasSubclassTransform()) {
      await new Promise<void>((resolve, reject) => {
        this._transform(chunk, encoding, (err?: Error | null, data?: TOutput) => {
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

    // Node.js always invokes the user transform as (chunk, encoding, callback),
    // regardless of declared parameter count. If the callback is called, its
    // result takes priority; otherwise we fall back to the return value.
    let callbackCalled = false;
    const cbPromise = new Promise<void>((resolve, reject) => {
      const out = (
        userTransform as (
          this: Transform<TInput, TOutput>,
          chunk: TInput,
          encoding: string,
          callback: (error?: Error | null, data?: TOutput) => void
        ) => any
      ).call(this, chunk, encoding, (err?: Error | null, data?: TOutput) => {
        callbackCalled = true;
        if (err) {
          reject(err);
          return;
        }
        if (data !== undefined) {
          this.push(data);
        }
        resolve();
      });

      // If callback was not called synchronously, check return value.
      if (!callbackCalled) {
        if (out && typeof (out as any).then === "function") {
          (out as Promise<TOutput>)
            .then(data => {
              if (!callbackCalled) {
                if (data !== undefined) {
                  this.push(data as TOutput);
                }
                resolve();
              }
            })
            .catch(err => {
              if (!callbackCalled) {
                reject(err);
              }
            });
        } else if (out !== undefined) {
          if (!callbackCalled) {
            this.push(out as TOutput);
            resolve();
          }
        } else if ((userTransform as any).length < 3) {
          // Shorthand transform (fewer than 3 declared params) returned
          // undefined and didn't call the callback — treat as synchronous
          // completion (e.g. filtering out values) instead of waiting for
          // a callback that will never be called.
          resolve();
        }
      }
    });

    await cbPromise;
  }

  private async _runFlush(): Promise<void> {
    if (this._destroyed || this._errored) {
      return;
    }

    if (this._hasSubclassFlush()) {
      await new Promise<void>((resolve, reject) => {
        (this as any)._flush((err?: Error | null, data?: TOutput) => {
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

    // Node.js always invokes flush as (callback), regardless of declared
    // parameter count. Users may access the callback via `arguments[0]`
    // even when the function signature has zero parameters.
    // If the callback is called, its result takes priority; otherwise we
    // fall back to the return value (convenience shorthand).
    let callbackCalled = false;
    await new Promise<void>((resolve, reject) => {
      const out = (
        userFlush as (
          this: Transform<TInput, TOutput>,
          callback: (error?: Error | null, data?: TOutput) => void
        ) => any
      ).call(this, (err?: Error | null, data?: TOutput) => {
        callbackCalled = true;
        if (err) {
          reject(err);
          return;
        }
        if (data !== undefined) {
          this.push(data);
        }
        resolve();
      });

      // If callback was not called synchronously, check return value.
      if (!callbackCalled) {
        if (out && typeof (out as any).then === "function") {
          (out as Promise<TOutput | void>)
            .then(data => {
              if (!callbackCalled) {
                if (data !== undefined) {
                  this.push(data as TOutput);
                }
                resolve();
              }
            })
            .catch(err => {
              if (!callbackCalled) {
                reject(err);
              }
            });
        } else if (out !== undefined) {
          if (!callbackCalled) {
            this.push(out as TOutput);
            resolve();
          }
        } else if ((userFlush as any).length < 1) {
          // Shorthand flush (zero declared params) returned undefined and
          // didn't call the callback — treat as synchronous completion
          // instead of waiting for a callback that will never be called.
          resolve();
        }
      }
    });
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
    } else if (event === "readable") {
      // Node.js: adding a 'readable' listener sets readableFlowing to false
      this._readable.readableFlowing = false;
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
    const encoding = typeof encodingOrCallback === "string" ? encodingOrCallback : undefined;
    const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;

    // Reject writes after end() — matches Node.js behavior.
    if (this._ended) {
      const err = new Error("write after end") as Error & { code: string };
      err.code = "ERR_STREAM_WRITE_AFTER_END";
      queueMicrotask(() => this.emit("error", err));
      if (cb) {
        queueMicrotask(() => cb(err));
      }
      return false;
    }

    return encoding !== undefined
      ? this._writable.write(chunk, encoding, cb)
      : this._writable.write(chunk, cb);
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

    const { chunk, encoding, cb } = parseEndArgs<TInput>(
      chunkOrCallback,
      encodingOrCallback,
      callback
    );

    if (cb) {
      this._endCallback = cb;
      this.once("finish", () => {
        const ecb = this._endCallback;
        if (ecb) {
          this._endCallback = null;
          ecb();
        }
      });
    }

    // Write the end-chunk BEFORE setting _ended so that synchronous writes
    // from data handlers (triggered during transform processing) are still
    // accepted — matching Node.js behaviour where writableEnded is false
    // during the transform callback for the end() chunk.
    if (chunk !== undefined) {
      if (encoding !== undefined) {
        this._writable.write(chunk, encoding);
      } else {
        this._writable.write(chunk);
      }
    }

    this._ended = true;
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

    const afterDestroy = (finalError?: Error | null): void => {
      const err = finalError ?? error;
      this._readable.destroy();
      this._writable.destroy();
      // Fire the pending end() callback before discarding it.
      // Node.js fires the end() callback on destroy (it listens on both
      // 'finish' and 'close'; destroy emits 'close').
      const endCb = this._endCallback;
      this._endCallback = null;
      this._closed = true;
      queueMicrotask(() => {
        if (endCb) {
          endCb();
        }
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
    this._readable._undestroy();
    this._writable._undestroy();
    this._destroyed = false;
    this._closed = false;
    this._errored = null;
    this._setupSideForwarding();
  }

  /** Check if _destroy has been overridden by a subclass or constructor option. */
  private _hasDestroyHook(): boolean {
    return (
      Object.prototype.hasOwnProperty.call(this, "_destroy") ||
      Object.getPrototypeOf(this)._destroy !== Transform.prototype._destroy
    );
  }

  /**
   * Check if a subclass defines _construct on its own prototype.
   * Node.js does NOT have _construct on any stream prototype — it only exists
   * when provided via constructor options or defined by a subclass.
   */
  private _hasConstructHook(): boolean {
    if (this._constructFunc) {
      return true;
    }
    let proto = Object.getPrototypeOf(this);
    while (proto && proto !== Transform.prototype && proto !== Object.prototype) {
      if (Object.prototype.hasOwnProperty.call(proto, "_construct")) {
        return true;
      }
      proto = Object.getPrototypeOf(proto);
    }
    return false;
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
      if (this.closed) {
        settle();
      } else {
        this.once("close", settle);
      }
    });
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
    return this._ended || this._writable.writableEnded;
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
    return (this as any)._readable.readableFlowing;
  }

  set readableFlowing(value: boolean | null) {
    (this as any)._readable.readableFlowing = value;
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
    return this._errored ?? this._readable.errored ?? this._writable.errored;
  }

  get closed(): boolean {
    return this._closed;
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
    stream: WritableLike | ((source: AsyncIterable<TOutput>) => AsyncIterable<U>),
    options?: { signal?: AbortSignal }
  ): Readable<U> {
    return this._readable.compose(stream, options);
  }

  // =========================================================================
  // Static Methods (Node.js compatibility)
  // =========================================================================

  /**
   * Check if a stream has been disturbed (data read or piped).
   * Delegates to Readable.isDisturbed, checking internal _readable for Duplex/Transform.
   */
  static isDisturbed(stream: any): boolean {
    if (stream && stream._readable instanceof Readable) {
      return Readable.isDisturbed(stream._readable);
    }
    return Readable.isDisturbed(stream);
  }

  /**
   * Create a Transform from various sources (delegates to Duplex.from).
   * Matches Node.js where Transform inherits static from() from Duplex.
   */
  static from<TIn = Uint8Array, TOut = Uint8Array>(
    source:
      | AsyncIterable<TIn>
      | Iterable<TIn>
      | {
          readable?: Readable<TIn>;
          writable?: Writable<TOut>;
        }
  ): Duplex<TIn, TOut> {
    if (!_DuplexFromFactory) {
      throw new Error("Transform.from() requires Duplex injection. Import from @stream.");
    }
    return _DuplexFromFactory(source);
  }

  /**
   * Convert a Web TransformStream to Node.js Transform
   */
  static fromWeb<TIn = Uint8Array, TOut = Uint8Array>(
    webStream: TransformStream<TIn, TOut>,
    options?: DuplexStreamOptions
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
   * Default behavior: call callback with ERR_METHOD_NOT_IMPLEMENTED (matches Node.js).
   * Node.js calls callback(err) rather than throwing synchronously.
   */
  _transform(
    _chunk: TInput,
    _encoding: string,
    callback: (error?: Error | null, data?: TOutput) => void
  ): void {
    const err = new Error("_transform() is not implemented") as Error & { code: string };
    err.code = "ERR_METHOD_NOT_IMPLEMENTED";
    callback(err);
  }

  /**
   * Base final method - matches Node.js Transform.prototype._final.
   * In Node.js this calls _flush (if defined), pushes null, and calls cb.
   * In our browser implementation, the actual final logic is handled by
   * the finalHandler passed to the internal Writable, so this method
   * exists primarily for API surface parity and subclass override detection.
   */
  _final(callback: (error?: Error | null) => void): void {
    if (typeof (this as any)._flush === "function" && !this.destroyed) {
      (this as any)._flush((err?: Error | null, data?: TOutput) => {
        if (err) {
          callback(err);
          return;
        }
        if (data != null) {
          this.push(data);
        }
        this.push(null);
        callback();
      });
    } else {
      this.push(null);
      callback();
    }
  }
}

// Node.js: `Transform.prototype.addListener === Transform.prototype.on` (same function).
// Transform overrides `on` from EventEmitter, so we must re-alias `addListener`.
Transform.prototype.addListener = Transform.prototype.on;

// Node.js: Transform.prototype._writev === null (inherited from Duplex/Writable chain).
// Browser Transform doesn't extend Duplex, so we set it explicitly.
(Transform.prototype as any)._writev = null;

// =============================================================================
// Late-binding injection for Duplex (avoids circular import)
// =============================================================================

let _DuplexFromFactory: ((source: any) => any) | null = null;

/** @internal — called from index.browser.ts to break circular dependency */
export function _injectDuplexFrom(factory: (source: any) => any): void {
  _DuplexFromFactory = factory;
}
