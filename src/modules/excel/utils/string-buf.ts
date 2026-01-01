/**
 * StringBuf - Cross-Platform String Buffer
 *
 * A way to keep string memory operations to a minimum while building XML strings.
 * Uses TextEncoder and Uint8Array for cross-platform compatibility (Node.js + Browser).
 */

interface StringBufOptions {
  size?: number;
  encoding?: string; // Only UTF-8 is supported (TextEncoder limitation)
}

const encoder = new TextEncoder();

/**
 * StringBuf - efficient string builder using Uint8Array
 * Works identically in Node.js and Browser environments.
 */
class StringBuf {
  private _buf: Uint8Array;
  private _inPos: number;
  private _buffer: Uint8Array | undefined;

  constructor(options?: StringBufOptions) {
    this._buf = new Uint8Array((options && options.size) || 16384);
    // TextEncoder only supports UTF-8, so encoding option is ignored
    this._inPos = 0;
    this._buffer = undefined;
  }

  get length(): number {
    return this._inPos;
  }

  get capacity(): number {
    return this._buf.length;
  }

  get buffer(): Uint8Array {
    return this._buf;
  }

  toBuffer(): Uint8Array {
    // Return the current data as a single enclosing buffer
    if (!this._buffer) {
      this._buffer = this._buf.slice(0, this._inPos);
    }
    return this._buffer;
  }

  reset(position?: number): void {
    position = position || 0;
    this._buffer = undefined;
    this._inPos = position;
  }

  private _grow(min: number): void {
    let size = this._buf.length * 2;
    while (size < min) {
      size *= 2;
    }
    const buf = new Uint8Array(size);
    buf.set(this._buf);
    this._buf = buf;
  }

  addText(text: string): void {
    this._buffer = undefined;

    // Encode string to UTF-8 bytes
    const encoded = encoder.encode(text);
    const minSpace = this._inPos + encoded.length;

    // Grow preemptively: if remaining space < 4 bytes margin, double
    // This matches original Buffer behavior where growth is triggered proactively
    if (minSpace > this._buf.length - 4) {
      this._grow(minSpace);
    }

    // Copy encoded bytes to buffer
    this._buf.set(encoded, this._inPos);
    this._inPos += encoded.length;
  }

  addStringBuf(inBuf: StringBuf): void {
    if (inBuf.length) {
      this._buffer = undefined;

      if (this.length + inBuf.length > this.capacity) {
        this._grow(this.length + inBuf.length);
      }

      // Copy bytes from input buffer
      this._buf.set(inBuf._buf.subarray(0, inBuf.length), this._inPos);
      this._inPos += inBuf.length;
    }
  }
}

export { StringBuf };
