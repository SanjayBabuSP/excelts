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

// Node.js file system convenience layer
export {
  ZipFile,
  traverseDirectory,
  traverseDirectorySync,
  glob,
  globSync,
  globToRegex,
  matchGlob,
  matchGlobAny,
  ensureDir,
  ensureDirSync,
  fileExists,
  fileExistsSync,
  readFileBytes,
  readFileBytesSync,
  writeFileBytes,
  writeFileBytesSync,
  setFileTime,
  setFileTimeSync,
  safeStats,
  safeStatsSync,
  readFileText,
  readFileTextSync,
  writeFileText,
  writeFileTextSync,
  remove,
  removeSync,
  copyFile,
  copyFileSync,
  createReadStream,
  createWriteStream,
  createTempDir,
  createTempDirSync,
  type FileEntry,
  type TraverseOptions,
  type GlobOptions,
  type ReadStreamOptions,
  type WriteStreamOptions,
  type OverwriteStrategy,
  type AddFileOptions,
  type AddDirectoryOptions,
  type AddGlobOptions,
  type ExtractOptions,
  type ExtractProgress,
  type ZipFileOptions,
  type OpenZipOptions,
  type WriteZipOptions,
  type ZipEntryInfo
} from "@archive/fs";
