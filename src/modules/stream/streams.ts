/**
 * Native Stream Implementation - Node.js
 *
 * Uses Node.js native stream module for maximum performance.
 * Provides Readable, Writable, Transform, Duplex, and PassThrough streams.
 */

// =============================================================================
// Barrel re-exports from node/ sub-modules
// =============================================================================

// Core stream classes (native Node.js)
import { Readable, Transform, Duplex, PassThrough } from "stream";
export { Readable, Transform, Duplex, PassThrough };

// Writable (extended with browser-compatible API)
export { Writable, toWritable } from "./node/writable";
export type { WritableOptions } from "./node/writable";

// Collector
export { Collector, createCollector } from "./node/collector";

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
} from "./node/factories";

// Pipeline
export { pipeline } from "./node/pipeline";

// Finished
export { finished, finishedAll } from "./node/finished";

// Compose
export { compose } from "./node/compose";

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
} from "./node/utils";

// Common re-exports (shared between Node.js and browser)
export { isDestroyed, isErrored } from "@stream/common/utils";
export { getDefaultHighWaterMark, setDefaultHighWaterMark } from "@stream/common/utils";
export { promisify } from "@stream/common/utils";
export { once } from "@stream/common/once";
export type { PipelineOptions } from "@stream/common/options";
export type { FinishedOptions } from "@stream/common/options";
