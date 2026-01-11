import { ZipParser, type ZipEntryInfo, type ZipParseOptions } from "@archive/unzip/zip-parser";
import {
  createParse,
  type ParseOptions,
  type ZipEntry as ParseZipEntry
} from "@archive/unzip/stream";
import { pipeIterableToSink, type ArchiveSink } from "@archive/io/archive-sink";
import { toAsyncIterable, toUint8Array, type ArchiveSource } from "@archive/io/archive-source";

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

export interface UnzipOptions {
  decodeStrings?: boolean;
  parse?: ParseOptions;
}

export class UnzipEntry {
  readonly path: string;
  readonly isDirectory: boolean;

  private readonly _info?: ZipEntryInfo;
  private readonly _parser?: ZipParser;
  private readonly _parseEntry?: ParseZipEntry;

  constructor(
    args:
      | { kind: "buffer"; parser: ZipParser; info: ZipEntryInfo }
      | { kind: "stream"; entry: ParseZipEntry }
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
  }

  async bytes(): Promise<Uint8Array> {
    if (this._parser && this._info) {
      const out = await this._parser.extract(this._info.path);
      return out ?? new Uint8Array(0);
    }
    if (this._parseEntry) {
      const data = await this._parseEntry.buffer();
      // In Node.js, `entry.buffer()` may return a Buffer, which causes
      // deep-equality mismatches against Uint8Array in tests.
      if (typeof Buffer !== "undefined" && data instanceof Buffer) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
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
      for await (const chunk of this._parseEntry as any as AsyncIterable<Uint8Array>) {
        yield chunk;
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

  private async _ensureBufferParser(): Promise<ZipParser> {
    if (this._bufferParser) {
      return this._bufferParser;
    }

    if (
      this._source instanceof Uint8Array ||
      this._source instanceof ArrayBuffer ||
      typeof this._source === "string" ||
      (typeof Blob !== "undefined" && this._source instanceof Blob)
    ) {
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

  async *entries(): AsyncIterable<UnzipEntry> {
    // Buffer mode
    if (
      this._source instanceof Uint8Array ||
      this._source instanceof ArrayBuffer ||
      typeof this._source === "string" ||
      (typeof Blob !== "undefined" && this._source instanceof Blob)
    ) {
      const parser = await this._ensureBufferParser();
      for (const info of parser.getEntries()) {
        yield new UnzipEntry({ kind: "buffer", parser, info });
      }
      return;
    }

    // Streaming mode
    // Always prefer forceStream mode for backpressure and bounded buffering.
    const parse = createParse({ ...(this._options.parse ?? {}), forceStream: true });

    const feedPromise = (async () => {
      try {
        for await (const chunk of toAsyncIterable(this._source)) {
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
        parse.end();
        await parse.promise();
      } catch (e) {
        parse.destroy(e instanceof Error ? e : new Error(String(e)));
        throw e;
      }
    })();

    try {
      for await (const entry of parse as any as AsyncIterable<ParseZipEntry>) {
        yield new UnzipEntry({ kind: "stream", entry });
      }
      await feedPromise;
    } finally {
      // Ensure the feed task does not get stranded.
      await feedPromise.catch(() => {});
    }
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
