/**
 * CSV class - Cross-Platform Base Implementation
 *
 * Provides CSV read/write functionality for both Node.js and Browser.
 * Node.js version (csv.ts) extends this with file system support.
 */

import { DateParser, DateFormatter, type DateFormat } from "../excel/utils/datetime";
import { parseCsv, formatCsv, type CsvParseOptions, type CsvFormatOptions } from "./csv-core";
import { CsvParserStream, CsvFormatterStream, type CsvFormatterStreamOptions } from "./csv-stream";
import { parseNumberFromCsv, type DecimalSeparator } from "./csv-number";
import { pipeline } from "../stream";
import type { IReadable, IWritable } from "../stream/types";
import type { Workbook } from "../excel/workbook";
import type { Worksheet } from "../excel/worksheet";
import type { CellErrorValue } from "../excel/types";

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_DATE_FORMATS: readonly DateFormat[] = [
  "YYYY-MM-DD[T]HH:mm:ssZ",
  "YYYY-MM-DD[T]HH:mm:ss",
  "MM-DD-YYYY",
  "YYYY-MM-DD"
];

// =============================================================================
// Types
// =============================================================================

export interface CsvReadOptions {
  dateFormats?: readonly DateFormat[];
  map?(value: any, index: number): any;
  sheetName?: string;
  parserOptions?: Partial<CsvParseOptions>;
  /** Options for the default value mapper (string -> number/date/etc). */
  valueMapperOptions?: DefaultValueMapperOptions;
}

export interface CsvWriteOptions {
  dateFormat?: string;
  dateUTC?: boolean;
  sheetName?: string;
  sheetId?: number;
  encoding?: string;
  map?(value: any, index: number): any;
  includeEmptyRows?: boolean;
  formatterOptions?: Partial<CsvFormatOptions>;
}

export interface CsvStreamReadOptions extends CsvReadOptions {
  highWaterMark?: number;
}

export interface CsvStreamWriteOptions extends CsvWriteOptions {
  highWaterMark?: number;
}

// =============================================================================
// Value Mappers
// =============================================================================

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

export interface DefaultValueMapperOptions {
  decimalSeparator?: DecimalSeparator;
}

export function createDefaultValueMapper(
  dateFormats: readonly DateFormat[],
  options?: DefaultValueMapperOptions
) {
  const dateParser = DateParser.create(dateFormats);
  const decimalSeparator: DecimalSeparator = options?.decimalSeparator ?? ".";

  return function mapValue(datum: any): any {
    if (datum === "") {
      return null;
    }

    if (typeof datum === "string") {
      const datumNumber = parseNumberFromCsv(datum, decimalSeparator);
      if (!Number.isNaN(datumNumber) && datumNumber !== Infinity) {
        return datumNumber;
      }
    } else {
      const datumNumber = Number(datum);
      if (!Number.isNaN(datumNumber) && datumNumber !== Infinity) {
        return datumNumber;
      }
    }

    const date = dateParser.parse(datum);
    if (date) {
      return date;
    }

    const special = SpecialValues[datum];
    if (special !== undefined) {
      return special;
    }

    return datum;
  };
}

export function createDefaultWriteMapper(dateFormat?: string, dateUTC?: boolean) {
  const formatter = dateFormat
    ? DateFormatter.create(dateFormat, { utc: dateUTC })
    : DateFormatter.iso(dateUTC);

  return function mapValue(value: any): any {
    if (value) {
      if (value.text || value.hyperlink) {
        return value.hyperlink || value.text || "";
      }
      if (value.formula || value.result) {
        return value.result || "";
      }
      if (value instanceof Date) {
        return formatter.format(value);
      }
      if (value.error) {
        return value.error;
      }
      if (typeof value === "object") {
        return JSON.stringify(value);
      }
    }
    return value;
  };
}

// =============================================================================
// CSV Class
// =============================================================================

class CSV {
  public workbook: Workbook;

  constructor(workbook: Workbook) {
    this.workbook = workbook;
  }

  // ---------------------------------------------------------------------------
  // In-Memory Operations
  // ---------------------------------------------------------------------------

  load(content: string | ArrayBuffer | Uint8Array, options?: CsvReadOptions): Worksheet {
    let str: string;
    if (typeof content === "string") {
      str = content;
    } else if (content instanceof ArrayBuffer || content instanceof Uint8Array) {
      str = new TextDecoder().decode(content);
    } else {
      str = String(content);
    }

    const worksheet = this.workbook.addWorksheet(options?.sheetName);
    const dateFormats = options?.dateFormats ?? DEFAULT_DATE_FORMATS;
    const map =
      options?.map ||
      createDefaultValueMapper(dateFormats, {
        decimalSeparator:
          options?.valueMapperOptions?.decimalSeparator ?? options?.parserOptions?.decimalSeparator
      });
    const rows = parseCsv(str, options?.parserOptions) as string[][];

    for (const row of rows) {
      worksheet.addRow(row.map(map));
    }

    return worksheet;
  }

  writeString(options?: CsvWriteOptions): string {
    const worksheet = this.workbook.getWorksheet(options?.sheetName || options?.sheetId);
    if (!worksheet) {
      return "";
    }

    const { dateFormat, dateUTC } = options || {};
    const map = options?.map || createDefaultWriteMapper(dateFormat, dateUTC);
    const includeEmptyRows = options?.includeEmptyRows !== false;

    const rows: any[][] = [];
    let lastRow = 1;

    worksheet.eachRow((row: any, rowNumber: number) => {
      if (includeEmptyRows) {
        while (lastRow++ < rowNumber - 1) {
          rows.push([]);
        }
      }
      const { values } = row;
      values.shift();
      rows.push(values.map(map));
      lastRow = rowNumber;
    });

    return formatCsv(rows, options?.formatterOptions);
  }

  async writeBuffer(options?: CsvWriteOptions): Promise<Uint8Array> {
    return new TextEncoder().encode(this.writeString(options));
  }

  // ---------------------------------------------------------------------------
  // Stream Operations
  // ---------------------------------------------------------------------------

  async read(stream: IReadable<any>, options?: CsvReadOptions): Promise<Worksheet> {
    const worksheet = this.workbook.addWorksheet(options?.sheetName);
    const dateFormats = options?.dateFormats ?? DEFAULT_DATE_FORMATS;
    const map =
      options?.map ||
      createDefaultValueMapper(dateFormats, {
        decimalSeparator:
          options?.valueMapperOptions?.decimalSeparator ?? options?.parserOptions?.decimalSeparator
      });
    const parser = new CsvParserStream(options?.parserOptions);

    return new Promise((resolve, reject) => {
      parser.on("data", (row: string[]) => worksheet.addRow(row.map(map)));
      pipeline(stream, parser)
        .then(() => resolve(worksheet))
        .catch(reject);
    });
  }

  async write(stream: IWritable<any>, options?: CsvWriteOptions): Promise<void> {
    const worksheet = this.workbook.getWorksheet(options?.sheetName || options?.sheetId);
    if (!worksheet) {
      stream.end();
      return;
    }

    const { dateFormat, dateUTC } = options || {};
    const map = options?.map || createDefaultWriteMapper(dateFormat, dateUTC);
    const includeEmptyRows = options?.includeEmptyRows !== false;
    const formatterOptions: CsvFormatterStreamOptions = { ...options?.formatterOptions };
    const formatter = new CsvFormatterStream(formatterOptions);
    const pipelinePromise = pipeline(formatter, stream);

    let lastRow = 1;
    worksheet.eachRow((row: any, rowNumber: number) => {
      if (includeEmptyRows) {
        while (lastRow++ < rowNumber - 1) {
          formatter.write([]);
        }
      }
      const { values } = row;
      values.shift();
      formatter.write(values.map(map));
      lastRow = rowNumber;
    });

    formatter.end();
    await pipelinePromise;
  }

  createReadStream(options?: CsvWriteOptions): IReadable<any> {
    const worksheet = this.workbook.getWorksheet(options?.sheetName || options?.sheetId);
    const { dateFormat, dateUTC } = options || {};
    const map = options?.map || createDefaultWriteMapper(dateFormat, dateUTC);
    const includeEmptyRows = options?.includeEmptyRows !== false;
    const formatter = new CsvFormatterStream({ ...options?.formatterOptions });

    if (worksheet) {
      setTimeout(() => {
        let lastRow = 1;
        worksheet.eachRow((row: any, rowNumber: number) => {
          if (includeEmptyRows) {
            while (lastRow++ < rowNumber - 1) {
              formatter.write([]);
            }
          }
          const { values } = row;
          values.shift();
          formatter.write(values.map(map));
          lastRow = rowNumber;
        });
        formatter.end();
      }, 0);
    } else {
      setTimeout(() => formatter.end(), 0);
    }

    return formatter;
  }

  createWriteStream(options?: CsvReadOptions): IWritable<any> {
    const worksheet = this.workbook.addWorksheet(options?.sheetName);
    const dateFormats = options?.dateFormats ?? DEFAULT_DATE_FORMATS;
    const map =
      options?.map ||
      createDefaultValueMapper(dateFormats, {
        decimalSeparator:
          options?.valueMapperOptions?.decimalSeparator ?? options?.parserOptions?.decimalSeparator
      });
    const parser = new CsvParserStream(options?.parserOptions);
    parser.on("data", (row: string[]) => worksheet.addRow(row.map(map)));
    return parser;
  }

  // ---------------------------------------------------------------------------
  // File Operations (Browser stubs - overridden in Node.js)
  // ---------------------------------------------------------------------------

  async readFile(_filename: string, _options?: CsvStreamReadOptions): Promise<Worksheet> {
    throw new Error(
      "csv.readFile() is not available in browser.\n" +
        "Use csv.load(csvString) or csv.read(stream) instead.\n" +
        "Example: const response = await fetch('/data.csv');\n" +
        "         workbook.csv.load(await response.text());"
    );
  }

  async writeFile(_filename: string, _options?: CsvStreamWriteOptions): Promise<void> {
    throw new Error(
      "csv.writeFile() is not available in browser.\n" +
        "Use csv.writeBuffer() and trigger a download instead.\n" +
        "Example: const buffer = await workbook.csv.writeBuffer();\n" +
        "         download(new Blob([buffer]), 'output.csv');"
    );
  }
}

// =============================================================================
// Standalone Functions (for backward compatibility)
// =============================================================================

export function parseCsvToWorksheet(
  content: string,
  workbook: Workbook,
  options?: CsvReadOptions
): Worksheet {
  const csv = new CSV(workbook);
  return csv.load(content, options);
}

export function formatWorksheetToCsv(
  worksheet: Worksheet | undefined,
  options?: CsvWriteOptions
): string {
  if (!worksheet) {
    return "";
  }
  const csv = new CSV(worksheet.workbook);
  return csv.writeString({ ...options, sheetId: worksheet.id });
}

export { CSV };
export { CsvParserStream, CsvFormatterStream } from "./csv-stream";
export { parseCsv, formatCsv } from "./csv-core";
export type { CsvParseOptions, CsvFormatOptions } from "./csv-core";
