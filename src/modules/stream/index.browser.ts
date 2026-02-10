/**
 * Stream Module (browser entry)
 *
 * Mirrors the public surface of `./index.ts`, but exports the browser
 * implementation from `./streams.browser`.
 *
 * This file is intentionally export-only (tree-shaking friendly).
 */

export type {
  StreamOptions,
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
  PipelineDestination
} from "@stream/types";

// Core stream classes (browser implementations)
export { Readable } from "@stream/browser/readable";
export { Writable, toWritable } from "@stream/browser/writable";
export type { WritableOptions } from "@stream/browser/writable";
export { Transform } from "@stream/browser/transform";
export { Duplex } from "@stream/browser/duplex";
export { PassThrough } from "@stream/browser/passthrough";
export { Collector } from "@stream/browser/collector";

// Factory functions + re-exported helpers
export {
  PullStream,
  BufferedStream,
  StringChunk,
  ByteChunk,
  createReadable,
  createReadableFromAsyncIterable,
  createReadableFromArray,
  createWritable,
  createTransform,
  createCollector,
  createPassThrough,
  createPullStream,
  createBufferedStream,
  createDuplex,
  createReadableFromGenerator,
  createReadableFromPromise,
  createEmptyReadable,
  createNullWritable
} from "@stream/browser/factories";

// Pipeline & Finished
export { pipeline, finished, finishedAll } from "@stream/browser/pipeline";

// Compose
export { compose } from "@stream/browser/compose";

// Utilities
export {
  streamToPromise,
  streamToUint8Array,
  streamToBuffer,
  streamToString,
  drainStream,
  copyStream,
  isTransform,
  isDuplex,
  isStream,
  addAbortSignal,
  isDisturbed,
  isReadable,
  isWritable,
  duplexPair,
  consumers,
  promises
} from "@stream/browser/utils";

// Common re-exports (shared between Node.js and browser)
export {
  isDestroyed,
  isErrored,
  getDefaultHighWaterMark,
  setDefaultHighWaterMark,
  promisify
} from "@stream/common/utils";
export type { PipelineOptions, FinishedOptions } from "@stream/common/options";

export { EventEmitter } from "@utils/event-emitter";
export { ChunkedBuilder, TransactionalChunkedBuilder } from "@stream/chunked-builder";
export type { ChunkedBuilderOptions, BuilderSnapshot } from "@stream/chunked-builder";
export {
  textEncoder,
  textDecoder,
  stringToUint8Array,
  uint8ArrayToString,
  uint8ArrayEquals,
  uint8ArrayIndexOf,
  toUint8Array,
  anyToString,
  concatUint8Arrays
} from "@utils/binary";

export {
  collect,
  text,
  json,
  bytes,
  fromString,
  fromJSON,
  fromBytes,
  transform,
  filter,
  isReadableStreamLike,
  readableStreamToAsyncIterable
} from "@stream/utils";

export { StreamStateError, StreamTypeError, UnsupportedStreamTypeError } from "@stream/errors";

// Internal utilities exposed for cross-module use (e.g. archive)
export {
  isReadableStream,
  isWritableStream,
  isAsyncIterable,
  isTransformStream
} from "@stream/internal/type-guards";
export { onceEvent } from "@stream/internal/event-utils";
export {
  eventedReadableToAsyncIterableNoDestroy,
  type EventedReadableLike
} from "@stream/internal/evented-readable-to-async-iterable";
export type { EventEmitterLike } from "@stream/types";
