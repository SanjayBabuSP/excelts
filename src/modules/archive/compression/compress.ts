/**
 * Node.js compression utilities using native zlib
 *
 * Uses zlib module (C++ implementation, fastest) with "deflate-raw" format
 * (raw DEFLATE without zlib header/trailer, required for ZIP files)
 */

import { promisify } from "util";
import * as zlib from "zlib";

import { DEFAULT_COMPRESS_LEVEL } from "@archive/defaults";

// Re-export shared types and utilities
export { type CompressOptions, hasCompressionStream } from "@archive/compression/compress.base";

import type { CompressOptions } from "@archive/compression/compress.base";

function uint8ArrayToBufferView(data: Uint8Array): Buffer {
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
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
    const result = zlib.deflateRawSync(uint8ArrayToBufferView(data), { level });
    return new Uint8Array(result.buffer, result.byteOffset, result.byteLength);
  }

  const result = await deflateRawAsync(uint8ArrayToBufferView(data), { level });
  return new Uint8Array(result.buffer, result.byteOffset, result.byteLength);
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

  const result = zlib.deflateRawSync(uint8ArrayToBufferView(data), { level });
  return new Uint8Array(result.buffer, result.byteOffset, result.byteLength);
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
    const result = zlib.inflateRawSync(uint8ArrayToBufferView(data));
    return new Uint8Array(result.buffer, result.byteOffset, result.byteLength);
  }

  const result = await inflateRawAsync(uint8ArrayToBufferView(data));
  return new Uint8Array(result.buffer, result.byteOffset, result.byteLength);
}

/**
 * Decompress data synchronously using Node.js zlib
 *
 * @param data - Compressed data (deflate-raw format)
 * @returns Decompressed data
 */
export function decompressSync(data: Uint8Array): Uint8Array {
  const result = zlib.inflateRawSync(uint8ArrayToBufferView(data));
  return new Uint8Array(result.buffer, result.byteOffset, result.byteLength);
}
