/**
 * TAR + Gzip (tar.gz / tgz) Support
 *
 * Provides utilities for creating and extracting gzip-compressed TAR archives.
 * Uses Node.js native zlib for compression/decompression.
 */

import { promisify } from "util";
import * as zlib from "zlib";

import { DEFAULT_COMPRESS_LEVEL } from "@archive/shared/defaults";
import { uint8ArrayToBuffer, bufferToUint8Array } from "@archive/compression/compress";
import type { ArchiveSource } from "@archive/io/archive-source";
import { toUint8Array, isInMemoryArchiveSource, toAsyncIterable } from "@archive/io/archive-source";
import { collect } from "@archive/io/archive-sink";
import { TarArchive, addEntries, type TarArchiveOptions } from "./tar-archive";
import { parseTar, untar, type TarEntry, type TarParseOptions } from "./tar-parser";

const gzipAsync = promisify(zlib.gzip) as (
  input: zlib.InputType,
  options?: zlib.ZlibOptions
) => Promise<Buffer>;
const gunzipAsync = promisify(zlib.gunzip) as (input: zlib.InputType) => Promise<Buffer>;

export interface TarGzOptions extends TarArchiveOptions {
  /** Compression level (0-9, default: 6) */
  level?: number;
}

// Use TarParseOptions directly since we don't need gzip-specific parse options
export type ParseTarGzOptions = TarParseOptions;

/**
 * TarGz Archive Builder
 *
 * Creates gzip-compressed TAR archives (.tar.gz / .tgz)
 *
 * @example
 * ```ts
 * const archive = new TarGzArchive({ level: 6 });
 * archive.add("file.txt", "Hello, World!");
 * const bytes = await archive.bytes();
 * ```
 */
export class TarGzArchive extends TarArchive {
  private readonly _gzLevel: number;

  constructor(options: TarGzOptions = {}) {
    super(options);
    this._gzLevel = options.level ?? DEFAULT_COMPRESS_LEVEL;
  }

  /**
   * Generate compressed archive as async iterable
   */
  override async *stream(): AsyncIterable<Uint8Array> {
    const tarBytes = await collect(super.stream());
    const compressed = await gzipAsync(uint8ArrayToBuffer(tarBytes), { level: this._gzLevel });
    yield bufferToUint8Array(compressed);
  }
}

/**
 * Create a gzip-compressed TAR archive
 */
export async function targz(
  entries: Map<string, ArchiveSource> | Array<{ name: string; source: ArchiveSource }>,
  options: TarGzOptions = {}
): Promise<Uint8Array> {
  const archive = new TarGzArchive(options);
  addEntries(archive, entries);
  return archive.bytes();
}

/**
 * Parse a gzip-compressed TAR archive
 *
 * @param source - Compressed archive data
 * @param options - Parse options
 * @returns Array of TAR entries
 */
export async function parseTarGz(
  source: ArchiveSource,
  options: ParseTarGzOptions = {}
): Promise<TarEntry[]> {
  // Get the compressed data
  let compressed: Uint8Array;
  if (isInMemoryArchiveSource(source)) {
    compressed = await toUint8Array(source);
  } else {
    compressed = await collect(toAsyncIterable(source, { signal: options.signal }));
  }

  return parseTar(await gunzip(compressed), options);
}

/**
 * Parse a gzip-compressed TAR archive as async iterable stream
 */
export async function* parseTarGzStream(
  source: ArchiveSource,
  options: ParseTarGzOptions = {}
): AsyncIterable<TarEntry> {
  // For gzip, we need to decompress completely first
  // Streaming decompression of gzip is possible but adds complexity
  yield* await parseTarGz(source, options);
}

/**
 * Extract gzip-compressed TAR archive to Map
 *
 * @param source - Compressed archive data
 * @param options - Parse options
 * @returns Map of path → { info, data }
 */
export async function untargz(
  source: ArchiveSource,
  options: ParseTarGzOptions = {}
): Promise<Map<string, { info: TarEntry["info"]; data: Uint8Array }>> {
  // Get the compressed data
  let compressed: Uint8Array;
  if (isInMemoryArchiveSource(source)) {
    compressed = await toUint8Array(source);
  } else {
    compressed = await collect(toAsyncIterable(source, { signal: options.signal }));
  }
  // Decompress and use existing untar
  return untar(await gunzip(compressed), options);
}

/**
 * Compress an existing TAR archive to gzip (alias for gzip)
 */
export const gzipTar = gzip;

/**
 * Decompress a gzipped file
 */
export async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  return bufferToUint8Array(await gunzipAsync(uint8ArrayToBuffer(data)));
}

/**
 * Compress data with gzip
 */
export async function gzip(
  data: Uint8Array,
  options: { level?: number } = {}
): Promise<Uint8Array> {
  const level = options.level ?? DEFAULT_COMPRESS_LEVEL;
  return bufferToUint8Array(await gzipAsync(uint8ArrayToBuffer(data), { level }));
}

/**
 * Synchronous gzip compression
 */
export function gzipSync(data: Uint8Array, options: { level?: number } = {}): Uint8Array {
  return bufferToUint8Array(
    zlib.gzipSync(uint8ArrayToBuffer(data), { level: options.level ?? DEFAULT_COMPRESS_LEVEL })
  );
}

/**
 * Synchronous gunzip decompression
 */
export function gunzipSync(data: Uint8Array): Uint8Array {
  return bufferToUint8Array(zlib.gunzipSync(uint8ArrayToBuffer(data)));
}
