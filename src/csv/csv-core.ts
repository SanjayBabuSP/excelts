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

import { formatNumberForCsv, type DecimalSeparator } from "./csv-number";

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
export type Row = RowArray | RowMap;

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
  /** Field delimiter (default: ",") */
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
  /**
   * Decimal separator used when parsing numbers from CSV (default: ".").
   *
   * Note: core CSV parsing returns strings; this option is intended for higher-level
   * consumers (e.g. the default value mapper in csv.base) that convert strings to numbers.
   */
  decimalSeparator?: "." | ",";
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
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

/**
 * Apply trim options to a field
 */
function applyTrim(field: string, trim: boolean, ltrim: boolean, rtrim: boolean): string {
  if (trim) {
    return field.trim();
  }
  let result = field;
  if (ltrim) {
    result = result.trimStart();
  }
  if (rtrim) {
    result = result.trimEnd();
  }
  return result;
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
    delimiter = ",",
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

  // Normalize line endings
  input = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

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

  while (i < input.length) {
    const char = input[i];
    const nextChar = input[i + 1];

    if (inQuotes && quoteEnabled) {
      // Inside quoted field
      if (escape && char === escape && nextChar === quote) {
        // Escaped quote
        currentField += quote;
        i += 2;
      } else if (char === quote) {
        // End of quoted field
        inQuotes = false;
        i++;
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
        currentRow.push(applyTrim(currentField, trim, ltrim, rtrim));
        currentField = "";
        i++;
      } else if (char === "\n") {
        // End of row
        currentRow.push(applyTrim(currentField, trim, ltrim, rtrim));
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
    currentRow.push(applyTrim(currentField, trim, ltrim, rtrim));

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

    // Check if quoting is needed (contains delimiter, quote, or newline)
    const quoteRegex = new RegExp(`[${escapeRegex(delimiter)}${escapeRegex(quote)}\r\n]`);
    const needsQuote = forceQuote || quoteRegex.test(str);

    if (needsQuote) {
      // Escape quotes
      const escaped = str.replace(new RegExp(escapeRegex(quote), "g"), escape + quote);
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

  // Handle array of objects
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
  } else if (data.length > 0) {
    // Handle 2D array with data
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
 */
export async function* parseCsvStream(
  input: string | AsyncIterable<string>,
  options: CsvParseOptions = {}
): AsyncGenerator<string[] | Record<string, string>, void, unknown> {
  const {
    delimiter = ",",
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

    while (i < buffer.length) {
      const char = buffer[i];
      const nextChar = buffer[i + 1];

      if (inQuotes && quoteEnabled) {
        if (escape && char === escape && nextChar === quote) {
          currentField += quote;
          i += 2;
        } else if (char === quote) {
          inQuotes = false;
          i++;
        } else if (i === buffer.length - 1) {
          buffer = buffer.slice(i);
          return;
        } else {
          currentField += char;
          i++;
        }
      } else {
        if (quoteEnabled && char === quote && currentField === "") {
          inQuotes = true;
          i++;
        } else if (char === delimiter) {
          currentRow.push(applyTrim(currentField, trim, ltrim, rtrim));
          currentField = "";
          i++;
        } else if (char === "\n" || char === "\r") {
          if (char === "\r" && nextChar === "\n") {
            i++;
          }

          currentRow.push(applyTrim(currentField, trim, ltrim, rtrim));
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
      currentRow.push(applyTrim(currentField, trim, ltrim, rtrim));

      if (!(maxRows !== undefined && dataRowCount >= maxRows)) {
        const result = processRow(currentRow);
        if (result.valid && result.row) {
          yield result.row;
        }
      }
    }
    return;
  }

  // Handle async iterable
  for await (const chunk of input) {
    buffer += chunk;
    yield* processBuffer();
  }

  // Handle last row
  if (currentField !== "" || currentRow.length > 0) {
    currentRow.push(applyTrim(currentField, trim, ltrim, rtrim));

    if (!(maxRows !== undefined && dataRowCount >= maxRows)) {
      const result = processRow(currentRow);
      if (result.valid && result.row) {
        yield result.row;
      }
    }
  }
}
