/**
 * CSV Parse Utilities
 *
 * Shared logic for CSV parsing used by both parseCsv (batch)
 * and CsvParserStream (streaming) to avoid code duplication.
 */

import { deduplicateHeadersWithRenames, type HeaderArray } from "@csv/utils/row";

// =============================================================================
// Pre-compiled Constants
// =============================================================================

/** Pre-compiled regex for splitting lines (handles all line endings) */
export const LINE_SPLIT_REGEX = /\r\n|\r|\n/;

/** Pre-compiled regex for non-whitespace detection */
export const NON_WHITESPACE_REGEX = /\S/;

// =============================================================================
// Types
// =============================================================================

/**
 * Result of processing headers
 */
export interface HeaderProcessResult {
  /** The processed (deduplicated) headers */
  headers: HeaderArray;
  /** Map of renamed headers (new name -> original name) */
  renamedHeaders: Record<string, string> | null;
  /** Whether the current row should be skipped (was used as headers) */
  skipCurrentRow: boolean;
}

/**
 * Column validation result
 */
export interface ColumnValidationResult {
  /** Whether the row is valid */
  isValid: boolean;
  /** Error code if invalid: 'TooManyFields' or 'TooFewFields' */
  errorCode?: "TooManyFields" | "TooFewFields";
  /** Error message if invalid */
  reason?: string;
  /** Whether the row was modified (padded or trimmed) */
  modified: boolean;
}

/**
 * Options for header processing
 */
export interface HeaderProcessOptions {
  /** Headers configuration: true, array, or function */
  headers: boolean | string[] | ((row: string[]) => (string | null | undefined)[]);
  /** Whether to rename headers from first data row */
  renameHeaders: boolean;
}

/**
 * Options for column validation
 */
export interface ColumnValidationOptions {
  /** Whether to strictly validate column counts */
  strictColumnHandling: boolean;
  /** Whether to discard unmapped (extra) columns instead of erroring */
  discardUnmappedColumns: boolean;
}

// =============================================================================
// Header Processing
// =============================================================================

/**
 * Process headers from first row or configuration.
 * Shared logic between parseCsv and CsvParserStream.
 *
 * @param row - The current row being processed
 * @param options - Header processing options
 * @param existingHeaders - Already configured headers (for array case)
 * @returns Processing result or null if headers not applicable
 */
export function processHeaders(
  row: string[],
  options: HeaderProcessOptions,
  existingHeaders: HeaderArray | null
): HeaderProcessResult | null {
  const { headers, renameHeaders } = options;

  // If we already have headers from array config and not renaming, no processing needed
  if (existingHeaders !== null && Array.isArray(headers) && !renameHeaders) {
    return null;
  }

  let rawHeaders: (string | null | undefined)[];
  let skipCurrentRow = false;

  if (typeof headers === "function") {
    // Function: call with row, skip current row
    rawHeaders = headers(row);
    skipCurrentRow = true;
  } else if (Array.isArray(headers)) {
    // Array: use provided headers
    rawHeaders = headers;
    // Skip current row only if renaming (first row is data to be renamed)
    skipCurrentRow = renameHeaders;
  } else if (headers === true) {
    // true: use first row as headers, skip it
    rawHeaders = row;
    skipCurrentRow = true;
  } else {
    // false/undefined: no headers
    return null;
  }

  // Deduplicate headers
  const { headers: dedupedHeaders, renamedHeaders } = deduplicateHeadersWithRenames(rawHeaders);

  return {
    headers: dedupedHeaders,
    renamedHeaders,
    skipCurrentRow
  };
}

/**
 * Validate and adjust row column count against expected headers.
 * Shared logic between parseCsv and CsvParserStream.
 *
 * @param row - The row to validate (will be modified in place if needed)
 * @param expectedCols - Expected number of columns (from headers)
 * @param options - Validation options
 * @returns Validation result
 */
export function validateAndAdjustColumns(
  row: string[],
  expectedCols: number,
  options: ColumnValidationOptions
): ColumnValidationResult {
  const { strictColumnHandling, discardUnmappedColumns } = options;
  const actualCols = row.length;

  if (actualCols === expectedCols) {
    return { isValid: true, modified: false };
  }

  if (actualCols > expectedCols) {
    // Too many columns
    if (strictColumnHandling && !discardUnmappedColumns) {
      return {
        isValid: false,
        errorCode: "TooManyFields",
        reason: `Column mismatch: expected ${expectedCols}, got ${actualCols}`,
        modified: false
      };
    }
    // Trim extra columns
    row.length = expectedCols;
    return { isValid: true, errorCode: "TooManyFields", modified: true };
  }

  // Too few columns
  if (strictColumnHandling) {
    return {
      isValid: false,
      errorCode: "TooFewFields",
      reason: `Column mismatch: expected ${expectedCols}, got ${actualCols}`,
      modified: false
    };
  }
  // Pad with empty strings
  while (row.length < expectedCols) {
    row.push("");
  }
  return { isValid: true, errorCode: "TooFewFields", modified: true };
}

/**
 * Get the effective header count (excluding null/undefined headers)
 */
export function getEffectiveHeaderCount(headers: HeaderArray): number {
  return headers.filter(h => h !== null && h !== undefined).length;
}

/**
 * Check if a row should be skipped as empty (greedy: whitespace-only also counts as empty)
 */
export function isEmptyRow(row: string[], shouldSkipEmpty: boolean | "greedy"): boolean {
  if (!shouldSkipEmpty) {
    return false;
  }
  for (const field of row) {
    if (NON_WHITESPACE_REGEX.test(field)) {
      return false;
    }
  }
  return true;
}

/**
 * Check if a row is a comment line
 */
export function isCommentRow(row: string[], commentChar: string | undefined): boolean {
  if (!commentChar) {
    return false;
  }
  const firstField = row[0] ?? "";
  return firstField.startsWith(commentChar);
}

/**
 * Convert a row array to an object using headers.
 * Shared logic between parseCsv and CsvParserStream.
 *
 * @param row - The row values as an array
 * @param headers - The header names (may contain null/undefined for skipped columns)
 * @returns Object with header keys and row values
 */
export function rowToObject(row: string[], headers: HeaderArray): Record<string, string> {
  const obj: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    if (header !== null && header !== undefined) {
      obj[header] = row[i] ?? "";
    }
  }
  return obj;
}
