/**
 * Shared formatting utilities for CSV output
 *
 * This module contains common logic used by both formatCsv (batch)
 * and CsvFormatterStream (streaming) to avoid code duplication.
 */

import {
  escapeRegex,
  startsWithFormulaChar,
  normalizeQuoteOption,
  normalizeEscapeOption
} from "@csv/utils/detect";
import { formatNumberForCsv, type DecimalSeparator } from "@csv/csv-number";
import type { TransformContext, TypeTransformMap, TransformResult } from "@csv/csv-core";
import { isFormattedValue } from "@csv/utils/formatted-value";

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
  /** Always quote all fields */
  alwaysQuote: boolean;
  /** Escape formulae (CSV injection protection) */
  escapeFormulae: boolean;
  /** Decimal separator for number formatting */
  decimalSeparator: DecimalSeparator;
  /** Type transform map */
  transform?: TypeTransformMap;
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
    alwaysQuote,
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
      str = transformed;
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
      alwaysQuote ||
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
  /** Force quote all fields */
  alwaysQuote: boolean;
  /** Escape formulae (CSV injection protection) */
  escapeFormulae: boolean;
  /** Decimal separator for number formatting */
  decimalSeparator: DecimalSeparator;
  /** Type transform map */
  transform?: TypeTransformMap;
}

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
    alwaysQuote,
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
        alwaysQuote,
        escapeFormulae,
        decimalSeparator,
        transform
      });
    })
    .join(delimiter);
}
