/**
 * CSV Parser and Formatter - RFC 4180 compliant
 *
 * A lightweight, cross-platform CSV implementation that works in both
 * Node.js and Browser environments with zero dependencies.
 *
 * High-performance RFC 4180 compliant CSV parser and formatter.
 *
 * @see https://tools.ietf.org/html/rfc4180
 */

import { formatNumberForCsv, type DecimalSeparator } from "@csv/csv-number";
import { detectDelimiter, detectLinebreak, stripBom, startsWithFormulaChar } from "@csv/csv-detect";
import {
  type HeaderArray,
  type RowHashArray,
  isRowHashArray,
  rowHashArrayToValues,
  rowHashArrayToHeaders,
  rowHashArrayMapByHeaders,
  deduplicateHeaders,
  deduplicateHeadersWithRenames
} from "@csv/csv-row-utils";
// Re-export types from utility files
export type { HeaderArray, RowHashArray } from "@csv/csv-row-utils";
// Re-export detection utilities
export { detectDelimiter, detectLinebreak, stripBom, startsWithFormulaChar } from "@csv/csv-detect";
// Re-export row utilities
export {
  isRowHashArray,
  rowHashArrayToMap,
  rowHashArrayToValues,
  rowHashArrayToHeaders,
  rowHashArrayGet,
  rowHashArrayMapByHeaders,
  deduplicateHeaders,
  deduplicateHeadersWithRenames
} from "@csv/csv-row-utils";

// =============================================================================
// Types
// =============================================================================

/** Header transform function */
export type HeaderTransformFunction = (headers: string[]) => HeaderArray;

/** Row types */
export type RowArray = string[];
export type RowMap = Record<string, string>;
export type Row = RowArray | RowMap | RowHashArray;

/** Row transform callback */
export type RowTransformCallback<T> = (error?: Error | null, row?: T | null) => void;

/** Row transform function - sync or async */
export type RowTransformFunction<I = Row, O = Row> =
  | ((row: I) => O | null)
  | ((row: I, callback: RowTransformCallback<O>) => void);

/**
 * Context passed to type-based transform functions.
 * Provides information about the current field being transformed.
 */
export interface TransformContext {
  /** Column name (for object rows) or column index (for array rows) */
  column: string | number;
  /**
   * Output record index (0-based).
   * This is the index of the current record in the output, after row filtering.
   * For example, if rows 0, 2, 4 pass the row filter, their indices will be 0, 1, 2.
   */
  index: number;
}

/**
 * Type-based transform functions for formatting specific data types.
 * Each function receives the value and context, returns a string.
 */
export interface TypeTransformMap {
  /** Transform boolean values */
  boolean?: (value: boolean, ctx: TransformContext) => string;
  /** Transform Date values */
  date?: (value: Date, ctx: TransformContext) => string;
  /** Transform number values */
  number?: (value: number, ctx: TransformContext) => string;
  /** Transform bigint values */
  bigint?: (value: bigint, ctx: TransformContext) => string;
  /** Transform object values (excluding Date, null, arrays) */
  object?: (value: Record<string, any>, ctx: TransformContext) => string;
  /** Transform string values */
  string?: (value: string, ctx: TransformContext) => string;
  /**
   * Row-level transform (runs before type transforms).
   * Return null to skip the row entirely.
   *
   * @param row - The row data
   * @param sourceIndex - Index in the source data array (0-based, before filtering)
   */
  row?: (row: Row, sourceIndex: number) => Row | null;
}

/**
 * Column configuration for formatting.
 * Allows separation of data field names (key) from output header names (header).
 */
export interface ColumnConfig {
  /** Key to access data in the source object */
  key: string;
  /** Header name for output (defaults to key if not specified) */
  header?: string;
}

/**
 * Process columns configuration to extract keys and headers.
 * Returns null if columns is empty or undefined.
 * @internal Exported for use in csv-stream.ts
 */
export function processColumns(
  columns: (string | ColumnConfig)[] | undefined
): { keys: string[]; headers: string[] } | null {
  if (!columns || columns.length === 0) {
    return null;
  }
  const keys = columns.map(c => (typeof c === "string" ? c : c.key));
  const headers = columns.map(c => (typeof c === "string" ? c : (c.header ?? c.key)));
  return { keys, headers };
}

/** Row validate callback */
export type RowValidateCallback = (
  error?: Error | null,
  isValid?: boolean,
  reason?: string
) => void;

/** Row validate function - sync or async */
export type RowValidateFunction<T = Row> =
  | ((row: T) => boolean)
  | ((row: T, callback: RowValidateCallback) => void);

/**
 * Dynamic typing configuration for automatic type conversion.
 *
 * - `true`: Convert all columns using built-in rules
 * - `false`: Keep all values as strings
 * - `Record<string, boolean>`: Enable/disable per column
 * - `Record<string, (value: string) => unknown>`: Custom converter per column
 */
export type DynamicTypingConfig = boolean | Record<string, boolean | ((value: string) => unknown)>;

/**
 * Metadata passed to chunk callback during streaming parse
 */
export interface ChunkMeta {
  /** Total number of data rows processed so far (excluding header) */
  cursor: number;
  /** Number of rows in the current chunk */
  rowCount: number;
  /** Whether this is the first chunk */
  isFirstChunk: boolean;
  /** Whether this is the last chunk (only true when stream ends) */
  isLastChunk: boolean;
}

/**
 * Base options shared between CsvParseOptions and CsvFormatOptions
 */
export interface CsvBaseOptions {
  /** Field delimiter (default: ",") */
  delimiter?: string;
  /** Quote character (default: '"'), set to false or null to disable quoting */
  quote?: string | false | null;
  /** Escape character (default: same as quote) */
  escape?: string | false | null;
  /**
   * Enable object mode (default: true for Node.js streams)
   * - Parse: push row objects/arrays vs JSON strings
   * - Format: accept row objects/arrays directly vs JSON strings
   */
  objectMode?: boolean;
}

/**
 * CSV parsing options
 */
export interface CsvParseOptions extends CsvBaseOptions {
  /**
   * Field delimiter (default: ",")
   * - Set to empty string "" to enable auto-detection
   * - Auto-detection will try: comma, semicolon, tab, pipe
   */
  delimiter?: string;
  /**
   * Delimiters to try during auto-detection (only used when delimiter is "")
   * Default: [",", ";", "\t", "|"]
   *
   * Order matters - earlier delimiters are preferred when scores are equal.
   *
   * @example
   * // Only try comma and semicolon
   * delimitersToGuess: [",", ";"]
   *
   * // European-style (semicolon first)
   * delimitersToGuess: [";", ",", "\t"]
   */
  delimitersToGuess?: string[];
  /**
   * Line terminator for parsing (default: auto-detect)
   * - Set to "" (empty string) for auto-detection (default behavior)
   * - Common values: "\n" (LF), "\r\n" (CRLF), "\r" (CR)
   *
   * When auto-detecting, the parser handles all line ending types.
   * Explicitly setting this can provide a small performance benefit
   * if you know the exact format.
   */
  newline?: string;
  /** Skip empty lines (default: false). Uses greedy mode: also skips whitespace-only lines. */
  skipEmptyLines?: boolean;
  /** Alias for skipEmptyLines */
  ignoreEmpty?: boolean;
  /** Trim whitespace from both sides of fields (default: false) */
  trim?: boolean;
  /** Left trim whitespace from fields (default: false) */
  ltrim?: boolean;
  /** Right trim whitespace from fields (default: false) */
  rtrim?: boolean;
  /**
   * Header handling:
   * - true: first row is headers, return objects
   * - false: no headers, return arrays
   * - string[]: use these as headers
   * - function: transform first row headers
   */
  headers?: boolean | HeaderArray | HeaderTransformFunction;
  /**
   * If true and headers is string[], discard first row and use provided headers
   */
  renameHeaders?: boolean;
  /** Comment character - lines starting with this are ignored */
  comment?: string;
  /** Maximum number of data rows to parse (excluding header) */
  maxRows?: number;
  /** Number of lines to skip at the beginning (before header detection) */
  skipLines?: number;
  /** Number of data rows to skip (after header detection) */
  skipRows?: number;
  /**
   * Maximum number of bytes allowed per row (default: unlimited).
   * An error is thrown if a row exceeds this limit.
   * This is a safety feature to prevent memory exhaustion from malformed CSV files
   * with unclosed quotes or malicious input.
   *
   * @example
   * // Limit rows to 1MB
   * { maxRowBytes: 1024 * 1024 }
   */
  maxRowBytes?: number;
  /**
   * Strict column handling:
   * - If true, rows with column count mismatch emit 'data-invalid' event
   * - If false (default), throws error on mismatch (unless discardUnmappedColumns)
   */
  strictColumnHandling?: boolean;
  /**
   * If true, discard columns that exceed header count
   * Only valid when headers are specified
   */
  discardUnmappedColumns?: boolean;
  /**
   * Character encoding for input (default: "utf8")
   * Only used in Node.js streaming context
   */
  encoding?: BufferEncoding;
  /**
   * Synchronous transform function to apply to each row after parsing
   * Return null/undefined to skip the row
   * Works in both Node.js and Browser environments
   *
   * @example
   * // With headers (row is Record<string, string>)
   * transform: (row) => ({ ...row, name: row.name.toUpperCase() })
   *
   * // Without headers (row is string[])
   * transform: (row) => [row[0].toUpperCase(), row[1]]
   */
  transform?: (row: Row) => Row | null | undefined;
  /**
   * Enable fast parsing mode for simple CSV data without quoted fields.
   * Skips character-by-character quote detection and splits directly by delimiter.
   * Can provide 20-50% performance improvement for clean data.
   *
   * WARNING: Only use when data is guaranteed to NOT contain:
   * - Quote characters within fields
   * - Delimiter characters within fields
   * - Newline characters within fields
   *
   * Ideal for: numeric data, sensor logs, simple exports without text fields.
   * @default false
   */
  fastMode?: boolean;
  /**
   * Synchronous validate function to check each row
   * Return false to mark row as invalid (will be in invalidRows)
   * Can also return { isValid: boolean, reason?: string }
   * Works in both Node.js and Browser environments
   *
   * @example
   * // With headers
   * validate: (row) => row.name !== ''
   *
   * // With custom reason
   * validate: (row) => ({ isValid: row.age >= 18, reason: 'Must be adult' })
   */
  validate?: (row: Row) => boolean | { isValid: boolean; reason?: string };
  /**
   * Automatically convert string values to appropriate JavaScript types.
   *
   * - `true`: Convert all columns (numbers, booleans, null/empty)
   * - `false`: Keep all values as strings (default)
   * - `Record<string, boolean>`: Enable/disable per column by header name
   * - `Record<string, (value: string) => unknown>`: Custom converter per column
   *
   * Built-in conversions when enabled:
   * - Numbers: "123" → 123, "3.14" → 3.14, "-5" → -5
   * - Booleans: "true"/"TRUE" → true, "false"/"FALSE" → false
   * - Empty/null: "" → null (only when dynamicTyping is enabled)
   *
   * @example
   * // Enable for all columns
   * dynamicTyping: true
   *
   * // Enable for specific columns only
   * dynamicTyping: { age: true, score: true, name: false }
   *
   * // Custom converters
   * dynamicTyping: {
   *   date: (val) => new Date(val),
   *   amount: (val) => parseFloat(val.replace('$', ''))
   * }
   */
  dynamicTyping?: DynamicTypingConfig;
  /**
   * Callback function invoked for each chunk of rows during parsing.
   * Useful for processing large files without loading everything into memory.
   *
   * Only works with streaming parsers (CsvParserStream, parseCsvStream).
   * For synchronous parseCsv(), use maxRows + pagination instead.
   *
   * @param rows - Array of parsed rows in the current chunk
   * @param meta - Metadata about the chunk (cursor position, flags)
   * @returns Return `false` to abort parsing early, anything else continues
   *
   * @example
   * // Process in batches
   * chunk: async (rows, meta) => {
   *   await db.insertBatch(rows);
   *   console.log(`Processed ${meta.cursor} rows`);
   * }
   *
   * // Abort after certain condition
   * chunk: (rows, meta) => {
   *   if (meta.cursor > 1000000) return false; // Stop after 1M rows
   * }
   */
  chunk?: (rows: Row[], meta: ChunkMeta) => boolean | void | Promise<boolean | void>;
  /**
   * Number of rows per chunk when using the chunk callback.
   * Larger chunks = fewer callbacks but more memory usage.
   * @default 1000
   */
  chunkSize?: number;
  /**
   * Callback invoked before parsing the first chunk of data.
   * Allows preprocessing, validation, or modification of raw CSV text.
   *
   * Common use cases:
   * - Skip metadata/comments at the start of file
   * - Detect and remove BOM characters
   * - Auto-detect delimiter by analyzing the content
   * - Validate file format before parsing
   *
   * @param chunk - The first chunk of raw CSV text
   * @returns Modified chunk to parse, or undefined to use original
   * @throws Throw an error to abort parsing
   *
   * @example
   * // Skip metadata lines starting with #
   * beforeFirstChunk: (chunk) => {
   *   const lines = chunk.split('\n');
   *   const dataStart = lines.findIndex(l => !l.startsWith('#'));
   *   return lines.slice(dataStart).join('\n');
   * }
   *
   * // Remove BOM
   * beforeFirstChunk: (chunk) => {
   *   if (chunk.charCodeAt(0) === 0xFEFF) return chunk.slice(1);
   * }
   *
   * // Validate required headers
   * beforeFirstChunk: (chunk) => {
   *   const headers = chunk.split('\n')[0].split(',');
   *   if (!headers.includes('id')) throw new Error('Missing id column');
   * }
   */
  beforeFirstChunk?: (chunk: string) => string | void;
}

export type SkipEmptyLines = boolean;

/**
 * CSV formatting options
 */
export interface CsvFormatOptions extends CsvBaseOptions {
  /** Row delimiter (default: "\n") */
  rowDelimiter?: string;
  /**
   * Decimal separator used when formatting numbers to CSV (default: ".").
   * For European-style CSV, this is commonly "," (often together with delimiter ";").
   */
  decimalSeparator?: "." | ",";
  /** Always quote all fields (default: false, only quote when necessary) */
  alwaysQuote?: boolean;
  /** Quote specific columns by name or index */
  quoteColumns?: boolean | boolean[] | Record<string, boolean>;
  /** Quote header fields */
  quoteHeaders?: boolean | boolean[] | Record<string, boolean>;
  /**
   * Header handling:
   * - true: auto-detect headers from first object
   * - false/null: no headers
   * - string[]: use these as headers (also used as keys)
   */
  headers?: string[] | boolean | null;
  /**
   * Column configuration with key/header separation.
   * When provided, takes precedence over `headers` for determining output structure.
   *
   * @example
   * // Simple: same as headers: ['firstName', 'lastName']
   * columns: ['firstName', 'lastName']
   *
   * @example
   * // With header renaming
   * columns: [
   *   { key: 'firstName', header: 'First Name' },
   *   { key: 'lastName', header: 'Last Name' },
   *   { key: 'createdAt', header: 'Registration Date' }
   * ]
   *
   * @example
   * // Mixed
   * columns: [
   *   'id',  // key and header are both 'id'
   *   { key: 'firstName', header: 'First Name' }
   * ]
   */
  columns?: (string | ColumnConfig)[];
  /**
   * Whether to write headers (default: true when headers is provided)
   * Set to false to suppress header row output
   */
  writeHeaders?: boolean;
  /** Include BOM for UTF-8 (default: false) */
  writeBOM?: boolean;
  /** Include final row delimiter (default: true) */
  includeEndRowDelimiter?: boolean;
  /**
   * Escape formulae to prevent CSV injection attacks.
   * Fields starting with dangerous characters are prefixed with a tab character
   * to neutralize them in spreadsheet applications.
   *
   * Escaped characters (per OWASP recommendations):
   * - `=` (equals) - formula prefix
   * - `+` (plus) - formula prefix
   * - `-` (minus) - formula prefix
   * - `@` (at) - formula prefix
   * - `\t` (tab, 0x09)
   * - `\r` (carriage return, 0x0D)
   * - `\n` (line feed, 0x0A)
   * - Full-width variants: `＝` `＋` `－` `＠` (for Japanese/CJK locales)
   *
   * @default false
   * @see https://owasp.org/www-community/attacks/CSV_Injection
   */
  escapeFormulae?: boolean;
  /** Write headers even when there's no data (default: false) */
  alwaysWriteHeaders?: boolean;
  /**
   * Transform configuration for data conversion.
   *
   * Supports type-based field transforms and row-level filtering:
   * - `boolean`: Transform boolean values
   * - `date`: Transform Date values
   * - `number`: Transform number values
   * - `bigint`: Transform bigint values
   * - `object`: Transform object values
   * - `string`: Transform string values
   * - `row`: Row-level filter/transform (runs first, return null to skip)
   *
   * @example
   * // Type-based transforms
   * transform: {
   *   boolean: (v) => v ? 'Yes' : 'No',
   *   date: (v) => v.toISOString().split('T')[0],
   *   number: (v, ctx) => ctx.column === 'price' ? '$' + v.toFixed(2) : String(v)
   * }
   *
   * @example
   * // Row filtering + type transforms
   * transform: {
   *   row: (row) => row.active ? row : null,
   *   boolean: (v) => v ? 'Active' : 'Inactive'
   * }
   */
  transform?: TypeTransformMap;
}

/**
 * Parsing metadata returned alongside results
 */
export interface CsvParseMeta {
  /** The delimiter that was used to parse the data */
  delimiter: string;
  /** The line terminator detected in the input (CRLF, LF, or CR) */
  linebreak: string;
  /** Whether parsing was aborted early (via chunk callback returning false) */
  aborted: boolean;
  /** Whether the result was truncated due to maxRows limit */
  truncated: boolean;
  /** Total number of data rows processed (excluding header) */
  cursor: number;
  /** Field names (headers) if header parsing was enabled */
  fields?: string[];
  /** Map of renamed headers when duplicates were found, otherwise null */
  renamedHeaders?: Record<string, string> | null;
}

/**
 * Error codes for CSV parsing errors
 */
export type CsvParseErrorCode = "MissingQuotes" | "TooManyFields" | "TooFewFields";

/**
 * Represents a parsing error encountered during CSV parsing.
 * Errors are non-fatal - parsing continues and collects all errors.
 */
export interface CsvParseError {
  /** Error code */
  code: CsvParseErrorCode;
  /** Human-readable error message */
  message: string;
  /** Row number where error occurred (0-based, excluding header) */
  row: number;
}

/**
 * Parsed CSV result with headers
 */
export interface CsvParseResult<T = string[]> {
  /** Header row (if headers option was true) */
  headers?: string[];
  /** Data rows */
  rows: T[];
  /** Invalid rows (when strictColumnHandling is true) */
  invalidRows?: { row: string[]; reason: string }[];
  /**
   * Parsing errors encountered (non-fatal).
   * Includes: MissingQuotes, TooManyFields, TooFewFields
   */
  errors?: CsvParseError[];
  /** Parsing metadata (delimiter used, linebreak detected, etc.) */
  meta: CsvParseMeta;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Escape special regex characters
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const NON_WHITESPACE_RE = /\S/;

function isEmptyRowGreedy(row: string[], shouldSkipEmpty: boolean): boolean {
  if (!shouldSkipEmpty) {
    return false;
  }
  for (const field of row) {
    if (NON_WHITESPACE_RE.test(field)) {
      return false;
    }
  }
  return true;
}

/**
 * Create a trim function based on options.
 * Pre-computes the function to avoid repeated condition checks.
 */
export function makeTrimField(
  trim: boolean,
  ltrim: boolean,
  rtrim: boolean
): (s: string) => string {
  if (trim || (ltrim && rtrim)) {
    return (s: string) => s.trim();
  }
  if (ltrim) {
    return (s: string) => s.trimStart();
  }
  if (rtrim) {
    return (s: string) => s.trimEnd();
  }
  return (s: string) => s;
}

// =============================================================================
// Dynamic Typing - Automatic Type Conversion
// =============================================================================

/**
 * Convert a string value to its appropriate JavaScript type.
 * Used internally by dynamicTyping feature.
 *
 * Conversion rules:
 * - Empty string → null
 * - "true"/"TRUE"/"True" → true
 * - "false"/"FALSE"/"False" → false
 * - Numeric strings → number (int or float)
 * - Everything else → original string
 */
export function convertValue(value: string): string | number | boolean | null {
  // Empty string stays empty (not converted to null)
  if (value === "") {
    return "";
  }

  // Boolean detection (case-insensitive)
  const lowerValue = value.toLowerCase();
  if (lowerValue === "true") {
    return true;
  }
  if (lowerValue === "false") {
    return false;
  }

  // Null detection (case-insensitive)
  if (lowerValue === "null") {
    return null;
  }

  // Number detection
  // Handle leading/trailing whitespace by trimming first
  const trimmed = value.trim();
  if (trimmed !== "" && trimmed === value) {
    // Special numeric values
    if (trimmed === "Infinity") {
      return Infinity;
    }
    if (trimmed === "-Infinity") {
      return -Infinity;
    }
    if (trimmed === "NaN") {
      return NaN;
    }

    // Preserve leading zeros (important for zip codes, phone numbers, IDs)
    // Only convert if the number doesn't have leading zeros (except for "0" itself or "0.xxx")
    if (/^-?0[0-9]/.test(trimmed)) {
      // Has leading zero followed by another digit - preserve as string
      return value;
    }

    // Check for valid number format (avoid converting "123abc" or "1.2.3")
    if (/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
      const num = Number(trimmed);
      if (!isNaN(num)) {
        return num;
      }
    }
  }

  // Default: keep as string
  return value;
}

/**
 * Type guard to check if dynamicTyping config has custom converter function
 */
function isCustomConverter(
  config: boolean | ((value: string) => unknown)
): config is (value: string) => unknown {
  return typeof config === "function";
}

/**
 * Apply dynamic typing to a single field value
 *
 * @param value - The string value to convert
 * @param columnConfig - Column-specific config (true, false, or custom function)
 * @returns Converted value
 */
export function applyDynamicTyping(
  value: string,
  columnConfig: boolean | ((value: string) => unknown)
): unknown {
  if (columnConfig === false) {
    return value;
  }

  if (isCustomConverter(columnConfig)) {
    return columnConfig(value);
  }

  // columnConfig === true → use default conversion
  return convertValue(value);
}

/**
 * Apply dynamic typing to an entire row (object form)
 *
 * @param row - Row object with string values
 * @param dynamicTyping - DynamicTyping configuration
 * @returns New row object with converted values
 */
export function applyDynamicTypingToRow(
  row: Record<string, string>,
  dynamicTyping: DynamicTypingConfig
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (dynamicTyping === true) {
    // Convert all columns
    for (const key of Object.keys(row)) {
      result[key] = convertValue(row[key]);
    }
  } else if (dynamicTyping === false) {
    // No conversion
    return row;
  } else {
    // Per-column configuration
    for (const key of Object.keys(row)) {
      const config = dynamicTyping[key];
      if (config === undefined) {
        // Column not in config → keep as string
        result[key] = row[key];
      } else {
        result[key] = applyDynamicTyping(row[key], config);
      }
    }
  }

  return result;
}

/**
 * Apply dynamic typing to an array row
 *
 * @param row - Row array with string values
 * @param headers - Header names (for per-column config lookup)
 * @param dynamicTyping - DynamicTyping configuration
 * @returns New row array with converted values
 */
export function applyDynamicTypingToArrayRow(
  row: string[],
  headers: string[] | null,
  dynamicTyping: DynamicTypingConfig
): unknown[] {
  if (dynamicTyping === true) {
    // Convert all columns
    return row.map(convertValue);
  }

  if (dynamicTyping === false) {
    // No conversion
    return row;
  }

  // Per-column configuration - need headers to look up column names
  if (!headers) {
    // No headers available, can't use per-column config → no conversion
    return row;
  }

  return row.map((value, index) => {
    const header = headers[index];
    const config = header ? dynamicTyping[header] : undefined;
    if (config === undefined) {
      return value;
    }
    return applyDynamicTyping(value, config);
  });
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a transform function is synchronous (1 argument) vs async (2 arguments)
 */
export function isSyncTransform<I, O>(
  transform: RowTransformFunction<I, O>
): transform is (row: I) => O | null {
  return transform.length === 1;
}

/**
 * Check if a validate function is synchronous (1 argument) vs async (2 arguments)
 */
export function isSyncValidate<T>(
  validate: RowValidateFunction<T>
): validate is (row: T) => boolean {
  return validate.length === 1;
}

/**
 * Process validation result and return { isValid, reason }
 */
function processValidateResult(result: boolean | { isValid: boolean; reason?: string }): {
  isValid: boolean;
  reason: string;
} {
  if (typeof result === "boolean") {
    return { isValid: result, reason: "Validation failed" };
  }
  return { isValid: result.isValid, reason: result.reason || "Validation failed" };
}

// =============================================================================
// Parse Functions
// =============================================================================

/**
 * Parse a CSV string into rows of fields
 */
export function parseCsv(
  input: string,
  options: CsvParseOptions = {}
): string[][] | CsvParseResult<Record<string, string>> | CsvParseResult<Record<string, unknown>> {
  const {
    delimiter: delimiterOption = ",",
    delimitersToGuess,
    newline: newlineOption = "",
    quote: quoteOption = '"',
    escape: escapeOption = '"',
    skipEmptyLines = false,
    ignoreEmpty = false,
    trim = false,
    ltrim = false,
    rtrim = false,
    headers = false,
    renameHeaders = false,
    comment,
    maxRows,
    skipLines = 0,
    skipRows = 0,
    strictColumnHandling = false,
    discardUnmappedColumns = false,
    fastMode = false,
    transform,
    validate,
    dynamicTyping,
    beforeFirstChunk
  } = options;

  // Apply beforeFirstChunk if provided
  let processedInput = input;
  if (beforeFirstChunk) {
    const result = beforeFirstChunk(input);
    if (typeof result === "string") {
      processedInput = result;
    }
  }

  // Strip BOM (Byte Order Mark) if present
  processedInput = stripBom(processedInput);

  const shouldSkipEmpty = skipEmptyLines || ignoreEmpty;

  // Auto-detect delimiter if empty string is passed
  const delimiter =
    delimiterOption === ""
      ? detectDelimiter(
          processedInput,
          quoteOption !== false && quoteOption !== null ? String(quoteOption) : '"',
          delimitersToGuess,
          comment,
          shouldSkipEmpty
        )
      : delimiterOption;

  // Detect or use provided line terminator for meta info
  // Note: The parser always handles all line ending types, this is mainly for meta info
  const linebreak = newlineOption || detectLinebreak(processedInput);

  // Handle quote: null/false to disable quoting
  const quoteEnabled = quoteOption !== null && quoteOption !== false;
  const quote = quoteEnabled ? String(quoteOption) : "";
  const escape = escapeOption !== null && escapeOption !== false ? String(escapeOption) : "";

  const rows: string[][] = [];
  const invalidRows: { row: string[]; reason: string }[] = [];
  const errors: CsvParseError[] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;
  let lineNumber = 0;
  let currentRowBytes = 0; // Track row size for maxRowBytes check
  const maxRowBytes = options.maxRowBytes;

  // Helper to check row size limit (inlined for performance in hot path)
  const checkRowBytes =
    maxRowBytes !== undefined
      ? () => {
          if (currentRowBytes > maxRowBytes) {
            throw new Error(`Row exceeds the maximum size of ${maxRowBytes} bytes`);
          }
        }
      : null;

  let dataRowCount = 0;
  let skippedDataRows = 0;
  let truncated = false; // Track if parsing was stopped due to maxRows

  // Header handling
  let headerRow: HeaderArray | null = null;
  let headersLength = 0;
  let useHeaders = false;
  let headerRowProcessed = false;

  // Track renamed headers for meta (PapaParse-compatible)
  let renamedHeadersForMeta: Record<string, string> | null = null;

  // Determine header mode
  if (headers === true) {
    useHeaders = true;
  } else if (Array.isArray(headers)) {
    const { headers: dedupedHeaders, renamedHeaders } = deduplicateHeadersWithRenames(headers);
    headerRow = dedupedHeaders;
    // For explicit headers, track renames for meta
    renamedHeadersForMeta = renamedHeaders;
    headersLength = headerRow.filter(h => h !== null && h !== undefined).length;
    useHeaders = true;
    if (!renameHeaders) {
      headerRowProcessed = true; // We already have headers, don't wait for first row
    }
  } else if (typeof headers === "function") {
    useHeaders = true;
  }

  // Pre-compute trim function to avoid repeated condition checks
  const trimField = makeTrimField(trim, ltrim, rtrim);

  const processRow = (row: string[]): boolean => {
    // Handle first row as headers when needed
    if (useHeaders && !headerRowProcessed) {
      if (typeof headers === "function") {
        const { headers: dedupedHeaders, renamedHeaders } = deduplicateHeadersWithRenames(
          headers(row)
        );
        headerRow = dedupedHeaders;
        renamedHeadersForMeta = renamedHeaders;
      } else if (!Array.isArray(headers)) {
        const { headers: dedupedHeaders, renamedHeaders } = deduplicateHeadersWithRenames(row);
        headerRow = dedupedHeaders;
        renamedHeadersForMeta = renamedHeaders;
      }
      headersLength = headerRow!.filter(h => h !== null && h !== undefined).length;
      headerRowProcessed = true;
      // Header row is never added to data rows
      return false;
    }

    // Skip data rows
    if (skippedDataRows < skipRows) {
      skippedDataRows++;
      return false;
    }

    // Column validation when using headers
    if (headerRow && headerRow.length > 0) {
      const expectedCols = headersLength;
      const actualCols = row.length;

      if (actualCols > expectedCols) {
        errors.push({
          code: "TooManyFields",
          message: `Too many fields: expected ${expectedCols}, found ${actualCols}`,
          row: dataRowCount
        });

        if (strictColumnHandling && !discardUnmappedColumns) {
          // Mark as invalid but continue
          invalidRows.push({
            row,
            reason: `Column header mismatch expected: ${expectedCols} columns got: ${actualCols}`
          });
          return false;
        } else {
          // Default: trim extra columns
          row.length = headerRow.length;
        }
      } else if (actualCols < expectedCols) {
        errors.push({
          code: "TooFewFields",
          message: `Too few fields: expected ${expectedCols}, found ${actualCols}`,
          row: dataRowCount
        });

        if (strictColumnHandling) {
          invalidRows.push({
            row,
            reason: `Column header mismatch expected: ${expectedCols} columns got: ${actualCols}`
          });
          return false;
        }
        // Pad with empty strings
        while (row.length < headerRow.length) {
          row.push("");
        }
      }
    }

    return true;
  };

  // ==========================================================================
  // Fast Mode: Skip quote detection, split directly by delimiter
  // ==========================================================================
  if (fastMode) {
    // Split by lines - use specified newline or handle all line endings
    const lines = newlineOption
      ? processedInput.split(newlineOption)
      : processedInput.split(/\r\n|\r|\n/);
    let lineIdx = 0;

    for (const line of lines) {
      lineIdx++;

      // Skip lines at beginning
      if (lineIdx <= skipLines) {
        continue;
      }

      // Skip comment lines
      if (comment && line.startsWith(comment)) {
        continue;
      }

      // Skip empty lines (fastMode always skips empty lines)
      if (line === "") {
        continue;
      }

      // Split by delimiter (fast path - no quote detection)
      const row = line.split(delimiter).map(trimField);

      // Greedy skipEmptyLines: also skips whitespace-only and delimiter-only rows
      if (isEmptyRowGreedy(row, shouldSkipEmpty)) {
        continue;
      }

      if (processRow(row)) {
        rows.push(row);
        dataRowCount++;
      }

      // Check max rows
      if (maxRows !== undefined && dataRowCount >= maxRows) {
        truncated = true;
        break;
      }
    }

    // Return result (rest of function handles headers conversion)
    return buildResult();
  }

  // Helper function to build the final result
  function buildResult():
    | string[][]
    | CsvParseResult<Record<string, string>>
    | CsvParseResult<Record<string, unknown>> {
    // Build meta object
    const meta: CsvParseMeta = {
      delimiter,
      linebreak,
      aborted: false, // parseCsv is synchronous, no abort mechanism
      truncated,
      cursor: dataRowCount,
      renamedHeaders: renamedHeadersForMeta
    };

    // Helper to apply validation and collect invalid rows
    function applyValidation<T>(
      dataRows: T[],
      toStringArray: (row: T) => string[]
    ): { validRows: T[]; newInvalidRows: { row: string[]; reason: string }[] } {
      const validRows: T[] = [];
      const newInvalidRows: { row: string[]; reason: string }[] = [];
      for (const row of dataRows) {
        const { isValid, reason } = processValidateResult(validate!(row as Row));
        if (isValid) {
          validRows.push(row);
        } else {
          newInvalidRows.push({ row: toStringArray(row), reason });
        }
      }
      return { validRows, newInvalidRows };
    }

    // Convert to objects if headers enabled
    if (useHeaders && headerRow) {
      const headers = headerRow.filter((h): h is string => h !== null && h !== undefined);
      meta.fields = headers;

      // Convert rows to objects using headers
      const rowToObject = (row: string[]): Record<string, string> => {
        const obj: Record<string, string> = {};
        for (let i = 0; i < headerRow!.length; i++) {
          const header = headerRow![i];
          if (header !== null && header !== undefined) {
            obj[header] = row[i] ?? "";
          }
        }
        return obj;
      };

      let dataRows: Record<string, unknown>[] = rows.map(rowToObject);

      // Apply dynamicTyping if provided (before transform)
      if (dynamicTyping) {
        dataRows = dataRows.map(row =>
          applyDynamicTypingToRow(row as Record<string, string>, dynamicTyping)
        ) as Record<string, unknown>[];
      }

      // Apply transform if provided
      if (transform) {
        dataRows = dataRows
          .map(row => transform(row as Record<string, string>))
          .filter(row => row !== null && row !== undefined) as Record<string, unknown>[];
      }

      // Apply validate if provided
      if (validate) {
        const { validRows, newInvalidRows } = applyValidation(dataRows, row =>
          Object.values(row).map(v => (v === null ? "" : String(v)))
        );
        dataRows = validRows;
        invalidRows.push(...newInvalidRows);
      }

      const result: CsvParseResult<Record<string, unknown>> = {
        headers,
        rows: dataRows,
        meta
      };
      if (invalidRows.length > 0) {
        result.invalidRows = invalidRows;
      }
      if (errors.length > 0) {
        result.errors = errors;
      }
      return result;
    }

    // For array mode, apply dynamicTyping, transform and validate
    let resultRows: (string[] | unknown[])[] = rows;

    // Apply dynamicTyping if provided (before transform)
    if (dynamicTyping) {
      // For array mode without headers, we can only use dynamicTyping: true (all columns)
      // Per-column config requires headers
      const effectiveHeaders = headerRow?.filter((h): h is string => h != null) ?? null;
      resultRows = resultRows.map(row =>
        applyDynamicTypingToArrayRow(row as string[], effectiveHeaders, dynamicTyping)
      );
    }

    if (transform) {
      resultRows = resultRows
        .map(row => transform(row as string[]))
        .filter((row): row is string[] => row !== null && row !== undefined && Array.isArray(row));
    }

    if (validate) {
      const { validRows, newInvalidRows } = applyValidation(resultRows, row =>
        row.map(v => (v === null ? "" : String(v)))
      );
      resultRows = validRows;

      // Return with invalidRows for array mode when validate is used
      if (newInvalidRows.length > 0) {
        return {
          rows: resultRows,
          invalidRows: newInvalidRows
        } as any;
      }
    }

    return resultRows as string[][];
  }

  // ==========================================================================
  // Standard Mode: Full RFC 4180 compliant parsing with quote handling
  // ==========================================================================
  const len = processedInput.length;
  while (i < len) {
    const char = processedInput[i];

    if (inQuotes && quoteEnabled) {
      // Inside quoted field
      if (escape && char === escape && processedInput[i + 1] === quote) {
        // Escaped quote ("" becomes single ")
        currentField += quote;
        currentRowBytes++;
        i += 2;
        checkRowBytes?.();
      } else if (char === quote) {
        // End of quoted field
        inQuotes = false;
        i++;
      } else if (char === "\r") {
        // Normalize CRLF to LF inside quoted fields
        if (processedInput[i + 1] === "\n") {
          i++; // Skip \r, will add \n on next iteration
        } else {
          currentField += "\n"; // Convert standalone \r to \n
          currentRowBytes++;
          i++;
          checkRowBytes?.();
        }
      } else {
        currentField += char;
        currentRowBytes++;
        i++;
        checkRowBytes?.();
      }
    } else {
      // Outside quoted field
      if (quoteEnabled && char === quote && currentField === "") {
        // Start of quoted field
        inQuotes = true;
        i++;
      } else if (char === delimiter) {
        // Field separator
        currentRow.push(trimField(currentField));
        currentField = "";
        currentRowBytes++; // Count delimiter
        i++;
        checkRowBytes?.();
      } else if (char === "\n" || char === "\r") {
        // End of row - handle \r\n, \r, and \n
        if (char === "\r" && processedInput[i + 1] === "\n") {
          i++; // Skip the \n in \r\n
        }
        currentRow.push(trimField(currentField));
        currentField = "";

        lineNumber++;

        // Skip lines at beginning
        if (lineNumber <= skipLines) {
          currentRow = [];
          i++;
          continue;
        }

        // Skip comment lines
        if (comment && currentRow[0]?.startsWith(comment)) {
          currentRow = [];
          i++;
          continue;
        }

        // Skip empty lines (greedy: also skips whitespace-only lines)
        if (isEmptyRowGreedy(currentRow, shouldSkipEmpty)) {
          currentRow = [];
          i++;
          continue;
        }

        // Process row (handles headers, validation)
        if (processRow(currentRow)) {
          rows.push(currentRow);
          dataRowCount++;
        }

        currentRow = [];
        currentRowBytes = 0; // Reset row bytes counter
        i++;

        // Check max rows - after resetting currentRow
        if (maxRows !== undefined && dataRowCount >= maxRows) {
          truncated = true;
          break;
        }
      } else {
        currentField += char;
        currentRowBytes++;
        i++;
        checkRowBytes?.();
      }
    }
  }

  // Handle last field/row
  if (currentField !== "" || currentRow.length > 0) {
    if (inQuotes && quoteEnabled) {
      errors.push({
        code: "MissingQuotes",
        message: "Quoted field unterminated",
        row: dataRowCount
      });
    }

    currentRow.push(trimField(currentField));

    // Use early-return style for cleaner logic
    const shouldProcessLastRow =
      lineNumber >= skipLines &&
      !(comment && currentRow[0]?.startsWith(comment)) &&
      !isEmptyRowGreedy(currentRow, shouldSkipEmpty) &&
      !(maxRows !== undefined && dataRowCount >= maxRows);

    if (shouldProcessLastRow && processRow(currentRow)) {
      rows.push(currentRow);
      dataRowCount++;
    }
  }

  return buildResult();
}

// =============================================================================
// Format Functions
// =============================================================================

/**
 * Apply type-based transform to a single value.
 * Returns the transformed string, or undefined if no transform applies.
 * @internal Exported for use in csv-stream.ts
 */
export function applyTypeTransform(
  value: any,
  transform: TypeTransformMap,
  ctx: TransformContext
): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const type = typeof value;

  if (type === "boolean" && transform.boolean) {
    return transform.boolean(value, ctx);
  }
  if (value instanceof Date && transform.date) {
    return transform.date(value, ctx);
  }
  if (type === "number" && transform.number) {
    return transform.number(value, ctx);
  }
  if (type === "bigint" && transform.bigint) {
    return transform.bigint(value, ctx);
  }
  if (type === "string" && transform.string) {
    return transform.string(value, ctx);
  }
  // Handle plain objects (not Date, not Array, not null)
  if (type === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
    if (transform.object) {
      return transform.object(value, ctx);
    }
  }

  return undefined;
}

/**
 * Default type conversion to string.
 * @internal Exported for use in csv-stream.ts
 */
export function defaultToString(value: any, decimalSeparator: DecimalSeparator): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number") {
    return formatNumberForCsv(value, decimalSeparator);
  }
  if (value instanceof Date) {
    return String(value.getTime());
  }
  if (typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Format data as a CSV string
 */
export function formatCsv(
  data: (string | number | boolean | null | undefined)[][] | Record<string, any>[],
  options: CsvFormatOptions = {}
): string {
  const {
    delimiter = ",",
    quote: quoteOption = '"',
    escape: escapeOption,
    rowDelimiter = "\n",
    alwaysQuote = false,
    quoteColumns = false,
    quoteHeaders = false,
    headers,
    columns,
    writeHeaders: writeHeadersOption,
    writeBOM = false,
    includeEndRowDelimiter = false,
    alwaysWriteHeaders = false,
    transform,
    decimalSeparator = ".",
    escapeFormulae = false
  } = options;

  // Determine if headers should be written (default: true when headers is provided)
  const shouldWriteHeaders = writeHeadersOption ?? true;

  // Process columns config to extract keys and headers
  const columnsConfig = processColumns(columns);
  const columnKeys = columnsConfig?.keys ?? null;
  const columnHeaders = columnsConfig?.headers ?? null;

  // If quote is false or null, disable quoting entirely
  const quoteEnabled = quoteOption !== false && quoteOption !== null;
  const quote = quoteEnabled ? String(quoteOption) : "";
  const escape =
    escapeOption !== undefined && escapeOption !== false && escapeOption !== null
      ? String(escapeOption)
      : quote;

  // Pre-compile regex patterns for performance
  const needsQuoteRegex = quoteEnabled
    ? new RegExp(`[${escapeRegex(delimiter)}${escapeRegex(quote)}\r\n]`)
    : null;
  const escapeQuoteRegex = quoteEnabled ? new RegExp(escapeRegex(quote), "g") : null;
  const escapedQuote = escape + quote;

  const lines: string[] = [];
  let recordsProcessed = 0;

  const shouldQuoteColumn = (
    index: number,
    header?: string,
    isHeader: boolean = false
  ): boolean => {
    const quoteConfig = isHeader ? quoteHeaders : quoteColumns;

    if (typeof quoteConfig === "boolean") {
      return quoteConfig;
    }
    if (Array.isArray(quoteConfig)) {
      return quoteConfig[index] === true;
    }
    if (typeof quoteConfig === "object" && header) {
      return quoteConfig[header] === true;
    }
    return false;
  };

  const formatField = (
    value: any,
    index: number,
    header?: string,
    isHeader: boolean = false
  ): string => {
    // Apply type-based transform if provided (not for headers)
    let str: string;
    if (!isHeader && transform) {
      const ctx: TransformContext = {
        column: header ?? index,
        index: recordsProcessed
      };
      const transformed = applyTypeTransform(value, transform, ctx);
      str =
        transformed !== undefined
          ? transformed
          : defaultToString(value, decimalSeparator as DecimalSeparator);
    } else {
      str = defaultToString(value, decimalSeparator as DecimalSeparator);
    }

    // Escape formulae to prevent CSV injection (OWASP recommendation)
    // Prefix dangerous characters with tab to neutralize them in spreadsheet apps
    if (escapeFormulae && startsWithFormulaChar(str)) {
      str = "\t" + str;
    }

    // If quoting is disabled, return raw string
    if (!quoteEnabled) {
      return str;
    }

    // Check if quoting is needed
    const forceQuote = alwaysQuote || shouldQuoteColumn(index, header, isHeader);
    const needsQuote = forceQuote || needsQuoteRegex!.test(str);

    if (needsQuote) {
      // Escape quotes using pre-compiled regex
      const escaped = str.replace(escapeQuoteRegex!, escapedQuote);
      return quote + escaped + quote;
    }

    return str;
  };

  const formatRow = (row: any[], rowHeaders?: string[], isHeader: boolean = false): string => {
    return row
      .map((value, index) => formatField(value, index, rowHeaders?.[index], isHeader))
      .join(delimiter);
  };

  // Determine headers
  let keys: string[] | null = null;

  // Helper to apply row-level transform if provided
  const applyRowTransform = (row: any, sourceIndex: number): any | null => {
    if (transform?.row) {
      return transform.row(row, sourceIndex);
    }
    return row;
  };

  /**
   * Extract values from a row based on keys.
   * Handles objects, RowHashArray, and plain arrays uniformly.
   */
  const extractValues = (row: any, rowKeys: string[] | null): any[] => {
    if (isRowHashArray(row)) {
      return rowKeys ? rowHashArrayMapByHeaders(row, rowKeys) : rowHashArrayToValues(row);
    }
    if (Array.isArray(row)) {
      return row;
    }
    // Plain object
    return rowKeys ? rowKeys.map(key => row[key]) : Object.values(row);
  };

  /**
   * Auto-detect keys from first row based on data type.
   */
  const autoDetectKeys = (firstRow: any): string[] => {
    if (isRowHashArray(firstRow)) {
      return rowHashArrayToHeaders(firstRow);
    }
    if (!Array.isArray(firstRow) && typeof firstRow === "object" && firstRow !== null) {
      return Object.keys(firstRow);
    }
    return []; // Arrays don't have intrinsic keys
  };

  // Determine keys and displayHeaders upfront
  // Priority: columns > headers array > auto-detect (when headers: true)
  let displayHeaders: string[] | null = null;

  if (data.length > 0) {
    if (columnKeys) {
      keys = columnKeys;
      displayHeaders = columnHeaders;
    } else if (headers === true) {
      keys = autoDetectKeys(data[0]);
      displayHeaders = keys.length > 0 ? keys : null;
    } else if (Array.isArray(headers)) {
      keys = headers;
      displayHeaders = headers;
    }
  }

  // Write header row if needed
  if (displayHeaders && shouldWriteHeaders) {
    lines.push(formatRow(displayHeaders, displayHeaders, true));
  }

  // Process data rows
  for (let i = 0; i < data.length; i++) {
    const transformedRow = applyRowTransform(data[i], i);
    if (transformedRow === null || transformedRow === undefined) {
      continue;
    }
    const values = extractValues(transformedRow, keys);
    lines.push(formatRow(values, displayHeaders ?? undefined));
    recordsProcessed++;
  }

  // Handle empty data with alwaysWriteHeaders
  if (data.length === 0 && alwaysWriteHeaders && shouldWriteHeaders) {
    const emptyHeaders = columnHeaders ?? (Array.isArray(headers) ? headers : null);
    if (emptyHeaders) {
      lines.push(formatRow(emptyHeaders, emptyHeaders, true));
    }
  }

  let result = lines.join(rowDelimiter);

  // Add trailing row delimiter
  if (result.length > 0 && includeEndRowDelimiter) {
    result += rowDelimiter;
  }

  // Add BOM for UTF-8
  if (writeBOM) {
    result = "\uFEFF" + result;
  }

  return result;
}

// =============================================================================
// Streaming Parser
// =============================================================================

/**
 * Async CSV parser that yields rows one at a time
 *
 * Note: For streaming input, auto-detection buffers the first chunk to detect the delimiter.
 * For string input with delimiter="", it will auto-detect before parsing.
 */
export async function* parseCsvStream(
  input: string | AsyncIterable<string>,
  options: CsvParseOptions = {}
): AsyncGenerator<string[] | Record<string, string>, void, unknown> {
  const {
    delimiter: delimiterOption = ",",
    delimitersToGuess,
    quote: quoteOption = '"',
    escape: escapeOption = '"',
    skipEmptyLines = false,
    ignoreEmpty = false,
    trim = false,
    ltrim = false,
    rtrim = false,
    headers = false,
    renameHeaders = false,
    comment,
    maxRows,
    skipLines = 0,
    skipRows = 0,
    strictColumnHandling = false,
    discardUnmappedColumns = false
  } = options;

  const shouldSkipEmpty = skipEmptyLines || ignoreEmpty;

  // Handle quote: null/false to disable quoting
  const quoteEnabled = quoteOption !== null && quoteOption !== false;
  const quote = quoteEnabled ? String(quoteOption) : "";
  const escape = escapeOption !== null && escapeOption !== false ? String(escapeOption) : "";

  // For string input, auto-detect delimiter upfront
  // For async iterable, we need to buffer first chunk for detection
  let delimiter = delimiterOption;
  let asyncIterator: AsyncIterator<string> | null = null;
  let firstChunk: string | null = null;

  if (typeof input === "string") {
    if (delimiterOption === "") {
      delimiter = detectDelimiter(input, quote || '"', delimitersToGuess, comment, shouldSkipEmpty);
    }
  } else if (delimiterOption === "") {
    // For async iterable, buffer enough data for detection.
    // Leading chunks may contain only comments/empty lines; avoid locking onto the default delimiter.
    asyncIterator = input[Symbol.asyncIterator]();

    const MAX_DETECT_BUFFER = 1024 * 1024; // 1MB
    const MAX_DETECT_CHUNKS = 20;

    let detectBuffer = "";
    let chunksRead = 0;
    let hasMeaningfulLine = false;

    const maybeMarkMeaningfulLines = (): void => {
      // Only consider complete lines for detection readiness
      let start = 0;
      for (let i = 0; i < detectBuffer.length; i++) {
        const ch = detectBuffer[i];
        if (ch !== "\n" && ch !== "\r") {
          continue;
        }

        const line = detectBuffer.slice(start, i);
        // Skip \r\n
        if (ch === "\r" && detectBuffer[i + 1] === "\n") {
          i++;
        }
        start = i + 1;

        if (comment && line.startsWith(comment)) {
          continue;
        }

        if (line.trim() === "") {
          continue;
        }

        hasMeaningfulLine = true;
        return;
      }
    };

    while (true) {
      const firstResult = await asyncIterator.next();
      if (firstResult.done) {
        // Empty input
        if (detectBuffer.length === 0) {
          return;
        }
        break;
      }

      detectBuffer += firstResult.value;
      chunksRead++;
      maybeMarkMeaningfulLines();

      if (hasMeaningfulLine) {
        break;
      }

      if (detectBuffer.length >= MAX_DETECT_BUFFER || chunksRead >= MAX_DETECT_CHUNKS) {
        break;
      }
    }

    firstChunk = detectBuffer;
    delimiter = detectDelimiter(
      firstChunk,
      quote || '"',
      delimitersToGuess,
      comment,
      shouldSkipEmpty
    );
  }

  let headerRow: HeaderArray | null = null;
  let headersLength = 0;
  let useHeaders = false;
  let headerRowProcessed = false;
  let buffer = "";
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let lineNumber = 0;
  let dataRowCount = 0;
  let skippedDataRows = 0;
  let currentRowBytes = 0; // Track row size for maxRowBytes check
  const maxRowBytes = options.maxRowBytes;

  // Helper to check row size limit (inlined for performance in hot path)
  const checkRowBytes =
    maxRowBytes !== undefined
      ? () => {
          if (currentRowBytes > maxRowBytes) {
            throw new Error(`Row exceeds the maximum size of ${maxRowBytes} bytes`);
          }
        }
      : null;

  // Determine header mode
  if (headers === true) {
    useHeaders = true;
  } else if (Array.isArray(headers)) {
    headerRow = deduplicateHeaders(headers);
    headersLength = headerRow.filter(h => h !== null && h !== undefined).length;
    useHeaders = true;
    if (!renameHeaders) {
      headerRowProcessed = true;
    }
  } else if (typeof headers === "function") {
    useHeaders = true;
  }

  // Pre-compute trim function to avoid repeated condition checks
  const trimField = makeTrimField(trim, ltrim, rtrim);

  const processRow = (
    row: string[]
  ): { valid: boolean; row: string[] | Record<string, string> | null } => {
    // Header handling
    if (useHeaders && !headerRowProcessed) {
      if (typeof headers === "function") {
        const transformed = headers(row);
        headerRow = deduplicateHeaders(transformed);
      } else if (!Array.isArray(headers)) {
        headerRow = deduplicateHeaders(row);
      }
      headersLength = headerRow!.filter(h => h !== null && h !== undefined).length;
      headerRowProcessed = true;

      if (renameHeaders) {
        return { valid: false, row: null };
      }
      if (headers === true || typeof headers === "function") {
        return { valid: false, row: null };
      }
      return { valid: false, row: null };
    }

    // Skip data rows
    if (skippedDataRows < skipRows) {
      skippedDataRows++;
      return { valid: false, row: null };
    }

    // Column validation
    if (headerRow && headerRow.length > 0) {
      const expectedCols = headersLength;
      const actualCols = row.length;

      if (actualCols > expectedCols) {
        if (strictColumnHandling && !discardUnmappedColumns) {
          return { valid: false, row: null };
        } else {
          // Default: trim extra columns
          row.length = headerRow.length;
        }
      } else if (actualCols < expectedCols) {
        if (strictColumnHandling) {
          return { valid: false, row: null };
        }
        while (row.length < headerRow.length) {
          row.push("");
        }
      }
    }

    // Convert to object if using headers
    if (useHeaders && headerRow) {
      const obj: Record<string, string> = {};
      headerRow.forEach((header, index) => {
        if (header !== null && header !== undefined) {
          obj[header] = row[index] ?? "";
        }
      });
      return { valid: true, row: obj };
    }

    return { valid: true, row };
  };

  const processBuffer = function* (): Generator<string[] | Record<string, string>> {
    let i = 0;
    const len = buffer.length;

    while (i < len) {
      const char = buffer[i];

      if (inQuotes && quoteEnabled) {
        if (escape && char === escape && buffer[i + 1] === quote) {
          // Escaped quote ("" becomes single ")
          currentField += quote;
          currentRowBytes++;
          i += 2;
          checkRowBytes?.();
        } else if (char === quote) {
          inQuotes = false;
          i++;
        } else if (i === len - 1) {
          // Need more data for quoted field
          buffer = buffer.slice(i);
          return;
        } else if (char === "\r") {
          // Normalize CRLF to LF inside quoted fields
          if (buffer[i + 1] === "\n") {
            i++; // Skip \r, will add \n on next iteration
          } else {
            currentField += "\n"; // Convert standalone \r to \n
            currentRowBytes++;
            i++;
            checkRowBytes?.();
          }
        } else {
          currentField += char;
          currentRowBytes++;
          i++;
          checkRowBytes?.();
        }
      } else {
        if (quoteEnabled && char === quote && currentField === "") {
          inQuotes = true;
          i++;
        } else if (char === delimiter) {
          currentRow.push(trimField(currentField));
          currentField = "";
          currentRowBytes++; // Count delimiter
          i++;
          checkRowBytes?.();
        } else if (char === "\n" || char === "\r") {
          if (char === "\r" && buffer[i + 1] === "\n") {
            i++;
          }

          currentRow.push(trimField(currentField));
          currentField = "";
          lineNumber++;

          if (lineNumber <= skipLines) {
            currentRow = [];
            i++;
            continue;
          }

          if (comment && currentRow[0]?.startsWith(comment)) {
            currentRow = [];
            i++;
            continue;
          }

          const isEmpty = currentRow.length === 1 && currentRow[0] === "";
          if (shouldSkipEmpty && isEmpty) {
            currentRow = [];
            i++;
            continue;
          }

          const result = processRow(currentRow);
          if (result.valid && result.row) {
            dataRowCount++;

            if (maxRows !== undefined && dataRowCount > maxRows) {
              return;
            }

            yield result.row;
          }

          currentRow = [];
          currentRowBytes = 0; // Reset row bytes counter
          i++;
        } else {
          currentField += char;
          currentRowBytes++;
          i++;
          checkRowBytes?.();
        }
      }
    }

    buffer = "";
  };

  // Handle string input
  if (typeof input === "string") {
    buffer = input;
    yield* processBuffer();

    // Handle last row
    if (currentField !== "" || currentRow.length > 0) {
      currentRow.push(trimField(currentField));

      if (!(maxRows !== undefined && dataRowCount >= maxRows)) {
        const result = processRow(currentRow);
        if (result.valid && result.row) {
          yield result.row;
        }
      }
    }
    return;
  }

  // Handle async iterable (with possible buffered first chunk for auto-detection)
  // Process first chunk if we buffered it for delimiter detection
  if (firstChunk !== null) {
    buffer = firstChunk;
    yield* processBuffer();
  }

  // Continue with remaining chunks
  const iterator = asyncIterator ?? input[Symbol.asyncIterator]();
  while (true) {
    const result = await iterator.next();
    if (result.done) {
      break;
    }
    buffer += result.value;
    yield* processBuffer();
  }

  // Handle last row
  if (currentField !== "" || currentRow.length > 0) {
    currentRow.push(trimField(currentField));

    if (!(maxRows !== undefined && dataRowCount >= maxRows)) {
      const result = processRow(currentRow);
      if (result.valid && result.row) {
        yield result.row;
      }
    }
  }
}
