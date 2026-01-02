/**
 * Node.js True Streaming Compression
 *
 * Uses zlib.createDeflateRaw() with explicit flush() calls for real chunk-by-chunk streaming.
 * Each write() immediately produces compressed output without waiting for end().
 */

import { createDeflateRaw, createInflateRaw, constants, type DeflateRaw } from "zlib";
import { Transform, type TransformCallback } from "@stream";

import { DEFAULT_COMPRESS_LEVEL } from "@archive/defaults";

export type {
  DeflateStream,
  InflateStream,
  StreamCompressOptions,
  StreamingCodec
} from "@archive/streaming-compress.base";
import type {
  DeflateStream,
  InflateStream,
  StreamCompressOptions
} from "@archive/streaming-compress.base";

/**
 * Wrapper around zlib DeflateRaw that flushes after every write
 * This ensures true streaming behavior - data is emitted immediately, not buffered
 */
class TrueStreamingDeflate extends Transform {
  private deflate: DeflateRaw;

  constructor(level: number) {
    super();
    this.deflate = createDeflateRaw({ level });

    // Forward data from deflate to this transform
    this.deflate.on("data", chunk => {
      this.push(chunk);
    });

    this.deflate.on("error", err => {
      this.destroy(err);
    });
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    // Write to deflate
    this.deflate.write(chunk, writeErr => {
      if (writeErr) {
        callback(writeErr);
        return;
      }

      // Explicitly flush to ensure data is emitted NOW, not later
      this.deflate.flush(constants.Z_SYNC_FLUSH, () => {
        callback();
      });
    });
  }

  _flush(callback: TransformCallback): void {
    // End the deflate stream with Z_FINISH to write proper termination
    // This is critical - Z_SYNC_FLUSH doesn't write the final block marker
    this.deflate.flush(constants.Z_FINISH, () => {
      this.deflate.end(() => {
        callback();
      });
    });
  }
}

/**
 * Create a true streaming DEFLATE compressor
 * Returns a Transform stream that emits compressed data immediately after each write
 */
export function createDeflateStream(options: StreamCompressOptions = {}): DeflateStream {
  return new TrueStreamingDeflate(options.level ?? DEFAULT_COMPRESS_LEVEL);
}

/**
 * Create a true streaming INFLATE decompressor
 */
export function createInflateStream(): InflateStream {
  return createInflateRaw();
}

/**
 * Check if true streaming deflate-raw is available
 * In Node.js, zlib is always available, so this always returns true
 */
export function hasDeflateRaw(): boolean {
  return true;
}
