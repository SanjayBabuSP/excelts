import type { Zip64Mode } from "@archive/zip-spec/zip-records";
import type { ZipCentralDirEntry } from "./writable-file";
import { EMPTY_UINT8ARRAY } from "@archive/shared/bytes";
import {
  buildCentralDirectoryHeader,
  buildEndOfCentralDirectory,
  buildZip64EndOfCentralDirectory,
  buildZip64EndOfCentralDirectoryLocator,
  buildZip64ExtraField,
  concatExtraFields,
  UINT16_MAX,
  UINT32_MAX,
  VERSION_MADE_BY,
  VERSION_NEEDED,
  VERSION_ZIP64
} from "@archive/zip-spec/zip-records";

/**
 * Input type for building Central Directory entries.
 *
 * This is a superset of ZipCentralDirEntry with fields renamed to match
 * the build function naming conventions.
 */
export interface ZipCentralDirectoryEntryInput {
  fileName: Uint8Array;
  extraField: Uint8Array;
  comment: Uint8Array;
  flags: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
  dosTime: number;
  dosDate: number;
  localHeaderOffset: number;
  zip64?: boolean;
  externalAttributes: number;
  versionMadeBy?: number;
}

/**
 * Convert ZipCentralDirEntry to ZipCentralDirectoryEntryInput.
 *
 * This allows StreamingZip writers to use the simpler ZipCentralDirEntry
 * interface while the builder uses the more explicit input naming.
 */
export function centralDirEntryToInput(entry: ZipCentralDirEntry): ZipCentralDirectoryEntryInput {
  return {
    fileName: entry.name,
    extraField: entry.extraField,
    comment: entry.comment,
    flags: entry.flags,
    crc32: entry.crc,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize,
    compressionMethod: entry.compressionMethod,
    dosTime: entry.dosTime,
    dosDate: entry.dosDate,
    localHeaderOffset: entry.offset,
    zip64: entry.zip64,
    externalAttributes: entry.externalAttributes,
    versionMadeBy: entry.versionMadeBy
  };
}

export interface ZipCentralDirectoryBuildResult {
  centralDirectoryHeaders: Uint8Array[];
  centralDirSize: number;
  trailerRecords: Uint8Array[];
  usedZip64: boolean;
}

export function buildCentralDirectoryAndEocd(
  entries: ZipCentralDirectoryEntryInput[],
  options: {
    zipComment: Uint8Array;
    zip64Mode: Zip64Mode;
    centralDirOffset: number;
  }
): ZipCentralDirectoryBuildResult {
  const forceZip64 = options.zip64Mode === true;
  const forbidZip64 = options.zip64Mode === false;

  const centralDirOffset = options.centralDirOffset;
  const needsZip64EOCDFromArchive = entries.length > UINT16_MAX || centralDirOffset > UINT32_MAX;

  const centralDirectoryHeaders: Uint8Array[] = new Array(entries.length);
  let centralDirSize = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;

    const needsZip64Entry =
      forceZip64 ||
      entry.zip64 === true ||
      entry.localHeaderOffset > UINT32_MAX ||
      entry.compressedSize > UINT32_MAX ||
      entry.uncompressedSize > UINT32_MAX;

    const zip64Extra = needsZip64Entry
      ? buildZip64ExtraField({
          uncompressedSize:
            forceZip64 || entry.uncompressedSize > UINT32_MAX ? entry.uncompressedSize : undefined,
          compressedSize:
            forceZip64 || entry.compressedSize > UINT32_MAX ? entry.compressedSize : undefined,
          localHeaderOffset:
            forceZip64 || entry.localHeaderOffset > UINT32_MAX ? entry.localHeaderOffset : undefined
        })
      : EMPTY_UINT8ARRAY;
    const extraField = needsZip64Entry
      ? concatExtraFields(entry.extraField, zip64Extra)
      : entry.extraField;

    const header = buildCentralDirectoryHeader({
      fileName: entry.fileName,
      extraField,
      comment: entry.comment ?? EMPTY_UINT8ARRAY,
      flags: entry.flags,
      compressionMethod: entry.compressionMethod,
      dosTime: entry.dosTime,
      dosDate: entry.dosDate,
      crc32: entry.crc32,
      compressedSize: needsZip64Entry ? UINT32_MAX : entry.compressedSize,
      uncompressedSize: needsZip64Entry ? UINT32_MAX : entry.uncompressedSize,
      localHeaderOffset: needsZip64Entry ? UINT32_MAX : entry.localHeaderOffset,
      versionMadeBy: entry.versionMadeBy ?? VERSION_MADE_BY,
      versionNeeded: needsZip64Entry ? VERSION_ZIP64 : VERSION_NEEDED,
      externalAttributes: entry.externalAttributes
    });

    centralDirectoryHeaders[i] = header;
    centralDirSize += header.length;
  }

  const usedZip64 = forceZip64 || needsZip64EOCDFromArchive || centralDirSize > UINT32_MAX;
  if (forbidZip64 && usedZip64) {
    throw new Error("ZIP64 is required but zip64=false");
  }

  if (usedZip64) {
    const zip64EocdOffset = centralDirOffset + centralDirSize;
    const zip64Eocd = buildZip64EndOfCentralDirectory({
      entryCountOnDisk: entries.length,
      entryCountTotal: entries.length,
      centralDirSize,
      centralDirOffset
    });
    const zip64Locator = buildZip64EndOfCentralDirectoryLocator({
      zip64EndOfCentralDirectoryOffset: zip64EocdOffset,
      totalDisks: 1
    });

    const eocd = buildEndOfCentralDirectory({
      entryCount: UINT16_MAX,
      centralDirSize: UINT32_MAX,
      centralDirOffset: UINT32_MAX,
      comment: options.zipComment
    });

    return {
      centralDirectoryHeaders,
      centralDirSize,
      trailerRecords: [zip64Eocd, zip64Locator, eocd],
      usedZip64
    };
  }

  const eocd = buildEndOfCentralDirectory({
    entryCount: entries.length,
    centralDirSize,
    centralDirOffset,
    comment: options.zipComment
  });

  return {
    centralDirectoryHeaders,
    centralDirSize,
    trailerRecords: [eocd],
    usedZip64
  };
}
