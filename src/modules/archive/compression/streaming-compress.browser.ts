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
 *
 * In browsers, the library always supports deflate-raw via the JS fallback.
 * Native deflate-raw Web Streams support (CompressionStream/DecompressionStream)
 * is used when available, but is not required.
 */
export function hasDeflateRaw(): boolean {
  return true;
}

class WebStreamCodec extends EventEmitter {
  private readonly writer: WritableStreamDefaultWriter<Uint8Array>;
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly readPromise: Promise<void>;
  private ended = false;

  constructor(
    writer: WritableStreamDefaultWriter<Uint8Array>,
    reader: ReadableStreamDefaultReader<Uint8Array>
  ) {
    super();
    this.writer = writer;
    this.reader = reader;
    this.readPromise = this._startReading();
  }

  private async _startReading(): Promise<void> {
    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) {
          break;
        }
        if (value) {
          this.emit("data", value);
        }
      }
      this.emit("end");
    } catch (err) {
      this.emit("error", asError(err));
    }
  }

  write(chunk: Uint8Array, callback?: StreamCallback): boolean {
    if (this.ended) {
      handleError(this, new Error(WRITE_AFTER_END_ERROR), callback);
      return false;
    }

    this.writer
      .write(chunk)
      .then(() => callback?.())
      .catch(err => handleError(this, err, callback));

    return true;
  }

  end(callback?: StreamCallback): void {
    if (this.ended) {
      callback?.();
      return;
    }
    this.ended = true;

    this.writer
      .close()
      .then(() => this.readPromise)
      .then(() => callback?.())
      .catch(err => handleError(this, err, callback));
  }

  destroy(err?: Error): void {
    this.ended = true;
    if (err) {
      this.emit("error", err);
    }
    try {
      this.reader.cancel(err);
    } catch {
      // Ignore
    }
    try {
      this.writer.abort(err);
    } catch {
      // Ignore
    }
  }
}

/**
 * Create a WebStreamCodec for CompressionStream or DecompressionStream
 */
function createWebStreamCodec(type: "deflate" | "inflate"): WebStreamCodec {
  const stream =
    type === "deflate"
      ? new CompressionStream("deflate-raw")
      : new DecompressionStream("deflate-raw");
  const writer = stream.writable.getWriter() as WritableStreamDefaultWriter<Uint8Array>;
  const reader = stream.readable.getReader();
  return new WebStreamCodec(writer, reader);
}

class BufferedCodec extends EventEmitter {
  protected readonly chunks: Uint8Array[] = [];
  protected ended = false;

  constructor(protected readonly process: ((data: Uint8Array) => Uint8Array) | null) {
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

    // Subclass (WorkerCodec) overrides end() so process can be null
    if (!this.process) {
      callback?.();
      return;
    }

    try {
      // Fast path for single chunk - avoid concat
      const data = this.chunks.length === 1 ? this.chunks[0] : concatUint8Arrays(this.chunks);
      const output = this.process(data);
      this.emit("data", output);
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
// Worker-based Streaming Compression
// =============================================================================

/**
 * Worker-based codec stream
 *
 * Extends BufferedCodec to reuse write/destroy logic.
 * Processes in a worker at end() to keep the main thread responsive.
 */
class WorkerCodec extends BufferedCodec {
  private readonly taskType: WorkerTaskType;
  private readonly level: number | undefined;
  private readonly pool: WorkerPool | undefined;
  private readonly allowTransfer: boolean | undefined;

  constructor(
    taskType: WorkerTaskType,
    pool?: WorkerPool,
    level?: number,
    allowTransfer?: boolean
  ) {
    super(null); // No sync process function - we use worker in end()
    this.taskType = taskType;
    this.pool = pool;
    this.level = level;
    this.allowTransfer = allowTransfer;
  }

  override end(callback?: StreamCallback): void {
    if (this.ended) {
      callback?.();
      return;
    }
    this.ended = true;

    // Fast path for single chunk - avoid concat
    const data = this.chunks.length === 1 ? this.chunks[0] : concatUint8Arrays(this.chunks);
    this.chunks.length = 0; // Release memory

    // Process in worker
    this._processInWorker(data, callback);
  }

  private async _processInWorker(data: Uint8Array, callback?: StreamCallback): Promise<void> {
    try {
      const pool = this.pool ?? getDefaultWorkerPool();
      const { level, allowTransfer, taskType } = this;
      const options = taskType === "deflate" ? { level, allowTransfer } : { allowTransfer };
      const result = await pool.execute(taskType, data, options);

      this.emit("data", result.data);
      this.emit("end");
      callback?.();
    } catch (err) {
      handleError(this, err, callback);
    }
  }
}

/**
 * Create a streaming codec (deflate or inflate)
 */
function createStreamCodec(
  type: "deflate" | "inflate",
  options: StreamCompressOptions
): DeflateStream | InflateStream {
  const level = type === "deflate" ? (options.level ?? DEFAULT_COMPRESS_LEVEL) : undefined;

  // Use worker if requested and supported
  if (options.useWorker && hasWorkerSupport()) {
    return new WorkerCodec(
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

/**
 * Create a streaming DEFLATE compressor
 *
 * @param options - Compression options
 * @returns A streaming deflate compressor
 *
 * @example Using worker pool for main thread responsiveness
 * ```ts
 * const deflate = createDeflateStream({ level: 6, useWorker: true });
 * deflate.on("data", chunk => console.log("Compressed chunk:", chunk.length));
 * deflate.on("end", () => console.log("Done!"));
 * deflate.write(data);
 * deflate.end();
 * ```
 */
export function createDeflateStream(options: StreamCompressOptions = {}): DeflateStream {
  return createStreamCodec("deflate", options);
}

/**
 * Create a streaming INFLATE decompressor
 *
 * @param options - Decompression options
 * @returns A streaming inflate decompressor
 *
 * @example Using worker pool for main thread responsiveness
 * ```ts
 * const inflate = createInflateStream({ useWorker: true });
 * inflate.on("data", chunk => console.log("Decompressed chunk:", chunk.length));
 * inflate.on("end", () => console.log("Done!"));
 * inflate.write(compressedData);
 * inflate.end();
 * ```
 */
export function createInflateStream(options: StreamCompressOptions = {}): InflateStream {
  return createStreamCodec("inflate", options);
}
