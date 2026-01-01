export class ByteQueue {
  private static readonly EMPTY = new Uint8Array(0);

  private _buf: Uint8Array;
  private _start = 0;
  private _end = 0;

  private _cachedView: Uint8Array | null = null;
  private _cachedBuf: Uint8Array | null = null;
  private _cachedStart = 0;
  private _cachedEnd = 0;

  constructor(initial?: Uint8Array) {
    this._buf = new Uint8Array(0);
    if (initial && initial.length > 0) {
      this.reset(initial);
    }
  }

  get length(): number {
    return this._end - this._start;
  }

  isEmpty(): boolean {
    return this.length === 0;
  }

  view(): Uint8Array {
    if (this._start === this._end) {
      return ByteQueue.EMPTY;
    }

    if (
      this._cachedView &&
      this._cachedBuf === this._buf &&
      this._cachedStart === this._start &&
      this._cachedEnd === this._end
    ) {
      return this._cachedView;
    }

    const view = this._buf.subarray(this._start, this._end);
    this._cachedView = view;
    this._cachedBuf = this._buf;
    this._cachedStart = this._start;
    this._cachedEnd = this._end;
    return view;
  }

  reset(data?: Uint8Array): void {
    this._cachedView = null;
    this._cachedBuf = null;
    if (!data || data.length === 0) {
      this._buf = ByteQueue.EMPTY;
      this._start = 0;
      this._end = 0;
      return;
    }

    // Keep a private copy to ensure future writes cannot mutate the source.
    const copy = new Uint8Array(data.length);
    copy.set(data);
    this._buf = copy;
    this._start = 0;
    this._end = copy.length;
  }

  append(chunk: Uint8Array): void {
    if (chunk.length === 0) {
      return;
    }

    this._cachedView = null;
    this._cachedBuf = null;

    const unread = this.length;

    // Fast path: enough tail room.
    if (this._end + chunk.length <= this._buf.length) {
      this._buf.set(chunk, this._end);
      this._end += chunk.length;
      return;
    }

    // Allocate a new buffer and copy unread bytes (never compacts in-place).
    const required = unread + chunk.length;
    const nextSize = this._buf.length === 0 ? required : Math.max(this._buf.length * 2, required);
    const next = new Uint8Array(nextSize);

    if (unread > 0) {
      next.set(this._buf.subarray(this._start, this._end), 0);
    }
    next.set(chunk, unread);

    this._buf = next;
    this._start = 0;
    this._end = required;
  }

  read(length: number): Uint8Array {
    if (length <= 0) {
      return new Uint8Array(0);
    }
    if (length > this.length) {
      throw new RangeError("ByteQueue: read beyond available data");
    }

    // Return a view for performance.
    // To keep this safe for async consumers, we must ensure we never write into
    // the same backing buffer again after it becomes fully consumed.
    const out = this._buf.subarray(this._start, this._start + length);
    this._start += length;

    this._cachedView = null;
    this._cachedBuf = null;

    if (this._start === this._end) {
      // Release backing storage to avoid reusing memory that might still be
      // referenced by previously returned views.
      this._buf = ByteQueue.EMPTY;
      this._start = 0;
      this._end = 0;
    }

    return out;
  }

  discard(length: number): void {
    if (length <= 0) {
      return;
    }
    if (length >= this.length) {
      // Release backing storage for the same reason as read(): previously
      // returned views may still be referenced by consumers.
      this._buf = ByteQueue.EMPTY;
      this._start = 0;
      this._end = 0;

      this._cachedView = null;
      this._cachedBuf = null;
      return;
    }
    this._start += length;

    this._cachedView = null;
    this._cachedBuf = null;

    if (this._start === this._end) {
      this._buf = ByteQueue.EMPTY;
      this._start = 0;
      this._end = 0;
    }
  }
}
