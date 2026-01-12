/**
 * Stream Module (browser entry)
 *
 * Mirrors the public surface of `./index.ts`, but exports the browser
 * implementation from `./streams.browser`.
 *
 * This file is intentionally export-only (tree-shaking friendly).
 */

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
} from "@stream/types";

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
  normalizeWritable as Writeable,
  consumers,
  promises
} from "@stream/streams.browser";

export type { PipelineOptions, FinishedOptions } from "@stream/streams.browser";

export { EventEmitter } from "@stream/event-emitter";
export { ChunkedBuilder, TransactionalChunkedBuilder } from "@stream/chunked-builder";
export type { ChunkedBuilderOptions, BuilderSnapshot } from "@stream/chunked-builder";
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
} from "@stream/shared";

export {
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
