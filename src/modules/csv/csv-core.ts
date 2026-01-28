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

// =============================================================================
// Types
// =============================================================================

/** Header array type (can include undefined to skip columns) */
export type HeaderArray = (string | undefined | null)[];

/** Header transform function */
export type HeaderTransformFunction = (headers: string[]) => HeaderArray;

/** Row types */
export type RowArray = string[];
export type RowMap = Record<string, string>;
/** Row as array of [header, value] tuples */
export type RowHashArray<V = any> = [string, V][];
export type Row = RowArray | RowMap | RowHashArray;

/** Row transform callback */
export type RowTransformCallback<T> = (error?: Error | null, row?: T | null) => void;

/** Row transform function - sync or async */
export type RowTransformFunction<I = Row, O = Row> =
  | ((row: I) => O | null)
  | ((row: I, callback: RowTransformCallback<O>) => void);

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
 * CSV parsing options
 */
export interface CsvParseOptions {
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
  /** Quote character (default: '"'), set to false or null to disable quoting */
  quote?: string | false | null;
  /** Escape character for quotes (default: '"'), set to false or null to disable */
  escape?: string | false | null;
  /** Skip empty lines (default: false). Uses greedy mode: also skips lines with only whitespace. */
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
   * Enable object mode (default: true for Node.js streams)
   * - true: push row objects/arrays
   * - false: push JSON strings
   */
  objectMode?: boolean;
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

/**
 * CSV formatting options
 */
export interface CsvFormatOptions {
  /** Field delimiter (default: ",") */
  delimiter?: string;
  /** Quote character (default: '"'), set to false or null to disable quoting */
  quote?: string | false | null;
  /** Escape character (default: same as quote) */
  escape?: string | false | null;
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
   * - string[]: use these as headers
   */
  headers?: string[] | boolean | null;
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
   * Fields starting with =, +, -, @, or tab are prefixed with a tab character.
   * (default: false)
   * @see https://owasp.org/www-community/attacks/CSV_Injection
   */
  escapeFormulae?: boolean;
  /** Write headers even when there's no data (default: false) */
  alwaysWriteHeaders?: boolean;
  /**
   * Transform function to apply to each row before formatting
   * Can be sync (returns row) or async (calls callback)
   */
  transform?: RowTransformFunction<Row, Row>;
  /**
   * Enable object mode (default: true for Node.js streams)
   * - true: accept row objects/arrays directly
   * - false: accept JSON strings
   */
  objectMode?: boolean;
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

// =============================================================================
// Delimiter and Linebreak Detection
// =============================================================================

/**
 * Common CSV delimiters to try during auto-detection
 * Order matters - comma is most common, then semicolon (European), tab, pipe
 */
const AUTO_DETECT_DELIMITERS = [",", ";", "\t", "|"] as const;

/**
 * Default delimiter when auto-detection fails
 */
const DEFAULT_DELIMITER = ",";

/**
 * Strip UTF-8 BOM (Byte Order Mark) from start of string if present.
 * Excel exports UTF-8 CSV files with BOM (\ufeff).
 *
 * @param input - String to process
 * @returns String without BOM
 */
export function stripBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

/**
 * Detect the line terminator used in a string.
 * Uses fast detection without quote handling since the result is only
 * informational for meta - the parser handles all line ending types.
 *
 * @param input - String to analyze
 * @returns Detected line terminator or '\n' as default
 *
 * @example
 * detectLinebreak('a,b\r\nc,d') // '\r\n'
 * detectLinebreak('a,b\nc,d') // '\n'
 * detectLinebreak('a,b\rc,d') // '\r'
 * detectLinebreak('a,b,c') // '\n' (default)
 */
export function detectLinebreak(input: string): string {
  // Fast path: find first newline character
  const crIndex = input.indexOf("\r");
  const lfIndex = input.indexOf("\n");

  // No newline found
  if (crIndex === -1 && lfIndex === -1) {
    return "\n";
  }

  // Only LF found
  if (crIndex === -1) {
    return "\n";
  }

  // Only CR found, or CR comes before LF (could be CRLF or standalone CR)
  if (lfIndex === -1 || crIndex < lfIndex) {
    // Check if CRLF
    return input[crIndex + 1] === "\n" ? "\r\n" : "\r";
  }

  // LF comes before CR
  return "\n";
}

/**
 * Auto-detect the delimiter used in a CSV string
 *
 * Algorithm:
 * 1. Sample the first few lines (up to 10) for analysis
 * 2. For each candidate delimiter:
 *    - Count occurrences per line (respecting quotes)
 *    - Check consistency: all lines should have the same count
 *    - Higher count = more fields = better delimiter candidate
 * 3. Choose the delimiter with highest consistent field count
 *
 * @param input - CSV string to analyze
 * @param quote - Quote character (default: '"')
 * @param delimitersToGuess - Custom list of delimiters to try (default: [",", ";", "\t", "|"])
 * @returns Detected delimiter or first delimiter in list
 *
 * @example
 * detectDelimiter('a,b,c\n1,2,3') // ','
 * detectDelimiter('a;b;c\n1;2;3') // ';'
 * detectDelimiter('a\tb\tc\n1\t2\t3') // '\t'
 * detectDelimiter('a:b:c\n1:2:3', '"', [':']) // ':'
 */
export function detectDelimiter(
  input: string,
  quote: string = '"',
  delimitersToGuess?: string[]
): string {
  const delimiters = delimitersToGuess ?? AUTO_DETECT_DELIMITERS;
  const defaultDelimiter = delimiters[0] ?? DEFAULT_DELIMITER;

  // Get sample lines (first 10 non-empty lines)
  const lines = getSampleLines(input, 10);

  if (lines.length === 0) {
    return defaultDelimiter;
  }

  let bestDelimiter = defaultDelimiter;
  let bestScore = 0;

  for (const delimiter of delimiters) {
    const score = scoreDelimiter(lines, delimiter, quote);
    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delimiter;
    }
  }

  return bestDelimiter;
}

/**
 * Get sample lines from input, skipping empty lines
 */
function getSampleLines(input: string, maxLines: number): string[] {
  const lines: string[] = [];
  let start = 0;
  let inQuotes = false;
  const len = input.length;

  for (let i = 0; i < len && lines.length < maxLines; i++) {
    const char = input[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && (char === "\n" || char === "\r")) {
      const line = input.slice(start, i);
      if (line.trim()) {
        lines.push(line);
      }
      // Skip \r\n
      if (char === "\r" && input[i + 1] === "\n") {
        i++;
      }
      start = i + 1;
    }
  }

  // Add last line if exists
  if (start < len && lines.length < maxLines) {
    const line = input.slice(start);
    if (line.trim()) {
      lines.push(line);
    }
  }

  return lines;
}

/**
 * Score a delimiter candidate based on consistency and field count
 *
 * Returns 0 if:
 * - Delimiter not found in any line
 * - Field counts are inconsistent across lines
 *
 * Higher score = more fields per row with consistent counts
 */
function scoreDelimiter(lines: string[], delimiter: string, quote: string): number {
  if (lines.length === 0) {
    return 0;
  }

  const counts: number[] = [];

  for (const line of lines) {
    const count = countDelimiters(line, delimiter, quote);
    counts.push(count);
  }

  // Check if delimiter exists
  const firstCount = counts[0];
  if (firstCount === 0) {
    return 0;
  }

  // Check consistency - all lines should have same number of delimiters
  // Allow some tolerance for the last line (might be incomplete)
  const mainCounts = counts.slice(0, -1);
  const isConsistent = mainCounts.length === 0 || mainCounts.every(count => count === firstCount);

  if (!isConsistent) {
    return 0;
  }

  // Score = number of fields (delimiters + 1) * number of consistent lines
  return (firstCount + 1) * lines.length;
}

/**
 * Count delimiters in a line, respecting quoted fields
 */
function countDelimiters(line: string, delimiter: string, quote: string): number {
  let count = 0;
  let inQuotes = false;
  const len = line.length;
  const delimLen = delimiter.length;

  for (let i = 0; i < len; i++) {
    if (quote && line[i] === quote) {
      // Toggle quote state, but handle escaped quotes ("" inside quoted field)
      if (inQuotes && line[i + 1] === quote) {
        i++; // Skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes) {
      // Check for delimiter match (supports multi-char delimiters)
      if (delimLen === 1) {
        if (line[i] === delimiter) {
          count++;
        }
      } else if (line.slice(i, i + delimLen) === delimiter) {
        count++;
        i += delimLen - 1;
      }
    }
  }

  return count;
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
 * Check if a row is a RowHashArray (array of [key, value] tuples)
 */
export function isRowHashArray(row: unknown): row is RowHashArray {
  if (!Array.isArray(row) || row.length === 0) {
    return false;
  }
  // Check if first element is a 2-element array with string key
  const first = row[0];
  return Array.isArray(first) && first.length === 2 && typeof first[0] === "string";
}

/**
 * Convert RowHashArray to RowMap
 * Note: Manual loop is ~4x faster than Object.fromEntries
 */
export function rowHashArrayToMap<V = any>(row: RowHashArray<V>): Record<string, V> {
  const obj: Record<string, V> = {};
  for (const [key, value] of row) {
    obj[key] = value;
  }
  return obj;
}

/**
 * Convert RowHashArray to values array (preserving order)
 */
export function rowHashArrayToValues<V = any>(row: RowHashArray<V>): V[] {
  return row.map(([, value]) => value);
}

/**
 * Get headers from RowHashArray
 */
export function rowHashArrayToHeaders(row: RowHashArray): string[] {
  return row.map(([key]) => key);
}

/**
 * Get value by key from RowHashArray (returns undefined if not found)
 * More efficient than creating a full map when you need only specific values
 */
export function rowHashArrayGet<V = any>(row: RowHashArray<V>, key: string): V | undefined {
  for (const [k, v] of row) {
    if (k === key) {
      return v;
    }
  }
  return undefined;
}

/**
 * Map RowHashArray values according to header order
 * Optimized: builds values array in single pass without intermediate object
 */
export function rowHashArrayMapByHeaders<V = any>(
  row: RowHashArray<V>,
  headers: string[]
): (V | undefined)[] {
  // For small headers array, linear search per header is faster than building a map
  // For larger headers (>10), build a map once
  if (headers.length <= 10) {
    return headers.map(h => rowHashArrayGet(row, h));
  }
  const map = rowHashArrayToMap(row);
  return headers.map(h => map[h]);
}

/**
 * Deduplicate headers by appending suffix to duplicates.
 * Example: ["A", "B", "A", "A"] → ["A", "B", "A_1", "A_2"]
 *
 * @param headers - Original header array
 * @returns New array with unique header names
 */
export function deduplicateHeaders(headers: HeaderArray): HeaderArray {
  const counts = new Map<string, number>();
  const result: HeaderArray = [];

  for (const header of headers) {
    if (header === null || header === undefined) {
      result.push(header);
      continue;
    }

    const count = counts.get(header) ?? 0;
    if (count === 0) {
      // First occurrence, use as-is
      result.push(header);
    } else {
      // Duplicate, append suffix
      result.push(`${header}_${count}`);
    }
    counts.set(header, count + 1);
  }

  return result;
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

  // Auto-detect delimiter if empty string is passed
  const delimiter =
    delimiterOption === ""
      ? detectDelimiter(
          processedInput,
          quoteOption !== false && quoteOption !== null ? String(quoteOption) : '"',
          delimitersToGuess
        )
      : delimiterOption;

  // Detect or use provided line terminator for meta info
  // Note: The parser always handles all line ending types, this is mainly for meta info
  const linebreak = newlineOption || detectLinebreak(processedInput);

  const shouldSkipEmpty = skipEmptyLines || ignoreEmpty;

  // Handle quote: null/false to disable quoting
  const quoteEnabled = quoteOption !== null && quoteOption !== false;
  const quote = quoteEnabled ? String(quoteOption) : "";
  const escape = escapeOption !== null && escapeOption !== false ? String(escapeOption) : "";

  const rows: string[][] = [];
  const invalidRows: { row: string[]; reason: string }[] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;
  let lineNumber = 0;
  let dataRowCount = 0;
  let skippedDataRows = 0;
  let truncated = false; // Track if parsing was stopped due to maxRows

  // Header handling
  let headerRow: HeaderArray | null = null;
  let headersLength = 0;
  let useHeaders = false;
  let headerRowProcessed = false;

  // Determine header mode
  if (headers === true) {
    useHeaders = true;
  } else if (Array.isArray(headers)) {
    headerRow = deduplicateHeaders(headers);
    headersLength = headerRow.filter(h => h !== null && h !== undefined).length;
    useHeaders = true;
    if (!renameHeaders) {
      headerRowProcessed = true; // We already have headers, don't wait for first row
    }
  } else if (typeof headers === "function") {
    useHeaders = true;
  }

  // Pre-compute trim function to avoid repeated condition checks
  const trimField =
    trim || (ltrim && rtrim)
      ? (s: string) => s.trim()
      : ltrim
        ? (s: string) => s.trimStart()
        : rtrim
          ? (s: string) => s.trimEnd()
          : (s: string) => s;

  const processRow = (row: string[]): boolean => {
    // Handle first row as headers when needed
    if (useHeaders && !headerRowProcessed) {
      if (typeof headers === "function") {
        headerRow = deduplicateHeaders(headers(row));
      } else if (!Array.isArray(headers)) {
        headerRow = deduplicateHeaders(row);
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

      // Skip empty lines (greedy: also skips whitespace-only lines)
      if (shouldSkipEmpty && line.trim() === "") {
        continue;
      }

      // Split by delimiter (fast path - no quote detection)
      const row = line.split(delimiter).map(trimField);

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
      cursor: dataRowCount
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
        // Escaped quote
        currentField += quote;
        i += 2;
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
          i++;
        }
      } else {
        currentField += char;
        i++;
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
        i++;
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
        const isEmpty = currentRow.length === 1 && currentRow[0].trim() === "";
        if (shouldSkipEmpty && isEmpty) {
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
        i++;

        // Check max rows - after resetting currentRow
        if (maxRows !== undefined && dataRowCount >= maxRows) {
          truncated = true;
          break;
        }
      } else {
        currentField += char;
        i++;
      }
    }
  }

  // Handle last field/row
  if (currentField !== "" || currentRow.length > 0) {
    currentRow.push(trimField(currentField));

    // Use early-return style for cleaner logic
    const shouldProcessLastRow =
      lineNumber >= skipLines &&
      !(comment && currentRow[0]?.startsWith(comment)) &&
      !(shouldSkipEmpty && currentRow.length === 1 && currentRow[0].trim() === "") &&
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
    if (value === null || value === undefined) {
      return "";
    }

    let str =
      typeof value === "number"
        ? formatNumberForCsv(value, decimalSeparator as DecimalSeparator)
        : String(value);

    // Escape formulae to prevent CSV injection (OWASP recommendation)
    // Prefix dangerous characters with tab to neutralize them in spreadsheet apps
    if (escapeFormulae && str.length > 0) {
      const firstChar = str[0];
      if (
        firstChar === "=" ||
        firstChar === "+" ||
        firstChar === "-" ||
        firstChar === "@" ||
        firstChar === "\t"
      ) {
        str = "\t" + str;
      }
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

  // Helper to apply transform if provided (sync only)
  const applyTransform = (row: any): any | null => {
    if (transform) {
      // Check if it's a sync transform (1 argument)
      if (transform.length === 1) {
        return (transform as (row: any) => any)(row);
      }
      // For async transform in sync context, just return the row unchanged
      // Async transforms should use streaming API
      return row;
    }
    return row;
  };

  // Handle array of objects (non-array first element)
  if (data.length > 0 && !Array.isArray(data[0])) {
    const objects = data as Record<string, any>[];
    keys = headers === true ? Object.keys(objects[0]) : Array.isArray(headers) ? headers : null;

    if (keys && shouldWriteHeaders) {
      // Add header row
      lines.push(formatRow(keys, keys, true));
    }

    // Add data rows
    for (const obj of objects) {
      const transformedObj = applyTransform(obj);
      if (transformedObj === null || transformedObj === undefined) {
        continue; // Skip row if transform returns null
      }
      const row = keys ? keys.map(key => transformedObj[key]) : Object.values(transformedObj);
      lines.push(formatRow(row, keys ?? undefined));
    }
  } else if (data.length > 0 && isRowHashArray(data[0])) {
    // Handle array of RowHashArray (array of [key, value] tuples)
    const hashArrays = data as RowHashArray[];

    // Determine headers: auto-detect from first row, use custom headers, or null
    keys =
      headers === true
        ? rowHashArrayToHeaders(hashArrays[0])
        : Array.isArray(headers)
          ? headers
          : null;

    if (keys && shouldWriteHeaders) {
      lines.push(formatRow(keys, keys, true));
    }

    // Add data rows
    for (const hashArray of hashArrays) {
      const transformedRow = applyTransform(hashArray);
      if (transformedRow === null || transformedRow === undefined) {
        continue;
      }

      // Convert to values array based on row type after transform
      let values: any[];
      if (isRowHashArray(transformedRow)) {
        values = keys
          ? rowHashArrayMapByHeaders(transformedRow, keys)
          : rowHashArrayToValues(transformedRow);
      } else if (Array.isArray(transformedRow)) {
        values = transformedRow;
      } else {
        values = keys ? keys.map(key => transformedRow[key]) : Object.values(transformedRow);
      }

      lines.push(formatRow(values, keys ?? undefined));
    }
  } else if (data.length > 0) {
    // Handle 2D array with data (plain arrays)
    const arrays = data as any[][];

    // Add custom headers if provided
    if (Array.isArray(headers)) {
      keys = headers;
      if (shouldWriteHeaders) {
        lines.push(formatRow(headers, headers, true));
      }
    }

    for (const row of arrays) {
      const transformedRow = applyTransform(row);
      if (transformedRow === null || transformedRow === undefined) {
        continue; // Skip row if transform returns null
      }
      lines.push(formatRow(transformedRow, keys ?? undefined));
    }
  } else if (alwaysWriteHeaders && Array.isArray(headers) && shouldWriteHeaders) {
    // Handle empty data with alwaysWriteHeaders
    lines.push(formatRow(headers, headers, true));
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
      delimiter = detectDelimiter(input, quote || '"');
    }
  } else if (delimiterOption === "") {
    // For async iterable, get first chunk for detection
    asyncIterator = input[Symbol.asyncIterator]();
    const firstResult = await asyncIterator.next();
    if (!firstResult.done) {
      firstChunk = firstResult.value;
      delimiter = detectDelimiter(firstChunk, quote || '"');
    } else {
      // Empty input
      return;
    }
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
  const trimField =
    trim || (ltrim && rtrim)
      ? (s: string) => s.trim()
      : ltrim
        ? (s: string) => s.trimStart()
        : rtrim
          ? (s: string) => s.trimEnd()
          : (s: string) => s;

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
          currentField += quote;
          i += 2;
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
            i++;
          }
        } else {
          currentField += char;
          i++;
        }
      } else {
        if (quoteEnabled && char === quote && currentField === "") {
          inQuotes = true;
          i++;
        } else if (char === delimiter) {
          currentRow.push(trimField(currentField));
          currentField = "";
          i++;
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
          i++;
        } else {
          currentField += char;
          i++;
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
