/**
 * Browser Stream - Shared event listener helpers
 */

import type { EventEmitterLike } from "@stream/types";

// =============================================================================
// Shared event listener helpers
// =============================================================================

export const removeEmitterListener = (
  emitter: EventEmitterLike,
  event: string,
  listener: (...args: any[]) => void
): void => {
  if (typeof emitter.off === "function") {
    emitter.off(event, listener);
  } else if (typeof emitter.removeListener === "function") {
    emitter.removeListener(event, listener);
  }
};

export const addEmitterListener = (
  emitter: EventEmitterLike,
  event: string,
  listener: (...args: any[]) => void,
  options?: { once?: boolean }
): (() => void) => {
  if (options?.once && typeof emitter.once === "function") {
    emitter.once(event, listener);
  } else {
    emitter.on!(event, listener);
  }
  return () => removeEmitterListener(emitter, event, listener);
};

export const createListenerRegistry = (): {
  add: (emitter: EventEmitterLike, event: string, listener: (...args: any[]) => void) => void;
  once: (emitter: EventEmitterLike, event: string, listener: (...args: any[]) => void) => void;
  cleanup: () => void;
} => {
  const listeners: Array<() => void> = [];

  return {
    add: (emitter, event, listener) => {
      listeners.push(addEmitterListener(emitter, event, listener));
    },
    once: (emitter, event, listener) => {
      listeners.push(addEmitterListener(emitter, event, listener, { once: true }));
    },
    cleanup: () => {
      for (let i = listeners.length - 1; i >= 0; i--) {
        listeners[i]();
      }
      listeners.length = 0;
    }
  };
};
