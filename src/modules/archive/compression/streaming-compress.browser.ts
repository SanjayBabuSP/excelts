/**
 * Browser True Streaming Compression
 *
 * Uses native CompressionStream("deflate-raw") for real chunk-by-chunk streaming.
 * Falls back to buffered compression if not supported.
 *
 * Worker Pool: Optional off-main-thread streaming compression/decompression
 * to prevent UI blocking.
 *
 * API compatible with Node.js version - supports .on("data"), .on("end"), .write(callback), .end()
 */

import { EventEmitter } from "@stream";
import { deflateRawCompressed, inflateRaw } from "@archive/compression/deflate-fallback";
import { hasDeflateRawWebStreams } from "@archive/compression/compress.base";
import { concatUint8Arrays } from "@stream/shared";
import { DEFAULT_COMPRESS_LEVEL } from "@archive/shared/defaults";
import type { WorkerPool, WorkerTaskType } from "@archive/compression/worker-pool/index.browser";
import {
  hasWorkerSupport,
  getDefaultWorkerPool
} from "@archive/compression/worker-pool/index.browser";

export type {
  DeflateStream,
  InflateStream,
  StreamingCodec,
  StreamCompressOptions
} from "@archive/compression/streaming-compress.base";
import {
  asError,
  type DeflateStream,
  type InflateStream,
  type StreamCallback,
  type StreamCompressOptions
} from "@archive/compression/streaming-compress.base";

export { hasWorkerSupport };

/** Shared error message constant */
const WRITE_AFTER_END_ERROR = "write after end";

/** Helper to handle errors with optional callback */
function handleError(emitter: EventEmitter, err: unknown, callback?: StreamCallback): void {
  const error = asError(err);
  if (callback) {
    callback(error);
  } else {
    emitter.emit("error", error);
  }
}

/**
 * Check if deflate-raw streaming compression is supported by this library.
 */
export function hasDeflateRaw(): boolean {
  return true;
}

// =============================================================================
// Base Codec - shared write/end/destroy lifecycle
// =============================================================================

/**
 * Async codec interface - abstracted write/end/close operations.
 */
interface AsyncCodecBackend {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(err?: Error): void;
}

/**
 * Base streaming codec with unified lifecycle management.
 * Backend can emit events via the returned codec reference.
 */
class AsyncStreamCodec extends EventEmitter {
  private ended = false;
  private destroyed = false;
  private writeChain: Promise<void> = Promise.resolve();
  private _backend: AsyncCodecBackend | null = null;

  setBackend(backend: AsyncCodecBackend): void {
    this._backend = backend;
  }

  private get backend(): AsyncCodecBackend {
    if (!this._backend) {
      throw new Error("Backend not initialized");
    }
    return this._backend;
  }

  write(chunk: Uint8Array, callback?: StreamCallback): boolean {
    if (this.ended) {
      handleError(this, new Error(WRITE_AFTER_END_ERROR), callback);
      return false;
    }

    const promise = this.writeChain.then(() => this.backend.write(chunk));
    this.writeChain = promise;

    promise
      .then(() => {
        if (!this.destroyed) {
          callback?.();
        }
      })
      .catch(err => {
        if (!this.destroyed) {
          handleError(this, err, callback);
        }
      });

    return true;
  }

  end(callback?: StreamCallback): void {
    if (this.ended) {
      callback?.();
      return;
    }
    this.ended = true;

    void this.writeChain
      .then(() => this.backend.close())
      .then(() => callback?.())
      .catch(err => handleError(this, err, callback));
  }

  destroy(err?: Error): void {
    this.ended = true;
    this.destroyed = true;
    this._backend?.abort(err);
    if (err) {
      this.emit("error", err);
    }
  }
}

// =============================================================================
// WebStream Codec - uses native CompressionStream/DecompressionStream
// =============================================================================

function createWebStreamCodec(type: "deflate" | "inflate"): DeflateStream | InflateStream {
  const stream =
    type === "deflate"
      ? new CompressionStream("deflate-raw")
      : new DecompressionStream("deflate-raw");
  const writer = stream.writable.getWriter() as WritableStreamDefaultWriter<Uint8Array>;
  const reader = stream.readable.getReader();

  const codec = new AsyncStreamCodec();
  codec.setBackend({
    write: chunk => writer.write(chunk),
    close: async () => {
      await writer.close();
      // Drain remaining data
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          codec.emit("data", value);
        }
      }
      codec.emit("end");
    },
    abort: err => {
      try {
        reader.cancel(err);
      } catch {
        /* ignore */
      }
      try {
        writer.abort(err);
      } catch {
        /* ignore */
      }
    }
  });

  // Start async read loop
  void (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          codec.emit("data", value);
        }
      }
    } catch (err) {
      codec.emit("error", asError(err));
    }
  })();

  return codec;
}

// =============================================================================
// Worker Codec - uses WorkerPool.openStream for true streaming in worker
// =============================================================================

function createWorkerStreamCodec(
  type: WorkerTaskType,
  pool: WorkerPool | undefined,
  level: number | undefined,
  allowTransfer: boolean | undefined
): DeflateStream | InflateStream {
  const effectivePool = pool ?? getDefaultWorkerPool();

  let endResolve: (() => void) | null = null;
  let endReject: ((err: Error) => void) | null = null;
  const endPromise = new Promise<void>((resolve, reject) => {
    endResolve = resolve;
    endReject = reject;
  });

  const codec = new AsyncStreamCodec();
  const workerStream = effectivePool.openStream(type, {
    level,
    allowTransfer,
    onData: chunk => codec.emit("data", chunk),
    onEnd: () => {
      codec.emit("end");
      endResolve?.();
    },
    onError: err => {
      codec.emit("error", err);
      endReject?.(err);
    }
  });

  codec.setBackend({
    write: chunk => workerStream.write(chunk),
    close: async () => {
      await workerStream.end();
      await endPromise;
    },
    abort: err => {
      endResolve?.();
      workerStream.abort(err?.message);
    }
  });

  return codec;
}

// =============================================================================
// Buffered Codec - fallback when no native streaming available
// =============================================================================

class BufferedCodec extends EventEmitter {
  private readonly chunks: Uint8Array[] = [];
  private ended = false;

  constructor(private readonly process: (data: Uint8Array) => Uint8Array) {
    super();
  }

  write(chunk: Uint8Array, callback?: StreamCallback): boolean {
    if (this.ended) {
      handleError(this, new Error(WRITE_AFTER_END_ERROR), callback);
      return false;
    }

    this.chunks.push(chunk);
    if (callback) {
      queueMicrotask(() => callback());
    }
    return true;
  }

  end(callback?: StreamCallback): void {
    if (this.ended) {
      callback?.();
      return;
    }
    this.ended = true;

    const data = this.chunks.length === 1 ? this.chunks[0] : concatUint8Arrays(this.chunks);
    this.chunks.length = 0;

    try {
      const result = this.process(data);
      this.emit("data", result);
      this.emit("end");
      callback?.();
    } catch (err) {
      handleError(this, err, callback);
    }
  }

  destroy(err?: Error): void {
    this.ended = true;
    this.chunks.length = 0;
    if (err) {
      this.emit("error", err);
    }
  }
}

// =============================================================================
// Factory - select best codec based on environment and options
// =============================================================================

function createStreamCodec(
  type: "deflate" | "inflate",
  options: StreamCompressOptions
): DeflateStream | InflateStream {
  const level = type === "deflate" ? (options.level ?? DEFAULT_COMPRESS_LEVEL) : undefined;

  if (options.useWorker && hasWorkerSupport()) {
    return createWorkerStreamCodec(
      type,
      options.workerPool as WorkerPool | undefined,
      level,
      options.allowTransfer
    );
  }

  if (hasDeflateRawWebStreams()) {
    return createWebStreamCodec(type);
  }

  return new BufferedCodec(type === "deflate" ? deflateRawCompressed : inflateRaw);
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Create a streaming DEFLATE compressor
 */
export function createDeflateStream(options: StreamCompressOptions = {}): DeflateStream {
  return createStreamCodec("deflate", options);
}

/**
 * Create a streaming INFLATE decompressor
 */
export function createInflateStream(options: StreamCompressOptions = {}): InflateStream {
  return createStreamCodec("inflate", options);
}
