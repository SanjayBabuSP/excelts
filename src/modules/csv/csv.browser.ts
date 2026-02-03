/**
 * CSV class - Cross-Platform Base Implementation
 *
 * Simple, unified API inspired by JSON.parse/stringify.
 * Node.js version (csv.ts) extends this with file system support.
 */

import { DateParser, DateFormatter, type DateFormat } from "@utils/datetime";
import { parseCsv } from "@csv/parse";
import { formatCsv } from "@csv/format";
import type { CsvParseOptions, CsvFormatOptions } from "@csv/types";
import { CsvParserStream, CsvFormatterStream } from "@csv/csv-stream";
import { parseNumberFromCsv, type DecimalSeparator } from "@csv/utils/number";
import { CsvDownloadError, CsvNotSupportedError, CsvFileError } from "@csv/errors";
import { pipeline } from "@stream";
import { readableStreamToAsyncIterable } from "@stream/utils";
import type { IReadable, IWritable } from "@stream/types";
import type { Workbook } from "@excel/workbook";
import type { Worksheet } from "@excel/worksheet";
import type { CellErrorValue } from "@excel/types";

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

/**
 * Supported input types for CSV parsing
 */
export type CsvInput =
  | string // CSV string or URL (http:// or https://)
  | ArrayBuffer
  | Uint8Array
  | File // Browser File object
  | Blob // Browser Blob object
  | IReadable<any>; // Readable stream

/**
 * Parse options from CsvParseOptions that are exposed in CsvOptions.
 * Internal fields like objectMode, transform, validate, chunk, etc. are excluded.
 */
type CsvOptionsParseFields = Pick<
  CsvParseOptions,
  | "delimiter"
  | "quote"
  | "escape"
  | "delimitersToGuess"
  | "newline"
  | "headers"
  | "renameHeaders"
  | "skipEmptyLines"
  | "ignoreEmpty"
  | "trim"
  | "ltrim"
  | "rtrim"
  | "comment"
  | "maxRows"
  | "toLine"
  | "skipLines"
  | "skipRows"
  | "strictColumnHandling"
  | "discardUnmappedColumns"
  | "relaxColumnCountLess"
  | "relaxColumnCountMore"
  | "groupColumnsByName"
  | "relaxQuotes"
  | "fastMode"
  | "info"
  | "raw"
  | "skipRecordsWithError"
  | "skipRecordsWithEmptyValues"
  | "onSkip"
>;

/**
 * Format options from CsvFormatOptions that are exposed in CsvOptions.
 */
type CsvOptionsFormatFields = Pick<
  CsvFormatOptions,
  | "rowDelimiter"
  | "decimalSeparator"
  | "quoteColumns"
  | "quoteHeaders"
  | "writeHeaders"
  | "escapeFormulae"
>;

/**
 * CsvOptions-specific fields not present in CsvParseOptions or CsvFormatOptions.
 */
interface CsvOptionsExtras {
  // === Worksheet ===
  sheetName?: string;
  sheetId?: number;

  // === File write options ===
  /**
   * Append mode - when true, data is appended to existing file.
   * Header row is automatically skipped in append mode.
   * If file doesn't exist, it will be created (with headers if configured).
   * @default false
   */
  append?: boolean;

  // === Value mapping ===
  dateFormats?: readonly DateFormat[];
  dateFormat?: string;
  dateUTC?: boolean;
  map?(value: any, index: number): any;
  includeEmptyRows?: boolean;

  // === Network options (for URL input) ===
  requestHeaders?: Record<string, string>;
  requestBody?: BodyInit;
  withCredentials?: boolean;
  signal?: AbortSignal;

  // === File options ===
  encoding?: string;
  onProgress?: (loaded: number, total: number) => void;

  // === Stream options ===
  stream?: boolean;
  highWaterMark?: number;
}

/**
 * Unified CSV options for both parsing and formatting
 */
export interface CsvOptions
  extends CsvOptionsParseFields, CsvOptionsFormatFields, CsvOptionsExtras {}

export interface DefaultValueMapperOptions {
  decimalSeparator?: DecimalSeparator;
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
// Input Type Detection
// =============================================================================

function isUrl(input: unknown): input is string {
  return typeof input === "string" && /^https?:\/\//i.test(input);
}

function isFile(input: unknown): input is File {
  return typeof File !== "undefined" && input instanceof File;
}

function isBlob(input: unknown): input is Blob {
  return typeof Blob !== "undefined" && input instanceof Blob && !isFile(input);
}

function isReadableStream(input: unknown): input is IReadable<any> {
  if (!input || typeof input !== "object") {
    return false;
  }
  const obj = input as any;
  return (
    typeof obj[Symbol.asyncIterator] === "function" ||
    (typeof obj.pipe === "function" && typeof obj.on === "function")
  );
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
  // Unified API
  // ---------------------------------------------------------------------------

  /**
   * Parse CSV from any supported input source
   *
   * @example
   * ```ts
   * // String (default delimiter is ",")
   * const ws = await workbook.csv.parse("a,b,c\n1,2,3");
   *
   * // Opt-in delimiter auto-detect
   * const ws2 = await workbook.csv.parse("a;b;c\n1;2;3", { delimiter: "" });
   *
   * // URL
   * const ws = await workbook.csv.parse("https://example.com/data.csv");
   *
   * // File (browser)
   * const ws = await workbook.csv.parse(fileInput.files[0]);
   *
   * // With options
   * const ws = await workbook.csv.parse(input, { delimiter: ";", headers: true });
   * ```
   */
  async parse(input: CsvInput, options?: CsvOptions): Promise<Worksheet> {
    if (isUrl(input)) {
      return this._parseUrl(input, options);
    }
    if (isFile(input)) {
      return this._parseFile(input, options);
    }
    if (isBlob(input)) {
      return this._parseBlob(input, options);
    }
    if (isReadableStream(input)) {
      return this._parseStream(input, options);
    }
    return this._parseContent(input, options);
  }

  /**
   * Convert worksheet to CSV string
   *
   * @example
   * ```ts
   * const csvString = workbook.csv.stringify();
   * const csvString = workbook.csv.stringify({ delimiter: ";", sheetName: "Data" });
   * ```
   */
  stringify(options?: CsvOptions): string {
    const worksheet = this.workbook.getWorksheet(options?.sheetName || options?.sheetId);
    if (!worksheet) {
      return "";
    }

    const map = options?.map || createDefaultWriteMapper(options?.dateFormat, options?.dateUTC);
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

    return formatCsv(rows, {
      delimiter: options?.delimiter ?? ",",
      quote: options?.quote,
      escape: options?.escape,
      rowDelimiter: options?.rowDelimiter,
      quoteColumns: options?.quoteColumns,
      quoteHeaders: options?.quoteHeaders,
      decimalSeparator: options?.decimalSeparator ?? ".",
      escapeFormulae: options?.escapeFormulae
    });
  }

  /**
   * Convert worksheet to CSV buffer
   */
  async toBuffer(options?: CsvOptions): Promise<Uint8Array> {
    return new TextEncoder().encode(this.stringify(options));
  }

  // ---------------------------------------------------------------------------
  // Internal Parse Methods (public for standalone functions)
  // ---------------------------------------------------------------------------

  _buildParserOptions(options?: CsvOptions): Partial<CsvParseOptions> {
    return {
      delimiter: options?.delimiter ?? ",",
      quote: options?.quote,
      escape: options?.escape,
      delimitersToGuess: options?.delimitersToGuess,
      newline: options?.newline,
      headers: options?.headers,
      renameHeaders: options?.renameHeaders,
      skipEmptyLines: options?.skipEmptyLines,
      ignoreEmpty: options?.ignoreEmpty,
      trim: options?.trim,
      ltrim: options?.ltrim,
      rtrim: options?.rtrim,
      comment: options?.comment,
      maxRows: options?.maxRows,
      toLine: options?.toLine,
      skipLines: options?.skipLines,
      skipRows: options?.skipRows,
      strictColumnHandling: options?.strictColumnHandling,
      discardUnmappedColumns: options?.discardUnmappedColumns,
      relaxColumnCountLess: options?.relaxColumnCountLess,
      relaxColumnCountMore: options?.relaxColumnCountMore,
      groupColumnsByName: options?.groupColumnsByName,
      relaxQuotes: options?.relaxQuotes,
      fastMode: options?.fastMode,
      info: options?.info,
      raw: options?.raw,
      skipRecordsWithError: options?.skipRecordsWithError,
      skipRecordsWithEmptyValues: options?.skipRecordsWithEmptyValues,
      onSkip: options?.onSkip
    };
  }

  _parseContent(content: string | ArrayBuffer | Uint8Array, options?: CsvOptions): Worksheet {
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
    const decimalSeparator = options?.decimalSeparator;
    const map = options?.map || createDefaultValueMapper(dateFormats, { decimalSeparator });
    const result = parseCsv(str, this._buildParserOptions(options));

    if (Array.isArray(result)) {
      for (const row of result) {
        worksheet.addRow(row.map(map));
      }
    } else {
      if (result.headers) {
        worksheet.addRow(result.headers);
      }
      for (const rowObj of result.rows) {
        const rowArray = result.headers!.map(h => rowObj[h]);
        worksheet.addRow(rowArray.map(map));
      }
    }

    return worksheet;
  }

  private async _parseStream(stream: IReadable<any>, options?: CsvOptions): Promise<Worksheet> {
    const worksheet = this.workbook.addWorksheet(options?.sheetName);
    const dateFormats = options?.dateFormats ?? DEFAULT_DATE_FORMATS;
    const decimalSeparator = options?.decimalSeparator;
    const map = options?.map || createDefaultValueMapper(dateFormats, { decimalSeparator });
    const parser = new CsvParserStream(this._buildParserOptions(options));
    const useHeaders = !!options?.headers;
    let headerRow: string[] | null = null;

    return new Promise((resolve, reject) => {
      // When headers option is enabled, listen for headers event to write header row first
      if (useHeaders) {
        parser.on("headers", (headers: string[]) => {
          headerRow = headers;
          worksheet.addRow(headers);
        });
      }

      parser.on("data", (row: unknown) => {
        // When headers: true, CsvParserStream emits objects; otherwise arrays
        if (useHeaders && headerRow && row && typeof row === "object" && !Array.isArray(row)) {
          // Convert object row to array using header order
          const rowObj = row as Record<string, unknown>;
          const rowArray = headerRow.map(h => rowObj[h]);
          worksheet.addRow(rowArray.map(map));
        } else if (Array.isArray(row)) {
          worksheet.addRow(row.map(map));
        }
      });

      pipeline(stream, parser)
        .then(() => resolve(worksheet))
        .catch(reject);
    });
  }

  private async _parseUrl(url: string, options?: CsvOptions): Promise<Worksheet> {
    const fetchOptions: RequestInit = {
      method: options?.requestBody ? "POST" : "GET",
      headers: options?.requestHeaders,
      body: options?.requestBody,
      credentials: options?.withCredentials ? "include" : "same-origin",
      signal: options?.signal
    };

    const response = await fetch(url, fetchOptions);
    if (!response.ok) {
      throw new CsvDownloadError(url, response.status, response.statusText);
    }

    if (options?.stream && response.body) {
      const readable = readableStreamToAsyncIterable<Uint8Array>(response.body);
      return this._parseStream(readable as any, options);
    }

    const text = await response.text();
    return this._parseContent(text, options);
  }

  private async _parseFile(file: File, options?: CsvOptions): Promise<Worksheet> {
    const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024;
    if (
      (options?.stream || file.size > LARGE_FILE_THRESHOLD) &&
      typeof file.stream === "function"
    ) {
      const readable = readableStreamToAsyncIterable<Uint8Array>(file.stream());
      return this._parseStream(readable as any, options);
    }

    return new Promise<Worksheet>((resolve, reject) => {
      const reader = new FileReader();
      const encoding = options?.encoding ?? "UTF-8";

      if (options?.onProgress) {
        reader.onprogress = event => {
          options.onProgress!(event.loaded, event.total || file.size);
        };
      }

      reader.onload = event => {
        try {
          const content = event.target?.result as string;
          resolve(this._parseContent(content, options));
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new CsvFileError(file.name, "read"));
      reader.readAsText(file, encoding);
    });
  }

  private async _parseBlob(blob: Blob, options?: CsvOptions): Promise<Worksheet> {
    const text = await blob.text();
    return this._parseContent(text, options);
  }

  // ---------------------------------------------------------------------------
  // Stream API
  // ---------------------------------------------------------------------------

  async read(stream: IReadable<any>, options?: CsvOptions): Promise<Worksheet> {
    return this._parseStream(stream, options);
  }

  async write(stream: IWritable<any>, options?: CsvOptions): Promise<void> {
    const worksheet = this.workbook.getWorksheet(options?.sheetName || options?.sheetId);
    if (!worksheet) {
      stream.end();
      return;
    }

    const map = options?.map || createDefaultWriteMapper(options?.dateFormat, options?.dateUTC);
    const includeEmptyRows = options?.includeEmptyRows !== false;
    const formatter = new CsvFormatterStream({
      delimiter: options?.delimiter ?? ",",
      quote: options?.quote,
      escape: options?.escape,
      rowDelimiter: options?.rowDelimiter,
      quoteColumns: options?.quoteColumns,
      quoteHeaders: options?.quoteHeaders,
      decimalSeparator: options?.decimalSeparator ?? ".",
      escapeFormulae: options?.escapeFormulae,
      writeHeaders: options?.writeHeaders
    });
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

  createReadStream(options?: CsvOptions): IReadable<any> {
    const worksheet = this.workbook.getWorksheet(options?.sheetName || options?.sheetId);
    const map = options?.map || createDefaultWriteMapper(options?.dateFormat, options?.dateUTC);
    const includeEmptyRows = options?.includeEmptyRows !== false;
    const formatter = new CsvFormatterStream({
      delimiter: options?.delimiter ?? ",",
      quote: options?.quote,
      escape: options?.escape,
      rowDelimiter: options?.rowDelimiter,
      quoteColumns: options?.quoteColumns,
      quoteHeaders: options?.quoteHeaders,
      decimalSeparator: options?.decimalSeparator ?? ".",
      escapeFormulae: options?.escapeFormulae,
      writeHeaders: options?.writeHeaders
    });

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

  createWriteStream(options?: CsvOptions): IWritable<any> {
    const worksheet = this.workbook.addWorksheet(options?.sheetName);
    const dateFormats = options?.dateFormats ?? DEFAULT_DATE_FORMATS;
    const decimalSeparator = options?.decimalSeparator;
    const map = options?.map || createDefaultValueMapper(dateFormats, { decimalSeparator });
    const parser = new CsvParserStream(this._buildParserOptions(options));
    const useHeaders = !!options?.headers;
    let headerRow: string[] | null = null;

    // When headers option is enabled, listen for headers event to write header row first
    if (useHeaders) {
      parser.on("headers", (headers: string[]) => {
        headerRow = headers;
        worksheet.addRow(headers);
      });
    }

    parser.on("data", (row: unknown) => {
      // When headers: true, CsvParserStream emits objects; otherwise arrays
      if (useHeaders && headerRow && row && typeof row === "object" && !Array.isArray(row)) {
        // Convert object row to array using header order
        const rowObj = row as Record<string, unknown>;
        const rowArray = headerRow.map(h => rowObj[h]);
        worksheet.addRow(rowArray.map(map));
      } else if (Array.isArray(row)) {
        worksheet.addRow((row as unknown[]).map(map));
      }
    });

    return parser;
  }

  // ---------------------------------------------------------------------------
  // File Operations (Browser stubs - overridden in Node.js)
  // ---------------------------------------------------------------------------

  async readFile(_filename: string, _options?: CsvOptions): Promise<Worksheet> {
    throw new CsvNotSupportedError(
      "csv.readFile()",
      "not available in browser. Use csv.parse(url) or csv.parse(file) instead."
    );
  }

  async writeFile(_filename: string, _options?: CsvOptions): Promise<void> {
    throw new CsvNotSupportedError(
      "csv.writeFile()",
      "not available in browser. Use csv.toBuffer() and trigger a download instead."
    );
  }
}

// =============================================================================
// Standalone Functions (for backward compatibility)
// =============================================================================

export function parseCsvToWorksheet(
  content: string,
  workbook: Workbook,
  options?: CsvOptions
): Worksheet {
  const csv = new CSV(workbook);
  return csv._parseContent(content, options);
}

export function formatWorksheetToCsv(
  worksheet: Worksheet | undefined,
  options?: CsvOptions
): string {
  if (!worksheet) {
    return "";
  }
  const csv = new CSV(worksheet.workbook);
  return csv.stringify({ ...options, sheetId: worksheet.id });
}

export { CSV };

// Re-export stream classes for convenience (used by tests and consumers)
export { CsvParserStream, CsvFormatterStream } from "./csv-stream";
