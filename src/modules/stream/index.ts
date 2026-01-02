/**
 * Stream Module
 *
 * Native stream implementations for Node.js and Browser.
 *
 * - Node.js: Uses native `stream` module (Readable, Writable, Transform, Duplex, PassThrough)
 * - Browser: Uses Web Streams API (ReadableStream, WritableStream, TransformStream)
 *
 * Both implementations provide the same API for cross-platform compatibility.
 *
 * @example
 * ```typescript
 * import {
 *   Readable,
 *   Writable,
 *   Transform,
 *   Duplex,
 *   PassThrough,
 *   pipeline,
 *   createTransform,
 *   streamToUint8Array
 * } from './modules/stream';
 *
 * // Create a transform stream
 * const uppercase = createTransform<Uint8Array, Uint8Array>(chunk => {
 *   const text = new TextDecoder().decode(chunk);
 *   return new TextEncoder().encode(text.toUpperCase());
 * });
 *
 * // Use pipeline for clean stream composition
 * await pipeline(readable, uppercase, writable);
 * ```
 */

// =============================================================================
// Types (shared between Node.js and Browser)
// =============================================================================

import type {
  ReadableStreamOptions,
  WritableStreamOptions,
  TransformStreamOptions,
  DuplexStreamOptions,
  PullStreamOptions,
  BufferedStreamOptions,
  TransformCallback,
  FlushCallback,
  WriteCallback,
  DestroyCallback,
  IEventEmitter,
  IReadable,
  IWritable,
  ITransform,
  IDuplex,
  IPullStream,
  IBufferedStream,
  IPassThrough,
  ICollector,
  DataChunk,
  EventListener,
  PipelineSource,
  PipelineTransform,
  PipelineDestination,
  ReadWriteBufferOptions
} from "@stream/types";

export type {
  ReadableStreamOptions,
  WritableStreamOptions,
  TransformStreamOptions,
  DuplexStreamOptions,
  PullStreamOptions,
  BufferedStreamOptions,
  TransformCallback,
  FlushCallback,
  WriteCallback,
  DestroyCallback,
  IEventEmitter,
  IReadable,
  IWritable,
  ITransform,
  IDuplex,
  IPullStream,
  IBufferedStream,
  IPassThrough,
  ICollector,
  DataChunk,
  EventListener,
  PipelineSource,
  PipelineTransform,
  PipelineDestination,
  ReadWriteBufferOptions
};

// =============================================================================
// Native Stream Classes and Functions (platform-specific)
// =============================================================================

import {
  Readable,
  Writable,
  Transform,
  Duplex,
  PassThrough,
  Collector,
  PullStream,
  BufferedStream,
  StringChunk,
  BufferChunk,
  createReadable,
  createWritable,
  createTransform,
  createCollector,
  createPassThrough,
  createPullStream,
  createBufferedStream,
  createReadableFromArray,
  createReadableFromAsyncIterable,
  createReadableFromGenerator,
  createReadableFromPromise,
  createDuplex,
  createEmptyReadable,
  createNullWritable,
  pipeline,
  finished,
  streamToPromise,
  streamToUint8Array,
  streamToBuffer,
  streamToString,
  drainStream,
  copyStream,
  addAbortSignal,
  compose,
  finishedAll,
  once,
  promisify,
  isReadable,
  isWritable,
  isTransform,
  isDuplex,
  isStream,
  isDestroyed,
  isDisturbed,
  isErrored,
  getDefaultHighWaterMark,
  setDefaultHighWaterMark,
  duplexPair,
  normalizeWritable as Writeable,
  consumers,
  promises
} from "@stream/streams";
import type { PipelineOptions, FinishedOptions } from "@stream/streams";

export {
  Readable,
  Writable,
  Transform,
  Duplex,
  PassThrough,
  Collector,
  PullStream,
  BufferedStream,
  StringChunk,
  BufferChunk,
  createReadable,
  createWritable,
  createTransform,
  createCollector,
  createPassThrough,
  createPullStream,
  createBufferedStream,
  createReadableFromArray,
  createReadableFromAsyncIterable,
  createReadableFromGenerator,
  createReadableFromPromise,
  createDuplex,
  createEmptyReadable,
  createNullWritable,
  pipeline,
  finished,
  streamToPromise,
  streamToUint8Array,
  streamToBuffer,
  streamToString,
  drainStream,
  copyStream,
  addAbortSignal,
  compose,
  finishedAll,
  once,
  promisify,
  isReadable,
  isWritable,
  isTransform,
  isDuplex,
  isStream,
  isDestroyed,
  isDisturbed,
  isErrored,
  getDefaultHighWaterMark,
  setDefaultHighWaterMark,
  duplexPair,
  Writeable,
  consumers,
  promises
};

export type { PipelineOptions, FinishedOptions };

import { EventEmitter } from "@stream/event-emitter";
export { EventEmitter };

// =============================================================================
// ChunkedBuilder (platform-independent)
// =============================================================================

import { ChunkedBuilder, TransactionalChunkedBuilder } from "@stream/chunked-builder";
import type { ChunkedBuilderOptions, BuilderSnapshot } from "@stream/chunked-builder";

export { ChunkedBuilder, TransactionalChunkedBuilder };
export type { ChunkedBuilderOptions, BuilderSnapshot };

// =============================================================================
// Utility Functions (platform-independent)
// =============================================================================

import {
  textEncoder,
  textDecoder,
  stringToUint8Array,
  uint8ArrayToString,
  uint8ArrayEquals,
  uint8ArrayIndexOf,
  uint8ArraySlice,
  toUint8Array,
  bufferToString,
  concatUint8Arrays
} from "@stream/shared";

export {
  textEncoder,
  textDecoder,
  stringToUint8Array,
  uint8ArrayToString,
  uint8ArrayEquals,
  uint8ArrayIndexOf,
  uint8ArraySlice,
  toUint8Array,
  bufferToString,
  concatUint8Arrays
};

import {
  collect,
  text,
  json,
  bytes,
  fromString,
  fromJSON,
  fromBytes,
  transform,
  filter
} from "@stream/utils";

export { collect, text, json, bytes, fromString, fromJSON, fromBytes, transform, filter };
