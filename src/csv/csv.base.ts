/**
 * CSV Base class - Shared functionality for Node.js and Browser
 *
 * Uses native CSV parser (RFC 4180 compliant) with zero external dependencies.
 * Date parsing uses native high-performance datetime utilities.
 */

import { DateParser, DateFormatter, type DateFormat } from "../utils/datetime";
import { parseCsv, formatCsv, type CsvParseOptions, type CsvFormatOptions } from "./csv-core";
import type { Workbook } from "../doc/workbook";
import type { Worksheet } from "../doc/worksheet";
import type { CellErrorValue } from "../types";

/**
 * CSV read options
 */
export interface CsvReadOptions {
  /** Date format strings to try when parsing (default: ISO formats) */
  dateFormats?: readonly DateFormat[];
  /** Custom value mapper function */
  map?(value: any, index: number): any;
  /** Worksheet name to create (default: "Sheet1") */
  sheetName?: string;
  /** CSV parsing options */
  parserOptions?: Partial<CsvParseOptions>;
}

/**
 * CSV write options
 */
export interface CsvWriteOptions {
  /** Date format for output (default: ISO format) */
  dateFormat?: string;
  /** Use UTC for dates (default: false) */
  dateUTC?: boolean;
  /** Worksheet name or ID to export */
  sheetName?: string;
  /** Worksheet ID to export */
  sheetId?: number;
  /** Output encoding (default: "utf8") */
  encoding?: string;
  /** Custom value mapper function */
  map?(value: any, index: number): any;
  /** Include empty rows (default: true) */
  includeEmptyRows?: boolean;
  /** CSV formatting options */
  formatterOptions?: Partial<CsvFormatOptions>;
}

// Special Excel values mapping
const SpecialValues: Record<string, boolean | CellErrorValue> = {
  true: true,
  false: false,
  "#N/A": { error: "#N/A" },
  "#REF!": { error: "#REF!" },
  "#NAME?": { error: "#NAME?" },
  "#DIV/0!": { error: "#DIV/0!" },
  "#NULL!": { error: "#NULL!" },
  "#VALUE!": { error: "#VALUE!" },
  "#NUM!": { error: "#NUM!" }
};

/**
 * Create the default value mapper for CSV parsing
 */
export function createDefaultValueMapper(
  dateFormats: readonly DateFormat[],
  parserOptions?: Pick<CsvParseOptions, "decimalSeparator">
) {
  const dateParser = DateParser.create(dateFormats);
  const decimalSeparator: "." | "," = parserOptions?.decimalSeparator ?? ".";

  return function mapValue(datum: any): any {
    if (datum === "") {
      return null;
    }

    // Try to parse as number
    let datumNumber: number;
    if (decimalSeparator === "," && typeof datum === "string") {
      const trimmed = datum.trim();
      // Minimal locale support: treat a single comma as the decimal separator.
      // Common EU CSV uses delimiter ';' and decimal ',' (e.g. 12,34).
      if (/^-?\d+(,\d+)?([eE][+-]?\d+)?$/.test(trimmed)) {
        datumNumber = Number(trimmed.replace(",", "."));
      } else {
        datumNumber = Number(datum);
      }
    } else {
      datumNumber = Number(datum);
    }
    if (!Number.isNaN(datumNumber) && datumNumber !== Infinity) {
      return datumNumber;
    }

    // Try to parse as date
    const date = dateParser.parse(datum);
    if (date) {
      return date;
    }

    // Check for special values
    const special = SpecialValues[datum];
    if (special !== undefined) {
      return special;
    }

    return datum;
  };
}

/**
 * Create the default value mapper for CSV writing
 */
export function createDefaultWriteMapper(dateFormat?: string, dateUTC?: boolean) {
  const formatter = dateFormat
    ? DateFormatter.create(dateFormat, { utc: dateUTC })
    : DateFormatter.iso(dateUTC);

  return function mapValue(value: any): any {
    if (value) {
      // Handle hyperlinks
      if (value.text || value.hyperlink) {
        return value.hyperlink || value.text || "";
      }

      // Handle formulas
      if (value.formula || value.result) {
        return value.result || "";
      }

      // Handle dates
      if (value instanceof Date) {
        return formatter.format(value);
      }

      // Handle errors
      if (value.error) {
        return value.error;
      }

      // Handle other objects
      if (typeof value === "object") {
        return JSON.stringify(value);
      }
    }
    return value;
  };
}

/**
 * Parse CSV content into a worksheet
 */
export function parseCsvToWorksheet(
  content: string,
  workbook: Workbook,
  options: CsvReadOptions = {}
): Worksheet {
  const worksheet = workbook.addWorksheet(options.sheetName);

  const dateFormats: readonly DateFormat[] = options.dateFormats || [
    "YYYY-MM-DD[T]HH:mm:ssZ",
    "YYYY-MM-DD[T]HH:mm:ss",
    "YYYY-MM-DD"
  ];

  // If using the default mapper, pass parserOptions for locale-aware number parsing.
  // (Custom map overrides this behavior.)
  const effectiveMap = options.map || createDefaultValueMapper(dateFormats, options.parserOptions);

  // Parse CSV
  const rows = parseCsv(content, options.parserOptions) as string[][];

  // Add rows to worksheet
  for (const row of rows) {
    worksheet.addRow(row.map(effectiveMap));
  }

  return worksheet;
}

/**
 * Format worksheet as CSV string
 */
export function formatWorksheetToCsv(
  worksheet: Worksheet | undefined,
  options: CsvWriteOptions = {}
): string {
  if (!worksheet) {
    return "";
  }

  const { dateFormat, dateUTC } = options;
  const map = options.map || createDefaultWriteMapper(dateFormat, dateUTC);
  const includeEmptyRows = options.includeEmptyRows !== false;

  const rows: any[][] = [];
  let lastRow = 1;

  worksheet.eachRow((row: any, rowNumber: number) => {
    // Add empty rows if needed
    if (includeEmptyRows) {
      while (lastRow++ < rowNumber - 1) {
        rows.push([]);
      }
    }

    const { values } = row;
    values.shift(); // Remove first empty element (1-indexed)
    rows.push(values.map(map));
    lastRow = rowNumber;
  });

  return formatCsv(rows, options.formatterOptions);
}

// Re-export core types
export { parseCsv, formatCsv, parseCsvStream } from "./csv-core";
export type { CsvParseOptions, CsvFormatOptions, CsvParseResult } from "./csv-core";
