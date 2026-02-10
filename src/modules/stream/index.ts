/**
 * Stream Module (Node.js entry)
 *
 * Public entrypoint for stream utilities and classes.
 *
 * Notes:
 * - This file is intentionally export-only (tree-shaking friendly).
 * - Browser builds should import from `@stream/index.browser`.
 *
 * @example
 * ```ts
 * import { pipeline, createTransform, createCollector } from "@stream";
 *
 * const upper = createTransform<Uint8Array, Uint8Array>(chunk => chunk);
 * const out = createCollector<Uint8Array>();
 * await pipeline(source, upper, out);
 * ```
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

// Core stream classes (native Node.js)
import { Readable, Transform, Duplex, PassThrough } from "stream";
export { Readable, Transform, Duplex, PassThrough };

// Writable (extended with browser-compatible API)
export { Writable, toWritable } from "@stream/node/writable";
export type { WritableOptions } from "@stream/node/writable";

// Collector
export { Collector, createCollector } from "@stream/node/collector";

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
  createPassThrough,
  createPullStream,
  createBufferedStream,
  createDuplex,
  createReadableFromGenerator,
  createReadableFromPromise,
  createEmptyReadable,
  createNullWritable
} from "@stream/node/factories";

// Pipeline & Finished
export { pipeline, finished, finishedAll } from "@stream/node/pipeline";

// Compose
export { compose } from "@stream/node/compose";

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
} from "@stream/node/utils";

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
