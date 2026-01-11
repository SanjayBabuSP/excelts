import { indexOfUint8ArrayPattern } from "@archive/utils/bytes";

export class ByteQueue {
  private static readonly EMPTY = new Uint8Array(0);

  // Store data as immutable chunks to avoid copying on append.
  private _chunks: Uint8Array[] = [];
  private _headOffset = 0;
  private _length = 0;

  // Lazily materialized contiguous view (used only by callers that require a single buffer).
  private _cachedView: Uint8Array | null = null;
  private _cachedLength = 0;

  constructor(initial?: Uint8Array) {
    if (initial && initial.length > 0) {
      this.reset(initial);
    }
  }

  get length(): number {
    return this._length;
  }

  isEmpty(): boolean {
    return this.length === 0;
  }

  view(): Uint8Array {
    if (this._length === 0) {
      return ByteQueue.EMPTY;
    }

    // Fast path: single chunk.
    if (this._chunks.length === 1) {
      const c = this._chunks[0];
      return c.subarray(this._headOffset, this._headOffset + this._length);
    }

    if (this._cachedView && this._cachedLength === this._length) {
      return this._cachedView;
    }

    const out = new Uint8Array(this._length);
    let offset = 0;
    for (let i = 0; i < this._chunks.length; i++) {
      const c = this._chunks[i];
      const start = i === 0 ? this._headOffset : 0;
      const end = i === this._chunks.length - 1 ? start + (this._length - offset) : c.length;
      out.set(c.subarray(start, end), offset);
      offset += end - start;
      if (offset >= out.length) {
        break;
      }
    }

    this._cachedView = out;
    this._cachedLength = this._length;
    return out;
  }

  reset(data?: Uint8Array): void {
    this._cachedView = null;
    this._cachedLength = 0;

    this._chunks = [];
    this._headOffset = 0;
    this._length = 0;

    if (!data || data.length === 0) {
      return;
    }

    // Keep a private copy to ensure future writes cannot mutate the source.
    const copy = new Uint8Array(data.length);
    copy.set(data);
    this._chunks = [copy];
    this._headOffset = 0;
    this._length = copy.length;
  }

  append(chunk: Uint8Array): void {
    if (chunk.length === 0) {
      return;
    }

    this._cachedView = null;
    this._cachedLength = 0;

    this._chunks.push(chunk);
    this._length += chunk.length;
  }

  read(length: number): Uint8Array {
    if (length <= 0) {
      return new Uint8Array(0);
    }
    if (length > this._length) {
      throw new RangeError("ByteQueue: read beyond available data");
    }

    this._cachedView = null;
    this._cachedLength = 0;

    if (this._chunks.length === 1) {
      const c = this._chunks[0];
      const start = this._headOffset;
      const end = start + length;
      const out = c.subarray(start, end);

      this._headOffset = end;
      this._length -= length;

      if (this._length === 0) {
        this._chunks = [];
        this._headOffset = 0;
      } else if (this._headOffset >= c.length) {
        this._chunks.shift();
        this._headOffset = 0;
      }

      return out;
    }

    // Slow path: spans multiple chunks, copy into a single output buffer.
    const out = new Uint8Array(length);
    let outOffset = 0;
    let remaining = length;

    while (remaining > 0) {
      const c = this._chunks[0];
      const start = this._headOffset;
      const available = c.length - start;
      const toCopy = Math.min(available, remaining);

      out.set(c.subarray(start, start + toCopy), outOffset);
      outOffset += toCopy;
      remaining -= toCopy;
      this._headOffset += toCopy;
      this._length -= toCopy;

      if (this._headOffset >= c.length) {
        this._chunks.shift();
        this._headOffset = 0;
      }
    }

    if (this._length === 0) {
      this._chunks = [];
      this._headOffset = 0;
    }

    return out;
  }

  discard(length: number): void {
    if (length <= 0) {
      return;
    }
    if (length >= this._length) {
      this._chunks = [];
      this._headOffset = 0;
      this._length = 0;

      this._cachedView = null;
      this._cachedLength = 0;
      return;
    }

    this._cachedView = null;
    this._cachedLength = 0;

    let remaining = length;
    while (remaining > 0) {
      const c = this._chunks[0];
      const start = this._headOffset;
      const available = c.length - start;
      const toDrop = Math.min(available, remaining);
      this._headOffset += toDrop;
      this._length -= toDrop;
      remaining -= toDrop;

      if (this._headOffset >= c.length) {
        this._chunks.shift();
        this._headOffset = 0;
      }
    }

    if (this._length === 0) {
      this._chunks = [];
      this._headOffset = 0;
    }
  }

  /**
   * Find the first index of `pattern` within the queue.
   *
   * This avoids materializing a contiguous `view()` for common small patterns
   * (ZIP signatures are typically 2-4 bytes).
   */
  indexOfPattern(pattern: Uint8Array, startIndex = 0): number {
    const patLen = pattern.length;
    if (patLen === 0) {
      return 0;
    }
    const len = this._length;
    if (patLen > len) {
      return -1;
    }

    let start = startIndex | 0;
    if (start < 0) {
      start = 0;
    }
    if (start > len - patLen) {
      return -1;
    }

    // Fast path: single chunk.
    if (this._chunks.length === 1) {
      const c = this._chunks[0];
      const base = this._headOffset;
      const view = c.subarray(base, base + len);
      // Delegate to native indexOf checks for 1..4 bytes.
      if (patLen === 1) {
        return view.indexOf(pattern[0], start);
      }
      return indexOfUint8ArrayPattern(view, pattern, start);
    }

    // Multi-chunk: optimize only for very common small patterns.
    if (patLen > 4) {
      // Rare: materialize view.
      const v = this.view();
      return indexOfUint8ArrayPattern(v, pattern, start);
    }

    const b0 = pattern[0];
    const b1 = patLen >= 2 ? pattern[1] : 0;
    const b2 = patLen >= 3 ? pattern[2] : 0;
    const b3 = patLen >= 4 ? pattern[3] : 0;

    let globalBase = 0;
    for (let ci = 0; ci < this._chunks.length; ci++) {
      const c = this._chunks[ci];
      const chunkOffset = ci === 0 ? this._headOffset : 0;
      const chunkLen = c.length - chunkOffset;
      if (chunkLen <= 0) {
        continue;
      }

      const chunkStartGlobal = globalBase;
      const chunkEndGlobal = chunkStartGlobal + chunkLen;

      // Compute local start for this chunk.
      const localStart =
        start <= chunkStartGlobal
          ? chunkOffset
          : start >= chunkEndGlobal
            ? c.length
            : chunkOffset + (start - chunkStartGlobal);

      if (localStart > c.length - 1) {
        globalBase += chunkLen;
        continue;
      }

      const lastLocal = c.length - 1;
      let i = c.indexOf(b0, localStart);
      while (i !== -1 && i <= lastLocal) {
        const globalPos = chunkStartGlobal + (i - chunkOffset);
        if (globalPos > len - patLen) {
          return -1;
        }

        if (patLen === 1) {
          return globalPos;
        }

        if (this.peekByte(globalPos + 1) !== b1) {
          i = c.indexOf(b0, i + 1);
          continue;
        }
        if (patLen === 2) {
          return globalPos;
        }
        if (this.peekByte(globalPos + 2) !== b2) {
          i = c.indexOf(b0, i + 1);
          continue;
        }
        if (patLen === 3) {
          return globalPos;
        }
        if (this.peekByte(globalPos + 3) !== b3) {
          i = c.indexOf(b0, i + 1);
          continue;
        }
        return globalPos;
      }

      globalBase += chunkLen;
    }

    return -1;
  }

  /** Peek a little-endian uint32 at `offset` without consuming bytes. Returns null if not enough bytes. */
  peekUint32LE(offset: number): number | null {
    const off = offset | 0;
    if (off < 0 || off + 4 > this._length) {
      return null;
    }

    const b0 = this.peekByte(off);
    const b1 = this.peekByte(off + 1);
    const b2 = this.peekByte(off + 2);
    const b3 = this.peekByte(off + 3);
    return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
  }

  /** Peek a single byte at `offset` without consuming bytes. */
  peekByte(offset: number): number {
    const off = offset | 0;
    if (off < 0 || off >= this._length) {
      throw new RangeError("ByteQueue: peek beyond available data");
    }

    let remaining = off;
    for (let i = 0; i < this._chunks.length; i++) {
      const c = this._chunks[i];
      const start = i === 0 ? this._headOffset : 0;
      const avail = c.length - start;
      if (remaining < avail) {
        return c[start + remaining] | 0;
      }
      remaining -= avail;
    }

    // Should be unreachable.
    throw new RangeError("ByteQueue: peek beyond available data");
  }
}
