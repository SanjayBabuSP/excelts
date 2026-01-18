/**
 * Browser compression utilities
 *
 * Primary: CompressionStream API (Chrome 103+, Firefox 113+, Safari 16.4+)
 * Fallback: Pure JS DEFLATE implementation for older browsers
 *
 * Worker Pool: Optional off-main-thread compression/decompression
 * to prevent UI blocking for large files.
 *
 * Supported browsers with fallback:
 * - Chrome >= 89
 * - Firefox >= 102
 * - Safari >= 14.1
 * - Edge >= 89
 */

import {
  type CompressOptions,
  compressWithStream,
  decompressWithStream,
  hasCompressionStream,
  hasDeflateRawCompressionStream,
  hasDeflateRawDecompressionStream
} from "@archive/compression/compress.base";
import { inflateRaw, deflateRawCompressed } from "@archive/compression/deflate-fallback";
import { DEFAULT_COMPRESS_LEVEL } from "@archive/defaults";
import {
  deflateWithPool,
  inflateWithPool,
  hasWorkerSupport
} from "@archive/compression/worker-pool/index.browser";

// Re-export shared types
export { type CompressOptions };

export { hasCompressionStream, hasWorkerSupport };

/**
 * Default threshold (1MB) above which compression automatically uses workers.
 * Set to 0 to disable auto-worker, or Infinity to always use main thread.
 */
const DEFAULT_AUTO_WORKER_THRESHOLD = 1024 * 1024;

export { DEFAULT_AUTO_WORKER_THRESHOLD };

/**
 * Decide whether to use worker based on options and data size
 */
function shouldUseWorker(data: Uint8Array, options: CompressOptions): boolean {
  if (options.useWorker === true) {
    return hasWorkerSupport();
  }
  if (options.useWorker === false) {
    return false;
  }

  const threshold = options.autoWorkerThreshold ?? DEFAULT_AUTO_WORKER_THRESHOLD;
  return hasWorkerSupport() && data.length >= threshold;
}

/**
 * Compress data using browser's native CompressionStream or JS fallback
 *
 * @param data - Data to compress
 * @param options - Compression options
 *   - useWorker: true = always use worker, false = never use worker, undefined = auto
 *   - autoWorkerThreshold: size threshold for auto-worker (default 1MB)
 * @returns Compressed data
 */
export async function compress(
  data: Uint8Array,
  options: CompressOptions = {}
): Promise<Uint8Array> {
  const level = options.level ?? DEFAULT_COMPRESS_LEVEL;

  // Level 0 means no compression
  if (level === 0) {
    return data;
  }

  // Use worker if appropriate
  if (shouldUseWorker(data, options)) {
    return deflateWithPool(data, {
      level,
      signal: options.signal,
      allowTransfer: options.allowTransfer
    });
  }

  // Always use native CompressionStream when available - it's much faster than JS
  if (hasDeflateRawCompressionStream()) {
    return compressWithStream(data);
  }

  // Fallback to pure JS implementation only when native is unavailable
  return deflateRawCompressed(data);
}

/**
 * Compress data synchronously using pure JS implementation
 *
 * @param data - Data to compress
 * @param options - Compression options
 * @returns Compressed data
 */
export function compressSync(data: Uint8Array, options: CompressOptions = {}): Uint8Array {
  const level = options.level ?? DEFAULT_COMPRESS_LEVEL;

  // Level 0 means no compression
  if (level === 0) {
    return data;
  }

  // Pure JS implementation
  return deflateRawCompressed(data);
}

/**
 * Decompress data using browser's native DecompressionStream or JS fallback
 *
 * @param data - Compressed data (deflate-raw format)
 * @param options - Decompression options
 *   - useWorker: true = always use worker, false = never use worker, undefined = auto
 *   - autoWorkerThreshold: size threshold for auto-worker (default 1MB)
 * @returns Decompressed data
 */
export async function decompress(
  data: Uint8Array,
  options: CompressOptions = {}
): Promise<Uint8Array> {
  // Use worker if appropriate
  if (shouldUseWorker(data, options)) {
    return inflateWithPool(data, {
      signal: options.signal,
      allowTransfer: options.allowTransfer
    });
  }

  // Always use native DecompressionStream when available - it's much faster than JS
  if (hasDeflateRawDecompressionStream()) {
    return decompressWithStream(data);
  }

  // Fallback to pure JS implementation only when native is unavailable
  return inflateRaw(data);
}

/**
 * Decompress data synchronously using pure JS implementation
 *
 * @param data - Compressed data (deflate-raw format)
 * @returns Decompressed data
 */
export function decompressSync(data: Uint8Array): Uint8Array {
  return inflateRaw(data);
}
