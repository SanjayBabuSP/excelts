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
 * CSV parsing options
 */
export interface CsvParseOptions {
  /**
   * Field delimiter (default: ",")
   * - Set to empty string "" to enable auto-detection
   * - Auto-detection will try: comma, semicolon, tab, pipe
   */
  delimiter?: string;
  /** Quote character (default: '"'), set to false or null to disable quoting */
  quote?: string | false | null;
  /** Escape character for quotes (default: '"'), set to false or null to disable */
  escape?: string | false | null;
  /** Skip empty lines (default: false) */
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
 * Parsed CSV result with headers
 */
export interface CsvParseResult<T = string[]> {
  /** Header row (if headers option was true) */
  headers?: string[];
  /** Data rows */
  rows: T[];
  /** Invalid rows (when strictColumnHandling is true) */
  invalidRows?: { row: string[]; reason: string }[];
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
// Delimiter Auto-Detection
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
 * @returns Detected delimiter or default ','
 *
 * @example
 * detectDelimiter('a,b,c\n1,2,3') // ','
 * detectDelimiter('a;b;c\n1;2;3') // ';'
 * detectDelimiter('a\tb\tc\n1\t2\t3') // '\t'
 */
export function detectDelimiter(input: string, quote: string = '"'): string {
  // Get sample lines (first 10 non-empty lines)
  const lines = getSampleLines(input, 10);

  if (lines.length === 0) {
    return DEFAULT_DELIMITER;
  }

  let bestDelimiter = DEFAULT_DELIMITER;
  let bestScore = 0;

  for (const delimiter of AUTO_DETECT_DELIMITERS) {
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
 * Check if headers are unique
 */
function validateUniqueHeaders(headers: HeaderArray): void {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const header of headers) {
    if (header !== null && header !== undefined) {
      if (seen.has(header)) {
        duplicates.push(header);
      }
      seen.add(header);
    }
  }

  if (duplicates.length > 0) {
    throw new Error(`Duplicate headers found ${JSON.stringify(duplicates)}`);
  }
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
): string[][] | CsvParseResult<Record<string, string>> {
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
    discardUnmappedColumns = false,
    transform,
    validate
  } = options;

  // Auto-detect delimiter if empty string is passed
  const delimiter =
    delimiterOption === ""
      ? detectDelimiter(
          input,
          quoteOption !== false && quoteOption !== null ? String(quoteOption) : '"'
        )
      : delimiterOption;

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

  // Header handling
  let headerRow: HeaderArray | null = null;
  let headersLength = 0;
  let useHeaders = false;
  let headerRowProcessed = false;

  // Determine header mode
  if (headers === true) {
    useHeaders = true;
  } else if (Array.isArray(headers)) {
    headerRow = headers;
    headersLength = headers.filter(h => h !== null && h !== undefined).length;
    validateUniqueHeaders(headers);
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
    // If we have headers defined and this is the first data row (for headers: true)
    // or we need to validate headers from a function
    if (useHeaders && !headerRowProcessed) {
      // First row is headers
      if (typeof headers === "function") {
        const transformed = headers(row);
        validateUniqueHeaders(transformed);
        headerRow = transformed;
      } else if (!Array.isArray(headers)) {
        validateUniqueHeaders(row);
        headerRow = row;
      }
      headersLength = headerRow!.filter(h => h !== null && h !== undefined).length;
      headerRowProcessed = true;

      // If renameHeaders and custom headers provided, discard this row
      if (renameHeaders) {
        return false;
      }

      // For headers: true, don't add header row to data
      if (headers === true || typeof headers === "function") {
        return false;
      }

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

  const len = input.length;
  while (i < len) {
    const char = input[i];

    if (inQuotes && quoteEnabled) {
      // Inside quoted field
      if (escape && char === escape && input[i + 1] === quote) {
        // Escaped quote
        currentField += quote;
        i += 2;
      } else if (char === quote) {
        // End of quoted field
        inQuotes = false;
        i++;
      } else if (char === "\r") {
        // Normalize CRLF to LF inside quoted fields
        if (input[i + 1] === "\n") {
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
        if (char === "\r" && input[i + 1] === "\n") {
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

        // Skip empty lines
        const isEmpty = currentRow.length === 1 && currentRow[0] === "";
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

    // Skip lines at beginning
    if (lineNumber >= skipLines) {
      // Skip comment lines
      if (!(comment && currentRow[0]?.startsWith(comment))) {
        // Skip empty lines
        const isEmpty = currentRow.length === 1 && currentRow[0] === "";
        if (!(shouldSkipEmpty && isEmpty)) {
          if (!(maxRows !== undefined && dataRowCount >= maxRows)) {
            if (processRow(currentRow)) {
              rows.push(currentRow);
            }
          }
        }
      }
    }
  }

  // Convert to objects if headers enabled
  if (useHeaders && headerRow) {
    let dataRows = rows.map(row => {
      const obj: Record<string, string> = {};
      headerRow!.forEach((header, index) => {
        if (header !== null && header !== undefined) {
          obj[header] = row[index] ?? "";
        }
      });
      return obj;
    });

    // Apply transform if provided
    if (transform) {
      dataRows = dataRows
        .map(row => transform(row))
        .filter((row): row is Record<string, string> => row !== null && row !== undefined);
    }

    // Apply validate if provided
    if (validate) {
      const validatedRows: Record<string, string>[] = [];
      for (const row of dataRows) {
        const result = validate(row);
        if (typeof result === "boolean") {
          if (result) {
            validatedRows.push(row);
          } else {
            invalidRows.push({ row: Object.values(row), reason: "Validation failed" });
          }
        } else {
          if (result.isValid) {
            validatedRows.push(row);
          } else {
            invalidRows.push({
              row: Object.values(row),
              reason: result.reason || "Validation failed"
            });
          }
        }
      }
      dataRows = validatedRows;
    }

    if ((strictColumnHandling || validate) && invalidRows.length > 0) {
      return {
        headers: headerRow.filter((h): h is string => h !== null && h !== undefined),
        rows: dataRows,
        invalidRows
      };
    }

    return {
      headers: headerRow.filter((h): h is string => h !== null && h !== undefined),
      rows: dataRows
    };
  }

  // For array mode (no headers), apply transform and validate
  let resultRows: string[][] = rows;

  if (transform) {
    resultRows = resultRows
      .map(row => transform(row))
      .filter((row): row is string[] => row !== null && row !== undefined);
  }

  if (validate) {
    const validatedRows: string[][] = [];
    const arrayInvalidRows: { row: string[]; reason: string }[] = [];
    for (const row of resultRows) {
      const result = validate(row);
      if (typeof result === "boolean") {
        if (result) {
          validatedRows.push(row);
        } else {
          arrayInvalidRows.push({ row, reason: "Validation failed" });
        }
      } else {
        if (result.isValid) {
          validatedRows.push(row);
        } else {
          arrayInvalidRows.push({ row, reason: result.reason || "Validation failed" });
        }
      }
    }
    resultRows = validatedRows;

    if (arrayInvalidRows.length > 0) {
      return {
        rows: resultRows,
        invalidRows: arrayInvalidRows
      } as any; // Return with invalidRows for array mode too
    }
  }

  return resultRows;
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
    decimalSeparator = "."
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

    const str =
      typeof value === "number"
        ? formatNumberForCsv(value, decimalSeparator as DecimalSeparator)
        : String(value);

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
    headerRow = headers;
    headersLength = headers.filter(h => h !== null && h !== undefined).length;
    validateUniqueHeaders(headers);
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
        validateUniqueHeaders(transformed);
        headerRow = transformed;
      } else if (!Array.isArray(headers)) {
        validateUniqueHeaders(row);
        headerRow = row;
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
