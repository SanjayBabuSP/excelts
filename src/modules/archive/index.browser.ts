/**
 * Archive (ZIP) module - unified ZIP + Unzip implementation (browser type surface).
 *
 * This file mirrors [src/modules/archive/index.ts] but explicitly re-exports
 * browser-specific implementations so we can enforce export-surface parity.
 */

export * from "@archive/index.base";

// CRC32
export { crc32, crc32Update, crc32Finalize } from "@archive/compression/crc32.browser";

// Compression
export {
  compress,
  compressSync,
  decompress,
  decompressSync,
  hasCompressionStream,
  hasWorkerSupport,
  type CompressOptions
} from "@archive/compression/compress.browser";

// Streaming compression
export {
  createDeflateStream,
  createInflateStream,
  hasDeflateRaw,
  type StreamCompressOptions
} from "@archive/compression/streaming-compress.browser";

// Worker Pool
export {
  WorkerPool,
  getDefaultWorkerPool,
  terminateDefaultWorkerPool,
  deflateWithPool,
  inflateWithPool,
  deflateBatchWithPool,
  inflateBatchWithPool,
  type WorkerPoolOptions,
  type WorkerPoolStats,
  type TaskOptions,
  type TaskResult,
  type WorkerTaskType
} from "@archive/compression/worker-pool/index.browser";
