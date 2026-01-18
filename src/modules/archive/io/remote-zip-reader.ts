/**
 * Remote ZIP Reader - On-demand ZIP archive reading via HTTP Range requests
 *
 * This module provides efficient access to ZIP archives stored on remote servers.
 * Instead of downloading the entire archive, it uses HTTP Range requests to:
 *
 * 1. Read the End of Central Directory (EOCD) from the end of the file
 * 2. Read the Central Directory to get file metadata
 * 3. Read individual entries on demand
 *
 * This can dramatically reduce bandwidth usage when you only need a few files
 * from a large archive.
 *
 * @module
 */

import { BinaryReader } from "@archive/utils/binary";
import { decompress } from "@archive/compression/compress";
import { crc32 } from "@archive/compression/crc32";
import {
  zipCryptoDecrypt,
  aesDecrypt,
  zipCryptoVerifyPassword,
  aesVerifyPassword,
  AES_PASSWORD_VERIFY_LENGTH,
  AES_SALT_LENGTH,
  ZIP_CRYPTO_HEADER_SIZE
} from "@archive/crypto";
import { parseZipExtraFields } from "@archive/utils/zip-extra-fields";
import { resolveZipLastModifiedDateFromUnixSeconds } from "@archive/utils/timestamps";
import type { ZipEntryInfo, ZipEntryEncryptionMethod } from "@archive/zip-spec/zip-entry-info";
import {
  CENTRAL_DIR_HEADER_SIG,
  COMPRESSION_AES,
  COMPRESSION_DEFLATE,
  COMPRESSION_STORE,
  FLAG_UTF8,
  LOCAL_FILE_HEADER_SIG,
  UINT16_MAX,
  UINT32_MAX,
  ZIP64_END_OF_CENTRAL_DIR_SIG
} from "@archive/zip-spec/zip-records";
import type { AesKeyStrength } from "@archive/crypto/aes";
import type { RandomAccessReader, HttpRangeReaderOptions } from "./random-access";
import { HttpRangeReader } from "./random-access";

// Constants
const EOCD_MIN_SIZE = 22;
const EOCD_MAX_COMMENT_SIZE = 65535;
const EOCD_MAX_SEARCH_SIZE = EOCD_MIN_SIZE + EOCD_MAX_COMMENT_SIZE;

const ZIP64_EOCD_LOCATOR_SIG = 0x07064b50;
const ZIP64_EOCD_LOCATOR_SIZE = 20;
const LOCAL_HEADER_FIXED_SIZE = 30;

/**
 * Options for RemoteZipReader
 */
export interface RemoteZipReaderOptions {
  /**
   * Password for encrypted entries.
   */
  password?: string | Uint8Array;

  /**
   * Whether to decode file names as UTF-8.
   * @default true
   */
  decodeStrings?: boolean;

  /**
   * Abort signal for cancellation.
   */
  signal?: AbortSignal;

  /**
   * Whether to validate CRC32 checksum after extraction.
   * @default false
   */
  checkCrc32?: boolean;
}

/**
 * Options for extracting entries
 */
export interface ExtractOptions {
  /**
   * Password for encrypted entries (overrides constructor password).
   */
  password?: string | Uint8Array;

  /**
   * Whether to validate CRC32 checksum after extraction.
   * Overrides the constructor option.
   */
  checkCrc32?: boolean;

  /**
   * Progress callback for large file extraction.
   * Called with current bytes processed and total bytes.
   */
  onprogress?: (current: number, total: number) => void;
}

/**
 * Options for opening a remote ZIP file via URL
 */
export interface RemoteZipOpenOptions extends RemoteZipReaderOptions, HttpRangeReaderOptions {}

/**
 * Statistics about remote ZIP reading operations
 */
export interface RemoteZipStats {
  /** Total size of the ZIP file */
  totalSize: number;
  /** Number of entries in the archive */
  entryCount: number;
  /** HTTP request statistics (if using HttpRangeReader) */
  http?: {
    requestCount: number;
    bytesDownloaded: number;
    downloadedPercent: number;
  };
}

/**
 * Error thrown when CRC32 validation fails
 */
export class Crc32MismatchError extends Error {
  constructor(
    public readonly path: string,
    public readonly expected: number,
    public readonly actual: number
  ) {
    super(
      `CRC32 mismatch for "${path}": expected 0x${expected.toString(16).padStart(8, "0")}, got 0x${actual.toString(16).padStart(8, "0")}`
    );
    this.name = "Crc32MismatchError";
  }
}

/**
 * Remote ZIP Reader
 *
 * Provides on-demand access to ZIP archives via random access reading.
 * Only downloads the parts of the archive that are actually needed.
 *
 * @example
 * ```ts
 * // Open a remote ZIP file
 * const reader = await RemoteZipReader.open("https://example.com/large-archive.zip");
 *
 * // List entries without downloading file content
 * for (const entry of reader.getEntries()) {
 *   console.log(entry.path, entry.uncompressedSize);
 * }
 *
 * // Extract just one file
 * const data = await reader.extract("important-file.txt");
 *
 * // Check how much was downloaded
 * console.log(reader.getStats());
 *
 * await reader.close();
 * ```
 */
export class RemoteZipReader {
  private readonly reader: RandomAccessReader;
  private readonly options: RemoteZipReaderOptions;
  private entries: ZipEntryInfo[] = [];
  private entryMap: Map<string, ZipEntryInfo> = new Map();
  private archiveComment = "";
  private initialized = false;
  private httpReader?: HttpRangeReader;

  private readonly dataOffsetCache = new WeakMap<ZipEntryInfo, number>();
  private _hasEncryptedEntries: boolean | null = null;

  private constructor(
    reader: RandomAccessReader,
    options: RemoteZipReaderOptions = {},
    httpReader?: HttpRangeReader
  ) {
    this.reader = reader;
    this.options = options;
    this.httpReader = httpReader;
  }

  /**
   * Open a remote ZIP file via URL.
   *
   * @param url - URL of the ZIP file
   * @param options - Reader options
   * @returns Initialized RemoteZipReader
   */
  static async open(url: string, options: RemoteZipOpenOptions = {}): Promise<RemoteZipReader> {
    const httpReader = await HttpRangeReader.open(url, options);
    const instance = new RemoteZipReader(httpReader, options, httpReader);
    await instance.init();
    return instance;
  }

  /**
   * Create a RemoteZipReader from any RandomAccessReader.
   *
   * @param reader - A random access reader
   * @param options - Reader options
   * @returns Initialized RemoteZipReader
   */
  static async fromReader(
    reader: RandomAccessReader,
    options: RemoteZipReaderOptions = {}
  ): Promise<RemoteZipReader> {
    const instance = new RemoteZipReader(reader, options);
    await instance.init();
    return instance;
  }

  /**
   * Initialize the reader by parsing EOCD and Central Directory.
   */
  private async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const { eocd } = await this.readEOCD();
    await this.readCentralDirectory(eocd);
    this.initialized = true;
  }

  /**
   * Read and parse the End of Central Directory record.
   */
  private async readEOCD(): Promise<{
    eocd: EOCDInfo;
    zip64Eocd: ZIP64EOCDInfo | null;
  }> {
    const size = this.reader.size;

    // Read enough to find EOCD (it's at the end, but may have a comment)
    const searchSize = Math.min(size, EOCD_MAX_SEARCH_SIZE);
    const tailData = await this.reader.read(size - searchSize, size);

    // Search backwards for EOCD signature
    const eocdOffset = this.findEOCDSignature(tailData);
    if (eocdOffset === -1) {
      throw new Error("Invalid ZIP file: End of Central Directory not found");
    }

    // Parse EOCD
    const eocdReader = new BinaryReader(tailData, eocdOffset);
    eocdReader.skip(4); // signature
    const diskNumber = eocdReader.readUint16();
    const centralDirDisk = eocdReader.readUint16();
    const entriesOnDisk = eocdReader.readUint16();
    const totalEntries = eocdReader.readUint16();
    const centralDirSize = eocdReader.readUint32();
    const centralDirOffset = eocdReader.readUint32();
    const commentLength = eocdReader.readUint16();

    const decodeStrings = this.options.decodeStrings ?? true;
    this.archiveComment =
      commentLength > 0 ? eocdReader.readString(commentLength, decodeStrings) : "";

    const eocd: EOCDInfo = {
      diskNumber,
      centralDirDisk,
      entriesOnDisk,
      totalEntries,
      centralDirSize,
      centralDirOffset
    };

    // Check for ZIP64
    let zip64Eocd: ZIP64EOCDInfo | null = null;

    // The actual file offset of EOCD
    const eocdFileOffset = size - searchSize + eocdOffset;

    // ZIP64 EOCD Locator is right before the regular EOCD
    if (eocdFileOffset >= ZIP64_EOCD_LOCATOR_SIZE) {
      // Check if we already have the locator in our tail data
      const locatorLocalOffset = eocdOffset - ZIP64_EOCD_LOCATOR_SIZE;

      let locatorData: Uint8Array;
      if (locatorLocalOffset >= 0) {
        locatorData = tailData.subarray(
          locatorLocalOffset,
          locatorLocalOffset + ZIP64_EOCD_LOCATOR_SIZE
        );
      } else {
        // Need to read it separately
        locatorData = await this.reader.read(
          eocdFileOffset - ZIP64_EOCD_LOCATOR_SIZE,
          eocdFileOffset
        );
      }

      const locatorReader = new BinaryReader(locatorData, 0);
      const locatorSig = locatorReader.readUint32();

      if (locatorSig === ZIP64_EOCD_LOCATOR_SIG) {
        locatorReader.skip(4); // disk with ZIP64 EOCD
        const zip64EocdOffset = Number(locatorReader.readBigUint64());

        // Read ZIP64 EOCD
        const zip64EocdData = await this.reader.read(zip64EocdOffset, zip64EocdOffset + 56);
        const zip64Reader = new BinaryReader(zip64EocdData, 0);

        const zip64Sig = zip64Reader.readUint32();
        if (zip64Sig === ZIP64_END_OF_CENTRAL_DIR_SIG) {
          zip64Reader.skip(8); // size of ZIP64 EOCD record
          zip64Reader.skip(2); // version made by
          zip64Reader.skip(2); // version needed
          zip64Reader.skip(4); // disk number
          zip64Reader.skip(4); // disk with central dir

          const zip64EntriesOnDisk = zip64Reader.readBigUint64();
          const zip64TotalEntries = zip64Reader.readBigUint64();
          const zip64CentralDirSize = zip64Reader.readBigUint64();
          const zip64CentralDirOffset = zip64Reader.readBigUint64();

          zip64Eocd = {
            entriesOnDisk: zip64EntriesOnDisk,
            totalEntries: zip64TotalEntries,
            centralDirSize: zip64CentralDirSize,
            centralDirOffset: zip64CentralDirOffset
          };

          // Update with ZIP64 values if needed
          if (totalEntries === UINT16_MAX) {
            eocd.totalEntries = Number(zip64TotalEntries);
          }
          if (centralDirSize === UINT32_MAX) {
            eocd.centralDirSize = Number(zip64CentralDirSize);
          }
          if (centralDirOffset === UINT32_MAX) {
            eocd.centralDirOffset = Number(zip64CentralDirOffset);
          }
        }
      }
    }

    return { eocd, zip64Eocd };
  }

  /**
   * Find EOCD signature by searching backwards.
   */
  private findEOCDSignature(data: Uint8Array): number {
    // Search backwards for the signature
    for (let i = data.length - EOCD_MIN_SIZE; i >= 0; i--) {
      if (
        data[i] === 0x50 &&
        data[i + 1] === 0x4b &&
        data[i + 2] === 0x05 &&
        data[i + 3] === 0x06
      ) {
        // Verify this is a valid EOCD by checking comment length
        const commentLen = data[i + 20] | (data[i + 21] << 8);
        const expectedEnd = i + EOCD_MIN_SIZE + commentLen;
        if (expectedEnd === data.length) {
          return i;
        }
      }
    }
    return -1;
  }

  /**
   * Read and parse the Central Directory.
   */
  private async readCentralDirectory(eocd: EOCDInfo): Promise<void> {
    const decodeStrings = this.options.decodeStrings ?? true;

    // Handle empty archives
    if (eocd.totalEntries === 0 || eocd.centralDirSize === 0) {
      this.entries = [];
      return;
    }

    // Read the entire central directory in one request
    const centralDirData = await this.reader.read(
      eocd.centralDirOffset,
      eocd.centralDirOffset + eocd.centralDirSize
    );

    const reader = new BinaryReader(centralDirData, 0);
    this.entries = new Array(eocd.totalEntries);

    for (let i = 0; i < eocd.totalEntries; i++) {
      const sig = reader.readUint32();
      if (sig !== CENTRAL_DIR_HEADER_SIG) {
        throw new Error(`Invalid Central Directory header signature at entry ${i}`);
      }

      const versionMadeBy = reader.readUint16();
      reader.skip(2); // version needed
      const flags = reader.readUint16();
      const compressionMethod = reader.readUint16();
      const lastModTime = reader.readUint16();
      const lastModDate = reader.readUint16();
      const crc32 = reader.readUint32();
      let compressedSize = reader.readUint32();
      let uncompressedSize = reader.readUint32();
      const fileNameLength = reader.readUint16();
      const extraFieldLength = reader.readUint16();
      const commentLength = reader.readUint16();
      reader.skip(2); // disk number start
      reader.skip(2); // internal attributes
      const externalAttributes = reader.readUint32();
      let localHeaderOffset = reader.readUint32();

      const isUtf8 = (flags & FLAG_UTF8) !== 0;
      const useUtf8 = decodeStrings && isUtf8;

      const fileName = fileNameLength > 0 ? reader.readString(fileNameLength, useUtf8) : "";

      let extraFields = {} as ReturnType<typeof parseZipExtraFields>;
      let rawExtraField: Uint8Array = new Uint8Array(0);

      if (extraFieldLength > 0) {
        rawExtraField = reader.readBytes(extraFieldLength);
        const vars = {
          compressedSize,
          uncompressedSize,
          offsetToLocalFileHeader: localHeaderOffset
        };
        extraFields = parseZipExtraFields(rawExtraField, vars);

        compressedSize = vars.compressedSize;
        uncompressedSize = vars.uncompressedSize;
        localHeaderOffset = vars.offsetToLocalFileHeader ?? localHeaderOffset;
      }

      const comment = commentLength > 0 ? reader.readString(commentLength, useUtf8) : "";

      const isDirectory = fileName.endsWith("/") || (externalAttributes & 0x10) !== 0;
      const isEncrypted = (flags & 0x01) !== 0;

      const unixSecondsMtime = extraFields.mtimeUnixSeconds;
      const lastModified = resolveZipLastModifiedDateFromUnixSeconds(
        lastModDate,
        lastModTime,
        unixSecondsMtime
      );

      // Determine encryption method
      let encryptionMethod: ZipEntryEncryptionMethod = "none";
      let aesVersion: 1 | 2 | undefined;
      let aesKeyStrength: AesKeyStrength | undefined;
      let originalCompressionMethod: number | undefined;

      if (isEncrypted) {
        if (compressionMethod === COMPRESSION_AES && extraFields.aesInfo) {
          encryptionMethod = "aes";
          aesVersion = extraFields.aesInfo.version;
          aesKeyStrength = extraFields.aesInfo.keyStrength;
          originalCompressionMethod = extraFields.aesInfo.compressionMethod;
        } else {
          encryptionMethod = "zipcrypto";
        }
      }

      this.entries[i] = {
        path: fileName,
        isDirectory,
        compressedSize,
        compressedSize64: extraFields.compressedSize64,
        uncompressedSize,
        uncompressedSize64: extraFields.uncompressedSize64,
        compressionMethod,
        crc32,
        lastModified,
        localHeaderOffset,
        localHeaderOffset64: extraFields.offsetToLocalFileHeader64,
        comment,
        externalAttributes,
        versionMadeBy,
        extraField: rawExtraField,
        isEncrypted,
        encryptionMethod,
        aesVersion,
        aesKeyStrength,
        originalCompressionMethod,
        dosTime: lastModTime
      };

      this.entryMap.set(fileName, this.entries[i]);
    }
  }

  /**
   * Get all entries in the ZIP file.
   */
  getEntries(): readonly ZipEntryInfo[] {
    return this.entries;
  }

  /**
   * Get entry by path.
   */
  getEntry(path: string): ZipEntryInfo | undefined {
    return this.entryMap.get(path);
  }

  /**
   * Check if entry exists.
   */
  hasEntry(path: string): boolean {
    return this.entryMap.has(path);
  }

  /**
   * Get the archive comment.
   */
  getZipComment(): string {
    return this.archiveComment;
  }

  /**
   * List all file paths.
   */
  listFiles(): string[] {
    return [...this.entryMap.keys()];
  }

  /**
   * Get the number of file entries (excluding directories).
   */
  getFileCount(): number {
    return this.entries.filter(e => !e.isDirectory).length;
  }

  /**
   * Get the number of directory entries.
   */
  getDirectoryCount(): number {
    return this.entries.filter(e => e.isDirectory).length;
  }

  /**
   * Filter entries by a predicate function.
   *
   * @param predicate - Function to test each entry
   * @returns Array of entries that pass the test
   */
  filterEntries(predicate: (entry: ZipEntryInfo) => boolean): ZipEntryInfo[] {
    return this.entries.filter(predicate);
  }

  /**
   * Find entries matching a glob-like pattern.
   * Supports * (any characters) and ? (single character).
   *
   * @param pattern - Glob pattern (e.g., "*.txt", "folder/*", "**\/data.json")
   * @returns Array of matching entries
   */
  findEntries(pattern: string): ZipEntryInfo[] {
    const regex = new RegExp(
      "^" +
        pattern
          .replace(/[.+^${}()|[\]\\]/g, "\\$&")
          .replace(/\*\*/g, "{{GLOBSTAR}}")
          .replace(/\*/g, "[^/]*")
          .replace(/\?/g, ".")
          .replace(/\{\{GLOBSTAR\}\}/g, ".*") +
        "$"
    );
    return this.entries.filter(e => regex.test(e.path));
  }

  /**
   * Check if the archive contains encrypted entries.
   * Result is cached after first call for performance.
   */
  hasEncryptedEntries(): boolean {
    if (this._hasEncryptedEntries === null) {
      this._hasEncryptedEntries = this.entries.some(e => e.isEncrypted);
    }
    return this._hasEncryptedEntries;
  }

  /**
   * Extract a single file.
   *
   * @param path - File path within the archive
   * @param options - Extract options or password
   * @returns File data, or null if entry not found
   */
  async extract(
    path: string,
    options?: ExtractOptions | string | Uint8Array
  ): Promise<Uint8Array | null> {
    const entry = this.entryMap.get(path);
    if (!entry) {
      return null;
    }
    const opts = this.normalizeExtractOptions(options);
    return this.extractEntry(entry, opts);
  }

  /**
   * Extract a specific entry.
   *
   * @param entry - Entry to extract
   * @param options - Extract options or password
   * @returns File data
   */
  async extractEntry(
    entry: ZipEntryInfo,
    options?: ExtractOptions | string | Uint8Array
  ): Promise<Uint8Array> {
    const opts = this.normalizeExtractOptions(options);
    const password = opts.password ?? this.options.password;
    const shouldCheckCrc = opts.checkCrc32 ?? this.options.checkCrc32 ?? false;

    if (entry.isDirectory) {
      return new Uint8Array(0);
    }

    const dataOffset = await this.getEntryDataOffset(entry);

    opts.onprogress?.(0, entry.compressedSize);

    // Read compressed data
    const compressedData = await this.reader.read(dataOffset, dataOffset + entry.compressedSize);

    // Report progress for download
    opts.onprogress?.(entry.compressedSize, entry.compressedSize);

    return this.processEntryCompressedData(entry, compressedData, password, shouldCheckCrc);
  }

  private async processEntryCompressedData(
    entry: ZipEntryInfo,
    compressedData: Uint8Array,
    password: string | Uint8Array | undefined,
    shouldCheckCrc: boolean
  ): Promise<Uint8Array> {
    let result: Uint8Array;

    // Handle encrypted entries
    if (entry.isEncrypted) {
      if (!password) {
        throw new Error(`File "${entry.path}" is encrypted. Please provide a password.`);
      }

      if (entry.encryptionMethod === "aes" && entry.aesKeyStrength) {
        const decrypted = await aesDecrypt(compressedData, password, entry.aesKeyStrength);
        if (!decrypted) {
          throw new Error(
            `Failed to decrypt "${entry.path}": incorrect password or corrupted data`
          );
        }
        result = await this.decompressData(
          decrypted,
          entry.originalCompressionMethod ?? COMPRESSION_STORE
        );
      } else if (entry.encryptionMethod === "zipcrypto") {
        const decrypted = zipCryptoDecrypt(compressedData, password, entry.crc32, entry.dosTime);
        if (!decrypted) {
          throw new Error(
            `Failed to decrypt "${entry.path}": incorrect password or corrupted data`
          );
        }
        result = await this.decompressData(decrypted, entry.compressionMethod);
      } else {
        throw new Error(`Unsupported encryption method for "${entry.path}"`);
      }
    } else {
      result = await this.decompressData(compressedData, entry.compressionMethod);
    }

    // Validate CRC32 if requested
    // Note: AES-encrypted entries don't use CRC32 (they use HMAC instead)
    if (shouldCheckCrc && entry.encryptionMethod !== "aes") {
      const actualCrc = crc32(result);
      if (actualCrc !== entry.crc32) {
        throw new Crc32MismatchError(entry.path, entry.crc32, actualCrc);
      }
    }

    return result;
  }

  /**
   * Decompress data based on compression method.
   */
  private async decompressData(data: Uint8Array, compressionMethod: number): Promise<Uint8Array> {
    if (compressionMethod === COMPRESSION_STORE) {
      return data;
    }
    if (compressionMethod === COMPRESSION_DEFLATE) {
      return decompress(data);
    }
    throw new Error(`Unsupported compression method: ${compressionMethod}`);
  }

  /**
   * Normalize extract options from various input formats.
   */
  private normalizeExtractOptions(options?: ExtractOptions | string | Uint8Array): ExtractOptions {
    if (!options) {
      return {};
    }
    if (typeof options === "string" || options instanceof Uint8Array) {
      return { password: options };
    }
    return options;
  }

  /**
   * Extract all files from the archive.
   * This is a convenience method that calls extractMultiple with all file paths.
   *
   * @param options - Extract options or password
   * @returns Map of path to file data (directories are excluded)
   */
  async extractAll(
    options?: ExtractOptions | string | Uint8Array
  ): Promise<Map<string, Uint8Array>> {
    const filePaths = this.entries.filter(e => !e.isDirectory).map(e => e.path);
    return this.extractMultiple(filePaths, options);
  }

  /**
   * Extract multiple entries efficiently.
   * Entries are sorted by offset to minimize seeks/requests.
   *
   * @param paths - File paths to extract
   * @param options - Extract options or password
   * @returns Map of path to file data
   */
  async extractMultiple(
    paths: string[],
    options?: ExtractOptions | string | Uint8Array
  ): Promise<Map<string, Uint8Array>> {
    const result = new Map<string, Uint8Array>();
    const opts = this.normalizeExtractOptions(options);

    // Get entries and sort by offset for efficient sequential reading
    const entriesToExtract = paths
      .map(p => ({ path: p, entry: this.entryMap.get(p) }))
      .filter((e): e is { path: string; entry: ZipEntryInfo } => e.entry !== undefined)
      .sort((a, b) => a.entry.localHeaderOffset - b.entry.localHeaderOffset);

    if (entriesToExtract.length === 0) {
      return result;
    }

    // Calculate total size for progress
    const totalSize = entriesToExtract.reduce((sum, e) => sum + e.entry.compressedSize, 0);
    let processedSize = 0;

    // Pre-compute data offsets in batches to avoid per-entry local header reads.
    // This dramatically reduces HTTP Range request count when using HttpRangeReader.
    const MAX_HEADER_BATCH_BYTES = 64 * 1024;
    const MAX_HEADER_GAP_BYTES = 4 * 1024;

    for (let i = 0; i < entriesToExtract.length; ) {
      const firstOffset = entriesToExtract[i].entry.localHeaderOffset;
      const batchStart = firstOffset;
      let batchEnd = batchStart + LOCAL_HEADER_FIXED_SIZE;

      let j = i + 1;
      for (; j < entriesToExtract.length; j++) {
        const nextOffset = entriesToExtract[j].entry.localHeaderOffset;
        const nextEnd = nextOffset + LOCAL_HEADER_FIXED_SIZE;

        if (nextOffset - batchEnd > MAX_HEADER_GAP_BYTES) {
          break;
        }
        const expandedEnd = Math.max(batchEnd, nextEnd);
        if (expandedEnd - batchStart > MAX_HEADER_BATCH_BYTES) {
          break;
        }
        batchEnd = expandedEnd;
      }

      const batch = await this.reader.read(batchStart, batchEnd);

      for (let k = i; k < j; k++) {
        const entry = entriesToExtract[k].entry;
        if (this.dataOffsetCache.has(entry)) {
          continue;
        }

        const rel = entry.localHeaderOffset - batchStart;
        if (rel < 0 || rel + LOCAL_HEADER_FIXED_SIZE > batch.length) {
          await this.getEntryDataOffset(entry);
          continue;
        }

        const headerReader = new BinaryReader(batch, rel);
        const sig = headerReader.readUint32();
        if (sig !== LOCAL_FILE_HEADER_SIG) {
          await this.getEntryDataOffset(entry);
          continue;
        }

        headerReader.skip(22);
        const fileNameLength = headerReader.readUint16();
        const extraFieldLength = headerReader.readUint16();

        const dataOffset =
          entry.localHeaderOffset + LOCAL_HEADER_FIXED_SIZE + fileNameLength + extraFieldLength;
        this.dataOffsetCache.set(entry, dataOffset);
      }

      i = j;
    }

    // Extract in data batches (contiguous-ish reads), then slice per entry.
    const MAX_DATA_BATCH_BYTES = 4 * 1024 * 1024;
    const MAX_DATA_GAP_BYTES = 64 * 1024;

    // Pre-compute options that are the same for all entries
    const password = opts.password ?? this.options.password;
    const shouldCheckCrc = opts.checkCrc32 ?? this.options.checkCrc32 ?? false;

    for (let i = 0; i < entriesToExtract.length; ) {
      // Skip directories (no data to read)
      if (entriesToExtract[i].entry.isDirectory) {
        opts.onprogress?.(processedSize, totalSize);
        result.set(entriesToExtract[i].path, new Uint8Array(0));
        i++;
        continue;
      }

      const firstEntry = entriesToExtract[i].entry;
      const firstDataOffset = await this.getEntryDataOffset(firstEntry);
      const batchStart = firstDataOffset;
      let batchEnd = firstDataOffset + firstEntry.compressedSize;

      let j = i + 1;
      for (; j < entriesToExtract.length; j++) {
        const nextEntry = entriesToExtract[j].entry;
        if (nextEntry.isDirectory) {
          break;
        }

        const nextDataOffset = await this.getEntryDataOffset(nextEntry);
        const nextEnd = nextDataOffset + nextEntry.compressedSize;

        if (nextDataOffset - batchEnd > MAX_DATA_GAP_BYTES) {
          break;
        }

        const expandedEnd = Math.max(batchEnd, nextEnd);
        if (expandedEnd - batchStart > MAX_DATA_BATCH_BYTES && j > i + 1) {
          break;
        }

        batchEnd = expandedEnd;
      }

      const batch = await this.reader.read(batchStart, batchEnd);

      for (let k = i; k < j; k++) {
        const { path, entry } = entriesToExtract[k];

        if (entry.isDirectory) {
          opts.onprogress?.(processedSize, totalSize);
          result.set(path, new Uint8Array(0));
          continue;
        }

        const dataOffset = await this.getEntryDataOffset(entry);
        const rel = dataOffset - batchStart;
        const end = rel + entry.compressedSize;

        let compressedData: Uint8Array;
        if (rel < 0 || end > batch.length) {
          // Fallback for unexpected layout
          compressedData = await this.reader.read(dataOffset, dataOffset + entry.compressedSize);
        } else {
          compressedData = batch.subarray(rel, end);
        }

        opts.onprogress?.(processedSize, totalSize);
        const data = await this.processEntryCompressedData(
          entry,
          compressedData,
          password,
          shouldCheckCrc
        );
        result.set(path, data);
        processedSize += entry.compressedSize;
      }

      i = j;
    }

    return result;
  }

  /**
   * Iterate over entries with async callback.
   *
   * @param callback - Callback for each entry. Return false to stop iteration.
   * @param options - Extract options or password
   */
  async forEach(
    callback: (entry: ZipEntryInfo, getData: () => Promise<Uint8Array>) => Promise<boolean | void>,
    options?: ExtractOptions | string | Uint8Array
  ): Promise<void> {
    for await (const { entry, getData } of this.entriesGenerator(options)) {
      const shouldContinue = await callback(entry, getData);
      if (shouldContinue === false) {
        break;
      }
    }
  }

  /**
   * Async generator to iterate over entries one by one.
   * Useful for processing large archives without loading all entries into memory.
   *
   * @example
   * ```ts
   * for await (const { entry, getData } of reader.entriesGenerator()) {
   *   if (entry.path.endsWith('.json')) {
   *     const data = await getData();
   *     console.log(JSON.parse(new TextDecoder().decode(data)));
   *   }
   * }
   * ```
   */
  async *entriesGenerator(
    options?: ExtractOptions | string | Uint8Array
  ): AsyncGenerator<{ entry: ZipEntryInfo; getData: () => Promise<Uint8Array> }> {
    const opts = this.normalizeExtractOptions(options);

    for (const entry of this.entries) {
      let dataPromise: Promise<Uint8Array> | null = null;
      const getData = () => {
        if (!dataPromise) {
          dataPromise = this.extractEntry(entry, opts);
        }
        return dataPromise;
      };

      yield { entry, getData };
    }
  }

  /**
   * Check if a password is correct for an encrypted entry without extracting the full file.
   * This is much faster than extracting the file as it only reads the encryption header.
   *
   * @param path - File path within the archive
   * @param password - Password to check
   * @returns true if password is correct, false if incorrect, null if entry not found or not encrypted
   */
  async checkPassword(path: string, password: string | Uint8Array): Promise<boolean | null> {
    const entry = this.entryMap.get(path);
    if (!entry) {
      return null;
    }
    return this.checkEntryPassword(entry, password);
  }

  /**
   * Check if a password is correct for an encrypted entry.
   *
   * @param entry - Entry to check
   * @param password - Password to check
   * @returns true if password is correct, false if incorrect, null if not encrypted
   */
  async checkEntryPassword(
    entry: ZipEntryInfo,
    password: string | Uint8Array
  ): Promise<boolean | null> {
    if (!entry.isEncrypted) {
      return null;
    }

    const dataOffset = await this.getEntryDataOffset(entry);

    if (entry.encryptionMethod === "zipcrypto") {
      // ZipCrypto: Only need the encryption header
      const encryptionHeader = await this.reader.read(
        dataOffset,
        dataOffset + ZIP_CRYPTO_HEADER_SIZE
      );
      return zipCryptoVerifyPassword(encryptionHeader, password, entry.crc32, entry.dosTime);
    } else if (entry.encryptionMethod === "aes" && entry.aesKeyStrength) {
      // AES: read salt + password verification bytes only (fast path)
      // Salt size: 8 bytes for 128-bit, 12 bytes for 192-bit, 16 bytes for 256-bit
      // Password verification: 2 bytes
      const saltSize = AES_SALT_LENGTH[entry.aesKeyStrength];
      const headerSize = saltSize + AES_PASSWORD_VERIFY_LENGTH;
      const aesHeader = await this.reader.read(dataOffset, dataOffset + headerSize);
      return aesVerifyPassword(aesHeader, password, entry.aesKeyStrength);
    }

    return null;
  }

  private async getEntryDataOffset(entry: ZipEntryInfo): Promise<number> {
    const cached = this.dataOffsetCache.get(entry);
    if (cached !== undefined) {
      return cached;
    }

    // Local header is fixed size + variable filename + extra field
    const localHeaderData = await this.reader.read(
      entry.localHeaderOffset,
      entry.localHeaderOffset + LOCAL_HEADER_FIXED_SIZE
    );

    const headerReader = new BinaryReader(localHeaderData, 0);
    const sig = headerReader.readUint32();
    if (sig !== LOCAL_FILE_HEADER_SIG) {
      throw new Error(`Invalid local file header signature for "${entry.path}"`);
    }

    headerReader.skip(22); // skip to filename length
    const fileNameLength = headerReader.readUint16();
    const extraFieldLength = headerReader.readUint16();

    const dataOffset =
      entry.localHeaderOffset + LOCAL_HEADER_FIXED_SIZE + fileNameLength + extraFieldLength;
    this.dataOffsetCache.set(entry, dataOffset);
    return dataOffset;
  }

  /**
   * Extract to a WritableStream (streaming output).
   * Useful for large files to avoid loading the entire content into memory.
   *
   * @param path - File path within the archive
   * @param writable - WritableStream to write the extracted data to
   * @param options - Extract options or password
   * @returns true if extraction succeeded, false if entry not found
   */
  async extractToStream(
    path: string,
    writable: WritableStream<Uint8Array>,
    options?: ExtractOptions | string | Uint8Array
  ): Promise<boolean> {
    const entry = this.entryMap.get(path);
    if (!entry) {
      return false;
    }

    const data = await this.extractEntry(entry, options);
    const writer = writable.getWriter();
    try {
      await writer.write(data);
      await writer.close();
    } finally {
      writer.releaseLock();
    }
    return true;
  }

  /**
   * Verify CRC32 for an entry without returning the data.
   * Useful for integrity checking.
   *
   * @param path - File path within the archive
   * @param options - Extract options (password if encrypted)
   * @returns true if CRC32 matches, throws Crc32MismatchError if not, null if entry not found
   */
  async verifyCrc32(
    path: string,
    options?: ExtractOptions | string | Uint8Array
  ): Promise<boolean | null> {
    const entry = this.entryMap.get(path);
    if (!entry) {
      return null;
    }

    // AES-encrypted entries don't use CRC32
    if (entry.encryptionMethod === "aes") {
      return true;
    }

    const opts = this.normalizeExtractOptions(options);
    const data = await this.extractEntry(entry, { ...opts, checkCrc32: false });
    const actualCrc = crc32(data);

    if (actualCrc !== entry.crc32) {
      throw new Crc32MismatchError(entry.path, entry.crc32, actualCrc);
    }

    return true;
  }

  /**
   * Get statistics about the reader's operations.
   */
  getStats(): RemoteZipStats {
    const stats: RemoteZipStats = {
      totalSize: this.reader.size,
      entryCount: this.entries.length
    };

    if (this.httpReader) {
      const httpStats = this.httpReader.getStats();
      stats.http = {
        requestCount: httpStats.requestCount,
        bytesDownloaded: httpStats.bytesDownloaded,
        downloadedPercent: httpStats.downloadedPercent
      };
    }

    return stats;
  }

  /**
   * Close the reader and release resources.
   */
  async close(): Promise<void> {
    await this.reader.close?.();
  }
}

// Internal types
interface EOCDInfo {
  diskNumber: number;
  centralDirDisk: number;
  entriesOnDisk: number;
  totalEntries: number;
  centralDirSize: number;
  centralDirOffset: number;
}

interface ZIP64EOCDInfo {
  entriesOnDisk: bigint;
  totalEntries: bigint;
  centralDirSize: bigint;
  centralDirOffset: bigint;
}
