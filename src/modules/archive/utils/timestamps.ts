import {
  buildExtendedTimestampExtraFieldFromDate,
  parseExtendedTimestampMtimeUnixSeconds
} from "./zip-extra";

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
 *
 * Note: returns Date in UTC, matching previous unzipper behavior.
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
