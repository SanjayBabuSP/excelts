/**
 * Node.js Stream - Factory Functions
 *
 * Stream creation helper functions for Node.js.
 */

import { Readable, Transform, Duplex, PassThrough } from "stream";
import type { TransformCallback as NodeTransformCallback } from "stream";
import type {
  ReadableStreamOptions,
  WritableStreamOptions,
  TransformStreamOptions,
  DuplexStreamOptions,
  PullStreamOptions,
  BufferedStreamOptions,
  IReadable,
  IWritable,
  ITransform,
  IDuplex,
  IPassThrough
} from "@stream/types";

import { PullStream } from "@stream/pull-stream";
import { BufferedStream, StringChunk, ByteChunk } from "@stream/buffered-stream";

// Re-export shared stream classes
export { PullStream, BufferedStream, StringChunk, ByteChunk };

/** Create a pull stream */
export function createPullStream(options?: PullStreamOptions): PullStream {
  return new PullStream(options);
}

/** Create a buffered stream */
export function createBufferedStream(options?: BufferedStreamOptions): BufferedStream {
  return new BufferedStream(options);
}

import { Writable } from "./writable";

// =============================================================================
// Stream Creation Functions
// =============================================================================

/**
 * Create a readable stream from various sources
 */
export function createReadable<_T = Uint8Array>(
  options?: ReadableStreamOptions & {
    read?: (size: number) => void;
    destroy?: (error: Error | null, callback: (error: Error | null) => void) => void;
  }
): IReadable<_T> {
  return new Readable({
    highWaterMark: options?.highWaterMark,
    objectMode: options?.objectMode,
    read: options?.read,
    destroy: options?.destroy
  });
}

/**
 * Create a readable stream from an async iterable
 */
export function createReadableFromAsyncIterable<T>(
  iterable: AsyncIterable<T>,
  options?: ReadableStreamOptions
): IReadable<T> {
  const opts: Record<string, unknown> = {
    objectMode: options?.objectMode ?? true
  };
  if (options?.highWaterMark !== undefined) {
    opts.highWaterMark = options.highWaterMark;
  }
  return Readable.from(iterable, opts);
}

/**
 * Create a readable stream from an array
 */
export function createReadableFromArray<T>(
  data: T[],
  options?: ReadableStreamOptions
): IReadable<T> {
  let index = 0;
  return new Readable({
    highWaterMark: options?.highWaterMark,
    objectMode: options?.objectMode ?? true,
    read() {
      if (index < data.length) {
        this.push(data[index++]);
      } else {
        this.push(null);
      }
    }
  });
}

/**
 * Create a writable stream
 */
export function createWritable<T = Uint8Array>(
  options?: WritableStreamOptions & {
    write?: (chunk: T, encoding: string, callback: (error?: Error | null) => void) => void;
    final?: (callback: (error?: Error | null) => void) => void;
    destroy?: (error: Error | null, callback: (error: Error | null) => void) => void;
  }
): IWritable<T> {
  return new Writable({
    highWaterMark: options?.highWaterMark,
    objectMode: options?.objectMode,
    write: options?.write as any,
    final: options?.final as any
  });
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
  return new Transform({
    highWaterMark: options?.highWaterMark,
    objectMode: options?.objectMode,
    transform(chunk: TInput, encoding: BufferEncoding, callback: NodeTransformCallback) {
      try {
        const result = transformFn(chunk, encoding);
        if (result instanceof Promise) {
          result
            .then(data => {
              if (data !== undefined) {
                callback(null, data);
              } else {
                callback();
              }
            })
            .catch(callback);
        } else {
          if (result !== undefined) {
            callback(null, result);
          } else {
            callback();
          }
        }
      } catch (err) {
        callback(err as Error);
      }
    },
    flush: options?.flush
      ? function (callback: NodeTransformCallback) {
          try {
            const result = options.flush!();
            if (result instanceof Promise) {
              result.then(data => callback(null, data)).catch(callback);
            } else if (result !== undefined) {
              callback(null, result);
            } else {
              callback();
            }
          } catch (err) {
            callback(err as Error);
          }
        }
      : undefined
  });
}

/**
 * Create a duplex stream
 */
export function createDuplex<_TRead = Uint8Array, TWrite = Uint8Array>(
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
): IDuplex<_TRead, TWrite> {
  return new Duplex({
    allowHalfOpen: (options as any)?.allowHalfOpen,
    readableHighWaterMark: options?.readableHighWaterMark,
    writableHighWaterMark: options?.writableHighWaterMark,
    readableObjectMode: options?.readableObjectMode,
    writableObjectMode: options?.writableObjectMode,
    read: options?.read,
    write: options?.write as any,
    final: options?.final as any,
    destroy: options?.destroy as any
  });
}

/**
 * Create a passthrough stream
 */
export function createPassThrough<_T = any>(options?: TransformStreamOptions): IPassThrough<_T> {
  return new PassThrough({
    highWaterMark: options?.highWaterMark,
    objectMode: options?.objectMode
  });
}

/**
 * Create a readable stream from a generator function
 */
export function createReadableFromGenerator<T>(
  generator: () => AsyncGenerator<T, void, unknown>,
  options?: ReadableStreamOptions
): IReadable<T> {
  return Readable.from(generator(), {
    highWaterMark: options?.highWaterMark,
    objectMode: options?.objectMode ?? true
  });
}

/**
 * Create a readable stream from a Promise
 */
export function createReadableFromPromise<T>(
  promise: Promise<T>,
  options?: ReadableStreamOptions
): IReadable<T> {
  const readable = new Readable({
    highWaterMark: options?.highWaterMark,
    objectMode: options?.objectMode ?? true,
    read() {}
  });

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

// Reusable empty read function
const emptyRead = function (this: Readable): void {
  this.push(null);
};

/**
 * Create a readable stream that emits nothing and immediately ends
 */
export function createEmptyReadable<_T = Uint8Array>(
  options?: ReadableStreamOptions
): IReadable<_T> {
  return new Readable({
    highWaterMark: options?.highWaterMark,
    objectMode: options?.objectMode,
    read: emptyRead
  });
}

// Reusable null write function
const nullWrite = (
  _chunk: unknown,
  _encoding: BufferEncoding,
  callback: (error?: Error | null) => void
): void => {
  callback();
};

/**
 * Create a writable stream that discards all data (like /dev/null)
 */
export function createNullWritable<_T = any>(options?: WritableStreamOptions): IWritable<_T> {
  return new Writable({
    highWaterMark: options?.highWaterMark,
    objectMode: options?.objectMode,
    write: nullWrite
  });
}
