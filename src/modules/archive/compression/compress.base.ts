/**
 * Base compression utilities using Web Streams API
 * Shared between Node.js and Browser implementations
 *
 * Uses CompressionStream/DecompressionStream API with "deflate-raw" format
 * (raw DEFLATE without zlib header/trailer, required for ZIP files)
 *
 * Browser fallback: For browsers without deflate-raw support (Firefox < 113, Safari < 16.4),
 * see deflate-fallback.ts for pure JS implementation
 */

import { ByteQueue } from "@archive/internal/byte-queue";

/**
 * Compression options
 */
export interface CompressOptions {
  /**
   * Compression level (0-9)
   * - 0: No compression (STORE)
   * - 1: Fastest compression
   * - 6: Default compression (good balance)
   * - 9: Best compression (slowest)
   *
   * Note: CompressionStream does not support level configuration,
   * it uses a fixed level (~6)
   */
  level?: number;

  /**
   * Threshold (in bytes) to choose the lower-overhead path.
   *
   * - Node.js: inputs <= threshold use sync zlib fast-path (avoid threadpool overhead)
   * - Browser: inputs <= threshold use the pure-JS fallback (avoid stream scheduling overhead)
   */
  thresholdBytes?: number;
}

/**
 * Default threshold (in bytes) to choose the lower-overhead path.
 *
 * This is a performance knob, not a correctness requirement.
 * Default: 8MB.
 */
export const DEFAULT_COMPRESS_THRESHOLD_BYTES = 8 * 1024 * 1024;

/**
 * Resolve the effective threshold bytes.
 */
export function resolveCompressThresholdBytes(options: CompressOptions): number {
  const value = options.thresholdBytes;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return DEFAULT_COMPRESS_THRESHOLD_BYTES;
  }
  return value;
}

/**
 * Check if CompressionStream is available
 */
export function hasCompressionStream(): boolean {
  return typeof CompressionStream !== "undefined";
}

/**
 * Non-cached probe for CompressionStream("deflate-raw") support.
 *
 * Prefer this in code paths that want up-to-date environment checks
 * (e.g. tests that stub globals).
 */
export function probeDeflateRawCompressionStream(): boolean {
  try {
    if (typeof CompressionStream === "undefined") {
      return false;
    }
    new CompressionStream("deflate-raw");
    return true;
  } catch {
    return false;
  }
}

/**
 * Non-cached probe for DecompressionStream("deflate-raw") support.
 */
export function probeDeflateRawDecompressionStream(): boolean {
  try {
    if (typeof DecompressionStream === "undefined") {
      return false;
    }
    new DecompressionStream("deflate-raw");
    return true;
  } catch {
    return false;
  }
}

/**
 * Non-cached probe for full deflate-raw Web Streams support.
 *
 * Returns true only if BOTH CompressionStream("deflate-raw") and
 * DecompressionStream("deflate-raw") are supported.
 */
export function probeDeflateRawWebStreams(): boolean {
  return probeDeflateRawCompressionStream() && probeDeflateRawDecompressionStream();
}

let _hasDeflateRawCompressionStream: boolean | null = null;
let _hasDeflateRawDecompressionStream: boolean | null = null;

/**
 * Check if CompressionStream supports the "deflate-raw" format.
 *
 * This is a stricter check than {@link hasCompressionStream} because some
 * environments expose CompressionStream but do not support "deflate-raw".
 */
export function hasDeflateRawCompressionStream(): boolean {
  if (typeof CompressionStream === "undefined") {
    return false;
  }

  if (_hasDeflateRawCompressionStream !== null) {
    return _hasDeflateRawCompressionStream;
  }

  _hasDeflateRawCompressionStream = probeDeflateRawCompressionStream();

  return _hasDeflateRawCompressionStream;
}

/**
 * Check if DecompressionStream supports the "deflate-raw" format.
 */
export function hasDeflateRawDecompressionStream(): boolean {
  if (typeof DecompressionStream === "undefined") {
    return false;
  }

  if (_hasDeflateRawDecompressionStream !== null) {
    return _hasDeflateRawDecompressionStream;
  }

  _hasDeflateRawDecompressionStream = probeDeflateRawDecompressionStream();

  return _hasDeflateRawDecompressionStream;
}

/**
 * Cached check for full deflate-raw Web Streams support.
 *
 * Returns true only if BOTH CompressionStream("deflate-raw") and
 * DecompressionStream("deflate-raw") are supported.
 */
export function hasDeflateRawWebStreams(): boolean {
  return hasDeflateRawCompressionStream() && hasDeflateRawDecompressionStream();
}

async function streamToUint8Array(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<Uint8Array> {
  const out = new ByteQueue();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    out.append(value);
  }

  return out.read(out.length);
}

async function transformWithStream(
  data: Uint8Array,
  stream: CompressionStream | DecompressionStream
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();

  try {
    // Start reading immediately to avoid potential backpressure deadlocks
    // (writer.write/close may wait for the readable side to be consumed).
    const readPromise = streamToUint8Array(reader);

    await writer.write(data as BufferSource);
    await writer.close();

    return await readPromise;
  } finally {
    try {
      writer.releaseLock();
    } catch {
      // ignore
    }
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}

/**
 * Compress using CompressionStream API
 * Uses "deflate-raw" format (required for ZIP files)
 *
 * @param data - Data to compress
 * @returns Compressed data
 */
export async function compressWithStream(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate-raw");
  return transformWithStream(data, cs);
}

/**
 * Decompress using DecompressionStream API
 *
 * @param data - Compressed data (deflate-raw format)
 * @returns Decompressed data
 */
export async function decompressWithStream(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  return transformWithStream(data, ds);
}
