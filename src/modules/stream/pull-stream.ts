/**
 * Pull Stream
 *
 * A stream that allows pulling data from internal buffer with pattern matching.
 * Works identically in both browser and Node.js environments.
 */

import { EventEmitter } from "@stream/event-emitter";
import { concatUint8Arrays } from "@stream/shared";

export interface PullStreamOptions {
  /** Enable object mode */
  objectMode?: boolean;
}

/**
 * Browser-compatible Pull Stream - Read data from buffer on demand with pattern matching
 */
export class PullStream extends EventEmitter {
  // Use chunked buffer storage to avoid repeated concat
  private _bufferChunks: Uint8Array[] = [];
  private _totalLength: number = 0;
  protected finished: boolean = false;
  protected _match?: number;
  private _destroyed: boolean = false;

  constructor(_options: PullStreamOptions = {}) {
    super();
  }

  // Consolidate chunks into single buffer when needed
  protected get buffer(): Uint8Array {
    const len = this._bufferChunks.length;
    if (len === 0) {
      return new Uint8Array(0);
    }
    if (len === 1) {
      return this._bufferChunks[0];
    }
    // Consolidate multiple chunks
    const buf = concatUint8Arrays(this._bufferChunks);
    this._bufferChunks = [buf];
    return buf;
  }

  protected set buffer(buf: Uint8Array) {
    this._bufferChunks = buf.length > 0 ? [buf] : [];
    this._totalLength = buf.length;
  }

  /**
   * Write data to the stream
   */
  write(chunk: Uint8Array): boolean {
    if (this._destroyed) {
      this.emit("error", new Error("Cannot write to destroyed stream"));
      return false;
    }

    this._bufferChunks.push(chunk);
    this._totalLength += chunk.length;
    this.emit("chunk");
    return true;
  }

  /**
   * Signal end of input
   */
  end(chunk?: Uint8Array): void {
    if (chunk !== undefined) {
      this.write(chunk);
    }
    this.finished = true;
    this.emit("chunk", false);
    this.emit("finish");
    this.emit("end");
  }

  /**
   * Destroy the stream
   */
  destroy(error?: Error): void {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;
    this._bufferChunks = [];
    this._totalLength = 0;

    if (error) {
      this.emit("error", error);
    }

    this.emit("close");
  }

  /**
   * Pull exactly N bytes from buffer, or pull until pattern is found
   */
  pull(size: number): Promise<Uint8Array>;
  pull(pattern: Uint8Array, includePattern?: boolean): Promise<Uint8Array>;
  pull(sizeOrPattern: number | Uint8Array, includePattern?: boolean): Promise<Uint8Array> {
    if (typeof sizeOrPattern === "number") {
      return this._pullSize(sizeOrPattern);
    }
    return this._pullPattern(sizeOrPattern, includePattern ?? false);
  }

  /**
   * Pull until pattern is found (alias for pull(pattern, includePattern))
   */
  pullUntil(pattern: Uint8Array, includePattern?: boolean): Promise<Uint8Array> {
    return this._pullPattern(pattern, includePattern ?? false);
  }

  private _pullSize(size: number): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const tryPull = (): void => {
        if (this._destroyed) {
          reject(new Error("Stream destroyed"));
          return;
        }

        // Use _totalLength for fast check before consolidating
        if (this._totalLength >= size) {
          const buf = this.buffer;
          const result = buf.subarray(0, size);
          this.buffer = buf.subarray(size);
          resolve(result);
          return;
        }

        if (this.finished) {
          // Return whatever we have
          const result = this.buffer;
          this._bufferChunks = [];
          this._totalLength = 0;
          resolve(result);
          return;
        }

        // Wait for more data
        this.once("chunk", tryPull);
      };

      tryPull();
    });
  }

  private _pullPattern(pattern: Uint8Array, includePattern: boolean): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const tryPull = (): void => {
        if (this._destroyed) {
          reject(new Error("Stream destroyed"));
          return;
        }

        const buf = this.buffer;
        const matchIndex = this._indexOf(buf, pattern);

        if (matchIndex !== -1) {
          this._match = matchIndex;

          const endIndex = includePattern ? matchIndex + pattern.length : matchIndex;
          const result = buf.subarray(0, endIndex);
          this.buffer = buf.subarray(includePattern ? endIndex : matchIndex + pattern.length);
          resolve(result);
          return;
        }

        if (this.finished) {
          // Pattern not found, return everything
          const result = buf;
          this._bufferChunks = [];
          this._totalLength = 0;
          resolve(result);
          return;
        }

        // Wait for more data
        this.once("chunk", tryPull);
      };

      tryPull();
    });
  }

  /**
   * Get the match position from last pattern match
   */
  get matchPosition(): number | undefined {
    return this._match;
  }

  /**
   * Get remaining buffer length
   */
  get length(): number {
    return this._totalLength;
  }

  /**
   * Check if stream is finished
   */
  get isFinished(): boolean {
    return this.finished;
  }

  /**
   * Check if stream is destroyed
   */
  get destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * Find pattern in Uint8Array (like Buffer.indexOf)
   */
  private _indexOf(haystack: Uint8Array, needle: Uint8Array, start = 0): number {
    const needleLen = needle.length;
    if (needleLen === 0) {
      return start;
    }
    const haystackLen = haystack.length;
    if (needleLen > haystackLen) {
      return -1;
    }

    const first = needle[0];
    const last = haystackLen - needleLen;

    outer: for (let i = start; i <= last; i++) {
      // Quick check first byte
      if (haystack[i] !== first) {
        continue;
      }
      // Check rest of pattern
      for (let j = 1; j < needleLen; j++) {
        if (haystack[i + j] !== needle[j]) {
          continue outer;
        }
      }
      return i;
    }

    return -1;
  }
}
