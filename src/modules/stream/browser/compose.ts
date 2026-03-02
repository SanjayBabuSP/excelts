/**
 * Browser Stream - Compose
 *
 * Compose multiple transform streams into one.
 * Aligned with Node.js compose semantics:
 * - Backpressure: pauses `last` when composed buffer is full
 * - Flush: waits for `last` to emit "end" before signalling completion
 * - Error: destroys composed stream on any child error (not just emit)
 */

import type { ITransform } from "@stream/types";
import { getDefaultHighWaterMark } from "@stream/common/utils";

import type { Writable } from "./writable";
import { Transform } from "./transform";
import type { Duplex } from "./duplex";
import { createListenerRegistry } from "./helpers";

// =============================================================================
// Compose
// =============================================================================

/**
 * Compose multiple transform streams into one
 * Data flows through each transform in sequence
 */
export function compose<T = any, R = any>(
  ...transforms: Array<ITransform<any, any>>
): ITransform<T, R> {
  const len = transforms.length;

  if (len === 0) {
    return new Transform<T, R>({
      objectMode: true,
      transform: chunk => chunk as any as R
    });
  }

  // Preserve identity: compose(single) returns the same transform.
  if (len === 1) {
    return transforms[0] as any as Transform<T, R>;
  }

  // Chain the transforms: first → second → ... → last
  const first = transforms[0]!;
  const last = transforms[len - 1]!;

  // Pipe all transforms together
  for (let i = 0; i < len - 1; i++) {
    transforms[i].pipe(transforms[i + 1]);
  }

  // Track whether last is paused due to backpressure from composed.
  let lastPaused = false;

  // Track whether flush is handling the end sequence.
  let flushing = false;

  // A lightweight Transform wrapper that delegates:
  // - writable side to `first`
  // - readable side to `last`
  //
  // Use per-side objectMode matching Node.js compose behavior.
  // When the property is missing, default to false (same as Node.js Transform).
  const readableObjMode = (last as any).readableObjectMode ?? false;
  const writableObjMode = (first as any).writableObjectMode ?? false;

  const composed = new Transform<T, R>({
    // Use objectMode when both sides agree; otherwise use per-side modes.
    ...(readableObjMode === writableObjMode
      ? { objectMode: readableObjMode }
      : { readableObjectMode: readableObjMode, writableObjectMode: writableObjMode }),
    transform: chunk => chunk
  });

  // Hook into the internal _readable's _read method so that when the
  // PipeManager (or any consumer) pulls data, we resume `last` if it was
  // paused due to backpressure. This is the browser equivalent of Node.js
  // compose's `read()` option which is called by the native pipe mechanism.
  const composedReadable = (composed as any)._readable;
  composedReadable._read = () => {
    if (lastPaused) {
      lastPaused = false;
      (last as any).resume?.();
    }
  };

  const registry = createListenerRegistry();

  // Forward errors from all transforms — destroy composed on error (matches Node.js).
  for (const t of transforms) {
    registry.add(t as any, "error", (err: Error) => composed.destroy(err));
  }

  // Forward writable-side backpressure from `first`.
  registry.add(first as any, "drain", () => composed.emit("drain"));
  // Forward finish from `last` — the composed stream is only "finished" once
  // data has fully flushed through the entire chain (matching Node.js compose).
  registry.once(last as any, "finish", () => composed.emit("finish"));

  // Eagerly attach data/end forwarding from `last` to composed (matching Node.js).
  // Node.js compose immediately attaches last.on("data") so data flows into
  // composed's buffer right away, ensuring no data is missed.
  registry.add(last as any, "data", (chunk: R) => {
    if (!(composed as any).push(chunk)) {
      lastPaused = true;
      (last as any).pause?.();
    }
  });

  registry.once(last as any, "end", () => {
    // When flushing, the flush/end logic in end() handles stream termination.
    // Otherwise (e.g. last ended independently), we must push(null) ourselves.
    if (!flushing) {
      (composed as any).push(null);
    }
  });

  // Delegate core stream methods
  const firstAny = first as any;
  const lastAny = last as any;

  (composed as any).write = (
    chunk: T,
    encodingOrCallback?: string | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void
  ): boolean => {
    try {
      if (typeof encodingOrCallback === "function") {
        return firstAny.write(chunk, encodingOrCallback);
      }
      return firstAny.write(chunk, encodingOrCallback, callback);
    } catch (err) {
      composed.destroy(err as Error);
      return false;
    }
  };

  // end() with flush semantics: end the head of the chain, then wait for `last`
  // to emit "end" (readable exhaustion) before completing the composed stream.
  // This ensures all data flows through intermediate transforms before completion.
  (composed as any).end = (
    chunkOrCallback?: T | (() => void),
    encodingOrCallback?: string | (() => void),
    callback?: () => void
  ): any => {
    // Guard against double-end: if already flushing, delegate to first's end()
    // which will handle ERR_STREAM_ALREADY_FINISHED natively, matching Node.js.
    if (flushing) {
      if (typeof chunkOrCallback === "function") {
        firstAny.end(chunkOrCallback);
      } else if (typeof encodingOrCallback === "function") {
        firstAny.end(chunkOrCallback, encodingOrCallback);
      } else {
        firstAny.end(chunkOrCallback, encodingOrCallback, callback);
      }
      return composed;
    }

    flushing = true;

    const onFlushEnd = (): void => {
      cleanupFlush();
      (composed as any).push(null);
      if (typeof chunkOrCallback === "function") {
        (chunkOrCallback as () => void)();
      } else if (typeof encodingOrCallback === "function") {
        (encodingOrCallback as () => void)();
      } else if (callback) {
        callback();
      }
    };
    const onFlushError = (err: Error): void => {
      cleanupFlush();
      // Invoke the user's end callback before destroying — matching Node.js
      // where flush(callback) calls callback(err) which propagates both the
      // error AND fires the user's end callback.
      if (typeof chunkOrCallback === "function") {
        (chunkOrCallback as () => void)();
      } else if (typeof encodingOrCallback === "function") {
        (encodingOrCallback as () => void)();
      } else if (callback) {
        callback();
      }
      composed.destroy(err);
    };
    const cleanupFlush = (): void => {
      lastAny.off?.("end", onFlushEnd);
      lastAny.off?.("error", onFlushError);
    };

    lastAny.once?.("end", onFlushEnd);
    lastAny.once?.("error", onFlushError);

    // Write the end-chunk (if any) and end the head.
    if (typeof chunkOrCallback === "function") {
      firstAny.end();
    } else if (typeof encodingOrCallback === "function") {
      firstAny.end(chunkOrCallback);
    } else {
      firstAny.end(chunkOrCallback, encodingOrCallback);
    }
    return composed;
  };

  (composed as any).pipe = <W extends Writable<R> | Transform<R, any> | Duplex<any, R>>(
    destination: W
  ): W => {
    return Transform.prototype.pipe.call(composed, destination) as W;
  };

  (composed as any).read = (size?: number): R | null => {
    // Resume last if it was paused due to backpressure.
    if (lastPaused) {
      lastPaused = false;
      lastAny.resume?.();
    }
    return Transform.prototype.read.call(composed, size) as R | null;
  };

  const originalPause = composed.pause.bind(composed);
  const originalResume = composed.resume.bind(composed);

  (composed as any).pause = (): any => {
    lastAny.pause?.();
    return originalPause();
  };

  (composed as any).resume = (): any => {
    const resumed = originalResume();
    lastAny.resume?.();
    return resumed;
  };

  // Delegate cork/uncork to the head of the chain.
  (composed as any).cork = (): void => {
    firstAny.cork?.();
  };
  (composed as any).uncork = (): void => {
    firstAny.uncork?.();
  };

  (composed as any)[Symbol.asyncIterator] = async function* (): AsyncIterableIterator<R> {
    yield* Transform.prototype[Symbol.asyncIterator].call(composed);
  };

  const originalDestroy = composed.destroy.bind(composed);
  composed.destroy = ((error?: Error) => {
    try {
      registry.cleanup();
      for (const t of transforms) {
        t.destroy(error);
      }
    } finally {
      originalDestroy(error);
    }
  }) as any;

  composed.once("close", () => {
    registry.cleanup();
  });

  // Reflect underlying readability/writability like the previous duck-typed wrapper
  Object.defineProperty(composed, "readable", {
    get: () => last.readable
  });
  Object.defineProperty(composed, "writable", {
    get: () => first.writable
  });

  // Proxy writable-side state to `first` so properties like writableEnded and
  // writableFinished reflect the actual head-of-chain state, not the inner
  // Transform wrapper which is never written to directly.
  Object.defineProperty(composed, "writableEnded", {
    get: () => (first as any).writableEnded ?? false
  });
  Object.defineProperty(composed, "writableFinished", {
    get: () => (first as any).writableFinished ?? false
  });
  Object.defineProperty(composed, "writableLength", {
    get: () => (first as any).writableLength ?? 0
  });
  Object.defineProperty(composed, "writableHighWaterMark", {
    get: () => (first as any).writableHighWaterMark ?? getDefaultHighWaterMark(false)
  });
  Object.defineProperty(composed, "writableCorked", {
    get: () => (first as any).writableCorked ?? 0
  });
  Object.defineProperty(composed, "writableNeedDrain", {
    get: () => (first as any).writableNeedDrain ?? false
  });

  // Proxy readable-side state to `last`.
  Object.defineProperty(composed, "readableEnded", {
    get: () => (last as any).readableEnded ?? false
  });
  Object.defineProperty(composed, "readableLength", {
    get: () => (last as any).readableLength ?? 0
  });
  Object.defineProperty(composed, "readableHighWaterMark", {
    get: () => (last as any).readableHighWaterMark ?? getDefaultHighWaterMark(false)
  });
  Object.defineProperty(composed, "readableFlowing", {
    get: () => (last as any).readableFlowing ?? null
  });

  return composed;
}
