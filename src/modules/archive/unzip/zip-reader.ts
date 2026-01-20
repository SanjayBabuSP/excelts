import { ZipParser, type ZipEntryInfo, type ZipParseOptions } from "@archive/unzip/zip-parser";
import { processEntryData, readEntryCompressedData } from "@archive/unzip/zip-extract-core";
import {
  createParse,
  type ParseOptions,
  type ZipEntry as ParseZipEntry
} from "@archive/unzip/stream";
import { pipeIterableToSink, type ArchiveSink } from "@archive/io/archive-sink";
import {
  isInMemoryArchiveSource,
  toAsyncIterable,
  toUint8Array,
  type ArchiveSource
} from "@archive/io/archive-source";
import {
  createAbortError,
  createLinkedAbortController,
  throwIfAborted,
  toError,
  suppressUnhandledRejection
} from "@archive/shared/errors";
import { ProgressEmitter } from "@archive/shared/progress";
import type { UnzipOperation, UnzipProgress, UnzipStreamOptions } from "./progress";
import { getTextDecoder } from "@stream/shared";
import { eventedReadableToAsyncIterableNoDestroy } from "@stream/internal/evented-readable-to-async-iterable";
import type { ArchiveFormat } from "@archive/formats/types";
import { isWritableStream } from "@stream/internal/type-guards";

function attachAbortToParseEntry(entry: any, signal: AbortSignal): void {
  let cleanedUp = false;

  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    signal.removeEventListener("abort", onAbort);
  };

  const onAbort = () => {
    cleanup();
    try {
      entry.destroy?.(createAbortError((signal as any).reason));
    } catch {
      entry.autodrain?.();
    }
  };

  if (signal.aborted) {
    onAbort();
    return;
  }

  signal.addEventListener("abort", onAbort, { once: true });
  entry.once?.("end", cleanup);
  entry.once?.("close", cleanup);
  entry.once?.("error", cleanup);
}

/**
 * Convert an AsyncIterable to a WHATWG ReadableStream.
 */
function asyncIterableToReadableStream<T>(
  iterable: AsyncIterable<T>,
  onCancel?: (reason: unknown) => void
): ReadableStream<T> {
  const iterator = iterable[Symbol.asyncIterator]();
  let cancelled = false;

  return new ReadableStream<T>({
    async pull(controller) {
      if (cancelled) {
        controller.close();
        return;
      }

      try {
        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (e) {
        controller.error(toError(e));
      }
    },
    async cancel(reason) {
      cancelled = true;
      try {
        await iterator.return?.();
      } catch {
        // ignore
      }
      onCancel?.(reason);
    }
  });
}

type PipeToOptions = {
  preventClose?: boolean;
  preventAbort?: boolean;
  preventCancel?: boolean;
  signal?: AbortSignal;
};

export interface UnzipOptions {
  /**
   * Archive format: "zip" (default) or "tar".
   * Note: format dispatch is handled by `unzip()`.
   */
  format?: ArchiveFormat;

  decodeStrings?: boolean;
  parse?: ParseOptions;

  /** Password for encrypted entries (ZIP only). */
  password?: string | Uint8Array;

  /** Default abort signal used by streaming operations. */
  signal?: AbortSignal;

  /** Default progress callback used by streaming operations. */
  onProgress?: (p: UnzipProgress) => void;

  /** Default throttle for progress callbacks. */
  progressIntervalMs?: number;
}

export type { UnzipOperation, UnzipProgress, UnzipStreamOptions } from "./progress";

export class UnzipEntry {
  readonly path: string;
  readonly isDirectory: boolean;

  private readonly _data?: Uint8Array;
  private readonly _info?: ZipEntryInfo;
  private readonly _password?: string | Uint8Array;
  private readonly _parseEntry?: ParseZipEntry;
  private readonly _onBytesOut?: (path: string, isDirectory: boolean, bytes: number) => void;
  private readonly _signal?: AbortSignal;

  constructor(
    args:
      | { kind: "buffer"; data: Uint8Array; info: ZipEntryInfo; password?: string | Uint8Array }
      | { kind: "stream"; entry: ParseZipEntry },
    hooks: {
      onBytesOut?: (path: string, isDirectory: boolean, bytes: number) => void;
      signal?: AbortSignal;
    } = {}
  ) {
    if (args.kind === "buffer") {
      this._data = args.data;
      this._info = args.info;
      this._password = args.password;
      this.path = args.info.path;
      this.isDirectory = args.info.isDirectory;
    } else {
      this._parseEntry = args.entry;
      this.path = args.entry.path;
      this.isDirectory = args.entry.type === "Directory";
    }

    this._onBytesOut = hooks.onBytesOut;
    this._signal = hooks.signal;

    // If this entry is backed by a streaming parser entry, ensure it is
    // interrupted on abort so consumers don't hang waiting for more chunks.
    if (this._parseEntry && this._signal) {
      attachAbortToParseEntry(this._parseEntry as any, this._signal);
    }
  }

  async bytes(): Promise<Uint8Array> {
    if (this._data && this._info) {
      // Use shared extraction core for buffer mode
      const compressedData = readEntryCompressedData(this._data, this._info);
      const bytes = await processEntryData(this._info, compressedData, this._password);
      if (this._onBytesOut && bytes.length) {
        this._onBytesOut(this.path, this.isDirectory, bytes.length);
      }
      return bytes;
    }
    if (this._parseEntry) {
      const data = await this._parseEntry.buffer();
      // In Node.js, `entry.buffer()` may return a Buffer, which causes
      // deep-equality mismatches against Uint8Array in tests.
      if (typeof Buffer !== "undefined" && data instanceof Buffer) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      }
      if (this._onBytesOut && (data as any).length) {
        this._onBytesOut(this.path, this.isDirectory, (data as any).length);
      }
      return data;
    }
    return new Uint8Array(0);
  }

  async *stream(): AsyncIterable<Uint8Array> {
    if (this._data && this._info) {
      const data = await this.bytes();
      if (data.length) {
        yield data;
      }
      return;
    }

    if (this._parseEntry) {
      const iterable: AsyncIterable<Uint8Array> =
        typeof (this._parseEntry as any)?.on === "function" &&
        typeof (this._parseEntry as any)?.pause === "function" &&
        typeof (this._parseEntry as any)?.resume === "function"
          ? eventedReadableToAsyncIterableNoDestroy<Uint8Array>(this._parseEntry)
          : (this._parseEntry as any as AsyncIterable<Uint8Array>);

      let completed = false;
      try {
        for await (const chunk of iterable) {
          if (this._onBytesOut && chunk.length) {
            this._onBytesOut(this.path, this.isDirectory, chunk.length);
          }
          yield chunk;
        }
        completed = true;
      } finally {
        if (!completed) {
          try {
            this._parseEntry.autodrain();
          } catch {
            // Best effort cleanup only.
          }
        }
      }
    }
  }

  async pipeTo(sink: WritableStream<Uint8Array>, options?: PipeToOptions): Promise<void>;
  async pipeTo(sink: ArchiveSink): Promise<void>;
  async pipeTo(sink: ArchiveSink, options?: PipeToOptions): Promise<void> {
    // Prefer native Web Streams piping semantics when a WHATWG WritableStream is provided.
    // This supports standard options like `signal` / `preventClose` / `preventAbort`.
    if (isWritableStream(sink) && typeof (this.readableStream() as any).pipeTo === "function") {
      await this.readableStream().pipeTo(sink, options as any);
      return;
    }

    // Fallback to the library sink piping (supports Node-style Writable too).
    await pipeIterableToSink(this.stream(), sink);
  }

  readableStream(): ReadableStream<Uint8Array> {
    const parseEntry = this._parseEntry;

    return asyncIterableToReadableStream(this.stream(), reason => {
      if (parseEntry) {
        try {
          parseEntry.destroy?.(createAbortError(reason));
        } catch {
          try {
            parseEntry.autodrain?.();
          } catch {
            // ignore
          }
        }
      }
    });
  }

  async text(encoding?: string): Promise<string> {
    const bytes = await this.bytes();
    return getTextDecoder(encoding).decode(bytes);
  }

  discard(): void {
    if (this._parseEntry) {
      this._parseEntry.autodrain();
    }
  }
}

export class ZipReader {
  private readonly _source: ArchiveSource;
  private readonly _options: UnzipOptions;
  private _bufferParser: ZipParser | null = null;
  private _bufferData: Uint8Array | null = null;

  constructor(source: ArchiveSource, options: UnzipOptions = {}) {
    this._source = source;
    this._options = options;
  }

  entries(options: UnzipStreamOptions = {}): AsyncIterable<UnzipEntry> {
    return this.operation(options).iterable;
  }

  entriesStream(options: UnzipStreamOptions = {}): ReadableStream<UnzipEntry> {
    const op = this.operation(options);

    return asyncIterableToReadableStream(op.iterable, reason => {
      try {
        op.abort(reason ?? "cancelled");
      } catch {
        // ignore
      }
    });
  }

  operation(options: UnzipStreamOptions = {}): UnzipOperation {
    const { controller, cleanup: cleanupAbortLink } = createLinkedAbortController(
      options.signal ?? this._options.signal
    );
    const signal = controller.signal;

    const onProgress = options.onProgress ?? this._options.onProgress;
    const progress = new ProgressEmitter<UnzipProgress>(
      {
        type: "unzip",
        phase: "running",
        bytesIn: 0,
        bytesOut: 0,
        entriesEmitted: 0
      },
      onProgress,
      { intervalMs: options.progressIntervalMs ?? this._options.progressIntervalMs }
    );

    const onBytesOut = (path: string, isDirectory: boolean, bytes: number): void => {
      progress.mutate(s => {
        s.bytesOut += bytes;
        const prev = s.currentEntry;
        s.currentEntry =
          prev && prev.path === path
            ? { ...prev, bytesOut: prev.bytesOut + bytes }
            : { path, isDirectory, bytesOut: bytes };
      });
    };

    const iterable = async function* (this: ZipReader): AsyncIterable<UnzipEntry> {
      try {
        throwIfAborted(signal);

        // Buffer mode
        if (isInMemoryArchiveSource(this._source)) {
          const bytes = await toUint8Array(this._source as any);
          throwIfAborted(signal);
          progress.update({ bytesIn: bytes.length });
          const parser = new ZipParser(bytes, {
            decodeStrings: this._options.decodeStrings
          } satisfies ZipParseOptions);
          const password = this._options.password;

          for (const info of parser.getEntries()) {
            throwIfAborted(signal);
            progress.mutate(s => {
              s.entriesEmitted += 1;
              s.currentEntry = { path: info.path, isDirectory: info.isDirectory, bytesOut: 0 };
            });
            yield new UnzipEntry(
              { kind: "buffer", data: bytes, info, password },
              { onBytesOut, signal }
            );
          }

          if (progress.snapshot.phase === "running") {
            progress.update({ phase: "done" });
          }
          return;
        }

        // Streaming mode
        const parse = createParse({ ...(this._options.parse ?? {}), forceStream: true });

        const parseDonePromise = parse.promise();
        // Ensure abort-driven rejections from the parser itself never surface as unhandled.
        suppressUnhandledRejection(parseDonePromise);

        const onAbort = () => {
          const err = createAbortError((signal as any).reason);
          progress.update({ phase: "aborted" });
          try {
            parse.destroy(err);
          } catch {
            // ignore
          }
        };
        signal.addEventListener("abort", onAbort, { once: true });

        const feedPromise = (async () => {
          try {
            for await (const chunk of toAsyncIterable(this._source, {
              signal,
              onChunk: c =>
                progress.mutate(s => {
                  s.bytesIn += c.length;
                })
            })) {
              throwIfAborted(signal);
              await new Promise<void>((resolve, reject) => {
                (parse as any).write(chunk, (err?: Error | null) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve();
                  }
                });
              });
            }

            throwIfAborted(signal);
            parse.end();
            await parseDonePromise;
          } catch (e) {
            const err = toError(e);
            parse.destroy(err);
            throw err;
          }
        })();

        // Avoid unhandled rejection warnings when the operation is aborted.
        suppressUnhandledRejection(feedPromise);

        const parseIter: AsyncIterator<ParseZipEntry> =
          typeof (parse as any)?.[Symbol.asyncIterator] === "function"
            ? (parse as any as AsyncIterable<ParseZipEntry>)[Symbol.asyncIterator]()
            : (parse as any as AsyncIterator<ParseZipEntry>);

        try {
          while (true) {
            const { value, done } = await parseIter.next();
            if (done) {
              break;
            }
            const entry = value;
            throwIfAborted(signal);
            progress.mutate(s => {
              s.entriesEmitted += 1;
              s.currentEntry = {
                path: entry.path,
                isDirectory: entry.type === "Directory",
                bytesOut: 0
              };
            });
            yield new UnzipEntry({ kind: "stream", entry }, { onBytesOut, signal });
          }

          await feedPromise;
          if (progress.snapshot.phase === "running") {
            progress.update({ phase: "done" });
          }
        } finally {
          signal.removeEventListener("abort", onAbort);

          // Ensure the parser iterator is closed and any abort-induced errors are observed.
          await parseIter.return?.().catch(() => {});

          // Ensure parser/feed completion does not surface as an unhandled rejection.
          await Promise.all([parseDonePromise, feedPromise]).catch(() => {});
        }
      } catch (e) {
        const err = toError(e);
        if ((err as any).name === "AbortError") {
          progress.update({ phase: "aborted" });
        } else {
          progress.update({ phase: "error" });
        }
        throw err;
      } finally {
        if (progress.snapshot.phase === "running" && !signal.aborted) {
          try {
            controller.abort("cancelled");
          } catch {
            // ignore
          }
          progress.update({ phase: "aborted" });
        }
        cleanupAbortLink();
        progress.emitNow();
      }
    }.call(this);

    return {
      iterable,
      signal,
      abort(reason?: unknown) {
        controller.abort(reason);
      },
      pointer() {
        return progress.snapshot.bytesIn;
      },
      progress() {
        return progress.snapshotCopy();
      }
    };
  }

  private async _ensureBufferParser(): Promise<{ parser: ZipParser; data: Uint8Array }> {
    if (this._bufferParser && this._bufferData) {
      return { parser: this._bufferParser, data: this._bufferData };
    }

    if (isInMemoryArchiveSource(this._source)) {
      const bytes = await toUint8Array(this._source as any);
      this._bufferData = bytes;
      this._bufferParser = new ZipParser(bytes, {
        decodeStrings: this._options.decodeStrings
      } satisfies ZipParseOptions);
      return { parser: this._bufferParser, data: bytes };
    }

    throw new Error("This ZIP source is streaming; random access is not available");
  }

  async get(path: string): Promise<UnzipEntry | null> {
    const { parser, data } = await this._ensureBufferParser();
    const info = parser.getEntry(path);
    if (!info) {
      return null;
    }
    return new UnzipEntry({ kind: "buffer", data, info, password: this._options.password });
  }

  async bytes(path: string): Promise<Uint8Array | null> {
    const entry = await this.get(path);
    if (!entry) {
      return null;
    }
    return entry.bytes();
  }

  async close(): Promise<void> {
    // No persistent resources in buffer mode.
  }
}

/** Unzip options with format: "tar" */
export interface UnzipOptionsTar extends UnzipOptions {
  format: "tar";
}

/** Unzip options with format: "zip" (or default) */
export interface UnzipOptionsZip extends UnzipOptions {
  format?: "zip";
}

export function createZipReader(source: ArchiveSource, options?: UnzipOptionsZip): ZipReader {
  return new ZipReader(source, options);
}
