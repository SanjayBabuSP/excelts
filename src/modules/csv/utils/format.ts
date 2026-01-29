/**
 * Shared formatting utilities for CSV output
 *
 * This module contains common logic used by both formatCsv (batch)
 * and CsvFormatterStream (streaming) to avoid code duplication.
 */

import { escapeRegex, startsWithFormulaChar } from "@csv/utils/detect";
import type { DecimalSeparator } from "@csv/csv-number";
import type { TransformContext, TypeTransformMap } from "@csv/csv-core";
import { applyTypeTransform, defaultToString } from "@csv/csv-core";

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

  // If quote is false or null, disable quoting entirely
  const quoteEnabled = quoteOption !== false && quoteOption !== null;
  const quote = quoteEnabled ? String(quoteOption) : "";
  const escape =
    escapeOption !== undefined && escapeOption !== false && escapeOption !== null
      ? String(escapeOption)
      : quote;

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
 * Check if a specific column should be force-quoted based on config
 */
export function shouldQuoteColumn(
  index: number,
  header: string | undefined,
  quoteConfig: QuoteColumnConfig | undefined
): boolean {
  if (quoteConfig === true) {
    return true;
  }
  if (quoteConfig === false || quoteConfig === undefined) {
    return false;
  }
  if (Array.isArray(quoteConfig)) {
    return quoteConfig[index] === true;
  }
  if (typeof quoteConfig === "object" && header) {
    return quoteConfig[header] === true;
  }
  return false;
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
  if (!isHeader && transform) {
    // Reuse TransformContext object to reduce GC pressure
    reusableTransformCtx.column = header ?? index;
    reusableTransformCtx.index = outputRowIndex;
    const transformed = applyTypeTransform(value, transform, reusableTransformCtx);
    str = transformed !== undefined ? transformed : defaultToString(value, decimalSeparator);
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
  const needsQuote =
    alwaysQuote ||
    forceQuote ||
    (regex.useFastCheck
      ? needsQuoteFast(str, regex.delimiter, regex.quote)
      : regex.needsQuoteRegex!.test(str));

  if (needsQuote) {
    // Escape quotes using pre-compiled regex
    const escaped = str.replace(regex.escapeQuoteRegex!, regex.escapedQuote);
    return regex.quote + escaped + regex.quote;
  }

  return str;
}

/**
 * Format an entire row to CSV string
 */
export function formatRow(
  row: unknown[],
  regex: CsvFormatRegex,
  options: {
    delimiter: string;
    headers?: string[];
    isHeader: boolean;
    outputRowIndex: number;
    alwaysQuote: boolean;
    escapeFormulae: boolean;
    decimalSeparator: DecimalSeparator;
    transform?: TypeTransformMap;
    quoteConfig?: QuoteColumnConfig;
  }
): string {
  const {
    delimiter,
    headers,
    isHeader,
    outputRowIndex,
    alwaysQuote,
    escapeFormulae,
    decimalSeparator,
    transform,
    quoteConfig
  } = options;

  // Pre-compute quote lookup function to avoid repeated type checks
  const getForceQuote = createQuoteLookup(quoteConfig);

  return formatRowWithLookup(
    row,
    regex,
    getForceQuote,
    delimiter,
    headers,
    isHeader,
    outputRowIndex,
    alwaysQuote,
    escapeFormulae,
    decimalSeparator,
    transform
  );
}

/**
 * Format an entire row to CSV string (optimized version with pre-computed lookup)
 * Use this when formatting multiple rows with the same quoteConfig
 */
export function formatRowWithLookup(
  row: unknown[],
  regex: CsvFormatRegex,
  quoteLookup: QuoteLookupFn,
  delimiter: string,
  headers: string[] | undefined,
  isHeader: boolean,
  outputRowIndex: number,
  alwaysQuote: boolean,
  escapeFormulae: boolean,
  decimalSeparator: DecimalSeparator,
  transform?: TypeTransformMap
): string {
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
