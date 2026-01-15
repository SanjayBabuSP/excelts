export const EXTENDED_TIMESTAMP_ID = 0x5455;

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

function unixSecondsFromDate(date: Date): number {
  return clampUint32(Math.floor(date.getTime() / 1000));
}

/**
 * Parse Info-ZIP "Extended Timestamp" extra field (0x5455) and return mtime.
 * Returns Unix seconds (UTC) if present.
 */
function parseExtendedTimestampMtimeUnixSeconds(extraField: Uint8Array): number | undefined {
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

/**
 * Build Info-ZIP "Extended Timestamp" extra field (0x5455).
 * We write only mtime (UTC, Unix seconds) to minimize size.
 */
function buildExtendedTimestampExtraFieldFromUnixSeconds(unixSeconds: number): Uint8Array {
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

function buildExtendedTimestampExtraFieldFromDate(date: Date): Uint8Array {
  return buildExtendedTimestampExtraFieldFromUnixSeconds(unixSecondsFromDate(date));
}

/**
 * DOS date/time helpers for ZIP files.
 */

/**
 * Convert Date to DOS time/date fields.
 *
 * Note: uses local time fields (getHours/getMinutes/getSeconds),
 * which matches common ZIP writer behavior.
 */
export function dateToDos(date: Date): [number, number] {
  const dosTime =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getSeconds() >> 1) & 0x1f);

  const dosDate =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);

  return [dosTime, dosDate];
}

/**
 * Parse DOS date/time to JS Date.
 */
export function parseDosDateTimeUTC(date: number, time?: number): Date {
  const day = date & 0x1f;
  const month = (date >> 5) & 0x0f;
  const year = ((date >> 9) & 0x7f) + 1980;
  const seconds = time ? (time & 0x1f) * 2 : 0;
  const minutes = time ? (time >> 5) & 0x3f : 0;
  const hours = time ? time >> 11 : 0;

  return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
}

/**
 * How to write timestamps in ZIP headers.
 *
 * ZIP always has DOS date/time fields; `dos+utc` additionally writes the Info-ZIP
 * extended timestamp extra field (0x5455) for a UTC mtime.
 */
export type ZipTimestampMode = "dos" | "dos+utc";

export function resolveZipLastModifiedDateFromUnixSeconds(
  dosDate: number,
  dosTime: number,
  mtimeUnixSeconds?: number
): Date {
  if (mtimeUnixSeconds === undefined) {
    return parseDosDateTimeUTC(dosDate, dosTime);
  }
  return new Date(mtimeUnixSeconds * 1000);
}

export function resolveZipLastModifiedDateFromExtraField(
  dosDate: number,
  dosTime: number,
  extraField: Uint8Array
): Date {
  const unixSeconds = parseExtendedTimestampMtimeUnixSeconds(extraField);
  return resolveZipLastModifiedDateFromUnixSeconds(dosDate, dosTime, unixSeconds);
}

export function buildZipTimestampExtraField(modTime: Date, mode: ZipTimestampMode): Uint8Array {
  return mode === "dos+utc" ? buildExtendedTimestampExtraFieldFromDate(modTime) : new Uint8Array(0);
}

export function dateToZipDos(modTime: Date): { dosTime: number; dosDate: number } {
  const [dosTime, dosDate] = dateToDos(modTime);
  return { dosTime, dosDate };
}
