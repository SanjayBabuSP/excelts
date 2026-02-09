/**
 * Browser Stream - Compose
 */

import type { ITransform } from "@stream/types";

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
    objectMode: (first as any)?.objectMode ?? true,
    transform: chunk => chunk
  });

  const registry = createListenerRegistry();

  // Always forward errors; they are critical for pipeline semantics.
  for (const t of transforms) {
    registry.add(t as any, "error", (err: Error) => composed.emit("error", err));
  }

  // Forward writable-side backpressure/completion events from `first`.
  registry.add(first as any, "drain", () => composed.emit("drain"));
  registry.once(first as any, "finish", () => composed.emit("finish"));

  // Forward readable-side events from `last` lazily.
  let forwardData = false;
  let forwardEnd = false;
  let forwardReadable = false;

  const ensureDataForwarding = (): void => {
    if (forwardData) {
      return;
    }
    forwardData = true;
    registry.add(last as any, "data", (chunk: R) => composed.emit("data", chunk));
  };

  const ensureEndForwarding = (): void => {
    if (forwardEnd) {
      return;
    }
    forwardEnd = true;
    registry.once(last as any, "end", () => composed.emit("end"));
  };

  const ensureReadableForwarding = (): void => {
    if (forwardReadable) {
      return;
    }
    forwardReadable = true;
    registry.add(last as any, "readable", () => composed.emit("readable"));
  };

  const originalOn = composed.on.bind(composed);
  const originalOnce = composed.once.bind(composed);

  (composed as any).on = (event: string | symbol, listener: (...args: any[]) => void): any => {
    if (event === "data") {
      ensureDataForwarding();
    } else if (event === "end") {
      ensureEndForwarding();
    } else if (event === "readable") {
      ensureReadableForwarding();
    }
    return originalOn(event, listener);
  };

  (composed as any).once = (event: string | symbol, listener: (...args: any[]) => void): any => {
    if (event === "data") {
      ensureDataForwarding();
    } else if (event === "end") {
      ensureEndForwarding();
    } else if (event === "readable") {
      ensureReadableForwarding();
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
    return lastAny.pipe(destination) as W;
  };

  (composed as any).read = (size?: number): R | null => {
    return typeof lastAny.read === "function" ? (lastAny.read(size) as R | null) : null;
  };

  (composed as any)[Symbol.asyncIterator] = async function* (): AsyncIterableIterator<R> {
    const it = lastAny?.[Symbol.asyncIterator]?.();
    if (it) {
      for await (const chunk of it as AsyncIterable<R>) {
        yield chunk;
      }
      return;
    }
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

  return composed;
}
