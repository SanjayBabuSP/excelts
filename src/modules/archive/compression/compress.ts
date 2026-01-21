/**
 * Node.js compression utilities using native zlib
 *
 * Supports multiple formats:
 * - deflate-raw: Raw DEFLATE (for ZIP files)
 * - gzip: GZIP format (for tar.gz, HTTP compression)
 */

import { promisify } from "util";
import * as zlib from "zlib";

import { DEFAULT_COMPRESS_LEVEL } from "@archive/shared/defaults";

// Re-export shared types and utilities
export {
  type CompressOptions,
  hasCompressionStream,
  // GZIP constants and utilities
  GZIP_ID1,
  GZIP_ID2,
  GZIP_CM_DEFLATE,
  GZIP_FLAG_FTEXT,
  GZIP_FLAG_FHCRC,
  GZIP_FLAG_FEXTRA,
  GZIP_FLAG_FNAME,
  GZIP_FLAG_FCOMMENT,
  GZIP_MIN_SIZE,
  isGzipData,
  hasGzipCompressionStream,
  hasGzipDecompressionStream
} from "@archive/compression/compress.base";

import type { CompressOptions } from "@archive/compression/compress.base";

/**
 * Check if Web Workers are available.
 * Always returns false in Node.js (zlib uses native thread pool).
 */
export function hasWorkerSupport(): boolean {
  return false;
}

/** Convert Uint8Array to Node.js Buffer (zero-copy view) */
export function uint8ArrayToBuffer(data: Uint8Array): Buffer {
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

/** Convert Node.js Buffer to Uint8Array (zero-copy view) */
export function bufferToUint8Array(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

const deflateRawAsync = promisify(zlib.deflateRaw) as (
  input: zlib.InputType,
  options?: zlib.ZlibOptions
) => Promise<Buffer>;

const inflateRawAsync = promisify(zlib.inflateRaw) as (input: zlib.InputType) => Promise<Buffer>;

import { resolveCompressThresholdBytes } from "@archive/compression/compress.base";

/**
 * Compress data using Node.js native zlib
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
  const thresholdBytes = resolveCompressThresholdBytes(options);

  // Level 0 means no compression
  if (level === 0) {
    return data;
  }

  // Small-input fast path: avoid threadpool overhead.
  if (data.byteLength <= thresholdBytes) {
    return bufferToUint8Array(zlib.deflateRawSync(uint8ArrayToBuffer(data), { level }));
  }

  return bufferToUint8Array(await deflateRawAsync(uint8ArrayToBuffer(data), { level }));
}

/**
 * Compress data synchronously using Node.js zlib
 *
 * @param data - Data to compress
 * @param options - Compression options
 * @returns Compressed data
 */
export function compressSync(data: Uint8Array, options: CompressOptions = {}): Uint8Array {
  const level = options.level ?? DEFAULT_COMPRESS_LEVEL;

  if (level === 0) {
    return data;
  }

  return bufferToUint8Array(zlib.deflateRawSync(uint8ArrayToBuffer(data), { level }));
}

/**
 * Decompress data using Node.js native zlib
 *
 * @param data - Compressed data (deflate-raw format)
 * @returns Decompressed data
 */
export async function decompress(
  data: Uint8Array,
  options: CompressOptions = {}
): Promise<Uint8Array> {
  const thresholdBytes = resolveCompressThresholdBytes(options);

  // Small-input fast path: avoid threadpool overhead.
  if (data.byteLength <= thresholdBytes) {
    return bufferToUint8Array(zlib.inflateRawSync(uint8ArrayToBuffer(data)));
  }

  return bufferToUint8Array(await inflateRawAsync(uint8ArrayToBuffer(data)));
}

/**
 * Decompress data synchronously using Node.js zlib
 *
 * @param data - Compressed data (deflate-raw format)
 * @returns Decompressed data
 */
export function decompressSync(data: Uint8Array): Uint8Array {
  return bufferToUint8Array(zlib.inflateRawSync(uint8ArrayToBuffer(data)));
}

// =============================================================================
// GZIP API
// =============================================================================

const gzipAsync = promisify(zlib.gzip) as (
  input: zlib.InputType,
  options?: zlib.ZlibOptions
) => Promise<Buffer>;

const gunzipAsync = promisify(zlib.gunzip) as (input: zlib.InputType) => Promise<Buffer>;

/**
 * Compress data with gzip
 */
export async function gzip(data: Uint8Array, options: CompressOptions = {}): Promise<Uint8Array> {
  const level = options.level ?? DEFAULT_COMPRESS_LEVEL;
  const thresholdBytes = resolveCompressThresholdBytes(options);

  // Small-input fast path
  if (data.byteLength <= thresholdBytes) {
    return bufferToUint8Array(zlib.gzipSync(uint8ArrayToBuffer(data), { level }));
  }

  return bufferToUint8Array(await gzipAsync(uint8ArrayToBuffer(data), { level }));
}

/**
 * Decompress gzip data
 */
export async function gunzip(data: Uint8Array, options: CompressOptions = {}): Promise<Uint8Array> {
  const thresholdBytes = resolveCompressThresholdBytes(options);

  // Small-input fast path
  if (data.byteLength <= thresholdBytes) {
    return bufferToUint8Array(zlib.gunzipSync(uint8ArrayToBuffer(data)));
  }

  return bufferToUint8Array(await gunzipAsync(uint8ArrayToBuffer(data)));
}

/**
 * Compress data with gzip (sync)
 */
export function gzipSync(data: Uint8Array, options: CompressOptions = {}): Uint8Array {
  const level = options.level ?? DEFAULT_COMPRESS_LEVEL;
  return bufferToUint8Array(zlib.gzipSync(uint8ArrayToBuffer(data), { level }));
}

/**
 * Decompress gzip data (sync)
 */
export function gunzipSync(data: Uint8Array): Uint8Array {
  return bufferToUint8Array(zlib.gunzipSync(uint8ArrayToBuffer(data)));
}
