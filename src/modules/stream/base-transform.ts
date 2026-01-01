/**
 * Base Transform Stream
 *
 * Provides a base class for Transform streams.
 * Works identically in both browser and Node.js environments.
 */

import { EventEmitter } from "./event-emitter";

export interface BaseTransformOptions {
  /** High water mark for backpressure */
  highWaterMark?: number;
  /** Enable object mode (non-binary data) */
  objectMode?: boolean;
}

export type TransformCallback<T = Uint8Array> = (error?: Error | null, data?: T) => void;

/**
 * Browser-compatible Base Transform stream
 */
export abstract class BaseTransform<
  TInput = Uint8Array,
  TOutput = Uint8Array
> extends EventEmitter {
  protected _buffer: TInput[] = [];
  protected _bufferIndex: number = 0;
  protected _isProcessing: boolean = false;
  protected _isDestroyed: boolean = false;
  protected _isFinished: boolean = false;
  protected _errorEmitted: boolean = false;
  protected _objectMode: boolean;
  protected _highWaterMark: number;

  constructor(options: BaseTransformOptions = {}) {
    super();
    this._objectMode = options.objectMode ?? false;
    this._highWaterMark = options.highWaterMark ?? 16384;
  }

  /**
   * Main transform implementation - must be overridden by subclasses
   */
  abstract processChunk(chunk: TInput, callback: TransformCallback<TOutput>): void;

  /**
   * Optional flush implementation for remaining data
   */
  processFlush(callback: TransformCallback<TOutput>): void {
    callback();
  }

  /**
   * Write data to the transform stream
   */
  write(chunk: TInput): boolean {
    if (this._isDestroyed) {
      this.emit("error", new Error("Cannot write to destroyed stream"));
      return false;
    }

    this._buffer.push(chunk);
    this._processNext();

    return this._buffer.length - this._bufferIndex < this._highWaterMark;
  }

  /**
   * Signal end of input
   */
  end(chunk?: TInput): void {
    if (chunk !== undefined) {
      this.write(chunk);
    }

    // Wait for buffer to drain, then flush
    const checkAndFlush = (): void => {
      if (this._buffer.length === this._bufferIndex && !this._isProcessing) {
        this.processFlush((err, data) => {
          if (err) {
            this._emitError(err);
          } else if (data !== undefined) {
            this.emit("data", data);
          }
          this._isFinished = true;
          this.emit("finish");
          this.emit("end");
        });
      } else {
        setTimeout(checkAndFlush, 0);
      }
    };

    checkAndFlush();
  }

  /**
   * Destroy the stream
   */
  destroy(error?: Error): void {
    if (this._isDestroyed) {
      return;
    }

    this._isDestroyed = true;
    // Reuse array if possible
    this._buffer.length = 0;
    this._bufferIndex = 0;

    if (error) {
      this._emitError(error);
    }

    this.emit("close");
  }

  /**
   * Process next chunk in buffer
   */
  private _processNext(): void {
    // Combined early exit check
    if (this._isProcessing || this._isDestroyed || this._bufferIndex >= this._buffer.length) {
      return;
    }

    this._isProcessing = true;
    const chunk = this._buffer[this._bufferIndex++]!;

    // Reset/compact when we consume a lot of the prefix to avoid unbounded growth.
    if (this._bufferIndex === this._buffer.length) {
      this._buffer.length = 0;
      this._bufferIndex = 0;
    } else if (this._bufferIndex > 1024 && this._bufferIndex * 2 > this._buffer.length) {
      this._buffer = this._buffer.slice(this._bufferIndex);
      this._bufferIndex = 0;
    }

    try {
      this.processChunk(chunk, (err, data) => {
        this._isProcessing = false;

        if (err) {
          this._emitError(err);
        } else {
          if (data !== undefined) {
            this.emit("data", data);
          }
          // Process next chunk
          this._processNext();
        }
      });
    } catch (err) {
      this._isProcessing = false;
      this._emitError(err as Error);
    }
  }

  /**
   * Emit error only once
   */
  private _emitError(error: Error): void {
    if (!this._errorEmitted) {
      this._errorEmitted = true;
      this.emit("error", error);
    }
  }

  /**
   * Check if stream is in a valid state
   */
  get isValid(): boolean {
    return !this._isDestroyed && !this._errorEmitted;
  }

  /**
   * Check if stream has finished
   */
  get isFinished(): boolean {
    return this._isFinished;
  }

  /**
   * Pipe to another transform or collector
   */
  pipe<T extends BaseTransform<TOutput, any>>(destination: T): T {
    this.on("data", chunk => {
      destination.write(chunk);
    });

    this.on("end", () => {
      destination.end();
    });

    this.on("error", err => {
      destination.destroy(err);
    });

    return destination;
  }
}
