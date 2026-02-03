/**
 * CSV Formatter
 *
 * Complete CSV formatting implementation with both low-level utilities
 * and high-level batch formatting API.
 *
 * Low-level exports (used by CsvFormatterStream):
 * - createFormatRegex(): Pre-compile regex patterns for performance
 * - createQuoteLookup(): Build quote decision function from config
 * - formatField(): Format a single field value
 * - formatRowWithLookup(): Format an entire row
 * - applyTypeTransform(): Apply type-based transforms
 * - defaultToString(): Default value-to-string conversion
 *
 * High-level exports:
 * - formatCsv(): Batch format data to CSV string
 *
 * Features:
 * - Multiple input types (objects, arrays, RowHashArray)
 * - Flexible quoting (per-column, per-header, always, disabled)
 * - Type transforms with context
 * - Formula escaping (CSV injection protection)
 * - BOM support
 */

import type {
  CsvFormatOptions,
  Row,
  TypeTransformMap,
  TransformContext,
  TransformResult
} from "./types";
import {
  deduplicateHeaders,
  isRowHashArray,
  rowHashArrayToHeaders,
  rowHashArrayToValues,
  rowHashArrayMapByHeaders
} from "./utils/row";
import {
  escapeRegex,
  startsWithFormulaChar,
  normalizeQuoteOption,
  normalizeEscapeOption
} from "./utils/detect";
import { formatNumberForCsv, type DecimalSeparator } from "./utils/number";
import { isFormattedValue } from "./utils/formatted-value";

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for quoting specific columns
 */
export type QuoteColumnConfig = boolean | boolean[] | Record<string, boolean>;

/**
 * Pre-compiled regex patterns for CSV formatting performance
 */
export interface CsvFormatRegex {
  /** Regex to check if a field needs quoting (contains delimiter, quote, or newline) */
  needsQuoteRegex: RegExp | null;
  /** Regex to find quote characters for escaping */
  escapeQuoteRegex: RegExp | null;
  /** The escaped quote sequence (escape + quote) */
  escapedQuote: string;
  /** Whether quoting is enabled */
  quoteEnabled: boolean;
  /** The quote character */
  quote: string;
  /** The delimiter character (for fast path) */
  delimiter: string;
  /** Whether we can use fast string.includes() check */
  useFastCheck: boolean;
}

/**
 * Options for creating format regex patterns
 */
export interface FormatRegexOptions {
  /** The quote character (false/null to disable quoting) */
  quote: string | false | null;
  /** The delimiter character */
  delimiter: string;
  /** The escape character (defaults to quote if not provided) */
  escape?: string | false | null;
}

/**
 * Context for formatting a single field
 */
export interface FormatFieldContext {
  /** Column index */
  index: number;
  /** Header name for this column (if known) */
  header?: string;
  /** Whether this is a header row */
  isHeader: boolean;
  /** Current output row index (for transform context) */
  outputRowIndex: number;
  /** Force quote this field */
  forceQuote: boolean;
  /** Quote all fields (when quoteColumns: true) */
  quoteAll: boolean;
  /** Escape formulae (CSV injection protection) */
  escapeFormulae: boolean;
  /** Decimal separator for number formatting */
  decimalSeparator: DecimalSeparator;
  /** Type transform map */
  transform?: TypeTransformMap;
}

/**
 * Options for formatting a row
 */
export interface FormatRowOptions {
  /** Pre-computed quote lookup function */
  quoteLookup: QuoteLookupFn;
  /** Field delimiter */
  delimiter: string;
  /** Header names for columns (used for transform context) */
  headers?: string[];
  /** Whether this row is a header row */
  isHeader: boolean;
  /** Current output row index (0-based) */
  outputRowIndex: number;
  /** Quote all fields (when quoteColumns: true) */
  quoteAll: boolean;
  /** Escape formulae (CSV injection protection) */
  escapeFormulae: boolean;
  /** Decimal separator for number formatting */
  decimalSeparator: DecimalSeparator;
  /** Type transform map */
  transform?: TypeTransformMap;
}

// =============================================================================
// Regex Factory
// =============================================================================

/**
 * Create pre-compiled regex patterns for CSV formatting
 */
export function createFormatRegex(options: FormatRegexOptions): CsvFormatRegex {
  const { quote: quoteOption, delimiter, escape: escapeOption } = options;

  // Use centralized normalization utilities
  const { enabled: quoteEnabled, char: quote } = normalizeQuoteOption(quoteOption);
  const escapeNormalized = normalizeEscapeOption(escapeOption, quote);

  if (!quoteEnabled) {
    return {
      needsQuoteRegex: null,
      escapeQuoteRegex: null,
      escapedQuote: "",
      quoteEnabled: false,
      quote: "",
      delimiter,
      useFastCheck: false
    };
  }

  // When quoting is enabled, we must have a valid escape character to produce valid CSV.
  // If escape was explicitly disabled (escape: false/null), fall back to quote char (RFC 4180 standard).
  // This ensures internal quotes are always properly escaped as "" rather than producing invalid CSV.
  const escape = escapeNormalized.char || quote;

  // Use fast string.includes() check for single-char delimiter and quote
  const useFastCheck = delimiter.length === 1 && quote.length === 1;

  return {
    needsQuoteRegex: useFastCheck
      ? null // Will use fast check instead
      : new RegExp(`[${escapeRegex(delimiter)}${escapeRegex(quote)}\r\n]`),
    escapeQuoteRegex: new RegExp(escapeRegex(quote), "g"),
    escapedQuote: escape + quote,
    quoteEnabled: true,
    quote,
    delimiter,
    useFastCheck
  };
}

// =============================================================================
// Quote Lookup
// =============================================================================

/**
 * Pre-compute a quote lookup function for better performance.
 * Avoids repeated type checks on quoteConfig during formatting.
 */
export type QuoteLookupFn = (index: number, header: string | undefined) => boolean;

export function createQuoteLookup(quoteConfig: QuoteColumnConfig | undefined): QuoteLookupFn {
  if (quoteConfig === true) {
    return () => true;
  }
  if (quoteConfig === false || quoteConfig === undefined) {
    return () => false;
  }
  if (Array.isArray(quoteConfig)) {
    return (index: number) => quoteConfig[index] === true;
  }
  // Record<string, boolean>
  return (_index: number, header: string | undefined) =>
    header ? quoteConfig[header] === true : false;
}

// =============================================================================
// Type Transform Functions
// =============================================================================

/**
 * Apply type-based transform to a single value.
 * Returns the transformed result, or undefined if no transform applies.
 */
export function applyTypeTransform(
  value: any,
  transform: TypeTransformMap,
  ctx: TransformContext
): TransformResult {
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

// =============================================================================
// Field Formatting
// =============================================================================

/**
 * Fast check if a string needs quoting (for single-char delimiter/quote)
 * Uses indexOf for slightly better V8 optimization
 */
function needsQuoteFast(str: string, delimiter: string, quote: string): boolean {
  return (
    str.indexOf(delimiter) !== -1 ||
    str.indexOf(quote) !== -1 ||
    str.indexOf("\n") !== -1 ||
    str.indexOf("\r") !== -1
  );
}

/**
 * Reusable TransformContext object to avoid GC pressure.
 * Only used within formatField - not exported.
 */
const reusableTransformCtx: TransformContext = { column: 0, index: 0 };

/**
 * Format a single field value to CSV string
 */
export function formatField(
  value: unknown,
  regex: CsvFormatRegex,
  ctx: FormatFieldContext
): string {
  const {
    index,
    header,
    isHeader,
    outputRowIndex,
    forceQuote,
    quoteAll,
    escapeFormulae,
    decimalSeparator,
    transform
  } = ctx;

  // Apply type-based transform if provided (not for headers)
  let str: string;
  // Track if transform explicitly requested quoting control
  let transformQuoteHint: boolean | undefined;

  if (!isHeader && transform) {
    // Reuse TransformContext object to reduce GC pressure
    reusableTransformCtx.column = header ?? index;
    reusableTransformCtx.index = outputRowIndex;
    const transformed = applyTypeTransform(value, transform, reusableTransformCtx);

    if (transformed === undefined || transformed === null) {
      str = defaultToString(value, decimalSeparator);
    } else if (isFormattedValue(transformed)) {
      // FormattedValue contains explicit quoting hint
      str = transformed.value;
      transformQuoteHint = transformed.quote;
    } else {
      str = transformed as string;
    }
  } else {
    str = defaultToString(value, decimalSeparator);
  }

  // Escape formulae to prevent CSV injection (OWASP recommendation)
  // Prefix dangerous characters with tab to neutralize them in spreadsheet apps
  if (escapeFormulae && startsWithFormulaChar(str)) {
    str = "\t" + str;
  }

  // If quoting is disabled, return raw string
  if (!regex.quoteEnabled) {
    return str;
  }

  // Check if quoting is needed
  // Transform quote hint takes precedence (explicit control via quoted()/unquoted())
  let needsQuote: boolean;
  if (transformQuoteHint !== undefined) {
    needsQuote = transformQuoteHint;
  } else {
    needsQuote =
      quoteAll ||
      forceQuote ||
      (regex.useFastCheck
        ? needsQuoteFast(str, regex.delimiter, regex.quote)
        : regex.needsQuoteRegex!.test(str));
  }

  if (needsQuote) {
    // Escape quotes using pre-compiled regex
    const escaped = str.replace(regex.escapeQuoteRegex!, regex.escapedQuote);
    return regex.quote + escaped + regex.quote;
  }

  return str;
}

// =============================================================================
// Row Formatting
// =============================================================================

/**
 * Format an entire row to CSV string
 */
export function formatRowWithLookup(
  row: unknown[],
  regex: CsvFormatRegex,
  options: FormatRowOptions
): string {
  const {
    quoteLookup,
    delimiter,
    headers,
    isHeader,
    outputRowIndex,
    quoteAll,
    escapeFormulae,
    decimalSeparator,
    transform
  } = options;

  return row
    .map((value, index) => {
      const header = headers?.[index];
      return formatField(value, regex, {
        index,
        header,
        isHeader,
        outputRowIndex,
        forceQuote: quoteLookup(index, header),
        quoteAll,
        escapeFormulae,
        decimalSeparator,
        transform
      });
    })
    .join(delimiter);
}

// =============================================================================
// Format Config (shared by batch formatter and CsvFormatterStream)
// =============================================================================

export interface FormatConfig {
  delimiter: string;
  rowDelimiter: string;
  quoteAll: boolean;
  escapeFormulae: boolean;
  decimalSeparator: DecimalSeparator;
  writeHeaders: boolean;
  bom: boolean;
  trailingNewline: boolean;
  transform?: TypeTransformMap;
  regex: CsvFormatRegex;
  shouldQuoteColumn: QuoteLookupFn;
  shouldQuoteHeader: QuoteLookupFn;
}

export function createFormatConfig(options: CsvFormatOptions): FormatConfig {
  const {
    delimiter = ",",
    rowDelimiter = "\n",
    quote: quoteOption = '"',
    escape: escapeOption,
    quoteColumns = false,
    quoteHeaders = false,
    writeHeaders: writeHeadersOption,
    bom = false,
    trailingNewline = false,
    escapeFormulae = false,
    decimalSeparator = ".",
    transform
  } = options;

  const regex = createFormatRegex({
    quote: quoteOption,
    delimiter,
    escape: escapeOption
  });

  const quoteAll = quoteColumns === true;

  return {
    delimiter,
    rowDelimiter,
    quoteAll,
    escapeFormulae,
    decimalSeparator: decimalSeparator as DecimalSeparator,
    writeHeaders: writeHeadersOption ?? true,
    bom,
    trailingNewline,
    transform,
    regex,
    shouldQuoteColumn: createQuoteLookup(quoteColumns),
    shouldQuoteHeader: createQuoteLookup(quoteHeaders)
  };
}

// =============================================================================
// Field Formatting (batch wrapper)
// =============================================================================

/**
 * Format a single field value for batch formatter.
 * Wraps formatField with local config.
 */
function formatFieldLocal(
  value: unknown,
  cfg: FormatConfig,
  colIndex: number,
  header?: string,
  isHeaderRow: boolean = false,
  rowIndex: number = 0
): string {
  const ctx: FormatFieldContext = {
    index: colIndex,
    header,
    isHeader: isHeaderRow,
    outputRowIndex: rowIndex,
    forceQuote: isHeaderRow
      ? cfg.shouldQuoteHeader(colIndex, header)
      : cfg.shouldQuoteColumn(colIndex, header),
    quoteAll: cfg.quoteAll,
    escapeFormulae: cfg.escapeFormulae,
    decimalSeparator: cfg.decimalSeparator,
    transform: isHeaderRow ? undefined : cfg.transform
  };
  return formatField(value, cfg.regex, ctx);
}

// =============================================================================
// Input Normalization
// =============================================================================

interface NormalizedInput {
  keys: string[] | null;
  displayHeaders: string[] | null;
  rows: unknown[][];
}

/**
 * Normalize all input types to a unified format.
 * Handles: objects, arrays, RowHashArray, and columns config.
 */
function normalizeInput(
  data: Row[] | Record<string, unknown>[],
  options: CsvFormatOptions,
  cfg: FormatConfig
): NormalizedInput {
  const { headers, columns } = options;

  // Empty data
  if (data.length === 0) {
    if (columns && columns.length > 0) {
      const displayHeaders = columns.map(c => (typeof c === "string" ? c : (c.header ?? c.key)));
      return { keys: null, displayHeaders, rows: [] };
    }
    if (Array.isArray(headers)) {
      return { keys: headers, displayHeaders: headers, rows: [] };
    }
    return { keys: null, displayHeaders: null, rows: [] };
  }

  const firstRow = data[0];

  // Columns config takes precedence
  if (columns && columns.length > 0) {
    const keys = columns.map(c => (typeof c === "string" ? c : c.key));
    const displayHeaders = columns.map(c => (typeof c === "string" ? c : (c.header ?? c.key)));

    const rows: unknown[][] = [];
    for (let i = 0; i < data.length; i++) {
      let row = data[i];

      if (cfg.transform?.row) {
        const transformed = cfg.transform.row(row as Row, i);
        if (transformed === null) {
          continue;
        }
        row = transformed;
      }

      let values: unknown[];
      if (isRowHashArray(row)) {
        values = keys.map(k => {
          const pair = (row as [string, unknown][]).find(([key]) => key === k);
          return pair ? pair[1] : undefined;
        });
      } else if (Array.isArray(row)) {
        values = row;
      } else {
        values = keys.map(k => (row as Record<string, unknown>)[k]);
      }

      rows.push(values);
    }

    return { keys, displayHeaders, rows };
  }

  // RowHashArray input
  if (isRowHashArray(firstRow)) {
    const hashArrays = data as [string, unknown][][];
    const keys =
      headers === true
        ? rowHashArrayToHeaders(hashArrays[0])
        : Array.isArray(headers)
          ? headers
          : null;

    const rows: unknown[][] = [];
    for (let i = 0; i < hashArrays.length; i++) {
      let row = hashArrays[i];

      if (cfg.transform?.row) {
        const transformed = cfg.transform.row(row as Row, i);
        if (transformed === null) {
          continue;
        }
        row = transformed as [string, unknown][];
      }

      let values: unknown[];
      if (isRowHashArray(row)) {
        values = keys ? rowHashArrayMapByHeaders(row, keys) : rowHashArrayToValues(row);
      } else if (Array.isArray(row)) {
        values = row;
      } else {
        values = keys ? keys.map(k => (row as Record<string, unknown>)[k]) : Object.values(row);
      }

      rows.push(values);
    }

    return { keys, displayHeaders: keys, rows };
  }

  // Object input
  if (!Array.isArray(firstRow) && typeof firstRow === "object") {
    const objects = data as Record<string, unknown>[];
    const keys =
      headers === true ? Object.keys(objects[0]) : Array.isArray(headers) ? headers : null;

    const rows: unknown[][] = [];
    for (let i = 0; i < objects.length; i++) {
      let obj = objects[i];

      if (cfg.transform?.row) {
        const transformed = cfg.transform.row(obj as Row, i);
        if (transformed === null) {
          continue;
        }
        obj = transformed as Record<string, unknown>;
      }

      const values = keys ? keys.map(k => obj[k]) : Object.values(obj);
      rows.push(values);
    }

    return { keys, displayHeaders: keys, rows };
  }

  // Array input
  const arrays = data as unknown[][];
  const keys = Array.isArray(headers) ? headers : null;

  const rows: unknown[][] = [];
  for (let i = 0; i < arrays.length; i++) {
    let row = arrays[i];

    if (cfg.transform?.row) {
      const transformed = cfg.transform.row(row as Row, i);
      if (transformed === null) {
        continue;
      }
      row = transformed as unknown[];
    }

    rows.push(row);
  }

  return { keys, displayHeaders: keys, rows };
}

// =============================================================================
// Main Formatter
// =============================================================================

/**
 * Format data as CSV string.
 *
 * @example
 * ```ts
 * // Array of arrays
 * formatCsv([["a", "b"], ["1", "2"]])
 * // "a,b\n1,2"
 *
 * // Array of objects
 * formatCsv([{ name: "Alice", age: 30 }])
 * // "name,age\nAlice,30"
 *
 * // With options
 * formatCsv(data, {
 *   delimiter: ";",
 *   quoteColumns: { name: true },
 *   escapeFormulae: true,
 *   bom: true
 * })
 * ```
 */
export function formatCsv(
  data: Row[] | Record<string, unknown>[],
  options: CsvFormatOptions = {}
): string {
  const cfg = createFormatConfig(options);
  const { displayHeaders, rows } = normalizeInput(data, options, cfg);

  const lines: string[] = [];

  // Header row
  if (displayHeaders && cfg.writeHeaders) {
    const deduped = deduplicateHeaders(displayHeaders);
    const headerLine = deduped
      .map((h, i) => formatFieldLocal(h, cfg, i, h, true, 0))
      .join(cfg.regex.delimiter);
    lines.push(headerLine);
  }

  // Data rows
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const values = rows[rowIdx];
    const line = values
      .map((v, i) => formatFieldLocal(v, cfg, i, displayHeaders?.[i], false, rowIdx))
      .join(cfg.regex.delimiter);
    lines.push(line);
  }

  let result = lines.join(cfg.rowDelimiter);

  // Trailing newline
  if (result.length > 0 && cfg.trailingNewline) {
    result += cfg.rowDelimiter;
  }

  // BOM for UTF-8
  if (cfg.bom) {
    result = "\uFEFF" + result;
  }

  return result;
}
