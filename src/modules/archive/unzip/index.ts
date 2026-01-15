import { ZipParser, type ZipEntryInfo, type ZipParseOptions } from "@archive/unzip/zip-parser";
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
  throwIfAborted
} from "@archive/utils/abort";
import { ProgressEmitter } from "@archive/utils/progress";
import { suppressUnhandledRejection } from "@archive/utils/promise";
import type { UnzipOperation, UnzipProgress, UnzipStreamOptions } from "./progress";

const textDecoderCache = new Map<string, TextDecoder>();

function getTextDecoder(encoding?: string): TextDecoder {
  const key = encoding ?? "utf-8";
  const cached = textDecoderCache.get(key);
  if (cached) {
    return cached;
  }
  const decoder = new TextDecoder(key);
  textDecoderCache.set(key, decoder);
  return decoder;
}

function nodeStreamToAsyncIterableNoDestroy(stream: any): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
      const chunks: Uint8Array[] = [];
      let head = 0;
      let done = false;
      let error: unknown | null = null;
      let cleanedUp = false;
      let pending: {
        resolve: (r: IteratorResult<Uint8Array>) => void;
        reject: (e: unknown) => void;
      } | null = null;

      const take = (): Uint8Array => {
        const chunk = chunks[head++]!;
        // Periodically compact to avoid unbounded head growth.
        if (head > 64 && head * 2 > chunks.length) {
          chunks.splice(0, head);
          head = 0;
        }
        return chunk;
      };

      const cleanup = (): void => {
        if (cleanedUp) {
          return;
        }
        cleanedUp = true;

        if (typeof stream?.off === "function") {
          stream.off("data", onData);
          stream.off("end", onEnd);
          stream.off("close", onClose);
          stream.off("error", onError);
        } else if (typeof stream?.removeListener === "function") {
          stream.removeListener("data", onData);
          stream.removeListener("end", onEnd);
          stream.removeListener("close", onClose);
          stream.removeListener("error", onError);
        }

        if (typeof stream?.pause === "function") {
          stream.pause();
        }
      };

      const onData = (chunk: Uint8Array): void => {
        chunks.push(chunk);
        if (typeof stream?.pause === "function") {
          stream.pause();
        }
        if (pending) {
          const { resolve } = pending;
          pending = null;
          resolve({ value: take(), done: false });
        }
      };

      const onEnd = (): void => {
        done = true;
        cleanup();
        if (pending) {
          const { resolve } = pending;
          pending = null;
          resolve({ value: undefined as any, done: true });
        }
      };

      const onClose = (): void => {
        onEnd();
      };

      const onError = (e: unknown): void => {
        error = e;
        done = true;
        cleanup();
        if (pending) {
          const { reject } = pending;
          pending = null;
          reject(e);
        }
      };

      if (typeof stream?.pause === "function") {
        stream.pause();
      }
      if (typeof stream?.on === "function") {
        stream.on("data", onData);
        stream.on("end", onEnd);
        stream.on("close", onClose);
        stream.on("error", onError);
      }

      return {
        next(): Promise<IteratorResult<Uint8Array>> {
          if (error) {
            return Promise.reject(error);
          }
          if (head < chunks.length) {
            return Promise.resolve({ value: take(), done: false });
          }
          if (done) {
            return Promise.resolve({ value: undefined as any, done: true });
          }

          return new Promise((resolve, reject) => {
            pending = { resolve, reject };
            if (typeof stream?.resume === "function") {
              stream.resume();
            }
          });
        },
        return(): Promise<IteratorResult<Uint8Array>> {
          done = true;
          cleanup();
          if (pending) {
            const { resolve } = pending;
            pending = null;
            resolve({ value: undefined as any, done: true });
          }
          return Promise.resolve({ value: undefined as any, done: true });
        },
        throw(e?: unknown): Promise<IteratorResult<Uint8Array>> {
          done = true;
          cleanup();
          if (pending) {
            const { reject } = pending;
            pending = null;
            reject(e);
          }
          return Promise.reject(e);
        }
      };
    }
  };
}

function attachAbortToParseEntry(entry: any, signal: AbortSignal): void {
  let cleanedUp = false;

  const onEndOrClose = () => {
    cleanup();
  };

  const onAbort = () => {
    cleanup();
    try {
      entry.destroy?.(createAbortError((signal as any).reason));
    } catch {
      try {
        entry.autodrain?.();
      } catch {
        // ignore
      }
    }
  };

  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;

    // `entry.once(...)` listeners remove themselves; only the abort listener
    // on the signal needs explicit cleanup.
    try {
      signal.removeEventListener("abort", onAbort);
    } catch {
      // ignore
    }
  };

  if (signal.aborted) {
    onAbort();
    return;
  }

  signal.addEventListener("abort", onAbort, { once: true });
  try {
    entry.once?.("end", onEndOrClose);
    entry.once?.("close", onEndOrClose);
    entry.once?.("error", onEndOrClose);
  } catch {
    // ignore
  }
}

export interface UnzipOptions {
  decodeStrings?: boolean;
  parse?: ParseOptions;

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

  private readonly _info?: ZipEntryInfo;
  private readonly _parser?: ZipParser;
  private readonly _parseEntry?: ParseZipEntry;
  private readonly _onBytesOut?: (path: string, isDirectory: boolean, bytes: number) => void;
  private readonly _signal?: AbortSignal;

  constructor(
    args:
      | { kind: "buffer"; parser: ZipParser; info: ZipEntryInfo }
      | { kind: "stream"; entry: ParseZipEntry },
    hooks: {
      onBytesOut?: (path: string, isDirectory: boolean, bytes: number) => void;
      signal?: AbortSignal;
    } = {}
  ) {
    if (args.kind === "buffer") {
      this._parser = args.parser;
      this._info = args.info;
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
    if (this._parser && this._info) {
      const out = await this._parser.extract(this._info.path);
      const bytes = out ?? new Uint8Array(0);
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
    if (this._parser && this._info) {
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
          ? nodeStreamToAsyncIterableNoDestroy(this._parseEntry)
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

  async pipeTo(sink: ArchiveSink): Promise<void> {
    await pipeIterableToSink(this.stream(), sink);
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

  constructor(source: ArchiveSource, options: UnzipOptions = {}) {
    this._source = source;
    this._options = options;
  }

  entries(options: UnzipStreamOptions = {}): AsyncIterable<UnzipEntry> {
    return this.operation(options).iterable;
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

          for (const info of parser.getEntries()) {
            throwIfAborted(signal);
            progress.mutate(s => {
              s.entriesEmitted += 1;
              s.currentEntry = { path: info.path, isDirectory: info.isDirectory, bytesOut: 0 };
            });
            yield new UnzipEntry({ kind: "buffer", parser, info }, { onBytesOut, signal });
          }

          if (progress.snapshot.phase === "running") {
            progress.update({ phase: "done" });
          }
          return;
        }

        // Streaming mode
        const parse = createParse({ ...(this._options.parse ?? {}), forceStream: true });

        const parseDonePromise = parse.promise();
        // Note: we attach a catch handler to `feedPromise` below to avoid
        // unhandled rejection warnings if the operation is aborted.

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
            const err = e instanceof Error ? e : new Error(String(e));
            parse.destroy(err);
            throw err;
          }
        })();

        // Avoid unhandled rejection warnings when the operation is aborted.
        suppressUnhandledRejection(feedPromise);

        try {
          for await (const entry of parse as any as AsyncIterable<ParseZipEntry>) {
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
          try {
            signal.removeEventListener("abort", onAbort);
          } catch {
            // ignore
          }

          // Ensure the feed task does not get stranded.
          await feedPromise.catch(() => {});
        }
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
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

  private async _ensureBufferParser(): Promise<ZipParser> {
    if (this._bufferParser) {
      return this._bufferParser;
    }

    if (isInMemoryArchiveSource(this._source)) {
      const bytes = await toUint8Array(this._source as any);
      this._bufferParser = new ZipParser(bytes, {
        decodeStrings: this._options.decodeStrings
      } satisfies ZipParseOptions);
      return this._bufferParser;
    }

    throw new Error("This ZIP source is streaming; random access is not available");
  }

  async get(path: string): Promise<UnzipEntry | null> {
    const parser = await this._ensureBufferParser();
    const info = parser.getEntry(path);
    if (!info) {
      return null;
    }
    return new UnzipEntry({ kind: "buffer", parser, info });
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

export function unzip(source: ArchiveSource, options?: UnzipOptions): ZipReader {
  return new ZipReader(source, options);
}
