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
import { DEFAULT_COMPRESS_LEVEL } from "@archive/shared/defaults";
import { createAbortError, isAbortError } from "@archive/shared/errors";
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
