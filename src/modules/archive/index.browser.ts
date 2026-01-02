/**
 * Archive (ZIP) module - unified ZIP + Unzip implementation (browser type surface).
 *
 * This file mirrors [src/modules/archive/index.ts] but explicitly re-exports
 * browser-specific implementations so we can enforce export-surface parity.
 */

export * from "@archive/index.base";

// CRC32
export { crc32, crc32Update, crc32Finalize } from "@archive/crc32.browser";

// Compression
export {
  compress,
  compressSync,
  decompress,
  decompressSync,
  hasCompressionStream,
  type CompressOptions
} from "@archive/compress.browser";

// Streaming compression
export {
  createDeflateStream,
  createInflateStream,
  hasDeflateRaw,
  type StreamCompressOptions
} from "@archive/streaming-compress.browser";

// Stream-based unzip API (browser implementation)
export {
  Parse,
  createParse,
  type ParseOptions,
  type ZipEntry as StreamZipEntry
} from "@archive/parse.browser";

// Buffer-based unzip API (cross-platform)
// (re-exported from ./index.base)
