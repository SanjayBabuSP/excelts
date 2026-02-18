/**
 * Browser Stream - Compose
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
): Transform<T, R> {
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

  // A lightweight Transform wrapper that delegates:
  // - writable side to `first`
  // - readable side to `last`
  // It forwards relevant events lazily to avoid per-chunk overhead when unused.
  const composed = new Transform<T, R>({
    objectMode: (first as any)?.readableObjectMode ?? (first as any)?.writableObjectMode ?? true,
    transform: chunk => chunk
  });

  const registry = createListenerRegistry();

  // Always forward errors; they are critical for pipeline semantics.
  for (const t of transforms) {
    registry.add(t as any, "error", (err: Error) => composed.emit("error", err));
  }

  // Forward writable-side backpressure from `first`.
  registry.add(first as any, "drain", () => composed.emit("drain"));
  // Forward finish from `last` — the composed stream is only "finished" once
  // data has fully flushed through the entire chain (matching Node.js compose).
  registry.once(last as any, "finish", () => composed.emit("finish"));

  // Forward readable-side events from `last` lazily.
  let forwardData = false;
  let forwardEnd = false;

  const ensureDataForwarding = (): void => {
    if (forwardData) {
      return;
    }
    forwardData = true;
    registry.add(last as any, "data", (chunk: R) => {
      (composed as any).push(chunk);
    });
  };

  const ensureEndForwarding = (): void => {
    if (forwardEnd) {
      return;
    }
    forwardEnd = true;
    registry.once(last as any, "end", () => {
      (composed as any).push(null);
    });
  };

  const originalOn = composed.on.bind(composed);
  const originalOnce = composed.once.bind(composed);

  (composed as any).on = (event: string | symbol, listener: (...args: any[]) => void): any => {
    if (event === "data") {
      ensureDataForwarding();
      ensureEndForwarding();
    } else if (event === "end") {
      ensureDataForwarding();
      ensureEndForwarding();
    }
    return originalOn(event, listener);
  };

  // Node.js: addListener === on (same function). Must also trigger lazy data forwarding.
  (composed as any).addListener = (composed as any).on;

  (composed as any).once = (event: string | symbol, listener: (...args: any[]) => void): any => {
    if (event === "data") {
      ensureDataForwarding();
      ensureEndForwarding();
    } else if (event === "end") {
      ensureDataForwarding();
      ensureEndForwarding();
    }
    return originalOnce(event, listener);
  };

  // Delegate core stream methods
  const firstAny = first as any;
  const lastAny = last as any;

  (composed as any).write = (
    chunk: T,
    encodingOrCallback?: string | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void
  ): boolean => {
    if (typeof encodingOrCallback === "function") {
      return firstAny.write(chunk, encodingOrCallback);
    }
    return firstAny.write(chunk, encodingOrCallback, callback);
  };

  (composed as any).end = (
    chunkOrCallback?: T | (() => void),
    encodingOrCallback?: string | (() => void),
    callback?: () => void
  ): any => {
    if (typeof chunkOrCallback === "function") {
      firstAny.end(chunkOrCallback);
      return composed;
    }
    if (typeof encodingOrCallback === "function") {
      firstAny.end(chunkOrCallback, encodingOrCallback);
      return composed;
    }
    firstAny.end(chunkOrCallback, encodingOrCallback, callback);
    return composed;
  };

  (composed as any).pipe = <W extends Writable<R> | Transform<R, any> | Duplex<any, R>>(
    destination: W
  ): W => {
    ensureDataForwarding();
    ensureEndForwarding();
    return Transform.prototype.pipe.call(composed, destination) as W;
  };

  (composed as any).read = (size?: number): R | null => {
    ensureDataForwarding();
    ensureEndForwarding();
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
    ensureDataForwarding();
    ensureEndForwarding();
    yield* Transform.prototype[Symbol.asyncIterator].call(composed);
  };

  const originalDestroy = composed.destroy.bind(composed);
  composed.destroy = ((error?: Error) => {
    registry.cleanup();
    for (const t of transforms) {
      t.destroy(error);
    }
    originalDestroy(error);
  }) as any;

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
