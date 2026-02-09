/**
 * Node.js Stream - Finished
 *
 * Wait for stream completion.
 */

import { finished as nodeFinished } from "stream";
import type { PipelineStreamLike } from "@stream/types";
import type { FinishedOptions, PipelineCallback } from "@stream/common/options";
import { createFinishedAll } from "@stream/common/finished-all";

import { toNodePipelineStream } from "./pipeline";

// Re-export for consumers
export type { FinishedOptions } from "@stream/common/options";

// =============================================================================
// Finished
// =============================================================================

/**
 * Wait for a stream to finish, close, or error.
 * Node.js compatible with support for options and callbacks.
 */
export function finished(
  stream: PipelineStreamLike,
  optionsOrCallback?: FinishedOptions | PipelineCallback,
  callback?: PipelineCallback
): Promise<void> {
  let options: FinishedOptions | undefined;
  let cb: PipelineCallback | undefined;

  if (typeof optionsOrCallback === "function") {
    cb = optionsOrCallback;
  } else {
    options = optionsOrCallback;
    cb = callback;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const normalizedStream = toNodePipelineStream(stream);
    (nodeFinished as any)(normalizedStream, options, (err: Error | null) => {
      // Node.js semantics: options.error defaults to true (report errors).
      // If options.error === false, ignore errors and resolve.
      if (err && options?.error !== false) {
        reject(err);
        return;
      }
      resolve();
    });
  });

  if (cb) {
    promise.then(() => cb!()).catch(err => cb!(err));
  }

  return promise;
}

/**
 * Wait for multiple streams to finish
 */
export const finishedAll = createFinishedAll(finished);
