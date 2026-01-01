/**
 * Archive (ZIP) module - unified ZIP + Unzip implementation.
 *
 * This module is intended to be extractable as a standalone package.
 * It groups all ZIP creation and extraction utilities in one place.
 */

export * from "./index.base";

// CRC32
export { crc32, crc32Update, crc32Finalize } from "./crc32";

// Compression
export {
  compress,
  compressSync,
  decompress,
  decompressSync,
  hasCompressionStream,
  type CompressOptions
} from "./compress";

// Streaming compression
export {
  createDeflateStream,
  createInflateStream,
  hasDeflateRaw,
  type StreamCompressOptions
} from "./streaming-compress";

// Stream-based unzip API (Node.js; browser build aliases to ./parse.browser.ts)
export { Parse, createParse, type ParseOptions, type ZipEntry as StreamZipEntry } from "./parse";
