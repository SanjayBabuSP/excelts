/**
 * Browser Stream - Deferred task context tracking
 *
 * Tracks whether code is currently executing inside a stream-internal
 * deferred callback (queueMicrotask). This allows destroy() to decide
 * whether to synchronously emit error/close events (when already in a
 * deferred context) or to schedule another queueMicrotask (when called
 * from synchronous user code).
 *
 * Why this matters:
 *
 * In Node.js, process.nextTick callbacks that schedule more nextTick
 * callbacks form a chain that runs to completion before any Promise.then
 * callbacks execute. For example:
 *
 *   process.nextTick(() => {           // tick A
 *     emit("finish");
 *     destroy();                        // internally does:
 *       process.nextTick(() => {        // tick B — runs before Promises
 *         emit("close");
 *       });
 *   });
 *   Promise.resolve().then(...)         // runs AFTER tick B
 *
 * In the browser, queueMicrotask and Promise.then share a single FIFO
 * microtask queue, so tick B would be appended after the Promise callback,
 * allowing it to interleave between "finish" and "close".
 *
 * This module solves the problem by tracking a depth counter. When
 * destroy() detects it is already inside a deferTask callback (depth > 0),
 * it emits error/close synchronously instead of scheduling another
 * queueMicrotask — collapsing the two-level nesting into one level.
 */

// =============================================================================
// Context tracking
// =============================================================================

let _depth = 0;

/**
 * Schedule `fn` via queueMicrotask, tracking the execution context.
 * Use this instead of raw queueMicrotask in stream implementation code.
 */
export function deferTask(fn: () => void): void {
  queueMicrotask(() => {
    _depth++;
    try {
      fn();
    } finally {
      _depth--;
    }
  });
}

/**
 * Returns true if the current call stack is inside a deferTask callback.
 * Used by destroy() to decide whether afterDestroy should emit
 * synchronously (already deferred) or schedule a new microtask.
 */
export function inDeferredContext(): boolean {
  return _depth > 0;
}
