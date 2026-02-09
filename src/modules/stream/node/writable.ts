/**
 * Node.js Stream - Writable
 *
 * Extended Writable class with browser-compatible API.
 */

import { Writable as NodeWritable } from "stream";
import type { WritableStreamOptions, WritableLike } from "@stream/types";

// =============================================================================
// Unified Writable class (compatible with browser API)
// =============================================================================

/**
 * Extended Writable options that match browser API
 * Supports wrapping an existing Node.js stream
 */
export interface WritableOptions<T = Uint8Array> extends WritableStreamOptions {
  /** Existing Node.js Writable stream to wrap (for API compatibility with browser) */
  stream?: NodeWritable;
  autoDestroy?: boolean;
  emitClose?: boolean;
  defaultEncoding?: BufferEncoding;
  write?: (
    this: Writable<T>,
    chunk: T,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ) => void;
  final?: (this: Writable<T>, callback: (error?: Error | null) => void) => void;
}

/**
 * Unified Writable class - wraps Node.js Writable with browser-compatible API
 *
 * Supports the same `{ stream }` option as browser version for wrapping existing streams.
 */
export class Writable<T = Uint8Array> extends NodeWritable {
  constructor(options?: WritableOptions<T>) {
    // If wrapping an existing stream, proxy to it
    if (options?.stream) {
      const underlying = options.stream;

      // Create a pass-through wrapper that proxies to the underlying stream
      super({
        highWaterMark: options?.highWaterMark,
        objectMode: options?.objectMode,
        write(chunk, encoding, callback) {
          underlying.write(chunk, encoding, callback);
        },
        final(callback) {
          underlying.end(callback);
        }
      });

      // Proxy events from underlying stream, but ensure we clean up listeners so
      // the underlying stream cannot retain this wrapper longer than necessary.
      const onUnderlyingError = (err: Error): void => {
        this.emit("error", err);
      };
      const onUnderlyingClose = (): void => {
        this.emit("close");
      };
      const cleanup = (): void => {
        underlying.off("error", onUnderlyingError);
        underlying.off("close", onUnderlyingClose);
      };

      underlying.on("error", onUnderlyingError);
      underlying.on("close", onUnderlyingClose);

      this.once("close", cleanup);
      this.once("finish", cleanup);
    } else {
      super({
        highWaterMark: options?.highWaterMark,
        objectMode: options?.objectMode,
        write: options?.write as any,
        final: options?.final as any
      });
    }
  }
}

// =============================================================================
// Cross-environment stream normalization
// =============================================================================

/**
 * Normalize a user-provided writable into a Node.js-compatible Writable.
 *
 * This keeps Web/Node branching at the stream-module boundary.
 */
export function toWritable<T = Uint8Array>(
  stream: WritableLike | WritableStream<T> | NodeWritable
): WritableLike {
  if (stream instanceof Writable) {
    return stream;
  }

  // Node.js Writable: already compatible, avoid extra wrapper allocation.
  if (stream instanceof (NodeWritable as any)) {
    return stream as unknown as WritableLike;
  }

  // Web WritableStream: detect by getWriter() (avoid relying on global WritableStream).
  if ((stream as any)?.getWriter) {
    return (NodeWritable as any).fromWeb(stream as any) as WritableLike;
  }

  // Assume it structurally matches Node's Writable.
  return stream as WritableLike;
}
