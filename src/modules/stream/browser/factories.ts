/**
 * Browser Stream - Factory functions
 */

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
  ICollector,
  IPassThrough
} from "@stream/types";

import { Readable, pumpAsyncIterableToReadable } from "./readable";
import { Writable } from "./writable";
import { Transform } from "./transform";
import { Duplex } from "./duplex";
import { PassThrough } from "./passthrough";
import { Collector } from "./collector";
import { addEmitterListener } from "./helpers";

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
  // Readable already supports Node-style `read()` via the constructor option.
  // Keep this helper minimal to avoid accidental double-read behavior.
  return new Readable<T>(options);
}

/**
 * Create a readable stream from an async iterable
 */
export function createReadableFromAsyncIterable<T>(
  iterable: AsyncIterable<T>,
  options?: ReadableStreamOptions
): IReadable<T> {
  const readable = new Readable<T>({ ...options, objectMode: options?.objectMode ?? true });

  pumpAsyncIterableToReadable(readable, iterable);

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
  // Writable already supports Node-style `write()` / `final()` via the constructor.
  return new Writable<T>(options);
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

  const underlyingWritable: any = options?.writable;

  const duplex = new Duplex<TRead, TWrite>({
    allowHalfOpen: options?.allowHalfOpen,
    readableHighWaterMark: options?.readableHighWaterMark,
    writableHighWaterMark: options?.writableHighWaterMark,
    readableObjectMode,
    writableObjectMode,
    read: options?.read,
    write:
      options?.write ??
      (underlyingWritable
        ? (chunk: TWrite, encoding: string, callback: (error?: Error | null) => void) => {
            if (typeof underlyingWritable.write === "function") {
              underlyingWritable.write(chunk, encoding, callback);
              return;
            }
            // Best-effort sync sink
            try {
              underlyingWritable.write?.(chunk);
              callback(null);
            } catch (err) {
              callback(err as Error);
            }
          }
        : undefined),
    final:
      options?.final ??
      (underlyingWritable
        ? (callback: (error?: Error | null) => void) => {
            if (typeof underlyingWritable.end === "function") {
              underlyingWritable.end((err: any) => callback(err ?? null));
            } else {
              underlyingWritable.end?.();
              callback(null);
            }
          }
        : undefined)
  });

  // If an underlying readable is provided, forward it into the duplex readable side.
  if (options?.readable) {
    const readable: any = options.readable;
    const sink = new Writable<any>({
      objectMode: duplex.readableObjectMode,
      write(chunk, _encoding, callback) {
        duplex.push(chunk);
        callback(null);
      },
      final(callback) {
        duplex.push(null);
        callback(null);
      }
    });

    if (typeof readable?.on === "function") {
      const onError = (err: any): void => {
        duplex.destroy(err);
      };
      const cleanupError = addEmitterListener(readable as any, "error", onError);
      addEmitterListener(readable as any, "end", cleanupError, { once: true });
      addEmitterListener(readable as any, "close", cleanupError, { once: true });
      addEmitterListener(sink as any, "finish", cleanupError, { once: true });
    }
    readable.pipe?.(sink);
  }

  if (options?.destroy) {
    const originalDestroy = duplex.destroy.bind(duplex);
    duplex.destroy = function (error?: Error): Duplex<TRead, TWrite> {
      options.destroy!.call(duplex, error ?? null, (err: Error | null) => {
        if (err) {
          duplex.emit("error", err);
          originalDestroy(err);
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

  pumpAsyncIterableToReadable(readable, generator());

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
