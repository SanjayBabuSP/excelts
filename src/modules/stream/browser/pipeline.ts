/**
 * Browser Stream - Pipeline & Finished
 */

import type { PipelineStreamLike } from "@stream/types";
import type { PipelineOptions, PipelineCallback, FinishedOptions } from "@stream/common/options";
import {
  isReadableStream,
  isTransformStream,
  isWritableStream
} from "@stream/internal/type-guards";
import { isPipelineOptions } from "@stream/common/options";

import { Readable } from "./readable";
import { Writable } from "./writable";
import { Transform } from "./transform";
import { Duplex } from "./duplex";
import { createListenerRegistry } from "./helpers";

// Re-export for consumers
export type { PipelineOptions, FinishedOptions } from "@stream/common/options";
export { isPipelineOptions } from "@stream/common/options";

// =============================================================================
// Pipeline
// =============================================================================

type PipelineStream = PipelineStreamLike;

export const toBrowserPipelineStream = (stream: PipelineStream): any => {
  if (
    stream instanceof Readable ||
    stream instanceof Writable ||
    stream instanceof Transform ||
    stream instanceof Duplex
  ) {
    return stream;
  }

  if (isTransformStream(stream)) {
    return Transform.fromWeb(stream);
  }
  if (isReadableStream(stream)) {
    return Readable.fromWeb(stream);
  }
  if (isWritableStream(stream)) {
    return Writable.fromWeb(stream);
  }

  return stream;
};

/**
 * Pipeline streams together with proper error handling and cleanup.
 * Supports both callback and promise-based usage like Node.js.
 *
 * @example
 * // Promise usage
 * await pipeline(source, transform, destination);
 *
 * @example
 * // With options
 * await pipeline(source, transform, destination, { signal: controller.signal });
 *
 * @example
 * // Callback usage
 * pipeline(source, transform, destination, (err) => {
 *   if (err) console.error('Pipeline failed', err);
 * });
 */
export function pipeline(
  ...args: [...PipelineStream[], PipelineOptions | PipelineCallback] | PipelineStream[]
): Promise<void> {
  // Parse arguments
  let streams: PipelineStream[];
  let options: PipelineOptions = {};
  let callback: PipelineCallback | undefined;

  const lastArg = args[args.length - 1];

  if (typeof lastArg === "function") {
    // Callback style: pipeline(s1, s2, s3, callback)
    callback = lastArg as PipelineCallback;
    streams = args.slice(0, -1) as PipelineStream[];
  } else if (isPipelineOptions(lastArg)) {
    // Options style: pipeline(s1, s2, s3, { signal })
    options = lastArg as PipelineOptions;
    streams = args.slice(0, -1) as PipelineStream[];
  } else {
    // No callback or options: pipeline(s1, s2, s3)
    streams = args as PipelineStream[];
  }

  const promise = new Promise<void>((resolve, reject) => {
    if (streams.length < 2) {
      const err = new Error("Pipeline requires at least 2 streams");
      reject(err);
      return;
    }

    const normalized = streams.map(toBrowserPipelineStream);
    const source = normalized[0];
    const destination = normalized[normalized.length - 1];
    const transforms = normalized.slice(1, -1);

    let completed = false;
    const allStreams = [source, ...transforms, destination];

    const registry = createListenerRegistry();

    let onAbort: (() => void) | undefined;
    const cleanupWithSignal = (error?: Error): void => {
      if (completed) {
        return;
      }
      completed = true;

      registry.cleanup();

      if (onAbort && options.signal) {
        options.signal.removeEventListener("abort", onAbort);
      }

      // Destroy all streams on error
      if (error) {
        for (const stream of allStreams) {
          if (typeof stream.destroy === "function") {
            stream.destroy(error);
          }
        }
        reject(error);
      } else {
        resolve();
      }
    };

    // Handle abort signal
    if (options.signal) {
      if (options.signal.aborted) {
        cleanupWithSignal(new Error("Pipeline aborted"));
        return;
      }
      onAbort = () => cleanupWithSignal(new Error("Pipeline aborted"));
      options.signal.addEventListener("abort", onAbort);
    }

    // Chain the streams
    let current: any = source;
    for (const transform of transforms) {
      current.pipe(transform);
      current = transform;
    }

    // Pipe to destination
    if (options.end !== false) {
      current.pipe(destination);
    } else {
      // Don't end destination
      let paused = false;
      let waitingForDrain = false;
      const onDrain = (): void => {
        waitingForDrain = false;
        if (paused && typeof current.resume === "function") {
          paused = false;
          current.resume();
        }
      };

      const onData = (chunk: any): void => {
        const ok = destination.write(chunk);
        if (!ok && !waitingForDrain) {
          waitingForDrain = true;
          if (!paused && typeof current.pause === "function") {
            paused = true;
            current.pause();
          }
          registry.once(destination, "drain", onDrain);
        }
      };

      const onEnd = (): void => cleanupWithSignal();

      registry.add(current, "data", onData);
      registry.once(current, "end", onEnd);
    }

    // Handle completion
    registry.once(destination, "finish", () => cleanupWithSignal());

    // Handle errors on all streams
    for (const stream of allStreams) {
      registry.once(stream, "error", (err: Error) => cleanupWithSignal(err));
    }
  });

  // If callback provided, use it
  if (callback) {
    promise.then(() => callback!(null)).catch(err => callback!(err));
  }

  return promise;
}

// =============================================================================
// Finished
// =============================================================================

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
export async function finishedAll(streams: ReadonlyArray<PipelineStreamLike>): Promise<void> {
  const len = streams.length;
  if (len === 0) {
    return;
  }
  if (len === 1) {
    await finished(streams[0]);
    return;
  }
  const promises = new Array<Promise<void>>(len);
  for (let i = 0; i < len; i++) {
    promises[i] = finished(streams[i]);
  }
  await Promise.all(promises);
}
