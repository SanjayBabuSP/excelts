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
  constants,
  type Gunzip
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
  StreamCompressOptions
} from "@archive/compression/streaming-compress.base";

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
