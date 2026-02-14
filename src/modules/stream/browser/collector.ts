/**
 * Browser Stream - Collector
 */

import type { WritableStreamOptions } from "@stream/types";
import { StreamTypeError } from "@stream/errors";
import { concatUint8Arrays, chunksToString } from "@utils/binary";
import { toBinaryChunk } from "@stream/common/binary-chunk";

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
    super({
      ...options,
      objectMode: options?.objectMode ?? true,
      write(
        this: Writable<T>,
        chunk: T,
        _encoding: string,
        callback: (error?: Error | null) => void
      ) {
        (this as unknown as Collector<T>).chunks.push(chunk);
        callback();
      }
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

    const binaryChunks = new Array<Uint8Array>(len);
    let totalLength = 0;
    for (let i = 0; i < len; i++) {
      const normalized = toBinaryChunk(chunks[i]);
      if (!normalized) {
        throw new StreamTypeError("Uint8Array", "non-binary data");
      }
      binaryChunks[i] = normalized;
      totalLength += normalized.length;
    }

    if (len === 1) {
      return binaryChunks[0]!;
    }

    return concatUint8Arrays(binaryChunks, totalLength);
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
