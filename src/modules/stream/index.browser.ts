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
  ByteChunk,
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
  toWritable,
  consumers,
  promises
} from "@stream/streams.browser";

export type { PipelineOptions, FinishedOptions, WritableOptions } from "@stream/streams.browser";

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
  toUint8Array,
  anyToString,
  concatUint8Arrays
} from "@stream/binary";

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

export { StreamStateError, StreamTypeError, UnsupportedStreamTypeError } from "@stream/errors";
