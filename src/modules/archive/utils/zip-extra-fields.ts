/**
 * ZIP extra field parsing helpers.
 *
 * Kept standalone so both streaming parser (`parse.base.ts`) and buffer parser
 * (`zip-parser.ts`) can share ZIP64 + Info-ZIP timestamp handling.
 */

import { parseExtendedTimestampMtimeUnixSeconds } from "./zip-extra";

export interface ZipVars {
  uncompressedSize: number;
  compressedSize: number;
  offsetToLocalFileHeader?: number;
}

export interface ZipExtraFields {
  uncompressedSize?: number;
  compressedSize?: number;
  offsetToLocalFileHeader?: number;
  /** Info-ZIP extended timestamp (0x5455) mtime, Unix seconds (UTC). */
  mtimeUnixSeconds?: number;
}

function readUint64LE(view: DataView, offset: number): number {
  // Convert to Number via 2x Uint32 to avoid BigInt requirements.
  const low = view.getUint32(offset, true);
  const high = view.getUint32(offset + 4, true);
  return high * 0x100000000 + low;
}

export function parseZipExtraFields(extraField: Uint8Array, vars: ZipVars): ZipExtraFields {
  const extra: ZipExtraFields = {};

  if (extraField.length < 4) {
    return extra;
  }

  const view = new DataView(extraField.buffer, extraField.byteOffset, extraField.byteLength);
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
        extra.uncompressedSize = readUint64LE(view, cursor);
        cursor += 8;
      }
      if (vars.compressedSize === 0xffffffff && cursor + 8 <= dataEnd) {
        extra.compressedSize = readUint64LE(view, cursor);
        cursor += 8;
      }
      if (vars.offsetToLocalFileHeader === 0xffffffff && cursor + 8 <= dataEnd) {
        extra.offsetToLocalFileHeader = readUint64LE(view, cursor);
      }
    } else if (signature === 0x5455) {
      // Fast-path parse for Info-ZIP extended timestamp (mtime only).
      if (partSize >= 1) {
        const flags = extraField[dataStart];
        if ((flags & 0x01) !== 0 && partSize >= 5) {
          extra.mtimeUnixSeconds = view.getUint32(dataStart + 1, true) >>> 0;
        } else {
          const unixSeconds = parseExtendedTimestampMtimeUnixSeconds(
            extraField.subarray(offset, dataEnd)
          );
          if (unixSeconds !== undefined) {
            extra.mtimeUnixSeconds = unixSeconds;
          }
        }
      }
    }

    offset = dataEnd;
  }

  if (vars.compressedSize === 0xffffffff) {
    vars.compressedSize = extra.compressedSize!;
  }

  if (vars.uncompressedSize === 0xffffffff) {
    vars.uncompressedSize = extra.uncompressedSize!;
  }

  if (vars.offsetToLocalFileHeader === 0xffffffff) {
    vars.offsetToLocalFileHeader = extra.offsetToLocalFileHeader;
  }

  return extra;
}
