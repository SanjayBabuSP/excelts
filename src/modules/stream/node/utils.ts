/**
 * Node.js Stream - Utilities
 *
 * Stream utility functions, type guards, consumers, and state inspection.
 */

import { Readable, Transform, Duplex, PassThrough } from "stream";
import type { DuplexOptions } from "stream";
import { UnsupportedStreamTypeError } from "@stream/errors";
import type {
  DuplexStreamOptions,
  IDuplex,
  ITransform,
  PipelineStreamLike,
  ReadableLike,
  WritableLike
} from "@stream/types";
import { isAsyncIterable, isReadableStream } from "@stream/internal/type-guards";

import { Writable } from "./writable";
import { pipeline } from "./pipeline";
import { finished } from "./finished";

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert a stream to a promise that resolves when finished
 */
export async function streamToPromise(stream: PipelineStreamLike): Promise<void> {
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
    throw new UnsupportedStreamTypeError("streamToBuffer", typeof stream);
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
    throw new UnsupportedStreamTypeError("drainStream", typeof stream);
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
