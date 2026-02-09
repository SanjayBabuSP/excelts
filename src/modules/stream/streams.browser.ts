/**
 * Native Stream Implementation - Browser
 *
 * Uses Web Streams API (ReadableStream, WritableStream, TransformStream)
 * for true native streaming in browsers.
 *
 * Supported browsers:
 * - Chrome >= 89
 * - Firefox >= 102
 * - Safari >= 14.1
 * - Edge >= 89
 */

// =============================================================================
// Barrel re-exports from browser/ sub-modules
// =============================================================================

// Core stream classes
export { Readable } from "./browser/readable";
export { Writable, toWritable } from "./browser/writable";
export type { WritableOptions } from "./browser/writable";
export { Transform } from "./browser/transform";
export { Duplex } from "./browser/duplex";
export { PassThrough } from "./browser/passthrough";
export { Collector } from "./browser/collector";

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
} from "./browser/factories";

// Pipeline
export { pipeline } from "./browser/pipeline";

// Finished
export { finished, finishedAll } from "./browser/finished";

// Compose
export { compose } from "./browser/compose";

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
} from "./browser/utils";

// Common re-exports (shared between Node.js and browser)
export { isDestroyed, isErrored } from "@stream/common/utils";
export { getDefaultHighWaterMark, setDefaultHighWaterMark } from "@stream/common/utils";
export { promisify } from "@stream/common/utils";
export { once } from "@stream/common/once";
export type { PipelineOptions } from "@stream/common/options";
export type { FinishedOptions } from "@stream/common/options";
