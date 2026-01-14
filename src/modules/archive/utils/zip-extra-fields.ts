/**
 * ZIP extra field parsing helpers.
 *
 * Kept standalone so both streaming parser (`stream.base.ts`) and buffer parser
 * (`zip-parser.ts`) can share ZIP64 + Info-ZIP timestamp handling.
 */

const EXTENDED_TIMESTAMP_ID = 0x5455;

export interface ZipVars {
  uncompressedSize: number;
  compressedSize: number;
  offsetToLocalFileHeader?: number;

  /** ZIP64 exact values (when present in extra field). */
  uncompressedSize64?: bigint;
  compressedSize64?: bigint;
  offsetToLocalFileHeader64?: bigint;
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
}

const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function readUint64LEBigInt(view: DataView, offset: number): bigint {
  return view.getBigUint64(offset, true);
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
        if ((flags & 0x01) !== 0 && partSize >= 5) {
          extra.mtimeUnixSeconds = view.getUint32(dataStart + 1, true) >>> 0;
        }
      }
    }

    offset = dataEnd;
  }

  return extra;
}
