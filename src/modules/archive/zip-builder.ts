/**
 * ZIP file format builder
 *
 * Implements ZIP file structure according to PKWARE's APPNOTE.TXT specification
 * https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
 *
 * ZIP file structure:
 * ┌──────────────────────────┐
 * │   Local File Header 1    │
 * │   File Data 1            │
 * ├──────────────────────────┤
 * │   Local File Header 2    │
 * │   File Data 2            │
 * ├──────────────────────────┤
 * │         ...              │
 * ├──────────────────────────┤
 * │  Central Directory 1     │
 * │  Central Directory 2     │
 * │         ...              │
 * ├──────────────────────────┤
 * │ End of Central Directory │
 * └──────────────────────────┘
 */

import { compress, compressSync, type CompressOptions } from "./compress";
import { crc32 } from "./crc32";
import { concatUint8Arrays, sumUint8ArrayLengths } from "./utils/bytes";
import { type ZipTimestampMode } from "./utils/timestamps";
import { buildZipEntryMetadata, resolveZipCompressionMethod } from "./zip-entry-metadata";
import { DEFAULT_ZIP_LEVEL, DEFAULT_ZIP_TIMESTAMPS } from "./defaults";
import {
  buildCentralDirectoryHeader,
  buildEndOfCentralDirectory,
  buildLocalFileHeader
} from "./zip-records";
import { FLAG_UTF8, VERSION_MADE_BY, VERSION_NEEDED } from "./zip-constants";

const LOCAL_FILE_HEADER_FIXED_SIZE = 30;

interface ProcessedEntry {
  name: Uint8Array;
  data: Uint8Array;
  compressedData: Uint8Array;
  crc: number;
  compressionMethod: number;
  modTime: number;
  modDate: number;
  extraField: Uint8Array;
  comment: Uint8Array;
  offset: number;
}

/**
 * ZIP file entry
 */
export interface ZipEntry {
  /** File name (can include directory path, use forward slashes) */
  name: string;
  /** File data (will be compressed unless level=0) */
  data: Uint8Array;
  /** File modification time (optional, defaults to current time) */
  modTime?: Date;
  /** File comment (optional) */
  comment?: string;
}

interface ZipBuildSettings {
  level: number;
  timestamps: ZipTimestampMode;
  defaultModTime: Date;
}

function encodeZipComment(comment?: string): Uint8Array {
  // Keep empty comment as empty bytes (no encoding surprises).
  return comment ? new TextEncoder().encode(comment) : new Uint8Array(0);
}

function shouldDeflate(level: number, data: Uint8Array): boolean {
  return level > 0 && data.length > 0;
}

function computeLocalRecordSize(entry: ProcessedEntry): number {
  return (
    LOCAL_FILE_HEADER_FIXED_SIZE +
    entry.name.length +
    entry.extraField.length +
    entry.compressedData.length
  );
}

function buildProcessedEntry(
  entry: ZipEntry,
  offset: number,
  settings: ZipBuildSettings,
  compressedData: Uint8Array
): ProcessedEntry {
  const modDate = entry.modTime ?? settings.defaultModTime;
  const isCompressed = shouldDeflate(settings.level, entry.data);
  const metadata = buildZipEntryMetadata({
    name: entry.name,
    comment: entry.comment,
    modTime: modDate,
    timestamps: settings.timestamps,
    useDataDescriptor: false,
    deflate: isCompressed
  });

  return {
    name: metadata.nameBytes,
    data: entry.data,
    compressedData,
    crc: crc32(entry.data),
    compressionMethod: resolveZipCompressionMethod(isCompressed),
    modTime: metadata.dosTime,
    modDate: metadata.dosDate,
    extraField: metadata.extraField,
    comment: metadata.commentBytes,
    offset
  };
}

function appendProcessedEntry(
  processedEntries: ProcessedEntry[],
  entry: ZipEntry,
  compressedData: Uint8Array,
  currentOffset: number,
  settings: ZipBuildSettings
): { processedEntry: ProcessedEntry; nextOffset: number } {
  const processedEntry = buildProcessedEntry(entry, currentOffset, settings, compressedData);
  processedEntries.push(processedEntry);
  return {
    processedEntry,
    nextOffset: currentOffset + computeLocalRecordSize(processedEntry)
  };
}

/**
 * ZIP builder options
 */
export interface ZipOptions extends CompressOptions {
  /** ZIP file comment (optional) */
  comment?: string;

  /**
   * Timestamp writing strategy.
   * - "dos": only write DOS date/time fields (smallest output)
   * - "dos+utc": also write UTC mtime in 0x5455 extra field (default, best practice)
   */
  timestamps?: ZipTimestampMode;
}

function finalizeZip(
  processedEntries: ProcessedEntry[],
  zipComment: Uint8Array,
  centralDirOffset: number
): Uint8Array {
  // Build ZIP structure
  const chunks: Uint8Array[] = [];

  // Local file headers and data
  for (const entry of processedEntries) {
    chunks.push(buildLocalFileHeaderChunk(entry));
    chunks.push(entry.compressedData);
  }

  chunks.push(...buildCentralDirectorySection(processedEntries, centralDirOffset, zipComment));

  return concatUint8Arrays(chunks);
}

function buildLocalFileHeaderChunk(entry: ProcessedEntry): Uint8Array {
  return buildLocalFileHeader({
    fileName: entry.name,
    extraField: entry.extraField,
    flags: FLAG_UTF8,
    compressionMethod: entry.compressionMethod,
    dosTime: entry.modTime,
    dosDate: entry.modDate,
    crc32: entry.crc,
    compressedSize: entry.compressedData.length,
    uncompressedSize: entry.data.length,
    versionNeeded: VERSION_NEEDED
  });
}

function buildCentralDirHeaderChunk(entry: ProcessedEntry): Uint8Array {
  return buildCentralDirectoryHeader({
    fileName: entry.name,
    extraField: entry.extraField,
    comment: entry.comment,
    flags: FLAG_UTF8,
    compressionMethod: entry.compressionMethod,
    dosTime: entry.modTime,
    dosDate: entry.modDate,
    crc32: entry.crc,
    compressedSize: entry.compressedData.length,
    uncompressedSize: entry.data.length,
    localHeaderOffset: entry.offset,
    versionMadeBy: VERSION_MADE_BY,
    versionNeeded: VERSION_NEEDED
  });
}

function buildCentralDirectorySection(
  processedEntries: ProcessedEntry[],
  centralDirOffset: number,
  zipComment: Uint8Array
): Uint8Array[] {
  const chunks: Uint8Array[] = [];

  for (const entry of processedEntries) {
    chunks.push(buildCentralDirHeaderChunk(entry));
  }

  const centralDirSize = sumUint8ArrayLengths(chunks);

  chunks.push(
    buildEndOfCentralDirectory({
      entryCount: processedEntries.length,
      centralDirSize,
      centralDirOffset,
      comment: zipComment
    })
  );

  return chunks;
}

/**
 * Create a ZIP file from entries (async)
 *
 * @param entries - Files to include in ZIP
 * @param options - ZIP options
 * @returns ZIP file as Uint8Array
 *
 * @example
 * ```ts
 * const zip = await createZip([
 *   { name: "hello.txt", data: new TextEncoder().encode("Hello!") },
 *   { name: "folder/file.txt", data: new TextEncoder().encode("Nested!") }
 * ], { level: 6 });
 * ```
 */
export async function createZip(
  entries: ZipEntry[],
  options: ZipOptions = {}
): Promise<Uint8Array> {
  const level = options.level ?? DEFAULT_ZIP_LEVEL;
  const timestamps: ZipTimestampMode = options.timestamps ?? DEFAULT_ZIP_TIMESTAMPS;
  const zipComment = encodeZipComment(options.comment);
  const defaultModTime = new Date();

  const settings: ZipBuildSettings = {
    level,
    timestamps,
    defaultModTime
  };

  const compressOptions: CompressOptions = {
    level,
    thresholdBytes: options.thresholdBytes
  };

  const compressedDatas = await Promise.all(
    entries.map(async entry => {
      return shouldDeflate(level, entry.data) ? compress(entry.data, compressOptions) : entry.data;
    })
  );

  // Process entries
  const processedEntries: ProcessedEntry[] = [];
  let currentOffset = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const compressedData = compressedDatas[i]!;
    const result = appendProcessedEntry(
      processedEntries,
      entry,
      compressedData,
      currentOffset,
      settings
    );
    currentOffset = result.nextOffset;
  }

  return finalizeZip(processedEntries, zipComment, currentOffset);
}

/**
 * Create a ZIP file from entries (sync)
 *
 * This is supported in both Node.js and browser builds.
 */
export function createZipSync(entries: ZipEntry[], options: ZipOptions = {}): Uint8Array {
  const level = options.level ?? DEFAULT_ZIP_LEVEL;
  const timestamps: ZipTimestampMode = options.timestamps ?? DEFAULT_ZIP_TIMESTAMPS;
  const zipComment = encodeZipComment(options.comment);
  const defaultModTime = new Date();

  const settings: ZipBuildSettings = {
    level,
    timestamps,
    defaultModTime
  };

  const compressOptions: CompressOptions = {
    level,
    thresholdBytes: options.thresholdBytes
  };

  // Process entries
  const processedEntries: ProcessedEntry[] = [];
  let currentOffset = 0;

  for (const entry of entries) {
    // Compress data
    const compressedData = shouldDeflate(level, entry.data)
      ? compressSync(entry.data, compressOptions)
      : entry.data;

    const result = appendProcessedEntry(
      processedEntries,
      entry,
      compressedData,
      currentOffset,
      settings
    );
    currentOffset = result.nextOffset;
  }

  return finalizeZip(processedEntries, zipComment, currentOffset);
}

/**
 * Streaming ZIP builder for large files
 * Writes chunks to a callback as they are generated
 */
export class ZipBuilder {
  private entries: ProcessedEntry[] = [];
  private currentOffset = 0;
  private level: number;
  private zipComment: Uint8Array;
  private timestamps: ZipTimestampMode;
  private compressOptions: CompressOptions;
  private settings: ZipBuildSettings;
  private finalized = false;

  /**
   * Create a new ZIP builder
   * @param options - ZIP options
   */
  constructor(options: ZipOptions = {}) {
    this.level = options.level ?? DEFAULT_ZIP_LEVEL;
    this.zipComment = encodeZipComment(options.comment);
    this.timestamps = options.timestamps ?? DEFAULT_ZIP_TIMESTAMPS;

    this.compressOptions = {
      level: this.level,
      thresholdBytes: options.thresholdBytes
    };

    this.settings = {
      level: this.level,
      timestamps: this.timestamps,
      defaultModTime: new Date()
    };
  }

  /**
   * Add a file to the ZIP (async)
   * @param entry - File entry
   * @returns Local file header and compressed data chunks
   */
  async addFile(entry: ZipEntry): Promise<Uint8Array[]> {
    if (this.finalized) {
      throw new Error("Cannot add files after finalizing");
    }

    // Compress data
    const compressedData = shouldDeflate(this.level, entry.data)
      ? await compress(entry.data, this.compressOptions)
      : entry.data;

    const result = appendProcessedEntry(
      this.entries,
      entry,
      compressedData,
      this.currentOffset,
      this.settings
    );
    this.currentOffset = result.nextOffset;

    return [buildLocalFileHeaderChunk(result.processedEntry), compressedData];
  }

  /**
   * Add a file to the ZIP (sync)
   * @param entry - File entry
   * @returns Local file header and compressed data chunks
   */
  addFileSync(entry: ZipEntry): Uint8Array[] {
    if (this.finalized) {
      throw new Error("Cannot add files after finalizing");
    }

    // Compress data
    const compressedData = shouldDeflate(this.level, entry.data)
      ? compressSync(entry.data, this.compressOptions)
      : entry.data;

    const result = appendProcessedEntry(
      this.entries,
      entry,
      compressedData,
      this.currentOffset,
      this.settings
    );
    this.currentOffset = result.nextOffset;

    return [buildLocalFileHeaderChunk(result.processedEntry), compressedData];
  }

  /**
   * Finalize the ZIP and return central directory + end record
   * @returns Central directory and end of central directory chunks
   */
  finalize(): Uint8Array[] {
    if (this.finalized) {
      throw new Error("ZIP already finalized");
    }
    this.finalized = true;

    return buildCentralDirectorySection(this.entries, this.currentOffset, this.zipComment);
  }

  /**
   * Get current number of entries
   */
  get entryCount(): number {
    return this.entries.length;
  }

  /**
   * Get current ZIP data size (without central directory)
   */
  get dataSize(): number {
    return this.currentOffset;
  }
}
