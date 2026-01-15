/**
 * ZIP file format encoder (single-buffer output)
 *
 * Implements ZIP file structure according to PKWARE's APPNOTE.TXT specification
 * https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
 *
 * This module focuses on producing a complete ZIP as a single Uint8Array.
 * For true streaming (push chunks while reading sources), use `zip()` / `ZipArchive.stream()`.
 */

import { compress, compressSync, type CompressOptions } from "@archive/compression/compress";
import { crc32 } from "@archive/compression/crc32";
import {
  zipCryptoEncrypt,
  aesEncrypt,
  buildAesExtraField,
  randomBytes,
  type ZipEncryptionMethod,
  isAesEncryption,
  getAesKeyStrength
} from "@archive/crypto";
import { DEFAULT_ZIP_LEVEL, DEFAULT_ZIP_TIMESTAMPS } from "@archive/defaults";
import { isProbablyIncompressible } from "@archive/utils/compressibility";
import { encodeUtf8 } from "@archive/utils/text";
import { type ZipTimestampMode } from "@archive/utils/timestamps";
import {
  buildZipEntryMetadata,
  resolveZipCompressionMethod
} from "@archive/zip/zip-entry-metadata";
import {
  FLAG_UTF8,
  FLAG_ENCRYPTED,
  COMPRESSION_AES,
  UINT16_MAX,
  UINT32_MAX,
  ZIP_CENTRAL_DIR_HEADER_FIXED_SIZE,
  ZIP_END_OF_CENTRAL_DIR_FIXED_SIZE,
  ZIP_LOCAL_FILE_HEADER_FIXED_SIZE,
  ZIP64_END_OF_CENTRAL_DIR_FIXED_SIZE,
  ZIP64_END_OF_CENTRAL_DIR_LOCATOR_FIXED_SIZE,
  buildZip64EndOfCentralDirectory,
  buildZip64EndOfCentralDirectoryLocator,
  buildZip64ExtraField,
  concatExtraFields,
  VERSION_ZIP64,
  writeCentralDirectoryHeaderInto,
  writeEndOfCentralDirectoryInto,
  writeLocalFileHeaderInto
} from "@archive/zip-spec/zip-records";
import type { Zip64Mode } from "./zip64-mode";

const REPRODUCIBLE_ZIP_MOD_TIME = new Date(1980, 0, 1, 0, 0, 0);
const EMPTY = new Uint8Array(0);

interface ProcessedEntry {
  name: Uint8Array;
  uncompressedSize: number;
  compressedData: Uint8Array;
  crc: number;
  compressionMethod: number;
  modTime: number;
  modDate: number;
  extraField: Uint8Array;
  comment: Uint8Array;
  offset: number;
  flags: number;
}

/**
 * ZIP file entry
 */
export interface ZipEntry {
  /** File name (can include directory path, use forward slashes) */
  name: string;
  /** File data (will be compressed unless level=0) */
  data: Uint8Array;
  /** Optional per-entry compression level override */
  level?: number;
  /** File modification time (optional, defaults to current time) */
  modTime?: Date;
  /** File comment (optional) */
  comment?: string;
  /** Per-entry encryption method override */
  encryptionMethod?: ZipEncryptionMethod;
  /** Per-entry password override */
  password?: string | Uint8Array;
}

interface ZipBuildSettings {
  level: number;
  timestamps: ZipTimestampMode;
  defaultModTime: Date;
  encryptionMethod: ZipEncryptionMethod;
  password?: string | Uint8Array;
}

/**
 * Validate encryption options and throw if invalid.
 */
function validateEncryptionOptions(
  encryptionMethod: ZipEncryptionMethod,
  password: string | Uint8Array | undefined,
  isSync: boolean
): void {
  if (encryptionMethod !== "none" && !password) {
    throw new Error("Password is required when encryption is enabled");
  }
  if (isSync && isAesEncryption(encryptionMethod)) {
    throw new Error(
      "AES encryption requires async API. Use createZip() instead of createZipSync()."
    );
  }
}

/**
 * Parse common ZIP options into build settings.
 */
function parseZipBuildOptions(options: ZipOptions): {
  settings: ZipBuildSettings;
  zipComment: Uint8Array;
  zip64Mode: Zip64Mode;
  smartStore: boolean;
  thresholdBytes: number | undefined;
} {
  const reproducible = options.reproducible ?? false;
  const level = options.level ?? DEFAULT_ZIP_LEVEL;
  const timestamps: ZipTimestampMode =
    options.timestamps ?? (reproducible ? "dos" : DEFAULT_ZIP_TIMESTAMPS);
  const defaultModTime = options.modTime ?? (reproducible ? REPRODUCIBLE_ZIP_MOD_TIME : new Date());

  return {
    settings: {
      level,
      timestamps,
      defaultModTime,
      encryptionMethod: options.encryptionMethod ?? "none",
      password: options.password
    },
    zipComment: encodeZipComment(options.comment),
    zip64Mode: options.zip64 ?? "auto",
    smartStore: options.smartStore ?? true,
    thresholdBytes: options.thresholdBytes
  };
}

function encodeZipComment(comment?: string): Uint8Array {
  // Keep empty comment as empty bytes (no encoding surprises).
  return comment ? encodeUtf8(comment) : EMPTY;
}

function shouldDeflate(level: number, data: Uint8Array): boolean {
  return level > 0 && data.length > 0;
}

async function compressEntryMaybe(
  entry: ZipEntry,
  level: number,
  compressOptions: CompressOptions,
  smartStore: boolean
): Promise<{ compressedData: Uint8Array; deflate: boolean }> {
  if (!shouldDeflate(level, entry.data)) {
    return { compressedData: entry.data, deflate: false };
  }

  if (!smartStore) {
    const compressed = await compress(entry.data, compressOptions);
    return { compressedData: compressed, deflate: true };
  }

  // Heuristic: skip deflate for high-entropy inputs.
  if (isProbablyIncompressible(entry.data)) {
    return { compressedData: entry.data, deflate: false };
  }

  const compressed = await compress(entry.data, compressOptions);
  if (compressed.length >= entry.data.length) {
    return { compressedData: entry.data, deflate: false };
  }

  return { compressedData: compressed, deflate: true };
}

function compressEntryMaybeSync(
  entry: ZipEntry,
  level: number,
  compressOptions: CompressOptions,
  smartStore: boolean
): { compressedData: Uint8Array; deflate: boolean } {
  if (!shouldDeflate(level, entry.data)) {
    return { compressedData: entry.data, deflate: false };
  }

  if (!smartStore) {
    const compressed = compressSync(entry.data, compressOptions);
    return { compressedData: compressed, deflate: true };
  }

  if (isProbablyIncompressible(entry.data)) {
    return { compressedData: entry.data, deflate: false };
  }

  const compressed = compressSync(entry.data, compressOptions);
  if (compressed.length >= entry.data.length) {
    return { compressedData: entry.data, deflate: false };
  }

  return { compressedData: compressed, deflate: true };
}

function buildProcessedEntry(
  entry: ZipEntry,
  settings: ZipBuildSettings,
  compressedData: Uint8Array,
  deflate: boolean,
  encryptionResult?: { data: Uint8Array; extraField?: Uint8Array; compressionMethod: number }
): ProcessedEntry {
  const modDate = entry.modTime ?? settings.defaultModTime;
  const metadata = buildZipEntryMetadata({
    name: entry.name,
    comment: entry.comment,
    modTime: modDate,
    timestamps: settings.timestamps,
    useDataDescriptor: false,
    deflate
  });

  // Determine final data and compression method based on encryption
  let finalData: Uint8Array;
  let finalCompressionMethod: number;
  let finalExtraField: Uint8Array = metadata.extraField;
  let flags = FLAG_UTF8;

  if (encryptionResult) {
    finalData = encryptionResult.data;
    finalCompressionMethod = encryptionResult.compressionMethod;
    flags |= FLAG_ENCRYPTED;
    if (encryptionResult.extraField) {
      finalExtraField = concatExtraFields(metadata.extraField, encryptionResult.extraField);
    }
  } else {
    finalData = compressedData;
    finalCompressionMethod = resolveZipCompressionMethod(deflate);
  }

  return {
    name: metadata.nameBytes,
    uncompressedSize: entry.data.length,
    compressedData: finalData,
    crc: crc32(entry.data),
    compressionMethod: finalCompressionMethod,
    modTime: metadata.dosTime,
    modDate: metadata.dosDate,
    extraField: finalExtraField,
    comment: metadata.commentBytes,
    offset: 0,
    flags
  };
}

/**
 * ZIP encoder options
 */
export interface ZipOptions extends CompressOptions {
  /** ZIP file comment (optional) */
  comment?: string;

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
   * Max number of entries to compress concurrently in `createZip()`.
   * This helps avoid zlib threadpool saturation / memory spikes with many files.
   *
   * Defaults to 4.
   */
  concurrency?: number;

  /**
   * If true (default), automatically STORE incompressible data.
   * If false, always follow `level` (DEFLATE when level > 0).
   */
  smartStore?: boolean;

  /**
   * Timestamp writing strategy.
   * - "dos": only write DOS date/time fields (smallest output)
   * - "dos+utc": also write UTC mtime in 0x5455 extra field
   */
  timestamps?: ZipTimestampMode;

  /**
   * ZIP64 mode:
   * - "auto" (default): write ZIP64 only when required by limits (e.g. >65535 entries).
   * - true: force ZIP64 structures even for small archives (less legacy compatibility).
   * - false: forbid ZIP64; throws if ZIP64 is required.
   */
  zip64?: Zip64Mode;

  /**
   * Encryption method for all entries:
   * - "none" (default): no encryption
   * - "zipcrypto": Traditional PKWARE encryption (weak, for compatibility)
   * - "aes-128", "aes-192", "aes-256": WinZip AES encryption (recommended)
   */
  encryptionMethod?: ZipEncryptionMethod;

  /**
   * Password for encryption. Required when encryptionMethod is not "none".
   */
  password?: string | Uint8Array;
}

/**
 * Encrypt compressed data using the specified method.
 */
async function encryptData(
  compressedData: Uint8Array,
  originalCrc: number,
  encryptionMethod: ZipEncryptionMethod,
  password: string | Uint8Array,
  originalCompressionMethod: number
): Promise<{ data: Uint8Array; extraField?: Uint8Array; compressionMethod: number }> {
  if (encryptionMethod === "zipcrypto") {
    // ZipCrypto encryption
    const encrypted = zipCryptoEncrypt(compressedData, password, originalCrc, randomBytes);
    return {
      data: encrypted,
      compressionMethod: originalCompressionMethod
    };
  }

  if (isAesEncryption(encryptionMethod)) {
    // AES encryption
    const keyStrength = getAesKeyStrength(encryptionMethod)!;
    const encrypted = await aesEncrypt(compressedData, password, keyStrength);
    const aesExtraField = buildAesExtraField(2, keyStrength, originalCompressionMethod);
    return {
      data: encrypted,
      extraField: aesExtraField,
      compressionMethod: COMPRESSION_AES
    };
  }

  // No encryption
  return {
    data: compressedData,
    compressionMethod: originalCompressionMethod
  };
}

/**
 * Encrypt compressed data synchronously (ZipCrypto only).
 */
function encryptDataSync(
  compressedData: Uint8Array,
  originalCrc: number,
  encryptionMethod: ZipEncryptionMethod,
  password: string | Uint8Array,
  originalCompressionMethod: number
): { data: Uint8Array; extraField?: Uint8Array; compressionMethod: number } {
  if (encryptionMethod === "zipcrypto") {
    const encrypted = zipCryptoEncrypt(compressedData, password, originalCrc, randomBytes);
    return {
      data: encrypted,
      compressionMethod: originalCompressionMethod
    };
  }

  if (isAesEncryption(encryptionMethod)) {
    throw new Error(
      "AES encryption requires async API. Use createZip() instead of createZipSync()."
    );
  }

  return {
    data: compressedData,
    compressionMethod: originalCompressionMethod
  };
}

function finalizeZip(
  processedEntries: ProcessedEntry[],
  zipComment: Uint8Array,
  zip64Mode: Zip64Mode = "auto"
): Uint8Array {
  const forceZip64 = zip64Mode === true;
  const forbidZip64 = zip64Mode === false;

  // Precompute offsets and effective extra fields (local vs central can differ for ZIP64).
  const localExtraFields: Uint8Array[] = new Array(processedEntries.length);
  const centralExtraFields: Uint8Array[] = new Array(processedEntries.length);
  const zip64EntryNeeded: boolean[] = new Array(processedEntries.length);
  const compressedSizes: number[] = new Array(processedEntries.length);

  let localSectionSize = 0;
  for (let i = 0; i < processedEntries.length; i++) {
    const entry = processedEntries[i]!;
    entry.offset = localSectionSize;

    const compressedSize = entry.compressedData.length;
    compressedSizes[i] = compressedSize;
    const needsZip64Entry =
      forceZip64 ||
      entry.offset > UINT32_MAX ||
      compressedSize > UINT32_MAX ||
      entry.uncompressedSize > UINT32_MAX;
    zip64EntryNeeded[i] = needsZip64Entry;

    const zip64LocalExtra = needsZip64Entry
      ? buildZip64ExtraField({
          uncompressedSize: entry.uncompressedSize,
          compressedSize
        })
      : EMPTY;
    const zip64CentralExtra = needsZip64Entry
      ? buildZip64ExtraField({
          uncompressedSize: entry.uncompressedSize,
          compressedSize,
          localHeaderOffset: entry.offset
        })
      : EMPTY;

    localExtraFields[i] = needsZip64Entry
      ? concatExtraFields(entry.extraField, zip64LocalExtra)
      : entry.extraField;
    centralExtraFields[i] = needsZip64Entry
      ? concatExtraFields(entry.extraField, zip64CentralExtra)
      : entry.extraField;

    const localHeaderSize =
      ZIP_LOCAL_FILE_HEADER_FIXED_SIZE + entry.name.length + localExtraFields[i]!.length;
    localSectionSize += localHeaderSize + compressedSize;
  }

  const centralDirOffset = localSectionSize;

  let centralDirSize = 0;
  for (let i = 0; i < processedEntries.length; i++) {
    const entry = processedEntries[i]!;
    const size =
      ZIP_CENTRAL_DIR_HEADER_FIXED_SIZE +
      entry.name.length +
      centralExtraFields[i]!.length +
      entry.comment.length;
    centralDirSize += size;
  }
  const needsZip64FromArchive =
    processedEntries.length > UINT16_MAX ||
    centralDirOffset > UINT32_MAX ||
    centralDirSize > UINT32_MAX;
  const needsZip64 = forceZip64 || needsZip64FromArchive;
  if (forbidZip64 && needsZip64) {
    throw new Error("ZIP64 is required but zip64=false");
  }

  const zip64TrailerSize = needsZip64
    ? ZIP64_END_OF_CENTRAL_DIR_FIXED_SIZE + ZIP64_END_OF_CENTRAL_DIR_LOCATOR_FIXED_SIZE
    : 0;

  const totalSize =
    localSectionSize +
    centralDirSize +
    zip64TrailerSize +
    ZIP_END_OF_CENTRAL_DIR_FIXED_SIZE +
    zipComment.length;
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);

  let offset = 0;

  // Local file headers and data
  for (let i = 0; i < processedEntries.length; i++) {
    const entry = processedEntries[i]!;
    const compressedSize = compressedSizes[i]!;
    const needsZip64Entry = zip64EntryNeeded[i]!;

    offset += writeLocalFileHeaderInto(out, view, offset, {
      fileName: entry.name,
      extraField: localExtraFields[i]!,
      flags: entry.flags,
      compressionMethod: entry.compressionMethod,
      dosTime: entry.modTime,
      dosDate: entry.modDate,
      crc32: entry.crc,
      compressedSize: needsZip64Entry ? UINT32_MAX : compressedSize,
      uncompressedSize: needsZip64Entry ? UINT32_MAX : entry.uncompressedSize,
      versionNeeded: needsZip64Entry ? VERSION_ZIP64 : undefined
    });

    out.set(entry.compressedData, offset);
    offset += compressedSize;
  }

  // Central directory headers
  for (let i = 0; i < processedEntries.length; i++) {
    const entry = processedEntries[i]!;
    const compressedSize = compressedSizes[i]!;
    const needsZip64Entry = zip64EntryNeeded[i]!;

    offset += writeCentralDirectoryHeaderInto(out, view, offset, {
      fileName: entry.name,
      extraField: centralExtraFields[i]!,
      comment: entry.comment,
      flags: entry.flags,
      compressionMethod: entry.compressionMethod,
      dosTime: entry.modTime,
      dosDate: entry.modDate,
      crc32: entry.crc,
      compressedSize: needsZip64Entry ? UINT32_MAX : compressedSize,
      uncompressedSize: needsZip64Entry ? UINT32_MAX : entry.uncompressedSize,
      localHeaderOffset: needsZip64Entry ? UINT32_MAX : entry.offset,
      versionNeeded: needsZip64Entry ? VERSION_ZIP64 : undefined
    });
  }

  if (needsZip64) {
    const zip64EocdOffset = offset;
    const zip64Eocd = buildZip64EndOfCentralDirectory({
      entryCountOnDisk: processedEntries.length,
      entryCountTotal: processedEntries.length,
      centralDirSize,
      centralDirOffset
    });
    out.set(zip64Eocd, offset);
    offset += zip64Eocd.length;

    const zip64Locator = buildZip64EndOfCentralDirectoryLocator({
      zip64EndOfCentralDirectoryOffset: zip64EocdOffset,
      totalDisks: 1
    });
    out.set(zip64Locator, offset);
    offset += zip64Locator.length;

    // End of central directory (classic) uses sentinel values.
    writeEndOfCentralDirectoryInto(out, view, offset, {
      entryCount: UINT16_MAX,
      centralDirSize: UINT32_MAX,
      centralDirOffset: UINT32_MAX,
      comment: zipComment
    });
    return out;
  }

  // End of central directory
  writeEndOfCentralDirectoryInto(out, view, offset, {
    entryCount: processedEntries.length,
    centralDirSize,
    centralDirOffset,
    comment: zipComment
  });

  return out;
}

/**
 * Create a ZIP file from entries (async)
 */
export async function createZip(
  entries: ZipEntry[],
  options: ZipOptions = {}
): Promise<Uint8Array> {
  const { settings, zipComment, zip64Mode, smartStore, thresholdBytes } =
    parseZipBuildOptions(options);
  validateEncryptionOptions(settings.encryptionMethod, settings.password, false);

  const concurrency = options.concurrency ?? 4;
  const limit = Math.max(1, Math.floor(concurrency));
  const processedEntries = new Array<ProcessedEntry>(entries.length);

  if (entries.length > 0) {
    let nextIndex = 0;
    const workerCount = Math.min(limit, entries.length);

    const workers = Array.from({ length: workerCount }, async () => {
      while (true) {
        const idx = nextIndex++;
        if (idx >= entries.length) {
          return;
        }
        const entry = entries[idx]!;
        const entryLevel = entry.level ?? settings.level;
        const compressOptions: CompressOptions = {
          level: entryLevel,
          thresholdBytes
        };
        const { compressedData, deflate } = await compressEntryMaybe(
          entry,
          entryLevel,
          compressOptions,
          smartStore
        );

        // Handle encryption
        const entryEncMethod = entry.encryptionMethod ?? settings.encryptionMethod;
        const entryPassword = entry.password ?? settings.password;
        let encryptionResult:
          | { data: Uint8Array; extraField?: Uint8Array; compressionMethod: number }
          | undefined;

        if (entryEncMethod !== "none" && entryPassword) {
          const originalCrc = crc32(entry.data);
          const originalCompressionMethod = resolveZipCompressionMethod(deflate);
          encryptionResult = await encryptData(
            compressedData,
            originalCrc,
            entryEncMethod,
            entryPassword,
            originalCompressionMethod
          );
        }

        processedEntries[idx] = buildProcessedEntry(
          entry,
          settings,
          compressedData,
          deflate,
          encryptionResult
        );
      }
    });

    await Promise.all(workers);
  }

  return finalizeZip(processedEntries, zipComment, zip64Mode);
}

/**
 * Create a ZIP file from entries (sync)
 *
 * This is supported in both Node.js and browser builds.
 * Note: AES encryption is not supported in sync mode.
 */
export function createZipSync(entries: ZipEntry[], options: ZipOptions = {}): Uint8Array {
  const { settings, zipComment, zip64Mode, smartStore, thresholdBytes } =
    parseZipBuildOptions(options);
  validateEncryptionOptions(settings.encryptionMethod, settings.password, true);

  const processedEntries: ProcessedEntry[] = [];

  for (const entry of entries) {
    const entryLevel = entry.level ?? settings.level;
    const compressOptions: CompressOptions = {
      level: entryLevel,
      thresholdBytes
    };
    const { compressedData, deflate } = compressEntryMaybeSync(
      entry,
      entryLevel,
      compressOptions,
      smartStore
    );

    // Handle encryption
    const entryEncMethod = entry.encryptionMethod ?? settings.encryptionMethod;
    const entryPassword = entry.password ?? settings.password;
    let encryptionResult:
      | { data: Uint8Array; extraField?: Uint8Array; compressionMethod: number }
      | undefined;

    if (entryEncMethod !== "none" && entryPassword) {
      const originalCrc = crc32(entry.data);
      const originalCompressionMethod = resolveZipCompressionMethod(deflate);
      encryptionResult = encryptDataSync(
        compressedData,
        originalCrc,
        entryEncMethod,
        entryPassword,
        originalCompressionMethod
      );
    }

    processedEntries.push(
      buildProcessedEntry(entry, settings, compressedData, deflate, encryptionResult)
    );
  }
  return finalizeZip(processedEntries, zipComment, zip64Mode);
}
