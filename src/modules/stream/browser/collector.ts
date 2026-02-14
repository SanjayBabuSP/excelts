/**
 * Browser Stream - Collector
 */

import type { WritableStreamOptions } from "@stream/types";
import { StreamTypeError } from "@stream/errors";
import { concatUint8Arrays, chunksToString } from "@utils/binary";

import { Writable } from "./writable";

// =============================================================================
// Collector Stream
// =============================================================================

/**
 * A writable stream that collects all chunks
 */
export class Collector<T = Uint8Array> extends Writable<T> {
  public chunks: T[] = [];

  constructor(options?: WritableStreamOptions) {
    super({ ...options, objectMode: options?.objectMode ?? true });
  }

  // Override write to be synchronous - Collector doesn't need async behavior
  // This makes behavior consistent with Node.js Collector
  override write(chunk: T, callback?: (error?: Error | null) => void): boolean;
  override write(chunk: T, encoding?: string, callback?: (error?: Error | null) => void): boolean;
  override write(
    chunk: T,
    encodingOrCallback?: string | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void
  ): boolean {
    if (this.destroyed || this.writableEnded || this.writableFinished) {
      const err = new Error("write after end");
      this.emit("error", err);
      return false;
    }

    const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;

    // Synchronously push to chunks
    this.chunks.push(chunk);
    cb?.(null);
    return true;
  }

  /**
   * Get all collected data as a single Uint8Array (for binary mode)
   */
  toUint8Array(): Uint8Array {
    const chunks = this.chunks;
    const len = chunks.length;
    if (len === 0) {
      return new Uint8Array(0);
    }
    if (len === 1 && chunks[0] instanceof Uint8Array) {
      return chunks[0];
    }

    // If chunks are Uint8Arrays, concatenate them
    if (chunks[0] instanceof Uint8Array) {
      return concatUint8Arrays(chunks as Uint8Array[]);
    }

    throw new StreamTypeError("Uint8Array", "non-binary data");
  }

  /**
   * Get all collected data as a string
   */
  override toString(): string {
    return chunksToString(this.chunks, () => this.toUint8Array());
  }

  get isFinished(): boolean {
    // Use inherited writable property
    return this.writableFinished;
  }
}
