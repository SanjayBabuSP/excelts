/**
 * ZIP extra field parsing helpers.
 *
 * Kept standalone so both streaming parser (`stream.base.ts`) and buffer parser
 * (`zip-parser.ts`) can share ZIP64 + Info-ZIP timestamp + AES handling.
 */

import {
  AES_VENDOR_ID,
  AES_EXTRA_FIELD_ID,
  AES_STRENGTH_FROM_BYTE,
  type AesKeyStrength
} from "@archive/crypto/aes";
import { EXTENDED_TIMESTAMP_ID, NTFS_TIMESTAMP_ID } from "@archive/utils/timestamps";

export interface ZipVars {
  uncompressedSize: number;
  compressedSize: number;
  offsetToLocalFileHeader?: number;

  /** ZIP64 exact values (when present in extra field). */
  uncompressedSize64?: bigint;
  compressedSize64?: bigint;
  offsetToLocalFileHeader64?: bigint;
}

export interface AesExtraFieldInfo {
  /** AE format version (1 or 2) */
  version: 1 | 2;
  /** Key strength (128, 192, or 256) */
  keyStrength: AesKeyStrength;
  /** Original compression method */
  compressionMethod: number;
}

export interface ZipExtraFields {
  uncompressedSize?: number;
  compressedSize?: number;
  offsetToLocalFileHeader?: number;

  /** ZIP64 exact values (when present in extra field). */
  uncompressedSize64?: bigint;
  compressedSize64?: bigint;
  offsetToLocalFileHeader64?: bigint;

  /** Info-ZIP extended timestamp (0x5455) mtime, Unix seconds (UTC). */
  mtimeUnixSeconds?: number;

  /** Info-ZIP extended timestamp (0x5455) atime, Unix seconds (UTC), when present. */
  atimeUnixSeconds?: number;

  /** Info-ZIP extended timestamp (0x5455) ctime, Unix seconds (UTC), when present. */
  ctimeUnixSeconds?: number;

  /** NTFS timestamps (0x000a) as Windows FILETIME (100ns since 1601-01-01 UTC). */
  ntfsTimes?: {
    mtime: bigint;
    atime: bigint;
    ctime: bigint;
    birthTime: bigint;
  };

  /** AES encryption info (0x9901) when present */
  aesInfo?: AesExtraFieldInfo;
}

const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function readUint64LEBigInt(view: DataView, offset: number): bigint {
  return view.getBigUint64(offset, true);
}

function hasBigUint64(view: DataView): boolean {
  return typeof (view as unknown as { getBigUint64?: unknown }).getBigUint64 === "function";
}

function toNumberIfSafe(value: bigint): number | undefined {
  if (value > MAX_SAFE_INTEGER_BIGINT) {
    return undefined;
  }
  return Number(value);
}

export function parseZipExtraFields(extraField: Uint8Array, vars: ZipVars): ZipExtraFields {
  const extra: ZipExtraFields = {};

  if (extraField.length < 4) {
    return extra;
  }

  const view = new DataView(extraField.buffer, extraField.byteOffset, extraField.byteLength);
  const canReadBigUint64 = hasBigUint64(view);
  let offset = 0;

  while (offset + 4 <= extraField.length) {
    const signature = view.getUint16(offset, true);
    const partSize = view.getUint16(offset + 2, true);
    const dataStart = offset + 4;
    const dataEnd = dataStart + partSize;

    if (dataEnd > extraField.length) {
      break;
    }

    if (signature === 0x0001) {
      // ZIP64 extended information.
      // Field presence and order depends on which values are 0xFFFFFFFF in the header.
      let cursor = dataStart;

      if (vars.uncompressedSize === 0xffffffff && cursor + 8 <= dataEnd) {
        const value64 = readUint64LEBigInt(view, cursor);
        extra.uncompressedSize64 = value64;
        vars.uncompressedSize64 = value64;

        const value = toNumberIfSafe(value64);
        if (value !== undefined) {
          extra.uncompressedSize = value;
          vars.uncompressedSize = value;
        }
        cursor += 8;
      }
      if (vars.compressedSize === 0xffffffff && cursor + 8 <= dataEnd) {
        const value64 = readUint64LEBigInt(view, cursor);
        extra.compressedSize64 = value64;
        vars.compressedSize64 = value64;

        const value = toNumberIfSafe(value64);
        if (value !== undefined) {
          extra.compressedSize = value;
          vars.compressedSize = value;
        }
        cursor += 8;
      }
      if (vars.offsetToLocalFileHeader === 0xffffffff && cursor + 8 <= dataEnd) {
        const value64 = readUint64LEBigInt(view, cursor);
        extra.offsetToLocalFileHeader64 = value64;
        vars.offsetToLocalFileHeader64 = value64;

        const value = toNumberIfSafe(value64);
        if (value !== undefined) {
          extra.offsetToLocalFileHeader = value;
          vars.offsetToLocalFileHeader = value;
        }
      }
    } else if (signature === EXTENDED_TIMESTAMP_ID) {
      // Info-ZIP Extended Timestamp (0x5455)
      // Data: [flags:1][mtime?:4][atime?:4][ctime?:4]
      if (partSize >= 1) {
        const flags = extraField[dataStart]!;
        let cursor = dataStart + 1;
        if ((flags & 0x01) !== 0 && cursor + 4 <= dataEnd) {
          extra.mtimeUnixSeconds = view.getUint32(cursor, true) >>> 0;
          cursor += 4;
        }
        if ((flags & 0x02) !== 0 && cursor + 4 <= dataEnd) {
          extra.atimeUnixSeconds = view.getUint32(cursor, true) >>> 0;
          cursor += 4;
        }
        if ((flags & 0x04) !== 0 && cursor + 4 <= dataEnd) {
          extra.ctimeUnixSeconds = view.getUint32(cursor, true) >>> 0;
        }
      }
    } else if (signature === NTFS_TIMESTAMP_ID) {
      // NTFS timestamps (0x000a)
      // Data:
      //   [reserved:4]
      //   repeated tags: [tag:2][size:2][data:size]
      // Tag 0x0001: [mtime:8][atime:8][ctime:8][btime:8] as FILETIME.
      if (!canReadBigUint64) {
        // Older runtimes may not support BigInt-based DataView accessors.
        // Skip parsing NTFS timestamps in that case.
      } else if (partSize >= 4 + 4) {
        let cursor = dataStart + 4;
        while (cursor + 4 <= dataEnd) {
          const tag = view.getUint16(cursor, true);
          const size = view.getUint16(cursor + 2, true);
          const tagDataStart = cursor + 4;
          const tagDataEnd = tagDataStart + size;
          if (tagDataEnd > dataEnd) {
            break;
          }
          if (tag === 0x0001 && size >= 32 && tagDataStart + 32 <= tagDataEnd) {
            extra.ntfsTimes = {
              mtime: view.getBigUint64(tagDataStart + 0, true),
              atime: view.getBigUint64(tagDataStart + 8, true),
              ctime: view.getBigUint64(tagDataStart + 16, true),
              birthTime: view.getBigUint64(tagDataStart + 24, true)
            };
          }
          cursor = tagDataEnd;
        }
      }
    } else if (signature === AES_EXTRA_FIELD_ID) {
      // AES Encryption Info (0x9901)
      // Data: [version:2][vendorId:2][strength:1][compressionMethod:2]
      if (partSize >= 7) {
        const version = view.getUint16(dataStart, true);
        const vendorId = view.getUint16(dataStart + 2, true);
        const strengthByte = extraField[dataStart + 4]!;
        const compressionMethod = view.getUint16(dataStart + 5, true);

        if (vendorId === AES_VENDOR_ID) {
          const keyStrength = AES_STRENGTH_FROM_BYTE[strengthByte];
          if (keyStrength && (version === 1 || version === 2)) {
            extra.aesInfo = {
              version: version as 1 | 2,
              keyStrength,
              compressionMethod
            };
          }
        }
      }
    }

    offset = dataEnd;
  }

  return extra;
}
