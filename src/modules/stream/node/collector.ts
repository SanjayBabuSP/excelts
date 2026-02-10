/**
 * Node.js Stream - Collector
 *
 * A writable stream that collects all chunks.
 */

import { StreamTypeError } from "@stream/errors";
import type { WritableStreamOptions, ICollector } from "@stream/types";
import { chunksToString } from "@utils/binary";

import { Writable } from "./writable";

// =============================================================================
// Collector Stream - Collects all chunks into an array
// =============================================================================

/**
 * A writable stream that collects all chunks
 */
export class Collector<T = Uint8Array> extends Writable {
  public chunks: T[] = [];

  constructor(options?: WritableStreamOptions) {
    super({
      highWaterMark: options?.highWaterMark,
      objectMode: options?.objectMode ?? true,
      write: ((chunk: T, _encoding: BufferEncoding, callback: (error?: Error | null) => void) => {
        this.chunks.push(chunk);
        callback();
      }) as any
    });
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
    if (len === 1) {
      const first = chunks[0];
      if (first instanceof Uint8Array) {
        return first;
      }
      if (Buffer.isBuffer(first)) {
        return new Uint8Array(first.buffer, first.byteOffset, first.byteLength);
      }
    }

    // Fast path: check first chunk type once
    const first = chunks[0];
    if (first instanceof Uint8Array || Buffer.isBuffer(first)) {
      // Calculate total length with simple loop (faster than reduce)
      let totalLength = 0;
      for (let i = 0; i < len; i++) {
        totalLength += (chunks[i] as Uint8Array).length;
      }

      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (let i = 0; i < len; i++) {
        const arr = chunks[i] as Uint8Array;
        result.set(arr, offset);
        offset += arr.length;
      }
      return result;
    }

    throw new StreamTypeError("Uint8Array", "non-binary data");
  }

  /**
   * Get all collected data as a string
   */
  override toString(): string {
    return chunksToString(this.chunks, () => this.toUint8Array());
  }

  /**
   * Whether the collector has finished receiving data
   */
  get isFinished(): boolean {
    return this.writableFinished;
  }
}

/**
 * Create a collector stream
 */
export function createCollector<T = Uint8Array>(options?: WritableStreamOptions): ICollector<T> {
  return new Collector<T>(options);
}
