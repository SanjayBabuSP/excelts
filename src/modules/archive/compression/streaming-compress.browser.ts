/**
 * Browser True Streaming Compression
 *
 * Uses native CompressionStream("deflate-raw") for real chunk-by-chunk streaming.
 * Falls back to buffered compression if not supported.
 *
 * API compatible with Node.js version - supports .on("data"), .on("end"), .write(callback), .end()
 */

import { EventEmitter } from "@stream";
import { deflateRawCompressed, inflateRaw } from "@archive/compression/deflate-fallback";
import { hasDeflateRawWebStreams } from "@archive/compression/compress.base";
import { concatUint8Arrays } from "@archive/utils/bytes";
import { DEFAULT_COMPRESS_LEVEL } from "@archive/defaults";

export type {
  DeflateStream,
  InflateStream,
  StreamCompressOptions,
  StreamingCodec
} from "@archive/compression/streaming-compress.base";
import {
  asError,
  type DeflateStream,
  type InflateStream,
  type StreamCallback,
  type StreamCompressOptions
} from "@archive/compression/streaming-compress.base";

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

function hasNativeDeflateRawWebStreams(): boolean {
  return hasDeflateRawWebStreams();
}

class WebStreamCodec extends EventEmitter {
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private readPromise: Promise<void>;
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
      const err = new Error("write after end");
      if (callback) {
        callback(err);
      } else {
        this.emit("error", err);
      }
      return false;
    }

    this.writer
      .write(chunk)
      .then(() => {
        if (callback) {
          callback();
        }
      })
      .catch(err => {
        const error = asError(err);
        if (callback) {
          callback(error);
        } else {
          this.emit("error", error);
        }
      });

    return true;
  }

  end(callback?: StreamCallback): void {
    if (this.ended) {
      if (callback) {
        callback();
      }
      return;
    }
    this.ended = true;

    this.writer
      .close()
      .then(() => this.readPromise)
      .then(() => {
        if (callback) {
          callback();
        }
      })
      .catch(err => {
        const error = asError(err);
        if (callback) {
          callback(error);
        } else {
          this.emit("error", error);
        }
      });
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
 * Browser True Streaming Deflate using CompressionStream API
 * Simple EventEmitter-based - emits "data" as compressed chunks arrive
 */
class TrueStreamingDeflate extends EventEmitter {
  private codec: WebStreamCodec;

  constructor(_level: number) {
    super();
    const compressionStream = new CompressionStream("deflate-raw");
    const writer =
      compressionStream.writable.getWriter() as WritableStreamDefaultWriter<Uint8Array>;
    const reader = compressionStream.readable.getReader();

    this.codec = new WebStreamCodec(writer, reader);
    this.codec.on("data", chunk => this.emit("data", chunk));
    this.codec.on("end", () => this.emit("end"));
    this.codec.on("error", err => this.emit("error", err));
  }

  write(chunk: Uint8Array, callback?: StreamCallback): boolean {
    return this.codec.write(chunk, callback);
  }

  end(callback?: StreamCallback): void {
    this.codec.end(callback);
  }

  destroy(err?: Error): void {
    this.codec.destroy(err);
  }
}

/**
 * Fallback Deflate - buffers all data, compresses at end
 */
class FallbackDeflate extends EventEmitter {
  private codec: BufferedCodec;

  constructor(_level: number) {
    super();
    this.codec = new BufferedCodec(deflateRawCompressed);
    this.codec.on("data", chunk => this.emit("data", chunk));
    this.codec.on("end", () => this.emit("end"));
    this.codec.on("error", err => this.emit("error", err));
  }

  write(chunk: Uint8Array, callback?: StreamCallback): boolean {
    return this.codec.write(chunk, callback);
  }

  end(callback?: StreamCallback): void {
    this.codec.end(callback);
  }

  destroy(err?: Error): void {
    this.codec.destroy(err);
  }
}

class BufferedCodec extends EventEmitter {
  private chunks: Uint8Array[] = [];
  private ended = false;

  constructor(private readonly process: (data: Uint8Array) => Uint8Array) {
    super();
  }

  write(chunk: Uint8Array, callback?: StreamCallback): boolean {
    if (this.ended) {
      const err = new Error("write after end");
      if (callback) {
        callback(err);
      } else {
        this.emit("error", err);
      }
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
      if (callback) {
        callback();
      }
      return;
    }
    this.ended = true;

    try {
      const data = concatUint8Arrays(this.chunks);
      const output = this.process(data);
      this.emit("data", output);
      this.emit("end");
      if (callback) {
        callback();
      }
    } catch (err) {
      const error = asError(err);
      this.emit("error", error);
      if (callback) {
        callback(error);
      }
    }
  }

  destroy(err?: Error): void {
    this.ended = true;
    if (err) {
      this.emit("error", err);
    }
  }
}

/**
 * Create a streaming DEFLATE compressor
 */
export function createDeflateStream(options: StreamCompressOptions = {}): DeflateStream {
  const level = options.level ?? DEFAULT_COMPRESS_LEVEL;

  if (hasNativeDeflateRawWebStreams()) {
    return new TrueStreamingDeflate(level);
  } else {
    return new FallbackDeflate(level);
  }
}

/**
 * Browser True Streaming Inflate using DecompressionStream API
 */
class TrueStreamingInflate extends EventEmitter {
  private codec: WebStreamCodec;

  constructor() {
    super();
    const decompressionStream = new DecompressionStream("deflate-raw");
    const writer =
      decompressionStream.writable.getWriter() as WritableStreamDefaultWriter<Uint8Array>;
    const reader = decompressionStream.readable.getReader();

    this.codec = new WebStreamCodec(writer, reader);
    this.codec.on("data", chunk => this.emit("data", chunk));
    this.codec.on("end", () => this.emit("end"));
    this.codec.on("error", err => this.emit("error", err));
  }

  write(chunk: Uint8Array, callback?: StreamCallback): boolean {
    return this.codec.write(chunk, callback);
  }

  end(callback?: StreamCallback): void {
    this.codec.end(callback);
  }

  destroy(err?: Error): void {
    this.codec.destroy(err);
  }
}

/**
 * Fallback Inflate - buffers all data, decompresses at end
 */
class FallbackInflate extends EventEmitter {
  private codec: BufferedCodec;

  constructor() {
    super();
    this.codec = new BufferedCodec(inflateRaw);
    this.codec.on("data", chunk => this.emit("data", chunk));
    this.codec.on("end", () => this.emit("end"));
    this.codec.on("error", err => this.emit("error", err));
  }

  write(chunk: Uint8Array, callback?: StreamCallback): boolean {
    return this.codec.write(chunk, callback);
  }

  end(callback?: StreamCallback): void {
    this.codec.end(callback);
  }

  destroy(err?: Error): void {
    this.codec.destroy(err);
  }
}

/**
 * Create a streaming INFLATE decompressor
 */
export function createInflateStream(): InflateStream {
  if (hasNativeDeflateRawWebStreams()) {
    return new TrueStreamingInflate();
  } else {
    return new FallbackInflate();
  }
}
