/**
 * Node.js True Streaming Compression
 *
 * Uses zlib.createDeflateRaw() with explicit flush() calls for real chunk-by-chunk streaming.
 * Each write() immediately produces compressed output without waiting for end().
 */

import {
  createDeflateRaw,
  createInflateRaw,
  createGzip,
  createGunzip,
  createDeflate,
  createInflate,
  deflateRawSync,
  constants,
  type Gunzip,
  type Inflate
} from "zlib";
import { Transform, type TransformCallback } from "@stream";

import { DEFAULT_COMPRESS_LEVEL } from "@archive/shared/defaults";

export type {
  DeflateStream,
  InflateStream,
  StreamCompressOptions,
  StreamingCodec
} from "@archive/compression/streaming-compress.base";
import type {
  DeflateStream,
  InflateStream,
  StreamCompressOptions,
  SyncDeflaterLike
} from "@archive/compression/streaming-compress.base";

export type { SyncDeflaterLike };

// Reusable type for zlib streams with flush() method
type ZlibFlushable = {
  write: (chunk: Buffer, cb: (err?: Error | null) => void) => void;
  flush: (mode: number, cb: () => void) => void;
  end: (cb: () => void) => void;
  on(event: "data", listener: (chunk: Buffer) => void): void;
  on(event: "error", listener: (err: Error) => void): void;
};

/**
 * Generic wrapper around zlib streams that flushes after every write.
 * This ensures true streaming behavior - data is emitted immediately, not buffered.
 */
class TrueStreamingZlib<T extends ZlibFlushable> extends Transform {
  constructor(private readonly zstream: T) {
    super();
    zstream.on("data", chunk => this.push(chunk));
    zstream.on("error", err => this.destroy(err));
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.zstream.write(chunk, writeErr => {
      if (writeErr) {
        callback(writeErr);
        return;
      }
      this.zstream.flush(constants.Z_SYNC_FLUSH, () => callback());
    });
  }

  _flush(callback: TransformCallback): void {
    this.zstream.flush(constants.Z_FINISH, () => {
      this.zstream.end(() => callback());
    });
  }
}

/**
 * Create a true streaming DEFLATE compressor
 * Returns a Transform stream that emits compressed data immediately after each write
 */
export function createDeflateStream(options: StreamCompressOptions = {}): DeflateStream {
  const level = options.level ?? DEFAULT_COMPRESS_LEVEL;
  return new TrueStreamingZlib(createDeflateRaw({ level }));
}

/**
 * Create a true streaming INFLATE decompressor
 *
 * @param options - Decompression options (useWorker is ignored in Node.js)
 */
export function createInflateStream(options: StreamCompressOptions = {}): InflateStream {
  // Note: options.useWorker is ignored in Node.js (zlib uses native thread pool)
  void options;
  return createInflateRaw();
}

/**
 * Check if true streaming deflate-raw is available
 * In Node.js, zlib is always available, so this always returns true
 */
export function hasDeflateRaw(): boolean {
  return true;
}

// =============================================================================
// GZIP Streaming
// =============================================================================

export type GzipStream = Transform;
export type GunzipStream = Gunzip;

/**
 * Create a streaming GZIP compressor
 */
export function createGzipStream(options: StreamCompressOptions = {}): GzipStream {
  const level = options.level ?? DEFAULT_COMPRESS_LEVEL;
  return new TrueStreamingZlib(createGzip({ level }));
}

/**
 * Create a streaming GZIP decompressor
 */
export function createGunzipStream(_options: StreamCompressOptions = {}): GunzipStream {
  return createGunzip();
}

// =============================================================================
// ZLIB Streaming (RFC 1950)
// =============================================================================

export type ZlibStream = Transform;
export type UnzlibStream = Inflate;

/**
 * Create a streaming Zlib compressor
 */
export function createZlibStream(options: StreamCompressOptions = {}): ZlibStream {
  const level = options.level ?? DEFAULT_COMPRESS_LEVEL;
  return new TrueStreamingZlib(createDeflate({ level }));
}

/**
 * Create a streaming Zlib decompressor
 */
export function createUnzlibStream(_options: StreamCompressOptions = {}): UnzlibStream {
  return createInflate();
}

// =============================================================================
// Synchronous stateful deflater (Node.js — native zlib)
// =============================================================================

/**
 * Node.js synchronous deflater using `deflateRawSync` with `Z_SYNC_FLUSH`.
 *
 * Each `write()` compresses the chunk independently (no cross-chunk dictionary)
 * but uses `Z_SYNC_FLUSH` so the output is byte-aligned and can be concatenated
 * into a single valid DEFLATE stream. The final `finish()` emits a proper
 * BFINAL=1 block.
 *
 * This is fast (native C zlib) and produces valid output on all Node.js versions
 * (20+). The trade-off is ~2% worse compression ratio vs a stateful context,
 * which is acceptable for streaming where memory is the priority.
 */
export class SyncDeflater implements SyncDeflaterLike {
  private _level: number;

  constructor(level = DEFAULT_COMPRESS_LEVEL) {
    this._level = level;
  }

  write(data: Uint8Array): Uint8Array {
    if (data.length === 0) {
      return new Uint8Array(0);
    }
    const result = deflateRawSync(Buffer.from(data), {
      level: this._level,
      finishFlush: constants.Z_SYNC_FLUSH
    });
    // deflateRawSync returns a Buffer sharing a 16 KB slab ArrayBuffer.
    // Copy to a tight Uint8Array so the slab can be reclaimed.
    return new Uint8Array(result);
  }

  finish(): Uint8Array {
    // Emit a final empty DEFLATE block (BFINAL=1, BTYPE=01, EOB).
    // This terminates the concatenated DEFLATE stream.
    return new Uint8Array(deflateRawSync(Buffer.alloc(0), { level: this._level }));
  }
}
