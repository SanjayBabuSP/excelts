/**
 * Node.js Stream - Compose
 *
 * Compose multiple transform streams into one.
 */

import { Transform } from "stream";
import type { TransformCallback as NodeTransformCallback } from "stream";
import type { ITransform } from "@stream/types";

// =============================================================================
// Compose
// =============================================================================

/**
 * Compose multiple transform streams into one
 */
export function compose<_T = any, _R = any>(...transforms: Array<ITransform<any, any>>): Transform {
  const len = transforms.length;
  if (len === 0) {
    return new Transform({
      objectMode: true,
      transform(chunk: any, _encoding: BufferEncoding, callback: NodeTransformCallback) {
        callback(null, chunk);
      }
    });
  }

  const isNativeTransform = (stream: ITransform<any, any>): stream is Transform =>
    stream instanceof Transform;

  if (len === 1 && isNativeTransform(transforms[0]!)) {
    return transforms[0];
  }

  // Chain all transforms together once.
  for (let i = 0; i < len - 1; i++) {
    transforms[i]!.pipe(transforms[i + 1]!);
  }

  const first = transforms[0]!;
  const last = transforms[len - 1]!;

  // Track whether last is paused due to backpressure from composed.
  let lastPaused = false;

  const composed = new Transform({
    readableObjectMode: (last as any).readableObjectMode,
    writableObjectMode: (first as any).writableObjectMode,
    transform(chunk: any, encoding: BufferEncoding, callback: NodeTransformCallback) {
      try {
        // Forward writes into the head of the chain.
        (first as any).write(chunk, encoding, callback);
      } catch (err) {
        callback(err as Error);
      }
    },
    flush(callback: NodeTransformCallback) {
      flushing = true;
      // End the head of the chain and wait for `last` to finish emitting all
      // data.  We must wait for `last`'s "end" (readable exhaustion) — not
      // `first`'s "finish" (writable flush) — because data may still be
      // flowing through intermediate transforms after `first` finishes.
      const onEnd = (): void => {
        cleanupFlush();
        callback();
      };
      const onError = (err: Error): void => {
        cleanupFlush();
        callback(err);
      };
      const cleanupFlush = (): void => {
        (last as any).off?.("end", onEnd);
        (last as any).off?.("error", onError);
      };

      (last as any).once?.("end", onEnd);
      (last as any).once?.("error", onError);
      (first as any).end();
    },
    read(this: Transform, size: number) {
      // Resume last if it was paused due to backpressure.
      if (lastPaused) {
        lastPaused = false;
        (last as any).resume?.();
      }
      Transform.prototype._read.call(this, size);
    },
    destroy(this: Transform, err: Error | null, callback: (error: Error | null) => void) {
      try {
        for (const t of transforms) {
          (t as any).destroy?.(err ?? undefined);
        }
      } finally {
        callback(err);
      }
    }
  });

  // Forward data from last directly to composed, with backpressure.
  const onLastData = (chunk: any): void => {
    if (!composed.push(chunk)) {
      lastPaused = true;
      (last as any).pause?.();
    }
  };

  // Track whether flush is handling the end sequence.
  let flushing = false;

  const onLastEnd = (): void => {
    cleanupListeners();
    // When flushing, the flush callback handles stream termination.
    // Otherwise (e.g. last ended independently), we must push(null) ourselves.
    if (!flushing) {
      composed.push(null);
    }
  };

  const onAnyError = (err: Error): void => {
    cleanupListeners();
    composed.destroy(err);
  };

  const transformErrorListeners: Array<{ t: any; fn: (err: Error) => void }> = [];
  const cleanupListeners = (): void => {
    (last as any).off?.("data", onLastData);
    (last as any).off?.("end", onLastEnd);
    (last as any).off?.("error", onAnyError);
    for (const { t, fn } of transformErrorListeners) {
      t.off?.("error", fn);
    }
    transformErrorListeners.length = 0;
  };

  (last as any).on?.("data", onLastData);
  (last as any).once?.("end", onLastEnd);
  (last as any).once?.("error", onAnyError);

  // Forward errors from all intermediate transforms.
  for (const t of transforms) {
    if (t === last) {
      continue;
    }
    const tt = t as any;
    tt.once?.("error", onAnyError);
    transformErrorListeners.push({ t: tt, fn: onAnyError });
  }

  composed.once("close", () => {
    cleanupListeners();
  });

  return composed;
}
