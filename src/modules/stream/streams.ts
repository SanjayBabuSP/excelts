/**
 * Native Stream Implementation - Node.js
 *
 * Uses Node.js native stream module for maximum performance.
 * Provides Readable, Writable, Transform, Duplex, and PassThrough streams.
 */

import {
  Readable,
  Writable as NodeWritable,
  Transform,
  Duplex,
  PassThrough,
  pipeline as nodePipeline,
  finished as nodeFinished
} from "stream";
import type { TransformCallback as NodeTransformCallback, DuplexOptions } from "stream";
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

import {
  BufferedStream as StandaloneBufferedStream,
  StringChunk as StandaloneStringChunk,
  BufferChunk as StandaloneBufferChunk
} from "@stream/buffered-stream";
import { PullStream as StandalonePullStream } from "@stream/pull-stream";

// =============================================================================
// Unified Writable class (compatible with browser API)
// =============================================================================

/**
 * Extended Writable options that match browser API
 * Supports wrapping an existing Node.js stream
 */
export interface WritableOptions<T = Uint8Array> extends WritableStreamOptions {
  /** Existing Node.js Writable stream to wrap (for API compatibility with browser) */
  stream?: NodeWritable;
  autoDestroy?: boolean;
  emitClose?: boolean;
  defaultEncoding?: BufferEncoding;
  write?: (
    this: Writable<T>,
    chunk: T,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ) => void;
  final?: (this: Writable<T>, callback: (error?: Error | null) => void) => void;
}

/**
 * Unified Writable class - wraps Node.js Writable with browser-compatible API
 *
 * Supports the same `{ stream }` option as browser version for wrapping existing streams.
 */
export class Writable<T = Uint8Array> extends NodeWritable {
  constructor(options?: WritableOptions<T>) {
    // If wrapping an existing stream, proxy to it
    if (options?.stream) {
      const underlying = options.stream;

      // Create a pass-through wrapper that proxies to the underlying stream
      super({
        highWaterMark: options?.highWaterMark,
        objectMode: options?.objectMode,
        write(chunk, encoding, callback) {
          underlying.write(chunk, encoding, callback);
        },
        final(callback) {
          underlying.end(callback);
        }
      });

      // Proxy events from underlying stream, but ensure we clean up listeners so
      // the underlying stream cannot retain this wrapper longer than necessary.
      const onUnderlyingError = (err: Error): void => {
        this.emit("error", err);
      };
      const onUnderlyingClose = (): void => {
        this.emit("close");
      };
      const cleanup = (): void => {
        underlying.off("error", onUnderlyingError);
        underlying.off("close", onUnderlyingClose);
      };

      underlying.on("error", onUnderlyingError);
      underlying.on("close", onUnderlyingClose);

      this.once("close", cleanup);
      this.once("finish", cleanup);
    } else {
      super({
        highWaterMark: options?.highWaterMark,
        objectMode: options?.objectMode,
        write: options?.write as any,
        final: options?.final as any
      });
    }
  }
}

// =============================================================================
// Re-export native classes with our interfaces
// =============================================================================

export { Readable, Transform, Duplex, PassThrough };

// =============================================================================
// Cross-environment stream normalization
// =============================================================================

/**
 * Normalize a user-provided writable into a Node.js-compatible Writable.
 *
 * This keeps Web/Node branching at the stream-module boundary.
 */
export function normalizeWritable<T = Uint8Array>(
  stream: WritableLike | WritableStream<T> | NodeWritable
): WritableLike {
  if (stream instanceof Writable) {
    return stream;
  }

  // Node.js Writable: already compatible, avoid extra wrapper allocation.
  if (stream instanceof (NodeWritable as any)) {
    return stream as unknown as WritableLike;
  }

  // Web WritableStream: detect by getWriter() (avoid relying on global WritableStream).
  if ((stream as any)?.getWriter) {
    return (NodeWritable as any).fromWeb(stream as any) as WritableLike;
  }

  // Assume it structurally matches Node's Writable.
  return stream as WritableLike;
}

// Import for internal use
import { textDecoder } from "@stream/shared";

// =============================================================================
// Promisified utilities
// =============================================================================

/**
 * Pipeline streams together with proper error handling and cleanup
 * Returns a promise that resolves when the pipeline completes
 */
type PipelineStream = PipelineStreamLike;
type PipelineCallback = (err?: Error | null) => void;

export interface PipelineOptions {
  signal?: AbortSignal;
  end?: boolean;
}

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

const toNodePipelineStream = (stream: PipelineStream): unknown => {
  // Node native streams (Readable/Transform/Duplex/Writable) are already compatible.
  if (
    stream instanceof Readable ||
    stream instanceof Transform ||
    stream instanceof Duplex ||
    stream instanceof NodeWritable
  ) {
    return stream;
  }

  if (isTransformStream(stream)) {
    return (Transform as any).fromWeb(stream as any);
  }
  if (isReadableStream(stream)) {
    return (Readable as any).fromWeb(stream as any);
  }
  if (isWritableStream(stream)) {
    return (NodeWritable as any).fromWeb(stream as any);
  }

  return stream;
};

/**
 * Pipeline streams together with proper error handling and cleanup.
 * Node.js compatible with support for options and callbacks.
 */
export function pipeline(
  ...args: [...PipelineStream[], PipelineOptions | PipelineCallback] | PipelineStream[]
): Promise<void> {
  let streams: PipelineStream[];
  let options: PipelineOptions | undefined;
  let callback: PipelineCallback | undefined;

  const lastArg = args[args.length - 1] as unknown;

  if (typeof lastArg === "function") {
    callback = lastArg as PipelineCallback;
    streams = args.slice(0, -1) as PipelineStream[];
  } else if (isPipelineOptions(lastArg)) {
    options = lastArg;
    streams = args.slice(0, -1) as PipelineStream[];
  } else {
    streams = args as PipelineStream[];
  }

  const normalizedStreams = streams.map(toNodePipelineStream);

  const promise = new Promise<void>((resolve, reject) => {
    const done = (err?: Error | null): void => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    };

    if (options) {
      (nodePipeline as any)(...normalizedStreams, options, done);
    } else {
      (nodePipeline as any)(...normalizedStreams, done);
    }
  });

  if (callback) {
    promise.then(() => callback!()).catch(err => callback!(err));
  }

  return promise;
}

/**
 * Wait for a stream to finish
 */
export interface FinishedOptions {
  readable?: boolean;
  writable?: boolean;
  error?: boolean;
  signal?: AbortSignal;
}

/**
 * Wait for a stream to finish, close, or error.
 * Node.js compatible with support for options and callbacks.
 */
export function finished(
  stream: PipelineStream,
  optionsOrCallback?: FinishedOptions | PipelineCallback,
  callback?: PipelineCallback
): Promise<void> {
  let options: FinishedOptions | undefined;
  let cb: PipelineCallback | undefined;

  if (typeof optionsOrCallback === "function") {
    cb = optionsOrCallback;
  } else {
    options = optionsOrCallback;
    cb = callback;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const normalizedStream = toNodePipelineStream(stream);
    (nodeFinished as any)(normalizedStream, options, (err: Error | null) => {
      // Node.js semantics: options.error defaults to true (report errors).
      // If options.error === false, ignore errors and resolve.
      if (err && options?.error !== false) {
        reject(err);
        return;
      }
      resolve();
    });
  });

  if (cb) {
    promise.then(() => cb!()).catch(err => cb!(err));
  }

  return promise;
}

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
  return Readable.from(iterable, {
    highWaterMark: options?.highWaterMark,
    objectMode: options?.objectMode ?? true
  });
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

// =============================================================================
// Collector Stream - Collects all chunks into an array
// =============================================================================

/**
 * A writable stream that collects all chunks
 */
export class Collector<T = Uint8Array> extends Writable {
  public chunks: T[] = [];

  constructor(options?: WritableStreamOptions) {
    super({
      highWaterMark: options?.highWaterMark,
      objectMode: options?.objectMode ?? true,
      write: ((chunk: T, _encoding: BufferEncoding, callback: (error?: Error | null) => void) => {
        this.chunks.push(chunk);
        callback();
      }) as any
    });
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
    if (len === 1) {
      const first = chunks[0];
      if (first instanceof Uint8Array) {
        return first;
      }
      if (Buffer.isBuffer(first)) {
        return new Uint8Array(first.buffer, first.byteOffset, first.byteLength);
      }
    }

    // Fast path: check first chunk type once
    const first = chunks[0];
    if (first instanceof Uint8Array || Buffer.isBuffer(first)) {
      // Calculate total length with simple loop (faster than reduce)
      let totalLength = 0;
      for (let i = 0; i < len; i++) {
        totalLength += (chunks[i] as Uint8Array).length;
      }

      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (let i = 0; i < len; i++) {
        const arr = chunks[i] as Uint8Array;
        result.set(arr, offset);
        offset += arr.length;
      }
      return result;
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
      // Fast path for string chunks
      if (len === 1) {
        return first;
      }
      return (chunks as string[]).join("");
    }

    // Binary data - decode to string
    return textDecoder.decode(this.toUint8Array());
  }
}

/**
 * Create a collector stream
 */
export function createCollector<T = Uint8Array>(options?: WritableStreamOptions): ICollector<T> {
  return new Collector<T>(options);
}

// =============================================================================
// Pull Stream - Read data on demand with pattern matching
// =============================================================================

export class PullStream extends StandalonePullStream {}

/**
 * Create a pull stream
 */
export function createPullStream(options?: PullStreamOptions): PullStream {
  return new PullStream(options);
}

// =============================================================================
// Buffered Stream - Efficient chunk management
// =============================================================================

/**
 * String chunk implementation
 */
export class StringChunk extends StandaloneStringChunk implements DataChunk {}

/**
 * Buffer chunk implementation
 */
export class BufferChunk extends StandaloneBufferChunk implements DataChunk {}

/**
 * Buffered stream with efficient chunk management
 */
export class BufferedStream extends StandaloneBufferedStream {}

/**
 * Create a buffered stream
 */
export function createBufferedStream(options?: BufferedStreamOptions): BufferedStream {
  return new BufferedStream(options);
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
 * (Node.js equivalent of browser streamToBuffer)
 */
export async function streamToBuffer(
  stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>
): Promise<Uint8Array> {
  let iterable: AsyncIterable<Uint8Array>;
  if (isReadableStream(stream)) {
    iterable = (Readable as any).fromWeb(stream as any) as AsyncIterable<Uint8Array>;
  } else if (isAsyncIterable(stream)) {
    iterable = stream;
  } else {
    throw new Error("streamToBuffer: unsupported stream type");
  }
  const chunks: Buffer[] = [];
  let totalLength = 0;
  for await (const chunk of iterable as any) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string | Uint8Array);
    chunks.push(buf);
    totalLength += buf.length;
  }

  if (chunks.length === 0) {
    return new Uint8Array(0);
  }
  if (chunks.length === 1) {
    const b = chunks[0]!;
    return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  }

  // Use pre-calculated length for faster concat
  const buffer = Buffer.concat(chunks, totalLength);
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/**
 * Collect all data from a readable stream into a Uint8Array
 */
export async function streamToUint8Array(
  stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>
): Promise<Uint8Array> {
  return streamToBuffer(stream);
}

/**
 * Collect all data from a readable stream into a string
 */
export async function streamToString(
  stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>,
  encoding?: string
): Promise<string> {
  const bytes = await streamToUint8Array(stream);
  return Buffer.from(bytes).toString((encoding ?? "utf8") as BufferEncoding);
}

/**
 * Drain a stream (consume all data without processing)
 */
export async function drainStream(
  stream: AsyncIterable<unknown> | ReadableStream<unknown>
): Promise<void> {
  let iterable: AsyncIterable<unknown>;
  if (isReadableStream(stream)) {
    iterable = (Readable as any).fromWeb(stream as any) as AsyncIterable<unknown>;
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
// Additional Utility Functions
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

  const cleanup = (): void => {
    signal.removeEventListener("abort", onAbort);
    (stream as any).off?.("close", onDone);
    (stream as any).off?.("end", onDone);
    (stream as any).off?.("finish", onDone);
    (stream as any).off?.("error", onError);
  };

  const onAbort = (): void => {
    cleanup();
    stream.destroy(new Error("Aborted"));
  };

  const onDone = (): void => {
    cleanup();
  };

  const onError = (): void => {
    cleanup();
  };

  signal.addEventListener("abort", onAbort, { once: true });
  (stream as any).once?.("close", onDone);
  (stream as any).once?.("end", onDone);
  (stream as any).once?.("finish", onDone);
  (stream as any).once?.("error", onError);

  return stream;
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

/**
 * Compose multiple transform streams into one
 */
export function compose<_T = any, _R = any>(...transforms: Array<ITransform<any, any>>): Transform {
  const len = transforms.length;
  if (len === 0) {
    return new PassThrough();
  }

  const isNativeTransform = (stream: ITransform<any, any>): stream is Transform =>
    stream instanceof Transform;

  if (len === 1 && isNativeTransform(transforms[0]!)) {
    return transforms[0];
  }

  // Chain all transforms together once.
  for (let i = 0; i < len - 1; i++) {
    transforms[i]!.pipe(transforms[i + 1]!);
  }

  const first = transforms[0]!;
  const last = transforms[len - 1]!;

  // Use a private output stream so we don't have to monkey-patch `write()` on the
  // public composed stream (which would break piping into it).
  const output = new PassThrough({ objectMode: (last as any).readableObjectMode ?? true });
  last.pipe(output);

  let outputEnded = false;
  const pumpOutput = (target: Transform): void => {
    if (outputEnded) {
      return;
    }
    while (true) {
      const chunk = output.read();
      if (chunk === null) {
        break;
      }
      if (!target.push(chunk)) {
        break;
      }
    }
  };

  const composed = new Transform({
    readableObjectMode: (last as any).readableObjectMode,
    writableObjectMode: (first as any).writableObjectMode,
    transform(chunk: any, encoding: BufferEncoding, callback: NodeTransformCallback) {
      try {
        // Forward writes into the head of the chain.
        (first as any).write(chunk, encoding, callback);
      } catch (err) {
        callback(err as Error);
      }
    },
    flush(callback: NodeTransformCallback) {
      // End the head of the chain; readable completion is driven by `output` ending.
      const onFinish = (): void => {
        cleanupFlush();
        callback();
      };
      const onError = (err: Error): void => {
        cleanupFlush();
        callback(err);
      };
      const cleanupFlush = (): void => {
        (first as any).off?.("finish", onFinish);
        (first as any).off?.("error", onError);
      };

      (first as any).once?.("finish", onFinish);
      (first as any).once?.("error", onError);
      (first as any).end();
    },
    read(this: Transform) {
      pumpOutput(this);
    },
    destroy(this: Transform, err: Error | null, callback: (error: Error | null) => void) {
      try {
        output.destroy(err ?? undefined);
        for (const t of transforms) {
          (t as any).destroy?.(err ?? undefined);
        }
      } finally {
        callback(err);
      }
    }
  });

  const onOutputReadable = (): void => {
    pumpOutput(composed);
  };
  const onOutputEnd = (): void => {
    cleanupListeners();
    outputEnded = true;
    composed.push(null);
  };
  const onAnyError = (err: Error): void => {
    cleanupListeners();
    composed.destroy(err);
  };

  const transformErrorListeners: Array<{ t: any; fn: (err: Error) => void }> = [];
  const cleanupListeners = (): void => {
    output.off("readable", onOutputReadable);
    output.off("end", onOutputEnd);
    output.off("error", onAnyError);
    for (const { t, fn } of transformErrorListeners) {
      t.off?.("error", fn);
    }
    transformErrorListeners.length = 0;
  };

  output.on("readable", onOutputReadable);
  output.once("end", onOutputEnd);
  output.once("error", onAnyError);
  for (const t of transforms) {
    const tt = t as any;
    tt.once?.("error", onAnyError);
    transformErrorListeners.push({ t: tt, fn: onAnyError });
  }

  composed.once("close", () => {
    cleanupListeners();
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
  // Create promise array in-place without intermediate allocation
  const promises = new Array<Promise<void>>(len);
  for (let i = 0; i < len; i++) {
    promises[i] = finished(streams[i]);
  }
  await Promise.all(promises);
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

/**
 * Promisified version of once for events
 */
export function once(
  emitter: IEventEmitter,
  event: string,
  options?: { signal?: AbortSignal }
): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      emitter.off(event, onEvent);
      emitter.off("error", onError);
      if (options?.signal) {
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

    const onAbort = (): void => {
      cleanup();
      reject(new Error("Aborted"));
    };

    emitter.once(event, onEvent);
    emitter.once("error", onError);

    if (options?.signal) {
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/**
 * Convert a callback-based operation to a promise
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
// Type Guards
// =============================================================================

/**
 * Check if an object is a readable stream
 */
export function isReadable(obj: unknown): obj is ReadableLike {
  if (obj == null) {
    return false;
  }
  if (obj instanceof Readable) {
    return true;
  }
  const o = obj as Record<string, unknown>;
  return typeof o.read === "function" && typeof o.pipe === "function";
}

/**
 * Check if an object is a writable stream
 */
export function isWritable(obj: unknown): obj is WritableLike {
  if (obj == null) {
    return false;
  }
  if (obj instanceof Writable) {
    return true;
  }
  const o = obj as Record<string, unknown>;
  return typeof o.write === "function" && typeof o.end === "function";
}

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
    typeof o._transform === "function"
  );
}

/**
 * Check if an object is a duplex stream
 */
export function isDuplex(obj: unknown): obj is IDuplex<any, any> {
  if (obj == null) {
    return false;
  }
  if (obj instanceof Duplex) {
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
// Stream State Inspection Functions
// =============================================================================

/**
 * Check if a stream has been destroyed
 */
export function isDestroyed(stream: { destroyed?: boolean } | null | undefined): boolean {
  return !!stream?.destroyed;
}

/**
 * Check if a readable stream has been disturbed (read from)
 */
export function isDisturbed(stream: unknown): boolean {
  if ((stream as any)?.locked !== undefined) {
    return !!(stream as ReadableStream).locked;
  }
  const s = stream as any;
  return !!(
    s?.readableDidRead ||
    s?._didRead ||
    s?.readableEnded ||
    s?.destroyed ||
    s?._ended ||
    s?._destroyed
  );
}

/**
 * Check if a stream has an error
 */
export function isErrored(stream: { errored?: unknown } | null | undefined): boolean {
  return !!stream?.errored;
}

// =============================================================================
// Default High Water Mark Management
// =============================================================================

/**
 * Get the default high water mark for streams
 */
export function getDefaultHighWaterMark(objectMode: boolean): number {
  // Default values from Node.js stream module
  return objectMode ? 16 : 16 * 1024;
}

/**
 * Set the default high water mark for streams
 * Note: This is a no-op in this implementation as we use fixed defaults
 */
export function setDefaultHighWaterMark(_objectMode: boolean, _value: number): void {
  // No-op - Node.js internal state cannot be modified safely
}

// =============================================================================
// Duplex Pair
// =============================================================================

/**
 * Create a pair of connected Duplex streams
 */
export function duplexPair<T = Uint8Array>(options?: DuplexStreamOptions): [Duplex, Duplex] {
  // Use PassThrough as the simplest implementation
  const objectMode =
    options?.readableObjectMode ?? options?.writableObjectMode ?? options?.objectMode ?? false;
  const highWaterMark =
    options?.readableHighWaterMark ?? options?.writableHighWaterMark ?? options?.highWaterMark;
  const nodeOpts: DuplexOptions = {
    objectMode,
    highWaterMark
  };

  const passthrough1 = new PassThrough(nodeOpts);
  const passthrough2 = new PassThrough(nodeOpts);

  const duplex1 = new Duplex({
    allowHalfOpen: options?.allowHalfOpen,
    readableHighWaterMark: options?.readableHighWaterMark ?? highWaterMark,
    writableHighWaterMark: options?.writableHighWaterMark ?? highWaterMark,
    readableObjectMode: options?.readableObjectMode ?? objectMode,
    writableObjectMode: options?.writableObjectMode ?? objectMode,
    read(): void {
      // Will be pushed from duplex2
    },
    write(chunk: T, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
      passthrough1.write(chunk, encoding, callback);
    },
    final(callback: (error?: Error | null) => void): void {
      passthrough1.end(callback);
    }
  });

  const duplex2 = new Duplex({
    allowHalfOpen: options?.allowHalfOpen,
    readableHighWaterMark: options?.readableHighWaterMark ?? highWaterMark,
    writableHighWaterMark: options?.writableHighWaterMark ?? highWaterMark,
    readableObjectMode: options?.readableObjectMode ?? objectMode,
    writableObjectMode: options?.writableObjectMode ?? objectMode,
    read(): void {
      // Will be pushed from duplex1
    },
    write(chunk: T, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
      passthrough2.write(chunk, encoding, callback);
    },
    final(callback: (error?: Error | null) => void): void {
      passthrough2.end(callback);
    }
  });

  // Connect them
  passthrough1.on("data", chunk => duplex2.push(chunk));
  passthrough1.on("end", () => duplex2.push(null));
  passthrough2.on("data", chunk => duplex1.push(chunk));
  passthrough2.on("end", () => duplex1.push(null));

  return [duplex1, duplex2];
}

// =============================================================================
// Stream Consumers (like stream/consumers in Node.js)
// =============================================================================

export const consumers = {
  async arrayBuffer(
    stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>
  ): Promise<ArrayBuffer> {
    const bytes = await streamToUint8Array(stream);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  },

  async blob(
    stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>,
    options?: BlobPropertyBag
  ): Promise<Blob> {
    const bytes = await streamToUint8Array(stream);
    return new Blob([bytes as BlobPart], options);
  },

  async buffer(
    stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>
  ): Promise<Uint8Array> {
    return streamToUint8Array(stream);
  },

  async json(stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>): Promise<any> {
    const text = await consumers.text(stream);
    return JSON.parse(text);
  },

  async text(
    stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>,
    encoding?: string
  ): Promise<string> {
    return streamToString(stream, encoding);
  }
};

// =============================================================================
// Promises API (like stream/promises in Node.js)
// =============================================================================

export const promises = {
  pipeline,
  finished
};
