/**
 * CSV Number Utilities
 *
 * Functions for parsing and formatting numbers in CSV files,
 * with support for different decimal separators (e.g., European format).
 */

/**
 * Decimal separator type.
 * - "." - Standard decimal point (default)
 * - "," - European decimal comma
 */
export type DecimalSeparator = "." | ",";

/** Pre-compiled regex for European decimal comma format */
const COMMA_DECIMAL_REGEX = /^-?\d+(,\d+)?([eE][+-]?\d+)?$/;

/**
 * Format a number for CSV output with the specified decimal separator.
 *
 * @param value - The number to format
 * @param decimalSeparator - The decimal separator to use
 * @returns Formatted string representation
 *
 * @example
 * formatNumberForCsv(3.14, ".") // "3.14"
 * formatNumberForCsv(3.14, ",") // "3,14"
 */
export function formatNumberForCsv(value: number, decimalSeparator: DecimalSeparator): string {
  if (decimalSeparator !== ",") {
    return String(value);
  }
  // Replace decimal point with comma - faster than split().join()
  return String(value).replace(".", ",");
}

/**
 * Parse a CSV string value as a number with the specified decimal separator.
 *
 * @param value - The string value to parse
 * @param decimalSeparator - The decimal separator used in the value
 * @returns Parsed number (may be NaN if invalid)
 *
 * @example
 * parseNumberFromCsv("3.14", ".") // 3.14
 * parseNumberFromCsv("3,14", ",") // 3.14
 */
export function parseNumberFromCsv(value: string, decimalSeparator: DecimalSeparator): number {
  const trimmed = value.trim();

  if (decimalSeparator !== ",") {
    return Number(trimmed);
  }

  // Minimal locale support: treat a single comma as the decimal separator.
  // Common EU CSV uses delimiter ';' and decimal ',' (e.g. 12,34).
  if (COMMA_DECIMAL_REGEX.test(trimmed)) {
    return Number(trimmed.replace(",", "."));
  }

  return Number(trimmed);
}
