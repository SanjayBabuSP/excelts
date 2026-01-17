import type { ZipTimestampMode } from "@archive/utils/timestamps";
import { DEFAULT_ZIP_LEVEL, DEFAULT_ZIP_TIMESTAMPS } from "@archive/defaults";
import { ZipDeflateFile, StreamingZip } from "@archive/zip/stream";
import { createZip, createZipSync } from "@archive/zip/zip-bytes";
import { collect, pipeIterableToSink, type ArchiveSink } from "@archive/io/archive-sink";
import {
  toAsyncIterable,
  toUint8Array,
  toUint8ArraySync,
  isInMemoryArchiveSource,
  type ArchiveSource
} from "@archive/io/archive-source";
import { createAsyncQueue } from "@archive/utils/async-queue";
import {
  createLinkedAbortController,
  createAbortError,
  throwIfAborted
} from "@archive/utils/abort";
import { ProgressEmitter } from "@archive/utils/progress";
import type { Zip64Mode } from "./zip64-mode";
import type { ZipOperation, ZipProgress, ZipStreamOptions } from "./progress";
import type { ZipPathOptions } from "./zip-path";

const REPRODUCIBLE_ZIP_MOD_TIME = new Date(1980, 0, 1, 0, 0, 0);

export interface ZipOptions {
  level?: number;
  timestamps?: ZipTimestampMode;
  comment?: string;

  /** Optional entry name normalization. `false` keeps names as-is. */
  path?: false | ZipPathOptions;

  /** Default abort signal used by streaming operations. */
  signal?: AbortSignal;

  /** Default progress callback used by streaming operations. */
  onProgress?: (p: ZipProgress) => void;

  /** Default throttle for progress callbacks. */
  progressIntervalMs?: number;

  /**
   * ZIP64 mode:
   * - "auto" (default): write ZIP64 only when required by limits.
   * - true: force ZIP64 structures even for small archives.
   * - false: forbid ZIP64; throws if ZIP64 is required.
   */
  zip64?: Zip64Mode;

  /**
   * Default modification time for entries that don't specify `modTime`.
   *
   * If you need stable output across runs, either pass this explicitly or use `reproducible: true`.
   */
  modTime?: Date;

  /**
   * If true, bias defaults toward reproducible output:
   * - default `modTime` becomes 1980-01-01 00:00:00 (local time)
   * - default `timestamps` becomes "dos" (no UTC extra field)
   */
  reproducible?: boolean;
  /**
   * If true (default), automatically STORE incompressible data.
   * If false, always follow `level` (DEFLATE when level > 0).
   */
  smartStore?: boolean;
}

export interface ZipEntryOptions {
  level?: number;
  modTime?: Date;
  atime?: Date;
  ctime?: Date;
  birthTime?: Date;
  comment?: string;

  /** Optional Unix mode/permissions for this entry. */
  mode?: number;

  /** Optional MS-DOS attributes (low 8 bits). */
  msDosAttributes?: number;

  /** Advanced override for external attributes. */
  externalAttributes?: number;

  /** Advanced override for versionMadeBy. */
  versionMadeBy?: number;

  /** Per-entry ZIP64 override. Defaults to the archive-level zip64 mode. */
  zip64?: Zip64Mode;
}

export type { ZipOperation, ZipProgress, ZipStreamOptions } from "./progress";

type ZipInput = {
  name: string;
  source: ArchiveSource;
  options?: ZipEntryOptions;
};

export class ZipArchive {
  private readonly _options: Required<Pick<ZipOptions, "level" | "timestamps">> & {
    comment?: string;
    modTime: Date;
    smartStore: boolean;
    zip64: Zip64Mode;
    path: false | ZipPathOptions;
  };
  private readonly _streamDefaults: {
    signal?: AbortSignal;
    onProgress?: (p: ZipProgress) => void;
    progressIntervalMs?: number;
  };
  private readonly _entries: ZipInput[] = [];
  private _sealed = false;

  constructor(options: ZipOptions = {}) {
    const reproducible = options.reproducible ?? false;
    this._options = {
      level: options.level ?? DEFAULT_ZIP_LEVEL,
      timestamps: options.timestamps ?? (reproducible ? "dos" : DEFAULT_ZIP_TIMESTAMPS),
      comment: options.comment,
      modTime: options.modTime ?? (reproducible ? REPRODUCIBLE_ZIP_MOD_TIME : new Date()),
      smartStore: options.smartStore ?? true,
      zip64: options.zip64 ?? "auto",
      path: options.path ?? false
    };
    this._streamDefaults = {
      signal: options.signal,
      onProgress: options.onProgress,
      progressIntervalMs: options.progressIntervalMs
    };
  }

  add(name: string, source: ArchiveSource, options?: ZipEntryOptions): this {
    if (this._sealed) {
      throw new Error("Cannot add entries after output has started");
    }
    if (!name) {
      throw new Error("Entry name is required");
    }
    this._entries.push({ name, source, options });
    return this;
  }

  stream(options: ZipStreamOptions = {}): AsyncIterable<Uint8Array> {
    return this.operation(options).iterable;
  }

  operation(options: ZipStreamOptions = {}): ZipOperation {
    this._sealed = true;

    const signalOpt = options.signal ?? this._streamDefaults.signal;
    const onProgress = options.onProgress ?? this._streamDefaults.onProgress;
    const progressIntervalMs =
      options.progressIntervalMs ?? this._streamDefaults.progressIntervalMs;

    const { controller, cleanup: cleanupAbortLink } = createLinkedAbortController(signalOpt);
    const signal = controller.signal;

    const progress = new ProgressEmitter<ZipProgress>(
      {
        type: "zip",
        phase: "running",
        entriesTotal: this._entries.length,
        entriesDone: 0,
        bytesIn: 0,
        bytesOut: 0,
        zip64: this._options.zip64
      },
      onProgress,
      { intervalMs: progressIntervalMs }
    );

    const queue = createAsyncQueue<Uint8Array>({
      onCancel: () => {
        // Consumer stopped reading; abort upstream work to avoid buffering.
        try {
          controller.abort("cancelled");
        } catch {
          // ignore
        }
      }
    });

    const zip = new StreamingZip(
      (err, data, final) => {
        if (err) {
          progress.update({ phase: progress.snapshot.phase === "aborted" ? "aborted" : "error" });
          queue.fail(err);
          return;
        }

        if (data.length) {
          progress.mutate(s => {
            s.bytesOut += data.length;
          });
          queue.push(data);
        }

        if (final) {
          if (progress.snapshot.phase === "running") {
            progress.update({ phase: "done" });
          }
          queue.close();
        }
      },
      { comment: this._options.comment, zip64: this._options.zip64 }
    );

    const onAbort = () => {
      const err = createAbortError((signal as any).reason);
      progress.update({ phase: "aborted" });
      try {
        zip.abort(err);
      } catch {
        // ignore
      }
      queue.fail(err);
    };
    signal.addEventListener("abort", onAbort, { once: true });

    (async () => {
      try {
        for (let i = 0; i < this._entries.length; i++) {
          throwIfAborted(signal);

          const entry = this._entries[i]!;
          const level = entry.options?.level ?? this._options.level;
          const zip64 = entry.options?.zip64 ?? this._options.zip64;

          let entryBytesIn = 0;
          progress.update({ currentEntry: { name: entry.name, index: i, bytesIn: 0 } });

          const file = new ZipDeflateFile(entry.name, {
            level,
            modTime: entry.options?.modTime ?? this._options.modTime,
            atime: entry.options?.atime,
            ctime: entry.options?.ctime,
            birthTime: entry.options?.birthTime,
            timestamps: this._options.timestamps,
            comment: entry.options?.comment,
            smartStore: this._options.smartStore,
            zip64,
            path: this._options.path,
            mode: entry.options?.mode,
            msDosAttributes: entry.options?.msDosAttributes,
            externalAttributes: entry.options?.externalAttributes,
            versionMadeBy: entry.options?.versionMadeBy
          });

          zip.add(file);

          const onChunk = (chunk: Uint8Array) => {
            entryBytesIn += chunk.length;
            progress.mutate(s => {
              s.bytesIn += chunk.length;
              s.currentEntry = { name: entry.name, index: i, bytesIn: entryBytesIn };
            });
          };

          if (
            entry.source instanceof Uint8Array ||
            entry.source instanceof ArrayBuffer ||
            typeof entry.source === "string" ||
            (typeof Blob !== "undefined" && entry.source instanceof Blob)
          ) {
            const bytes = await toUint8Array(entry.source as any);
            throwIfAborted(signal);
            onChunk(bytes);
            await file.push(bytes, true);
          } else {
            for await (const chunk of toAsyncIterable(entry.source, { signal, onChunk })) {
              throwIfAborted(signal);
              await file.push(chunk, false);
            }
            throwIfAborted(signal);
            await file.push(new Uint8Array(0), true);
          }

          await file.complete();
          progress.set("entriesDone", progress.snapshot.entriesDone + 1);
        }

        throwIfAborted(signal);
        zip.end();
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        if ((err as any).name === "AbortError") {
          progress.update({ phase: "aborted" });
          try {
            zip.abort(err);
          } catch {
            // ignore
          }
        } else {
          progress.update({ phase: "error" });
        }
        queue.fail(err);
      } finally {
        try {
          signal.removeEventListener("abort", onAbort);
        } catch {
          // ignore
        }
        cleanupAbortLink();
        progress.emitNow();
      }
    })();

    return {
      iterable: queue.iterable,
      signal,
      abort(reason?: unknown) {
        controller.abort(reason);
      },
      pointer() {
        return progress.snapshot.bytesOut;
      },
      progress() {
        return progress.snapshotCopy();
      }
    };
  }

  async bytes(options: ZipStreamOptions = {}): Promise<Uint8Array> {
    this._sealed = true;

    const signalOpt = options.signal ?? this._streamDefaults.signal;
    const onProgress = options.onProgress ?? this._streamDefaults.onProgress;

    // If progress/abort is requested, prefer the streaming pipeline so updates
    // are meaningful and cancellation is responsive.
    if (onProgress || signalOpt) {
      return collect(this.stream(options));
    }

    const allSourcesInMemory = this._entries.every(e => isInMemoryArchiveSource(e.source));
    const hasBlobSource =
      typeof Blob !== "undefined" && this._entries.some(e => e.source instanceof Blob);

    // Fast-path: when all sources are already in memory and there are no
    // per-entry compression overrides, use the single-buffer ZIP builder.
    // This avoids the overhead of chunking + collecting from the streaming writer.
    if (allSourcesInMemory) {
      // Prefer the sync builder when possible (Node.js hot path): it avoids
      // async/Promise overhead and uses zlib sync fast paths.
      if (!hasBlobSource) {
        const entries = this._entries.map(e => ({
          name: e.name,
          data: toUint8ArraySync(e.source as any),
          level: e.options?.level,
          modTime: e.options?.modTime,
          comment: e.options?.comment
        }));

        return createZipSync(entries, {
          level: this._options.level,
          timestamps: this._options.timestamps,
          modTime: this._options.modTime,
          comment: this._options.comment,
          smartStore: this._options.smartStore,
          zip64: this._options.zip64
        });
      }

      const entries = await Promise.all(
        this._entries.map(async e => ({
          name: e.name,
          data: await toUint8Array(e.source as any),
          level: e.options?.level,
          modTime: e.options?.modTime,
          comment: e.options?.comment
        }))
      );

      return createZip(entries, {
        level: this._options.level,
        timestamps: this._options.timestamps,
        modTime: this._options.modTime,
        comment: this._options.comment,
        smartStore: this._options.smartStore,
        zip64: this._options.zip64
      });
    }

    return collect(this.stream());
  }

  bytesSync(): Uint8Array {
    this._sealed = true;

    const entries = this._entries.map(e => {
      if (
        !(e.source instanceof Uint8Array) &&
        !(e.source instanceof ArrayBuffer) &&
        typeof e.source !== "string"
      ) {
        throw new Error("bytesSync() only supports Uint8Array/ArrayBuffer/string sources");
      }
      return {
        name: e.name,
        data: toUint8ArraySync(e.source as any),
        modTime: e.options?.modTime,
        comment: e.options?.comment
      };
    });

    return createZipSync(entries, {
      level: this._options.level,
      timestamps: this._options.timestamps,
      modTime: this._options.modTime,
      comment: this._options.comment,
      smartStore: this._options.smartStore,
      zip64: this._options.zip64
    });
  }

  async pipeTo(sink: ArchiveSink, options: ZipStreamOptions = {}): Promise<void> {
    await pipeIterableToSink(this.stream(options), sink);
  }
}

export function zip(options?: ZipOptions): ZipArchive {
  return new ZipArchive(options);
}
