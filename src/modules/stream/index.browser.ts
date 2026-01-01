/**
 * Stream Module (browser type surface)
 *
 * Mirrors [src/modules/stream/index.ts] but explicitly re-exports from
 * ./streams.browser so we can enforce index export-surface parity.
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
} from "./types";

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
// Native Stream Classes and Functions (browser)
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
} from "./streams.browser";

import type { PipelineOptions, FinishedOptions } from "./streams.browser";

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

import { EventEmitter } from "./event-emitter";
export { EventEmitter };

// =============================================================================
// ChunkedBuilder (platform-independent)
// =============================================================================

import { ChunkedBuilder, TransactionalChunkedBuilder } from "./chunked-builder";
import type { ChunkedBuilderOptions, BuilderSnapshot } from "./chunked-builder";

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
} from "./shared";

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
} from "./utils";

export { collect, text, json, bytes, fromString, fromJSON, fromBytes, transform, filter };
