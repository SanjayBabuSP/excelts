export interface PatternSearchTarget {
  indexOfPattern(pattern: Uint8Array, startIndex: number): number;
}

/**
 * Stateful helper for incremental pattern scanning in growing buffers.
 *
 * The scanner tracks a `searchFrom` cursor and an `overlap` region so callers
 * can avoid rescanning bytes that cannot start a match.
 */
export class PatternScanner {
  readonly pattern: Uint8Array;
  readonly overlap: number;

  searchFrom = 0;

  constructor(pattern: Uint8Array) {
    this.pattern = pattern;
    this.overlap = Math.max(0, pattern.length - 1);
  }

  /** Find the next match index starting at the current `searchFrom`. */
  find(target: PatternSearchTarget): number {
    return target.indexOfPattern(this.pattern, this.searchFrom);
  }

  /** Update `searchFrom` after consuming `consumed` bytes from the front. */
  onConsume(consumed: number): void {
    if (consumed > 0) {
      this.searchFrom = Math.max(0, this.searchFrom - consumed);
    }
  }

  /** Update `searchFrom` after a no-match scan on a buffer of length `bufferLength`. */
  onNoMatch(bufferLength: number): void {
    this.searchFrom = Math.max(this.searchFrom, Math.max(0, bufferLength - this.overlap));
  }
}
