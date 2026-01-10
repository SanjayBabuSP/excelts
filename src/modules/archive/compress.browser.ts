/**
 * Browser compression utilities
 *
 * Primary: CompressionStream API (Chrome 103+, Firefox 113+, Safari 16.4+)
 * Fallback: Pure JS DEFLATE implementation for older browsers
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
  hasDeflateRawCompressionStream,
  hasDeflateRawDecompressionStream
} from "@archive/compress.base";
import { inflateRaw, deflateRawCompressed } from "@archive/deflate-fallback";
import { DEFAULT_COMPRESS_LEVEL } from "@archive/defaults";

// Re-export shared types
export { type CompressOptions };

/**
 * Check if CompressionStream is available in this environment.
 *
 * Note: Some environments may expose CompressionStream but not support
 * the "deflate-raw" format that ZIP requires.
 */
export function hasCompressionStream(): boolean {
  return typeof CompressionStream !== "undefined";
}

/**
 * Compress data using browser's native CompressionStream or JS fallback
 *
 * Note: We always prefer native CompressionStream when available because
 * it's significantly faster than pure JS implementation.
 *
 * @param data - Data to compress
 * @param options - Compression options
 * @returns Compressed data
 *
 * @example
 * ```ts
 * const data = new TextEncoder().encode("Hello, World!");
 * const compressed = await compress(data, { level: 6 });
 * ```
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
 * Note: We always prefer native DecompressionStream when available because
 * it's significantly faster than pure JS implementation, regardless of data size.
 * The threshold is only useful for compression where the overhead matters more.
 *
 * @param data - Compressed data (deflate-raw format)
 * @returns Decompressed data
 */
export async function decompress(data: Uint8Array): Promise<Uint8Array> {
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
