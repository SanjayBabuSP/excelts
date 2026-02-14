/**
 * Browser Stream - Utilities
 */

import type {
  IDuplex,
  ITransform,
  ReadableLike,
  WritableLike,
  DuplexStreamOptions
} from "@stream/types";
import { UnsupportedStreamTypeError } from "@stream/errors";
import { concatUint8Arrays, createTextDecoder, stringToUint8Array } from "@utils/binary";
import { isAsyncIterable, isReadableStream } from "@stream/internal/type-guards";
import { createConsumers } from "@stream/common/consumers";
import { createAddAbortSignal } from "@stream/common/add-abort-signal";
import { createIsTransform, createIsDuplex, createIsStream } from "@stream/common/type-guards";
import { toBinaryChunk } from "@stream/common/binary-chunk";

import { Readable } from "./readable";
import { Writable } from "./writable";
import { Transform } from "./transform";
import { Duplex } from "./duplex";
import { removeEmitterListener, addEmitterListener } from "./helpers";
import { pipeline, finished } from "./pipeline";

// =============================================================================
// Utility Functions
// =============================================================================

/** Convert a stream to a promise that resolves when finished */
export const streamToPromise = finished;

/** Copy from a readable stream to a writable stream */
export const copyStream = pipeline;

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
  const iterable = toReadableAsyncIterable(stream, "streamToString") as AsyncIterable<Uint8Array>;
  const decoder = createTextDecoder(encoding);
  let text = "";

  for await (const chunk of iterable as any) {
    const bytes = toTextBytes(chunk);
    if (!bytes) {
      throw new UnsupportedStreamTypeError("streamToString", typeof chunk);
    }
    text += decoder.decode(bytes, { stream: true });
  }

  text += decoder.decode();
  return text;
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

// =============================================================================
// Type Guards
// =============================================================================

/** Check if an object is a transform stream */
export const isTransform: (obj: unknown) => obj is ITransform<any, any> =
  createIsTransform(Transform);

/** Check if an object is a duplex stream */
export const isDuplex: (obj: unknown) => obj is IDuplex<any, any> = createIsDuplex(
  Duplex,
  Transform
);

/** Check if an object is any kind of stream */
export const isStream: (obj: unknown) => obj is ReadableLike | WritableLike = createIsStream(
  Readable,
  Writable
);

// =============================================================================
// Additional Utility Functions (Node.js Compatibility)
// =============================================================================

/** Add abort signal handling to any stream */
export const addAbortSignal = createAddAbortSignal({
  add(emitter, event, listener) {
    addEmitterListener(emitter, event, listener, { once: true });
  },
  remove: removeEmitterListener
});

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
    return Readable.isDisturbed((stream as any)._readable);
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
    return (stream as any)._readable instanceof Readable;
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
    return (stream as any)._writable instanceof Writable;
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

  stream1.write = function (
    chunk: T,
    encodingOrCallback?: string | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void
  ): boolean {
    const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
    const ok = stream2.push(chunk);
    cb?.(null);
    return ok;
  };

  stream2.write = function (
    chunk: T,
    encodingOrCallback?: string | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void
  ): boolean {
    const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
    const ok = stream1.push(chunk);
    cb?.(null);
    return ok;
  };

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
// Private Helpers
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

function toTextBytes(chunk: unknown): Uint8Array | null {
  if (typeof chunk === "string") {
    return stringToUint8Array(chunk);
  }
  if (Array.isArray(chunk)) {
    return new Uint8Array(chunk);
  }
  return toBinaryChunk(chunk);
}

// =============================================================================
// Stream Consumers (like stream.consumers in Node.js)
// =============================================================================

export const consumers = createConsumers({ streamToUint8Array, streamToString });

// =============================================================================
// Promises API (like stream/promises in Node.js)
// =============================================================================

export const promises = { pipeline, finished };
