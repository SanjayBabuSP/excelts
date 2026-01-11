/**
 * Archive (ZIP) module - unified ZIP + Unzip implementation.
 *
 * This module is intended to be extractable as a standalone package.
 * It groups all ZIP creation and extraction utilities in one place.
 */

export * from "@archive/index.base";

// CRC32
export { crc32, crc32Update, crc32Finalize } from "@archive/compression/crc32";

// Compression
export {
  compress,
  compressSync,
  decompress,
  decompressSync,
  hasCompressionStream,
  type CompressOptions
} from "@archive/compression/compress";

// Streaming compression
export {
  createDeflateStream,
  createInflateStream,
  hasDeflateRaw,
  type StreamCompressOptions
} from "@archive/compression/streaming-compress";
