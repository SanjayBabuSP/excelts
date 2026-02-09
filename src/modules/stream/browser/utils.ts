/**
 * Browser Stream - Utilities
 */

import type {
  IDuplex,
  ITransform,
  PipelineStreamLike,
  ReadableLike,
  WritableLike,
  DuplexStreamOptions
} from "@stream/types";
import { UnsupportedStreamTypeError } from "@stream/errors";
import { concatUint8Arrays, getTextDecoder, textDecoder } from "@stream/binary";
import { isAsyncIterable, isReadableStream } from "@stream/internal/type-guards";

import { Readable } from "./readable";
import { Writable } from "./writable";
import { Transform } from "./transform";
import { Duplex } from "./duplex";
import { removeEmitterListener, addEmitterListener } from "./helpers";
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
 * (Browser equivalent of Node.js streamToBuffer)
 */
export async function streamToUint8Array(
  stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>
): Promise<Uint8Array> {
  const [chunks, totalLength] = await collectStreamChunks(stream);
  return concatUint8Arrays(chunks, totalLength);
}

/**
 * Alias for streamToUint8Array (Node.js compatibility)
 */
export async function streamToBuffer(
  stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>
): Promise<Uint8Array> {
  return streamToUint8Array(stream);
}

/**
 * Collect all data from a readable stream into a string
 */
export async function streamToString(
  stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>,
  encoding?: string
): Promise<string> {
  const [chunks, totalLength] = await collectStreamChunks(stream);
  const combined = concatUint8Arrays(chunks, totalLength);
  const decoder = encoding ? getTextDecoder(encoding) : textDecoder;
  return decoder.decode(combined);
}

/**
 * Drain a stream (consume all data without processing)
 */
export async function drainStream(
  stream: AsyncIterable<unknown> | ReadableStream<unknown>
): Promise<void> {
  const iterable = toReadableAsyncIterable(stream, "drainStream");

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
  return pipeline(source, destination);
}

// =============================================================================
// Type Guards
// =============================================================================

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
    typeof o.end === "function" &&
    typeof o._transform === "function"
  );
}

/**
 * Check if an object is a duplex stream
 * Note: In Node.js, Transform extends Duplex, so Transform is also a Duplex
 */
export function isDuplex(obj: unknown): obj is IDuplex<any, any> {
  if (obj == null) {
    return false;
  }
  if (obj instanceof Duplex || obj instanceof Transform) {
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
// Additional Utility Functions (Node.js Compatibility)
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
    removeEmitterListener(stream, "close", onDone);
    removeEmitterListener(stream, "end", onDone);
    removeEmitterListener(stream, "finish", onDone);
    removeEmitterListener(stream, "error", onError);
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
  addEmitterListener(stream, "close", onDone, { once: true });
  addEmitterListener(stream, "end", onDone, { once: true });
  addEmitterListener(stream, "finish", onDone, { once: true });
  addEmitterListener(stream, "error", onError, { once: true });

  return stream;
}

// =============================================================================
// Stream State Inspection Functions
// =============================================================================

/**
 * Check if a readable stream has been disturbed (read from)
 */
export function isDisturbed(stream: unknown): boolean {
  if (stream instanceof Readable) {
    return Readable.isDisturbed(stream);
  }
  if (stream instanceof Duplex) {
    return Readable.isDisturbed(stream._readable);
  }

  const s = stream as any;
  return (
    s?.readableDidRead === true ||
    s?._didRead === true ||
    s?._ended === true ||
    s?._destroyed === true
  );
}

/**
 * Check if a stream is readable
 */
export function isReadable(stream: unknown): stream is ReadableLike {
  if (stream == null) {
    return false;
  }
  if (stream instanceof Readable || stream instanceof Transform) {
    return true;
  }
  if (stream instanceof Duplex) {
    return stream._readable instanceof Readable;
  }
  const o = stream as Record<string, unknown>;
  return typeof o.read === "function" && typeof o.pipe === "function";
}

/**
 * Check if a stream is writable
 */
export function isWritable(stream: unknown): stream is WritableLike {
  if (stream == null) {
    return false;
  }
  if (stream instanceof Writable || stream instanceof Transform) {
    return true;
  }
  if (stream instanceof Duplex) {
    return stream._writable instanceof Writable;
  }
  const o = stream as Record<string, unknown>;
  return typeof o.write === "function" && typeof o.end === "function";
}

// =============================================================================
// Duplex Pair
// =============================================================================

/**
 * Create a pair of connected Duplex streams
 * Data written to one stream can be read from the other
 */
export function duplexPair<T = Uint8Array>(
  options?: DuplexStreamOptions
): [Duplex<T, T>, Duplex<T, T>] {
  const stream1 = new Duplex<T, T>(options);
  const stream2 = new Duplex<T, T>(options);

  // Override write to push to the other stream's readable
  stream1.write = function (chunk: T): boolean {
    // Push to stream2's readable side
    stream2.push(chunk);
    return true;
  };

  stream2.write = function (chunk: T): boolean {
    // Push to stream1's readable side
    stream1.push(chunk);
    return true;
  };

  // Override end to signal EOF to the other stream
  const originalEnd1 = stream1.end.bind(stream1);
  const originalEnd2 = stream2.end.bind(stream2);

  stream1.end = function (chunk?: T | (() => void)): any {
    if (chunk !== undefined && typeof chunk !== "function") {
      stream2.push(chunk);
    }
    stream2.push(null);
    return originalEnd1(typeof chunk === "function" ? chunk : undefined);
  };

  stream2.end = function (chunk?: T | (() => void)): any {
    if (chunk !== undefined && typeof chunk !== "function") {
      stream1.push(chunk);
    }
    stream1.push(null);
    return originalEnd2(typeof chunk === "function" ? chunk : undefined);
  };

  return [stream1, stream2];
}

// =============================================================================
// Stream Consumers (like stream.consumers in Node.js)
// =============================================================================

// Helper function to collect stream chunks with total length tracking
async function collectStreamChunks(
  stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>
): Promise<[chunks: Uint8Array[], totalLength: number]> {
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  const iterable = toReadableAsyncIterable(
    stream,
    "collectStreamChunks"
  ) as AsyncIterable<Uint8Array>;

  for await (const chunk of iterable) {
    chunks.push(chunk);
    totalLength += chunk.length;
  }
  return [chunks, totalLength];
}

function toReadableAsyncIterable<T>(
  stream: AsyncIterable<T> | ReadableStream<T>,
  name: string
): AsyncIterable<T> {
  if (isReadableStream(stream)) {
    return Readable.fromWeb(stream as any) as unknown as AsyncIterable<T>;
  }
  if (isAsyncIterable(stream)) {
    return stream;
  }
  throw new UnsupportedStreamTypeError(name, typeof stream);
}

export const consumers = {
  /**
   * Consume entire stream as ArrayBuffer
   */
  async arrayBuffer(
    stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>
  ): Promise<ArrayBuffer> {
    const bytes = await streamToUint8Array(stream);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  },

  /**
   * Consume entire stream as Blob
   */
  async blob(
    stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>,
    options?: BlobPropertyBag
  ): Promise<Blob> {
    const [chunks] = await collectStreamChunks(stream);
    return new Blob(chunks as any, options);
  },

  /**
   * Consume entire stream as Buffer (Uint8Array in browser)
   */
  async buffer(
    stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>
  ): Promise<Uint8Array> {
    return streamToUint8Array(stream);
  },

  /**
   * Consume entire stream as JSON
   */
  async json(stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>): Promise<any> {
    return JSON.parse(await streamToString(stream));
  },

  /**
   * Consume entire stream as text
   */
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
