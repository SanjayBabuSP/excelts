/**
 * Browser compression utilities
 *
 * Supports multiple formats:
 * - deflate-raw: Raw DEFLATE (for ZIP files)
 * - gzip: GZIP format (for tar.gz, HTTP compression)
 *
 * Primary: CompressionStream API (Chrome 103+, Firefox 113+, Safari 16.4+)
 * Fallback: Pure JS DEFLATE implementation for older browsers
 *
 * Worker Pool: Optional off-main-thread compression/decompression
 * to prevent UI blocking for large files.
 */

import { concatUint8Arrays } from "@stream/shared";
import {
  type CompressOptions,
  compressWithStream,
  decompressWithStream,
  transformWithStream,
  hasCompressionStream,
  hasDeflateRawCompressionStream,
  hasDeflateRawDecompressionStream,
  // GZIP
  GZIP_ID1,
  GZIP_ID2,
  GZIP_CM_DEFLATE,
  GZIP_FLAG_FEXTRA,
  GZIP_FLAG_FNAME,
  GZIP_FLAG_FCOMMENT,
  GZIP_FLAG_FHCRC,
  GZIP_MIN_SIZE,
  hasGzipCompressionStream,
  hasGzipDecompressionStream
} from "@archive/compression/compress.base";
import {
  inflateRaw,
  deflateRawCompressed,
  deflateRawStore
} from "@archive/compression/deflate-fallback";
import { DEFAULT_COMPRESS_LEVEL } from "@archive/shared/defaults";
import { createAbortError, isAbortError, throwIfAborted } from "@archive/shared/errors";
import {
  deflateWithPool,
  inflateWithPool,
  hasWorkerSupport
} from "@archive/compression/worker-pool/index.browser";
import { crc32 } from "@archive/compression/crc32.browser";
import { readUint32LE } from "@archive/zip-spec/binary";

// Re-export shared types and GZIP utilities
export { type CompressOptions };
export {
  hasCompressionStream,
  hasWorkerSupport,
  // GZIP
  GZIP_ID1,
  GZIP_ID2,
  GZIP_CM_DEFLATE,
  GZIP_MIN_SIZE,
  hasGzipCompressionStream,
  hasGzipDecompressionStream
};
export { isGzipData } from "@archive/compression/compress.base";

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
 * Check if an error or signal indicates an abort. Rethrow as AbortError if so.
 */
function rethrowIfAborted(err: unknown, signal?: AbortSignal): void {
  if (signal?.aborted || isAbortError(err)) {
    throw createAbortError((signal as any)?.reason ?? err);
  }
}

// =============================================================================
// Unified Codec Strategy
// =============================================================================

interface CodecStrategy {
  hasNative: () => boolean;
  native: (data: Uint8Array) => Promise<Uint8Array>;
  worker: (
    data: Uint8Array,
    opts: { level?: number; signal?: AbortSignal; allowTransfer?: boolean }
  ) => Promise<Uint8Array>;
  jsFallback: (data: Uint8Array) => Uint8Array;
}

const deflateStrategy: CodecStrategy = {
  hasNative: hasDeflateRawCompressionStream,
  native: compressWithStream,
  worker: deflateWithPool,
  jsFallback: deflateRawCompressed
};

const inflateStrategy: CodecStrategy = {
  hasNative: hasDeflateRawDecompressionStream,
  native: decompressWithStream,
  worker: inflateWithPool,
  jsFallback: inflateRaw
};

/**
 * Unified compression/decompression with automatic strategy selection.
 */
async function processWithStrategy(
  strategy: CodecStrategy,
  data: Uint8Array,
  options: CompressOptions
): Promise<Uint8Array> {
  const canUseNative = strategy.hasNative();

  // If the user explicitly requested workers, honor it.
  if (options.useWorker === true && hasWorkerSupport()) {
    try {
      return await strategy.worker(data, {
        level: options.level,
        signal: options.signal,
        allowTransfer: options.allowTransfer
      });
    } catch (err) {
      // If the user aborts, do NOT fall back to main-thread work.
      rethrowIfAborted(err, options.signal);
      // Fall through to best available in-process path.
    }
  }

  // Default: use native stream if supported (fastest, no worker overhead).
  if (canUseNative) {
    return strategy.native(data);
  }

  // Use worker in fallback environments (no native deflate-raw) when appropriate.
  if (shouldUseWorker(data, options)) {
    return strategy.worker(data, {
      level: options.level,
      signal: options.signal,
      allowTransfer: options.allowTransfer
    });
  }

  // Fallback to pure JS implementation.
  return strategy.jsFallback(data);
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Compress data using browser's native CompressionStream or JS fallback
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

  return processWithStrategy(deflateStrategy, data, { ...options, level });
}

/**
 * Compress data synchronously using pure JS implementation
 */
export function compressSync(data: Uint8Array, options: CompressOptions = {}): Uint8Array {
  const level = options.level ?? DEFAULT_COMPRESS_LEVEL;
  if (level === 0) {
    return data;
  }
  return deflateRawCompressed(data);
}

/**
 * Decompress data using browser's native DecompressionStream or JS fallback
 */
export async function decompress(
  data: Uint8Array,
  options: CompressOptions = {}
): Promise<Uint8Array> {
  return processWithStrategy(inflateStrategy, data, options);
}

/**
 * Decompress data synchronously using pure JS implementation
 */
export function decompressSync(data: Uint8Array): Uint8Array {
  return inflateRaw(data);
}

// =============================================================================
// GZIP API
// =============================================================================

// Cached GZIP header: ID1, ID2, CM=DEFLATE, FLG=0, MTIME=0, XFL=0, OS=unknown
const GZIP_HEADER = new Uint8Array([GZIP_ID1, GZIP_ID2, GZIP_CM_DEFLATE, 0, 0, 0, 0, 0, 0, 255]);

function buildGzipTrailer(crcValue: number, size: number): Uint8Array {
  const trailer = new Uint8Array(8);
  const view = new DataView(trailer.buffer, trailer.byteOffset, trailer.byteLength);
  view.setUint32(0, crcValue >>> 0, true);
  view.setUint32(4, size >>> 0, true);
  return trailer;
}

function parseGzipPayload(data: Uint8Array): {
  deflateData: Uint8Array;
  expectedCrc32: number;
  expectedSize: number;
} {
  if (data.length < GZIP_MIN_SIZE) {
    throw new Error("Invalid gzip data (too small)");
  }
  if (data[0] !== GZIP_ID1 || data[1] !== GZIP_ID2) {
    throw new Error("Invalid gzip header (magic mismatch)");
  }
  if (data[2] !== GZIP_CM_DEFLATE) {
    throw new Error("Unsupported gzip compression method");
  }

  const flags = data[3];
  let offset = 10;

  if (flags & GZIP_FLAG_FEXTRA) {
    if (offset + 2 > data.length) {
      throw new Error("Invalid gzip extra field");
    }
    const extraLen = data[offset] | (data[offset + 1] << 8);
    offset += 2 + extraLen;
  }

  // Skip null-terminated strings
  const skipNullTerminated = () => {
    while (offset < data.length && data[offset] !== 0) {
      offset++;
    }
    offset++;
  };

  if (flags & GZIP_FLAG_FNAME) {
    skipNullTerminated();
  }
  if (flags & GZIP_FLAG_FCOMMENT) {
    skipNullTerminated();
  }

  if (flags & GZIP_FLAG_FHCRC) {
    offset += 2;
  }

  if (offset > data.length - 8) {
    throw new Error("Invalid gzip data (truncated payload)");
  }

  const trailerOffset = data.length - 8;
  const expectedCrc32 = readUint32LE(data, trailerOffset);
  const expectedSize = readUint32LE(data, trailerOffset + 4);
  const deflateData = data.subarray(offset, trailerOffset);

  return { deflateData, expectedCrc32, expectedSize };
}

/**
 * Verify decompressed data against GZIP trailer CRC32 and ISIZE
 */
function verifyGzipOutput(out: Uint8Array, expectedCrc32: number, expectedSize: number): void {
  const actualCrc32 = crc32(out) >>> 0;
  const actualSize = out.length >>> 0;

  if (actualCrc32 !== expectedCrc32) {
    throw new Error("Invalid gzip data (CRC32 mismatch)");
  }
  if (actualSize !== expectedSize) {
    throw new Error("Invalid gzip data (ISIZE mismatch)");
  }
}

function wrapGzip(deflated: Uint8Array, original: Uint8Array): Uint8Array {
  const trailer = buildGzipTrailer(crc32(original), original.length);
  return concatUint8Arrays([GZIP_HEADER, deflated, trailer]);
}

/**
 * Gzip-compress data in the browser.
 *
 * Strategy:
 * 1. Native CompressionStream("gzip") when available
 * 2. Fallback: compress (deflate-raw) + manual GZIP wrapper
 *    - Inherits Worker Pool support from compress() for large files
 */
export async function gzip(data: Uint8Array, options: CompressOptions = {}): Promise<Uint8Array> {
  throwIfAborted(options.signal);

  if (hasGzipCompressionStream()) {
    const cs = new CompressionStream("gzip");
    const out = await transformWithStream(data, cs);
    throwIfAborted(options.signal);
    return out;
  }

  const level = options.level ?? DEFAULT_COMPRESS_LEVEL;
  const deflated =
    level === 0 ? deflateRawStore(data) : await compress(data, { ...options, level });
  return wrapGzip(deflated, data);
}

/**
 * Gzip-compress data synchronously using the JS fallback.
 */
export function gzipSync(data: Uint8Array, options: CompressOptions = {}): Uint8Array {
  const level = options.level ?? DEFAULT_COMPRESS_LEVEL;
  const deflated = level === 0 ? deflateRawStore(data) : deflateRawCompressed(data);
  return wrapGzip(deflated, data);
}

/**
 * Gunzip data in the browser.
 *
 * Strategy:
 * 1. Native DecompressionStream("gzip") when available
 * 2. Fallback: parse header + decompress (inflate-raw) + verify CRC32
 *    - Inherits Worker Pool support from decompress() for large files
 */
export async function gunzip(data: Uint8Array, options: CompressOptions = {}): Promise<Uint8Array> {
  throwIfAborted(options.signal);

  if (hasGzipDecompressionStream()) {
    const ds = new DecompressionStream("gzip");
    const out = await transformWithStream(data, ds);
    throwIfAborted(options.signal);
    return out;
  }

  const { deflateData, expectedCrc32, expectedSize } = parseGzipPayload(data);
  const out = await decompress(deflateData, options);
  verifyGzipOutput(out, expectedCrc32, expectedSize);
  return out;
}

/**
 * Gunzip data synchronously using the JS fallback.
 */
export function gunzipSync(data: Uint8Array): Uint8Array {
  const { deflateData, expectedCrc32, expectedSize } = parseGzipPayload(data);
  const out = inflateRaw(deflateData);
  verifyGzipOutput(out, expectedCrc32, expectedSize);
  return out;
}
