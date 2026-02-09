/**
 * Node.js Stream - Compose
 *
 * Compose multiple transform streams into one.
 */

import { Transform, PassThrough } from "stream";
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
    return new PassThrough();
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

  // Use a private output stream so we don't have to monkey-patch `write()` on the
  // public composed stream (which would break piping into it).
  const output = new PassThrough({ objectMode: (last as any).readableObjectMode ?? true });
  last.pipe(output);

  let outputEnded = false;
  const pumpOutput = (target: Transform): void => {
    if (outputEnded) {
      return;
    }
    while (true) {
      const chunk = output.read();
      if (chunk === null) {
        break;
      }
      if (!target.push(chunk)) {
        break;
      }
    }
  };

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
      // End the head of the chain; readable completion is driven by `output` ending.
      const onFinish = (): void => {
        cleanupFlush();
        callback();
      };
      const onError = (err: Error): void => {
        cleanupFlush();
        callback(err);
      };
      const cleanupFlush = (): void => {
        (first as any).off?.("finish", onFinish);
        (first as any).off?.("error", onError);
      };

      (first as any).once?.("finish", onFinish);
      (first as any).once?.("error", onError);
      (first as any).end();
    },
    read(this: Transform) {
      pumpOutput(this);
    },
    destroy(this: Transform, err: Error | null, callback: (error: Error | null) => void) {
      try {
        output.destroy(err ?? undefined);
        for (const t of transforms) {
          (t as any).destroy?.(err ?? undefined);
        }
      } finally {
        callback(err);
      }
    }
  });

  const onOutputReadable = (): void => {
    pumpOutput(composed);
  };
  const onOutputEnd = (): void => {
    cleanupListeners();
    outputEnded = true;
    composed.push(null);
  };
  const onAnyError = (err: Error): void => {
    cleanupListeners();
    composed.destroy(err);
  };

  const transformErrorListeners: Array<{ t: any; fn: (err: Error) => void }> = [];
  const cleanupListeners = (): void => {
    output.off("readable", onOutputReadable);
    output.off("end", onOutputEnd);
    output.off("error", onAnyError);
    for (const { t, fn } of transformErrorListeners) {
      t.off?.("error", fn);
    }
    transformErrorListeners.length = 0;
  };

  output.on("readable", onOutputReadable);
  output.once("end", onOutputEnd);
  output.once("error", onAnyError);
  for (const t of transforms) {
    const tt = t as any;
    tt.once?.("error", onAnyError);
    transformErrorListeners.push({ t: tt, fn: onAnyError });
  }

  composed.once("close", () => {
    cleanupListeners();
  });

  return composed;
}
