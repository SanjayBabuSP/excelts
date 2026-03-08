/**
 * Browser Stream - ChunkBuffer
 *
 * Encapsulates FIFO buffer management for Readable streams.
 * Tracks byte size internally so callers don't need manual bookkeeping.
 */

// =============================================================================
// ChunkBuffer
// =============================================================================

/**
 * A FIFO buffer optimised for stream chunk management.
 *
 * - Uses an index-based ring on the main array to avoid O(n) `Array.shift()`.
 * - Maintains a small front-stack for `unshift()` to avoid O(n) `Array.unshift()`.
 * - Tracks cumulative byte size (binary mode) so backpressure checks are O(1).
 */
export class ChunkBuffer<T> {
  private _items: T[] = [];
  private _index: number = 0;
  private _front: T[] = [];
  private _byteSize: number = 0;
  private readonly _objectMode: boolean;

  constructor(objectMode: boolean) {
    this._objectMode = objectMode;
  }

  // ---------------------------------------------------------------------------
  // Size helpers
  // ---------------------------------------------------------------------------

  private _chunkSize(chunk: T): number {
    return chunk instanceof Uint8Array ? chunk.byteLength : 1;
  }

  /** Number of buffered items. */
  get length(): number {
    return this._front.length + (this._items.length - this._index);
  }

  /**
   * Tracked byte size (binary mode) or item count (object mode).
   * Useful for O(1) backpressure checks without iterating.
   */
  get byteSize(): number {
    return this._byteSize;
  }

  // ---------------------------------------------------------------------------
  // Core operations
  // ---------------------------------------------------------------------------

  /** Append a chunk to the back of the buffer. */
  push(chunk: T): void {
    this._items.push(chunk);
    if (!this._objectMode) {
      this._byteSize += this._chunkSize(chunk);
    }
  }

  /** Remove and return the front chunk. Caller must check `length > 0` first. */
  shift(): T {
    let chunk: T;

    if (this._front.length > 0) {
      chunk = this._front.pop()!;
    } else {
      chunk = this._items[this._index++]!;

      // Fast reset when emptied
      if (this._index === this._items.length) {
        this._items.length = 0;
        this._index = 0;
      } else if (this._index > 1024 && this._index * 2 > this._items.length) {
        // Occasionally compact to avoid unbounded growth of the unused prefix
        this._items = this._items.slice(this._index);
        this._index = 0;
      }
    }

    if (!this._objectMode) {
      this._byteSize -= this._chunkSize(chunk);
    }
    return chunk;
  }

  /** Push a chunk back to the front of the buffer. */
  unshift(chunk: T): void {
    if (this._index === 0) {
      // Avoid O(n) Array.unshift() by using a small front stack.
      // Semantics: last unshifted chunk is returned first by shift().
      this._front.push(chunk);
    } else {
      this._index--;
      this._items[this._index] = chunk;
    }

    if (!this._objectMode) {
      this._byteSize += this._chunkSize(chunk);
    }
  }

  /** Peek at the front chunk without removing it. Returns `null` if empty. */
  peek(): T | null {
    const frontLen = this._front.length;
    if (frontLen > 0) {
      return this._front[frontLen - 1]!;
    }
    return this._index < this._items.length ? this._items[this._index] : null;
  }

  /** Return a snapshot array of all buffered chunks (front-stack first, then main ring). */
  toArray(): T[] {
    const frontLen = this._front.length;
    const mainLen = this._items.length - this._index;
    const result = new Array<T>(frontLen + mainLen);

    // Front stack is stored in reverse order (last pushed = first shifted)
    for (let i = 0; i < frontLen; i++) {
      result[i] = this._front[frontLen - 1 - i]!;
    }
    for (let i = 0; i < mainLen; i++) {
      result[frontLen + i] = this._items[this._index + i]!;
    }
    return result;
  }

  /** Remove all buffered data. */
  clear(): void {
    this._items.length = 0;
    this._index = 0;
    this._front.length = 0;
    this._byteSize = 0;
  }

  // ---------------------------------------------------------------------------
  // Byte-level operations (binary mode)
  // ---------------------------------------------------------------------------

  /**
   * Consume exactly `size` bytes from the buffer, splitting chunks as needed.
   * Returns a single Uint8Array of exactly `size` bytes.
   * Caller must ensure `byteSize >= size` before calling.
   * Only valid in binary (non-object) mode.
   */
  consumeBytes(size: number): T {
    if (size === 0) {
      return new Uint8Array(0) as T;
    }

    // Fast path: if the front chunk is exactly the right size
    const first = this.peek();
    if (first instanceof Uint8Array && first.byteLength === size) {
      return this.shift();
    }

    // Fast path: if the front chunk is bigger than needed, slice it
    if (first instanceof Uint8Array && first.byteLength > size) {
      this._shiftFrontChunk(); // remove the full chunk from queue
      const result = first.subarray(0, size);
      const remainder = first.subarray(size);
      // Put remainder back at front
      this.unshift(remainder as T);
      // Adjust byteSize: shift removed full chunk, unshift added remainder.
      // We need to additionally correct because we removed a big chunk but only consumed `size`.
      // shift() already subtracted the full chunk size, unshift() added remainder size back.
      // Net effect: byteSize reduced by `size`. Correct!
      return result as T;
    }

    // General case: concatenate across multiple chunks
    const result = new Uint8Array(size);
    let offset = 0;
    while (offset < size) {
      const chunk = this.shift();
      if (chunk instanceof Uint8Array) {
        const needed = size - offset;
        if (chunk.byteLength <= needed) {
          result.set(chunk, offset);
          offset += chunk.byteLength;
        } else {
          // Chunk is bigger than remaining need — take what we need, put rest back
          result.set(chunk.subarray(0, needed), offset);
          this.unshift(chunk.subarray(needed) as T);
          offset += needed;
        }
      }
    }
    return result as T;
  }

  /**
   * Consume all buffered data and return as a single concatenated Uint8Array.
   * Only valid in binary (non-object) mode.
   * Optimised: iterates directly over internal arrays instead of per-element
   * shift() to avoid redundant _byteSize arithmetic and compaction checks.
   */
  consumeAll(): T {
    const frontLen = this._front.length;
    const ringLen = this._items.length - this._index;
    const totalLen = frontLen + ringLen;

    if (totalLen === 0) {
      return new Uint8Array(0) as T;
    }

    // Fast path: single chunk
    if (totalLen === 1) {
      return this.shift();
    }

    const totalSize = this._byteSize;
    const result = new Uint8Array(totalSize);
    let offset = 0;

    // Drain front stack (LIFO order — last pushed is first out)
    for (let i = frontLen - 1; i >= 0; i--) {
      const chunk = this._front[i];
      if (chunk instanceof Uint8Array) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
      }
    }

    // Drain main ring
    for (let i = this._index; i < this._items.length; i++) {
      const chunk = this._items[i];
      if (chunk instanceof Uint8Array) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
      }
    }

    // Reset all state in one shot
    this.clear();
    return result as T;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Remove and return the front chunk WITHOUT updating byteSize.
   * Used by consumeBytes when we need to split a chunk.
   * Actually, we just use shift() which handles byteSize — see consumeBytes.
   */
  private _shiftFrontChunk(): T {
    return this.shift();
  }
}
