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
import { concatUint8Arrays, createTextDecoder } from "@utils/binary";
import { isAsyncIterable, isReadableStream } from "@stream/internal/type-guards";
import { createConsumers } from "@stream/common/consumers";
import { createAddAbortSignal } from "@stream/common/add-abort-signal";
import { createIsTransform, createIsDuplex, createIsStream } from "@stream/common/type-guards";
import { toStreamBytes } from "@stream/common/binary-chunk";

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
    const bytes = toStreamBytes(chunk);
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
 * Check if a readable stream has been disturbed (read from).
 * For Web ReadableStreams, returns `locked` (matches Node.js behaviour).
 */
export function isDisturbed(stream: unknown): boolean {
  if (stream instanceof Readable) {
    return Readable.isDisturbed(stream);
  }
  if (stream instanceof Duplex) {
    return Readable.isDisturbed((stream as any)._readable);
  }

  // Web ReadableStream: `locked` is the closest indicator of disturbance
  // (a reader has been acquired). Matches the Node.js isDisturbed check.
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
 * Check if a stream is readable.
 * Node.js checks that the stream is not destroyed and not ended.
 */
export function isReadable(stream: unknown): stream is ReadableLike {
  if (stream == null) {
    return false;
  }
  const s = stream as any;
  // Node.js: a destroyed or ended stream is not readable
  if (s.destroyed || s.readableEnded || s._destroyed || s._endEmitted) {
    return false;
  }
  if (stream instanceof Readable || stream instanceof Transform) {
    return true;
  }
  if (stream instanceof Duplex) {
    return true;
  }
  const o = stream as Record<string, unknown>;
  return typeof o.read === "function" && typeof o.pipe === "function";
}

/**
 * Check if a stream is writable.
 * Node.js checks that the stream is not destroyed and not finished.
 */
export function isWritable(stream: unknown): stream is WritableLike {
  if (stream == null) {
    return false;
  }
  const s = stream as any;
  // Node.js: a destroyed or finished stream is not writable
  if (s.destroyed || s.writableFinished || s._destroyed || s._finished) {
    return false;
  }
  if (stream instanceof Writable || stream instanceof Transform) {
    return true;
  }
  if (stream instanceof Duplex) {
    return true;
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
export function duplexPair<T = any>(options?: DuplexStreamOptions): [IDuplex<T, T>, IDuplex<T, T>] {
  const objectMode =
    options?.readableObjectMode ?? options?.writableObjectMode ?? options?.objectMode ?? false;
  const highWaterMark =
    options?.readableHighWaterMark ?? options?.writableHighWaterMark ?? options?.highWaterMark;

  const duplexOpts: DuplexStreamOptions = {
    readableHighWaterMark: options?.readableHighWaterMark ?? highWaterMark,
    writableHighWaterMark: options?.writableHighWaterMark ?? highWaterMark,
    readableObjectMode: options?.readableObjectMode ?? objectMode,
    writableObjectMode: options?.writableObjectMode ?? objectMode,
    allowHalfOpen: options?.allowHalfOpen
  };

  // Holder object allows both streams to reference each other via closure
  // while satisfying the `const` constraint (each variable is assigned once).
  const pair: { s1?: Duplex<T, T>; s2?: Duplex<T, T> } = {};

  const stream1 = new Duplex<T, T>({
    ...duplexOpts,
    read() {
      // Data will be pushed from stream2's write()
    },
    write(chunk: T, _encoding: string, callback: (error?: Error | null) => void) {
      // Push to peer; if peer signals backpressure, defer callback until drain.
      if (!pair.s2!.push(chunk)) {
        pair.s2!.once("drain", () => callback());
      } else {
        callback();
      }
    },
    final(callback: (error?: Error | null) => void) {
      pair.s2!.push(null);
      callback();
    }
  });

  const stream2 = new Duplex<T, T>({
    ...duplexOpts,
    read() {
      // Data will be pushed from stream1's write()
    },
    write(chunk: T, _encoding: string, callback: (error?: Error | null) => void) {
      // Push to peer; if peer signals backpressure, defer callback until drain.
      if (!stream1.push(chunk)) {
        stream1.once("drain", () => callback());
      } else {
        callback();
      }
    },
    final(callback: (error?: Error | null) => void) {
      stream1.push(null);
      callback();
    }
  });

  pair.s1 = stream1;
  pair.s2 = stream2;

  // Node.js: destroying one side of a duplexPair destroys the other.
  stream1.on("close", () => {
    if (!stream2.destroyed) {
      stream2.destroy(stream1.errored ?? undefined);
    }
  });
  stream2.on("close", () => {
    if (!stream1.destroyed) {
      stream1.destroy(stream2.errored ?? undefined);
    }
  });

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

  for await (const chunk of iterable as any) {
    const bytes = toStreamBytes(chunk);
    if (!bytes) {
      throw new UnsupportedStreamTypeError("streamToBuffer", typeof chunk);
    }
    chunks.push(bytes);
    totalLength += bytes.length;
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

// =============================================================================
// Stream Consumers (like stream.consumers in Node.js)
// =============================================================================

export const consumers = createConsumers({ streamToUint8Array, streamToString });

// =============================================================================
// Promises API (like stream/promises in Node.js)
// =============================================================================

export const promises = { pipeline, finished };
