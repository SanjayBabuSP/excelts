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

import { type DecimalSeparator } from "@csv/csv-number";
import {
  detectDelimiter,
  detectLinebreak,
  stripBom,
  normalizeQuoteOption,
  normalizeEscapeOption
} from "@csv/utils/detect";
import {
  createFormatRegex,
  createQuoteLookup,
  formatRowWithLookup,
  type QuoteColumnConfig
} from "@csv/utils/format";
import {
  type HeaderArray,
  type RowHashArray,
  extractRowValues,
  detectRowKeys,
  deduplicateHeaders
} from "@csv/utils/row";
import {
  type DynamicTypingConfig,
  applyDynamicTypingToRow,
  applyDynamicTypingToArrayRow,
  applyDynamicTyping
} from "@csv/utils/dynamic-typing";
import {
  processHeaders,
  validateAndAdjustColumns,
  isEmptyRow,
  rowToObject,
  LINE_SPLIT_REGEX
} from "@csv/utils/parse";
import type { FormattedValue } from "@csv/utils/formatted-value";

// Re-export types from utility files
export type { HeaderArray, RowHashArray } from "@csv/utils/row";
export type { DynamicTypingConfig } from "@csv/utils/dynamic-typing";

// Re-export detection utilities
export {
  detectDelimiter,
  detectLinebreak,
  stripBom,
  startsWithFormulaChar,
  escapeRegex,
  normalizeQuoteOption,
  normalizeEscapeOption
} from "@csv/utils/detect";

// Re-export format utilities
export {
  createFormatRegex,
  createQuoteLookup,
  formatField,
  formatRowWithLookup,
  applyTypeTransform,
  defaultToString,
  type QuoteColumnConfig,
  type QuoteLookupFn,
  type CsvFormatRegex,
  type FormatFieldContext,
  type FormatRowOptions
} from "@csv/utils/format";

// Re-export row utilities
export {
  isRowHashArray,
  rowHashArrayToMap,
  rowHashArrayToValues,
  rowHashArrayToHeaders,
  rowHashArrayGet,
  rowHashArrayMapByHeaders,
  extractRowValues,
  detectRowKeys,
  deduplicateHeaders,
  deduplicateHeadersWithRenames
} from "@csv/utils/row";

// Re-export dynamic typing utilities
export {
  convertValue,
  applyDynamicTyping,
  applyDynamicTypingToRow,
  applyDynamicTypingToArrayRow
} from "@csv/utils/dynamic-typing";

// Re-export formatted value utilities for field-level quoting control
export type { FormattedValue } from "@csv/utils/formatted-value";
export { quoted, unquoted } from "@csv/utils/formatted-value";

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
 * Result type for transform functions.
 *
 * - `string` - Output as-is, apply global quoting rules
 * - `FormattedValue` - Output with explicit quoting control (use `quoted()` or `unquoted()` helpers)
 * - `null` / `undefined` - Output as empty field
 */
export type TransformResult = string | FormattedValue | null | undefined;

/**
 * Type-based transform functions for formatting specific data types.
 *
 * Each function receives the value and context, and can return:
 * - A string (uses global quoting settings)
 * - `quoted(value)` to force quoting
 * - `unquoted(value)` to prevent quoting
 * - `null`/`undefined` for empty field
 *
 * @example
 * ```ts
 * import { quoted, unquoted } from '@cj-tech-master/excelts';
 *
 * transform: {
 *   // Force all strings to be quoted
 *   string: (v) => quoted(v),
 *
 *   // Excel formula without outer quotes
 *   number: (v, ctx) => ctx.column === 'id' ? unquoted(`="${v}"`) : String(v),
 *
 *   // Regular string (follows global settings)
 *   date: (v) => v.toISOString()
 * }
 * ```
 */
export interface TypeTransformMap {
  /** Transform boolean values */
  boolean?: (value: boolean, ctx: TransformContext) => TransformResult;
  /** Transform Date values */
  date?: (value: Date, ctx: TransformContext) => TransformResult;
  /** Transform number values */
  number?: (value: number, ctx: TransformContext) => TransformResult;
  /** Transform bigint values */
  bigint?: (value: bigint, ctx: TransformContext) => TransformResult;
  /** Transform object values (excluding Date, null, arrays) */
  object?: (value: Record<string, any>, ctx: TransformContext) => TransformResult;
  /** Transform string values */
  string?: (value: string, ctx: TransformContext) => TransformResult;
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
  /**
   * Skip empty lines:
   * - true: skip completely empty lines
   * - false: keep all lines (default)
   * - "greedy": skip empty lines AND whitespace-only lines
   */
  skipEmptyLines?: boolean | "greedy";
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
  /**
   * Include additional information about each record.
   * When enabled, each row becomes an object with `record` and `info` properties.
   *
   * The info object contains:
   * - `index`: 0-based record index (data rows only, excluding header)
   * - `line`: 1-based line number in the original file where this record started
   * - `bytes`: Byte offset from the start of the file where this record started
   * - `invalid_field_length`: Number of fields (only present if mismatched)
   * - `raw`: Raw unparsed string of this record (only when `raw: true`)
   * - `quoted`: Array of booleans indicating which fields were quoted
   *
   * @example
   * const result = parseCsv('a,b\n1,2', { headers: true, info: true });
   * // result.rows[0] = {
   * //   record: { a: '1', b: '2' },
   * //   info: { index: 0, line: 2, bytes: 4, quoted: [false, false] }
   * // }
   *
   * @default false
   */
  info?: boolean;
  /**
   * Include the raw unparsed string for each record in the info object.
   * Only effective when `info: true` is also set.
   *
   * @example
   * const result = parseCsv('a,b\n"1","2"', { headers: true, info: true, raw: true });
   * // result.rows[0].info.raw === '"1","2"'
   *
   * @default false
   */
  raw?: boolean;
  /**
   * Tolerate quotes appearing inside unquoted fields.
   * When enabled, a quote character mid-field is treated as a literal quote
   * instead of triggering quote mode.
   *
   * This is useful for parsing malformed CSV files where fields contain
   * unescaped quote characters.
   *
   * @example
   * // Without relaxQuotes (throws error or corrupts data):
   * // John's "nickname" is Bob
   *
   * // With relaxQuotes: true
   * const result = parseCsv('John\'s "nickname" is Bob', { relaxQuotes: true });
   * // result = [['John\'s "nickname" is Bob']]
   *
   * @default false
   */
  relaxQuotes?: boolean;
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

/**
 * Additional information about a parsed record.
 * Available when parsing with `info: true` option.
 */
export interface RecordInfo {
  /** 0-based record index (data rows only, excluding header) */
  index: number;
  /** 1-based line number in the original file where this record started */
  line: number;
  /** Byte offset from the start of the file where this record started */
  bytes: number;
  /** Array of booleans indicating which fields were quoted */
  quoted: boolean[];
  /** Raw unparsed string of this record (only when `raw: true`) */
  raw?: string;
  /** Number of fields if mismatched with expected column count */
  invalid_field_length?: number;
}

/**
 * A parsed record with additional info metadata.
 * Returned when parsing with `info: true` option.
 */
export interface RecordWithInfo<T = Record<string, unknown>> {
  /** The parsed record data */
  record: T;
  /** Additional information about this record */
  info: RecordInfo;
}

// =============================================================================
// Helper Functions
// =============================================================================

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
):
  | string[][]
  | CsvParseResult<Record<string, string>>
  | CsvParseResult<Record<string, unknown>>
  | CsvParseResult<RecordWithInfo<Record<string, unknown>>>
  | CsvParseResult<RecordWithInfo<string[]>> {
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
    beforeFirstChunk,
    info: infoOption = false,
    raw: rawOption = false,
    relaxQuotes = false
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

  // Use centralized normalization utilities
  const { enabled: quoteEnabled, char: quote } = normalizeQuoteOption(quoteOption);
  const escapeNormalized = normalizeEscapeOption(escapeOption, quote);
  // When quoting is enabled, fall back to quote char if escape was disabled (RFC 4180)
  const escape = quoteEnabled ? escapeNormalized.char || quote : escapeNormalized.char;

  // Auto-detect delimiter if empty string is passed
  const delimiter =
    delimiterOption === ""
      ? detectDelimiter(processedInput, quote || '"', delimitersToGuess, comment, shouldSkipEmpty)
      : delimiterOption;

  // Detect or use provided line terminator for meta info
  // Note: The parser always handles all line ending types, this is mainly for meta info
  const linebreak = newlineOption || detectLinebreak(processedInput);

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

  // Info tracking variables (only tracked when info option is enabled)
  let rowInfos: RecordInfo[] = [];
  let currentRowStartLine = 0; // 1-based line number where current row started
  let currentRowStartBytes = 0; // Byte offset where current row started
  let currentFieldQuoted = false; // Whether current field started with a quote
  let currentRowQuoted: boolean[] = []; // Quote status for each field in current row
  let currentRawRow = ""; // Raw string of current row (only tracked when raw option is enabled)

  // Helper to reset info/raw state when skipping a row (reduces code duplication)
  const resetInfoState =
    infoOption || rawOption
      ? (nextLine: number, nextBytes: number) => {
          if (infoOption) {
            currentRowQuoted = [];
            currentRowStartLine = nextLine;
            currentRowStartBytes = nextBytes;
          }
          if (rawOption) {
            currentRawRow = "";
          }
        }
      : null;

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
  let useHeaders = false;
  let headerRowProcessed = false;

  // Track renamed headers for meta
  let renamedHeadersForMeta: Record<string, string> | null = null;

  // Determine header mode using shared utility for pre-configured headers
  if (headers === true) {
    useHeaders = true;
  } else if (Array.isArray(headers)) {
    // Use shared utility for initial header setup
    const result = processHeaders([], { headers, renameHeaders }, null);
    if (result) {
      headerRow = result.headers;
      renamedHeadersForMeta = result.renamedHeaders;
    }
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
      // Use shared utility for header processing from first row
      const result = processHeaders(row, { headers, renameHeaders }, headerRow);
      if (result) {
        headerRow = result.headers;
        renamedHeadersForMeta = result.renamedHeaders;
        headerRowProcessed = true;
        if (result.skipCurrentRow) {
          return false;
        }
      } else {
        // Headers already set (array case without renaming)
        headerRowProcessed = true;
      }
    }

    // Skip data rows
    if (skippedDataRows < skipRows) {
      skippedDataRows++;
      return false;
    }

    // Column validation when using headers
    // Note: use headerRow.length (not headersLength) because null headers still occupy a column position
    if (headerRow && headerRow.length > 0) {
      const expectedCols = headerRow.length;
      const actualCols = row.length;

      // Use shared validation utility
      const validation = validateAndAdjustColumns(row, expectedCols, {
        strictColumnHandling,
        discardUnmappedColumns
      });

      // Record errors regardless of validation result
      if (validation.errorCode) {
        errors.push({
          code: validation.errorCode,
          message:
            validation.errorCode === "TooManyFields"
              ? `Too many fields: expected ${expectedCols}, found ${actualCols}`
              : `Too few fields: expected ${expectedCols}, found ${actualCols}`,
          row: dataRowCount
        });
      }

      if (!validation.isValid) {
        invalidRows.push({
          row,
          reason: `Column header mismatch expected: ${expectedCols} columns got: ${actualCols}`
        });
        return false;
      }
    }

    return true;
  };

  // ==========================================================================
  // Fast Mode: Skip quote detection, split directly by delimiter
  // ==========================================================================
  if (fastMode) {
    // Split by lines - use specified newline or pre-compiled regex for all line endings
    const lines = newlineOption
      ? processedInput.split(newlineOption)
      : processedInput.split(LINE_SPLIT_REGEX);
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

      // Check maxRowBytes limit (security check - should not be skipped in fastMode)
      if (maxRowBytes !== undefined) {
        const rowBytes = new TextEncoder().encode(line).length;
        if (rowBytes > maxRowBytes) {
          throw new Error(`Row exceeds the maximum size of ${maxRowBytes} bytes`);
        }
      }

      // Split by delimiter (fast path - no quote detection)
      const row = line.split(delimiter).map(trimField);

      // Greedy skipEmptyLines: also skips whitespace-only and delimiter-only rows
      if (isEmptyRow(row, shouldSkipEmpty)) {
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
    | CsvParseResult<Record<string, unknown>>
    | CsvParseResult<RecordWithInfo<Record<string, unknown>>>
    | CsvParseResult<RecordWithInfo<string[]>> {
    // Build meta object
    const meta: CsvParseMeta = {
      delimiter,
      linebreak,
      aborted: false, // parseCsv is synchronous, no abort mechanism
      truncated,
      cursor: dataRowCount,
      renamedHeaders: renamedHeadersForMeta
    };

    // Convert to objects if headers enabled
    if (useHeaders && headerRow) {
      const headers = headerRow.filter((h): h is string => h !== null && h !== undefined);
      meta.fields = headers;

      // Convert rows to objects using shared utility
      let dataRows: Record<string, unknown>[] = rows.map(row => rowToObject(row, headerRow!));

      // Apply dynamicTyping if provided (before transform)
      if (dynamicTyping) {
        dataRows = dataRows.map(row =>
          applyDynamicTypingToRow(row as Record<string, string>, dynamicTyping)
        ) as Record<string, unknown>[];
      }

      // Apply transform if provided
      if (transform) {
        const transformedDataRows: Record<string, unknown>[] = [];
        const transformedInfos: RecordInfo[] = [];
        for (let idx = 0; idx < dataRows.length; idx++) {
          const transformed = transform(dataRows[idx] as Record<string, string>);
          if (transformed !== null && transformed !== undefined) {
            transformedDataRows.push(transformed as Record<string, unknown>);
            if (infoOption) {
              transformedInfos.push(rowInfos[idx]);
            }
          }
        }
        dataRows = transformedDataRows;
        if (infoOption) {
          rowInfos = transformedInfos;
        }
      }

      // Apply validate if provided
      if (validate) {
        const validDataRows: Record<string, unknown>[] = [];
        const validInfos: RecordInfo[] = [];
        for (let idx = 0; idx < dataRows.length; idx++) {
          const { isValid, reason } = processValidateResult(validate!(dataRows[idx] as Row));
          if (isValid) {
            validDataRows.push(dataRows[idx]);
            if (infoOption) {
              validInfos.push(rowInfos[idx]);
            }
          } else {
            invalidRows.push({
              row: Object.values(dataRows[idx]).map(v => (v === null ? "" : String(v))),
              reason
            });
          }
        }
        dataRows = validDataRows;
        if (infoOption) {
          rowInfos = validInfos;
        }
      }

      // Build result object
      const result: any = {
        headers,
        rows: infoOption
          ? dataRows.map((row, idx) => ({ record: row, info: rowInfos[idx] }))
          : dataRows,
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
      const transformedRows: (string[] | unknown[])[] = [];
      const transformedInfos: RecordInfo[] = [];
      for (let idx = 0; idx < resultRows.length; idx++) {
        const transformed = transform(resultRows[idx] as string[]);
        if (transformed !== null && transformed !== undefined && Array.isArray(transformed)) {
          transformedRows.push(transformed);
          if (infoOption) {
            transformedInfos.push(rowInfos[idx]);
          }
        }
      }
      resultRows = transformedRows;
      if (infoOption) {
        rowInfos = transformedInfos;
      }
    }

    if (validate) {
      const validResultRows: (string[] | unknown[])[] = [];
      const validInfos: RecordInfo[] = [];
      for (let idx = 0; idx < resultRows.length; idx++) {
        const { isValid, reason } = processValidateResult(validate!(resultRows[idx] as Row));
        if (isValid) {
          validResultRows.push(resultRows[idx]);
          if (infoOption) {
            validInfos.push(rowInfos[idx]);
          }
        } else {
          invalidRows.push({
            row: (resultRows[idx] as unknown[]).map(v => (v === null ? "" : String(v))),
            reason
          });
        }
      }
      resultRows = validResultRows;
      if (infoOption) {
        rowInfos = validInfos;
      }
    }

    // Build result - for array mode without headers
    if (infoOption || invalidRows.length > 0) {
      const result: any = {
        rows: infoOption
          ? resultRows.map((row, idx) => ({ record: row as string[], info: rowInfos[idx] }))
          : resultRows,
        meta
      };
      if (invalidRows.length > 0) {
        result.invalidRows = invalidRows;
      }
      return result;
    }

    return resultRows as string[][];
  }

  // ==========================================================================
  // Standard Mode: Full RFC 4180 compliant parsing with quote handling
  // ==========================================================================
  const len = processedInput.length;

  // Initialize row tracking for info option
  if (infoOption) {
    currentRowStartLine = 1;
    currentRowStartBytes = 0;
  }

  while (i < len) {
    const char = processedInput[i];

    if (inQuotes && quoteEnabled) {
      // Inside quoted field
      if (escape && char === escape && processedInput[i + 1] === quote) {
        // Escaped quote ("" becomes single ")
        currentField += quote;
        currentRowBytes++;
        if (rawOption) {
          currentRawRow += char + processedInput[i + 1];
        }
        i += 2;
        checkRowBytes?.();
      } else if (char === quote) {
        // Check if this is truly end of quoted field or if relaxQuotes allows continuation
        const nextChar = processedInput[i + 1];
        if (
          relaxQuotes &&
          nextChar !== undefined &&
          nextChar !== delimiter &&
          nextChar !== "\n" &&
          nextChar !== "\r"
        ) {
          // relaxQuotes: quote mid-field, treat as literal
          currentField += char;
          currentRowBytes++;
          if (rawOption) {
            currentRawRow += char;
          }
          i++;
          checkRowBytes?.();
        } else {
          // End of quoted field
          inQuotes = false;
          if (rawOption) {
            currentRawRow += char;
          }
          i++;
        }
      } else if (char === "\r") {
        // Normalize CRLF to LF inside quoted fields
        if (processedInput[i + 1] === "\n") {
          if (rawOption) {
            currentRawRow += char;
          }
          i++; // Skip \r, will add \n on next iteration
        } else {
          currentField += "\n"; // Convert standalone \r to \n
          currentRowBytes++;
          if (rawOption) {
            currentRawRow += char;
          }
          i++;
          checkRowBytes?.();
        }
      } else {
        currentField += char;
        currentRowBytes++;
        if (rawOption) {
          currentRawRow += char;
        }
        i++;
        checkRowBytes?.();
      }
    } else {
      // Outside quoted field
      if (quoteEnabled && char === quote && currentField === "") {
        // Start of quoted field (only at field start)
        inQuotes = true;
        if (infoOption) {
          currentFieldQuoted = true;
        }
        if (rawOption) {
          currentRawRow += char;
        }
        i++;
      } else if (quoteEnabled && char === quote && relaxQuotes) {
        // relaxQuotes: quote mid-field (not at start), treat as literal
        currentField += char;
        currentRowBytes++;
        if (rawOption) {
          currentRawRow += char;
        }
        i++;
        checkRowBytes?.();
      } else if (char === delimiter) {
        // Field separator
        currentRow.push(trimField(currentField));
        if (infoOption) {
          currentRowQuoted.push(currentFieldQuoted);
          currentFieldQuoted = false;
        }
        currentField = "";
        currentRowBytes++; // Count delimiter
        if (rawOption) {
          currentRawRow += char;
        }
        i++;
        checkRowBytes?.();
      } else if (char === "\n" || char === "\r") {
        // End of row - handle \r\n, \r, and \n
        const isWindowsLineEnding = char === "\r" && processedInput[i + 1] === "\n";
        if (isWindowsLineEnding) {
          i++; // Skip the \n in \r\n
        }
        currentRow.push(trimField(currentField));
        if (infoOption) {
          currentRowQuoted.push(currentFieldQuoted);
          currentFieldQuoted = false;
        }
        currentField = "";

        lineNumber++;

        // Skip lines at beginning
        if (lineNumber <= skipLines) {
          currentRow = [];
          resetInfoState?.(lineNumber + 1, i + 1);
          i++;
          continue;
        }

        // Skip comment lines
        if (comment && currentRow[0]?.startsWith(comment)) {
          currentRow = [];
          resetInfoState?.(lineNumber + 1, i + 1);
          i++;
          continue;
        }

        // Skip empty lines (greedy: also skips whitespace-only lines)
        if (isEmptyRow(currentRow, shouldSkipEmpty)) {
          currentRow = [];
          resetInfoState?.(lineNumber + 1, i + 1);
          i++;
          continue;
        }

        // Process row (handles headers, validation)
        if (processRow(currentRow)) {
          rows.push(currentRow);
          // Build RecordInfo if info option is enabled
          if (infoOption) {
            const info: RecordInfo = {
              index: dataRowCount,
              line: currentRowStartLine,
              bytes: currentRowStartBytes,
              quoted: [...currentRowQuoted]
            };
            if (rawOption) {
              info.raw = currentRawRow;
            }
            rowInfos.push(info);
          }
          dataRowCount++;
        }

        currentRow = [];
        currentRowBytes = 0; // Reset row bytes counter
        resetInfoState?.(lineNumber + 1, i + 1);
        i++;

        // Check max rows - after resetting currentRow
        if (maxRows !== undefined && dataRowCount >= maxRows) {
          truncated = true;
          break;
        }
      } else {
        currentField += char;
        currentRowBytes++;
        if (rawOption) {
          currentRawRow += char;
        }
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
    if (infoOption) {
      currentRowQuoted.push(currentFieldQuoted);
    }

    // Use early-return style for cleaner logic
    const shouldProcessLastRow =
      lineNumber >= skipLines &&
      !(comment && currentRow[0]?.startsWith(comment)) &&
      !isEmptyRow(currentRow, shouldSkipEmpty) &&
      !(maxRows !== undefined && dataRowCount >= maxRows);

    if (shouldProcessLastRow && processRow(currentRow)) {
      rows.push(currentRow);
      // Build RecordInfo if info option is enabled
      if (infoOption) {
        const info: RecordInfo = {
          index: dataRowCount,
          line: currentRowStartLine,
          bytes: currentRowStartBytes,
          quoted: [...currentRowQuoted]
        };
        if (rawOption) {
          info.raw = currentRawRow;
        }
        rowInfos.push(info);
      }
      dataRowCount++;
    }
  }

  return buildResult();
}

// =============================================================================
// Format Functions
// =============================================================================

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

  // Pre-compile regex patterns for performance (using shared utility)
  const formatRegex = createFormatRegex({
    quote: quoteOption,
    delimiter,
    escape: escapeOption
  });

  // Pre-compute quote lookups once (avoid recreating per row)
  const quoteColumnsLookup = createQuoteLookup(quoteColumns as QuoteColumnConfig);
  const quoteHeadersLookup = createQuoteLookup(quoteHeaders as QuoteColumnConfig);

  const lines: string[] = [];
  let recordsProcessed = 0;

  // Determine headers
  let keys: string[] | null = null;

  // Helper to apply row-level transform if provided
  const applyRowTransform = (row: any, sourceIndex: number): any | null => {
    if (transform?.row) {
      return transform.row(row, sourceIndex);
    }
    return row;
  };

  // Determine keys and displayHeaders upfront
  // Priority: columns > headers array > auto-detect (when headers: true)
  let displayHeaders: string[] | null = null;

  if (data.length > 0) {
    if (columnKeys) {
      keys = columnKeys;
      displayHeaders = columnHeaders;
    } else if (headers === true) {
      keys = detectRowKeys(data[0]);
      displayHeaders = keys.length > 0 ? keys : null;
    } else if (Array.isArray(headers)) {
      keys = headers;
      displayHeaders = headers;
    }
  }

  // Write header row if needed
  if (displayHeaders && shouldWriteHeaders) {
    lines.push(
      formatRowWithLookup(displayHeaders, formatRegex, {
        quoteLookup: quoteHeadersLookup,
        delimiter,
        headers: displayHeaders,
        isHeader: true,
        outputRowIndex: recordsProcessed,
        alwaysQuote,
        escapeFormulae,
        decimalSeparator: decimalSeparator as DecimalSeparator,
        transform
      })
    );
  }

  // Process data rows
  for (let i = 0; i < data.length; i++) {
    const transformedRow = applyRowTransform(data[i], i);
    if (transformedRow === null || transformedRow === undefined) {
      continue;
    }
    const values = extractRowValues(transformedRow, keys);
    lines.push(
      formatRowWithLookup(values, formatRegex, {
        quoteLookup: quoteColumnsLookup,
        delimiter,
        headers: displayHeaders ?? undefined,
        isHeader: false,
        outputRowIndex: recordsProcessed,
        alwaysQuote,
        escapeFormulae,
        decimalSeparator: decimalSeparator as DecimalSeparator,
        transform
      })
    );
    recordsProcessed++;
  }

  // Handle empty data with alwaysWriteHeaders
  if (data.length === 0 && alwaysWriteHeaders && shouldWriteHeaders) {
    const emptyHeaders = columnHeaders ?? (Array.isArray(headers) ? headers : null);
    if (emptyHeaders) {
      lines.push(
        formatRowWithLookup(emptyHeaders, formatRegex, {
          quoteLookup: quoteHeadersLookup,
          delimiter,
          headers: emptyHeaders,
          isHeader: true,
          outputRowIndex: recordsProcessed,
          alwaysQuote,
          escapeFormulae,
          decimalSeparator: decimalSeparator as DecimalSeparator,
          transform
        })
      );
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
    discardUnmappedColumns = false,
    dynamicTyping = false
  } = options;

  const shouldSkipEmpty = skipEmptyLines || ignoreEmpty;
  const skipEmptyGreedy = skipEmptyLines === "greedy";

  // Use centralized normalization utilities
  const { enabled: quoteEnabled, char: quote } = normalizeQuoteOption(quoteOption);
  const escapeNormalized = normalizeEscapeOption(escapeOption, quote);
  // When quoting is enabled, fall back to quote char if escape was disabled (RFC 4180)
  const escape = quoteEnabled ? escapeNormalized.char || quote : escapeNormalized.char;

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
  let trailingCR = false; // Track if last chunk ended with \r for CRLF across chunks
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
      const obj: Record<string, unknown> = {};
      headerRow.forEach((header, index) => {
        if (header !== null && header !== undefined) {
          const value = row[index] ?? "";
          if (dynamicTyping === true) {
            obj[header] = applyDynamicTyping(value, true);
          } else if (dynamicTyping && typeof dynamicTyping === "object") {
            const columnConfig = dynamicTyping[header];
            obj[header] =
              columnConfig !== undefined ? applyDynamicTyping(value, columnConfig) : value;
          } else {
            obj[header] = value;
          }
        }
      });
      return { valid: true, row: obj as Record<string, string> };
    }

    // Apply dynamicTyping to array rows if enabled
    if (dynamicTyping) {
      // For array rows without headers, pass null - per-column config won't work
      const typedRow = applyDynamicTypingToArrayRow(
        row,
        headerRow as string[] | null,
        dynamicTyping
      );
      return { valid: true, row: typedRow as string[] };
    }

    return { valid: true, row };
  };

  const processBuffer = function* (): Generator<string[] | Record<string, string>> {
    let i = 0;
    const len = buffer.length;

    // Handle CRLF split across chunks: skip \n if previous chunk ended with \r
    if (trailingCR && len > 0 && buffer[0] === "\n") {
      i = 1;
      trailingCR = false;
    } else {
      trailingCR = false;
    }

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
          if (char === "\r") {
            if (buffer[i + 1] === "\n") {
              i++; // Skip \r, will skip \n on next increment
            } else if (i === len - 1) {
              // \r at end of buffer - track for CRLF across chunks
              trailingCR = true;
            }
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
          // For greedy mode, also skip whitespace-only rows
          const shouldSkipRow =
            shouldSkipEmpty && (isEmpty || (skipEmptyGreedy && isEmptyRow(currentRow, true)));
          if (shouldSkipRow) {
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
