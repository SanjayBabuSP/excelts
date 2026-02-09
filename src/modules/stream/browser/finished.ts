/**
 * Browser Stream - Finished
 */

import type { PipelineStreamLike } from "@stream/types";
import type { FinishedOptions } from "@stream/common/options";
import { createFinishedAll } from "@stream/common/finished-all";

import { createListenerRegistry } from "./helpers";
import { toBrowserPipelineStream } from "./pipeline";

// Re-export for consumers
export type { FinishedOptions } from "@stream/common/options";

/**
 * Wait for a stream to finish, close, or error.
 * Node.js compatible with support for options and callbacks.
 *
 * @example
 * // Promise usage
 * await finished(stream);
 *
 * @example
 * // With options
 * await finished(stream, { readable: false }); // Only wait for writable side
 *
 * @example
 * // Callback usage
 * finished(stream, (err) => {
 *   if (err) console.error('Stream error', err);
 * });
 */
export function finished(
  stream: PipelineStreamLike,
  optionsOrCallback?: FinishedOptions | ((err?: Error | null) => void),
  callback?: (err?: Error | null) => void
): Promise<void> {
  let options: FinishedOptions = {};
  let cb: ((err?: Error | null) => void) | undefined;

  if (typeof optionsOrCallback === "function") {
    cb = optionsOrCallback;
  } else if (optionsOrCallback) {
    options = optionsOrCallback;
    cb = callback;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const normalizedStream = toBrowserPipelineStream(stream);
    let resolved = false;

    const registry = createListenerRegistry();
    let onAbort: (() => void) | undefined;
    const cleanup = (): void => {
      registry.cleanup();
      if (onAbort && options.signal) {
        options.signal.removeEventListener("abort", onAbort);
      }
    };

    const done = (err?: Error | null): void => {
      if (resolved) {
        return;
      }
      resolved = true;

      cleanup();

      if (err && options?.error !== false) {
        reject(err);
      } else {
        resolve();
      }
    };

    // Handle abort signal
    if (options.signal) {
      if (options.signal.aborted) {
        done(new Error("Aborted"));
        return;
      }
      onAbort = () => done(new Error("Aborted"));
      options.signal.addEventListener("abort", onAbort);
    }

    const checkReadable = options.readable !== false;
    const checkWritable = options.writable !== false;

    // Already finished?
    if (checkReadable && normalizedStream.readableEnded) {
      done();
      return;
    }

    if (checkWritable && normalizedStream.writableFinished) {
      done();
      return;
    }

    // Listen for events
    if (checkWritable) {
      registry.once(normalizedStream, "finish", () => done());
    }

    if (checkReadable) {
      registry.once(normalizedStream, "end", () => done());
    }

    registry.once(normalizedStream, "error", (err: Error) => done(err));
    registry.once(normalizedStream, "close", () => done());
  });

  // If callback provided, use it
  if (cb) {
    promise.then(() => cb!(null)).catch(err => cb!(err));
  }

  return promise;
}

/**
 * Wait for multiple streams to finish
 */
export const finishedAll = createFinishedAll(finished);
