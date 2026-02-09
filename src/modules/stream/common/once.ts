/**
 * Stream Module - Common Once
 *
 * Promisified event listener that resolves on the first occurrence of an event.
 * Used by both Node.js and Browser implementations.
 */

import type { IEventEmitter } from "@stream/types";

/**
 * Promisified version of once for events
 */
export function once(
  emitter: IEventEmitter,
  event: string,
  options?: { signal?: AbortSignal }
): Promise<any[]> {
  return new Promise((resolve, reject) => {
    let onAbort: (() => void) | undefined;
    let resolved = false;

    const cleanup = (): void => {
      if (resolved) {
        return;
      }
      resolved = true;
      emitter.off(event, onEvent);
      emitter.off("error", onError);
      if (onAbort && options?.signal) {
        options.signal.removeEventListener("abort", onAbort);
      }
    };

    const onEvent = (...args: any[]): void => {
      cleanup();
      resolve(args);
    };

    const onError = (err: Error): void => {
      cleanup();
      reject(err);
    };

    emitter.once(event, onEvent);
    emitter.once("error", onError);

    if (options?.signal) {
      if (options.signal.aborted) {
        cleanup();
        reject(new Error("Aborted"));
        return;
      }
      onAbort = () => {
        cleanup();
        reject(new Error("Aborted"));
      };
      options.signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}
