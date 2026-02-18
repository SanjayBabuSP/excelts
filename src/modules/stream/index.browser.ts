/**
 * Stream Module (browser entry)
 *
 * Mirrors the public surface of `./index.ts`, but exports the browser
 * implementation from `./streams.browser`.
 *
 * This file is intentionally export-only (tree-shaking friendly).
 */

// Shared type + platform-independent exports
export * from "./index.base";

// Core stream classes (browser implementations)
import { Readable, _injectDuplexFrom as _injectReadableDuplexFrom } from "@stream/browser/readable";
export { Writable, toWritable } from "@stream/browser/writable";
export type { WritableOptions } from "@stream/browser/writable";
export { Transform } from "@stream/browser/transform";
import { Duplex } from "@stream/browser/duplex";
export { PassThrough } from "@stream/browser/passthrough";
export { Collector } from "@stream/browser/collector";
export { Readable, Duplex };

// Late-binding injection: break circular Readable ↔ Duplex and Transform ↔ Duplex
import { _injectDuplexFrom as _injectTransformDuplexFrom } from "@stream/browser/transform";
import { _injectIsDisturbed } from "@stream/browser/writable";

_injectReadableDuplexFrom(source => Duplex.from(source));
_injectTransformDuplexFrom(source => Duplex.from(source));
_injectIsDisturbed((stream: any) => {
  if (stream && stream._readable instanceof Readable) {
    return Readable.isDisturbed(stream._readable);
  }
  return Readable.isDisturbed(stream);
});

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
