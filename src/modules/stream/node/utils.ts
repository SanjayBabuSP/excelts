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
  ReadableLike,
  WritableLike
} from "@stream/types";
import { isAsyncIterable, isReadableStream } from "@stream/internal/type-guards";
import { createConsumers } from "@stream/common/consumers";
import { createAddAbortSignal } from "@stream/common/add-abort-signal";
import { createIsTransform, createIsDuplex, createIsStream } from "@stream/common/type-guards";
import { createTextDecoder } from "@utils/binary";
import { toBinaryChunk } from "@stream/common/binary-chunk";

import { Writable } from "./writable";
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
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  for await (const chunk of iterable as any) {
    const bytes =
      typeof chunk === "string" ? Buffer.from(chunk) : (toBinaryChunk(chunk) ?? Buffer.from(chunk));
    chunks.push(bytes);
    totalLength += bytes.byteLength;
  }

  if (chunks.length === 0) {
    return new Uint8Array(0);
  }
  if (chunks.length === 1) {
    const chunk = chunks[0]!;
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
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
  let iterable: AsyncIterable<Uint8Array>;
  if (isReadableStream(stream)) {
    iterable = (Readable as any).fromWeb(stream as any) as AsyncIterable<Uint8Array>;
  } else if (isAsyncIterable(stream)) {
    iterable = stream;
  } else {
    throw new UnsupportedStreamTypeError("streamToString", typeof stream);
  }

  const decoder = createTextDecoder(encoding);
  let text = "";

  for await (const chunk of iterable as any) {
    let bytes: Uint8Array;
    if (typeof chunk === "string") {
      bytes = Buffer.from(chunk);
    } else {
      const converted = toBinaryChunk(chunk);
      if (converted) {
        bytes = converted;
      } else {
        // Try Buffer.from as last resort (handles array-like objects, etc.)
        try {
          bytes = Buffer.from(chunk);
        } catch {
          throw new UnsupportedStreamTypeError("streamToString", typeof chunk);
        }
      }
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

// =============================================================================
// Additional Utility Functions
// =============================================================================

/** Add abort signal handling to any stream */
export const addAbortSignal = createAddAbortSignal({
  add(emitter, event, listener) {
    (emitter as any).once?.(event, listener);
  },
  remove(emitter, event, listener) {
    (emitter as any).off?.(event, listener);
  }
});

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
  if (obj instanceof Readable || obj instanceof Transform) {
    return true;
  }
  if (obj instanceof Duplex) {
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
  if (obj instanceof Writable || obj instanceof Transform) {
    return true;
  }
  if (obj instanceof Duplex) {
    return true;
  }
  const o = obj as Record<string, unknown>;
  return typeof o.write === "function" && typeof o.end === "function";
}

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
export function duplexPair<T = any>(options?: DuplexStreamOptions): [IDuplex<T, T>, IDuplex<T, T>] {
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

export const consumers = createConsumers({ streamToUint8Array, streamToString });

// =============================================================================
// Promises API (like stream/promises in Node.js)
// =============================================================================

export const promises = { pipeline, finished };
