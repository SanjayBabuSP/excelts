const EXTENDED_TIMESTAMP_ID = 0x5455;

function clampUint32(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  // 0xFFFFFFFF fits JS safe integer.
  if (value >= 0xffffffff) {
    return 0xffffffff;
  }
  return value >>> 0;
}

export function unixSecondsFromDate(date: Date): number {
  return clampUint32(Math.floor(date.getTime() / 1000));
}

/**
 * Build Info-ZIP "Extended Timestamp" extra field (0x5455).
 * We write only mtime (UTC, Unix seconds) to minimize size.
 *
 * Layout:
 * - Header ID: 2 bytes (0x5455)
 * - Data size: 2 bytes
 * - Flags: 1 byte (bit0 = mtime)
 * - mtime: 4 bytes (Unix seconds)
 */
export function buildExtendedTimestampExtraFieldFromUnixSeconds(unixSeconds: number): Uint8Array {
  const ts = clampUint32(unixSeconds);

  // flags(1) + mtime(4)
  const payloadSize = 5;
  const out = new Uint8Array(4 + payloadSize);
  const view = new DataView(out.buffer);

  view.setUint16(0, EXTENDED_TIMESTAMP_ID, true);
  view.setUint16(2, payloadSize, true);

  out[4] = 0x01; // mtime present
  view.setUint32(5, ts, true);

  return out;
}

export function buildExtendedTimestampExtraFieldFromDate(date: Date): Uint8Array {
  return buildExtendedTimestampExtraFieldFromUnixSeconds(unixSecondsFromDate(date));
}

/**
 * Parse Info-ZIP "Extended Timestamp" extra field (0x5455) and return mtime.
 * Returns Unix seconds (UTC) if present.
 */
export function parseExtendedTimestampMtimeUnixSeconds(extraField: Uint8Array): number | undefined {
  const view = new DataView(extraField.buffer, extraField.byteOffset, extraField.byteLength);
  let offset = 0;

  while (offset + 4 <= extraField.length) {
    const headerId = view.getUint16(offset, true);
    const dataSize = view.getUint16(offset + 2, true);
    const dataStart = offset + 4;
    const dataEnd = dataStart + dataSize;

    if (dataEnd > extraField.length) {
      break;
    }

    if (headerId === EXTENDED_TIMESTAMP_ID && dataSize >= 1) {
      const flags = extraField[dataStart];
      if ((flags & 0x01) !== 0 && dataSize >= 5) {
        // mtime is 4 bytes right after flags.
        return view.getUint32(dataStart + 1, true) >>> 0;
      }
    }

    offset = dataEnd;
  }

  return undefined;
}
