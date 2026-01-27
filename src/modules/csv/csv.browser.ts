/**
 * CSV class - Cross-Platform Base Implementation
 *
 * Simple, unified API inspired by JSON.parse/stringify.
 * Node.js version (csv.ts) extends this with file system support.
 */

import { DateParser, DateFormatter, type DateFormat } from "@utils/datetime";
import { parseCsv, formatCsv, type CsvParseOptions, type CsvFormatOptions } from "@csv/csv-core";
import { CsvParserStream, CsvFormatterStream } from "@csv/csv-stream";
import { parseNumberFromCsv, type DecimalSeparator } from "@csv/csv-number";
import { pipeline } from "@stream";
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
 * Unified CSV options for both parsing and formatting
 */
export interface CsvOptions {
  // === Worksheet ===
  sheetName?: string;
  sheetId?: number;

  // === Parser options (flattened) ===
  /** Field delimiter - empty string "" for auto-detection (default: auto-detect) */
  delimiter?: string;
  /** Quote character (default: '"') */
  quote?: string | false | null;
  /** First row is header */
  header?: boolean;
  /** Skip empty lines */
  skipEmptyLines?: boolean;
  /** Trim whitespace from fields */
  trim?: boolean;
  /** Comment character */
  comment?: string;
  /** Maximum rows to parse */
  maxRows?: number;
  /**
   * Fast parsing mode - skips quote detection for simple data.
   * Provides 20-50% performance improvement for clean data without quoted fields.
   * WARNING: Only use when data contains no quotes, delimiters, or newlines within fields.
   * @default false
   */
  fastMode?: boolean;

  // === Formatter options ===
  rowDelimiter?: string;
  alwaysQuote?: boolean;
  /**
   * Escape formulae to prevent CSV injection attacks.
   * Fields starting with =, +, -, @, or tab are prefixed with a tab character.
   * @see https://owasp.org/www-community/attacks/CSV_Injection
   */
  escapeFormulae?: boolean;

  // === Value mapping ===
  dateFormats?: readonly DateFormat[];
  dateFormat?: string;
  dateUTC?: boolean;
  decimalSeparator?: DecimalSeparator;
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

  // === Legacy options (for backward compatibility) ===
  parserOptions?: Partial<CsvParseOptions>;
  formatterOptions?: Partial<CsvFormatOptions>;
  valueMapperOptions?: DefaultValueMapperOptions;
}

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
   * // String (auto-detects delimiter)
   * const ws = await workbook.csv.parse("a,b,c\n1,2,3");
   * const ws = await workbook.csv.parse("a;b;c\n1;2;3"); // detects ';'
   *
   * // URL
   * const ws = await workbook.csv.parse("https://example.com/data.csv");
   *
   * // File (browser)
   * const ws = await workbook.csv.parse(fileInput.files[0]);
   *
   * // With options
   * const ws = await workbook.csv.parse(input, { delimiter: ";", header: true });
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
      delimiter: options?.delimiter ?? options?.formatterOptions?.delimiter ?? ",",
      quote: options?.quote ?? options?.formatterOptions?.quote,
      rowDelimiter: options?.rowDelimiter ?? options?.formatterOptions?.rowDelimiter,
      alwaysQuote: options?.alwaysQuote ?? options?.formatterOptions?.alwaysQuote,
      escapeFormulae: options?.escapeFormulae ?? options?.formatterOptions?.escapeFormulae
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
    // Support both new flattened options and legacy parserOptions
    const legacy = options?.parserOptions;
    return {
      delimiter: options?.delimiter ?? legacy?.delimiter ?? "",
      quote: options?.quote ?? legacy?.quote,
      headers: options?.header ?? legacy?.headers,
      skipEmptyLines: options?.skipEmptyLines ?? legacy?.skipEmptyLines,
      trim: options?.trim ?? legacy?.trim,
      comment: options?.comment ?? legacy?.comment,
      maxRows: options?.maxRows ?? legacy?.maxRows,
      fastMode: options?.fastMode
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
    // Support both new decimalSeparator and legacy valueMapperOptions
    const decimalSeparator =
      options?.decimalSeparator ?? options?.valueMapperOptions?.decimalSeparator;
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
    const decimalSeparator =
      options?.decimalSeparator ?? options?.valueMapperOptions?.decimalSeparator;
    const map = options?.map || createDefaultValueMapper(dateFormats, { decimalSeparator });
    const parser = new CsvParserStream(this._buildParserOptions(options));

    return new Promise((resolve, reject) => {
      parser.on("data", (row: string[]) => worksheet.addRow(row.map(map)));
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
      throw new Error(`Failed to download CSV: ${response.status} ${response.statusText}`);
    }

    if (options?.stream && response.body) {
      const reader = response.body.getReader();
      const readable: IReadable<Uint8Array> = {
        [Symbol.asyncIterator]: async function* () {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            if (value) {
              yield value;
            }
          }
        }
      } as any;
      return this._parseStream(readable, options);
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
      const fileStream = file.stream();
      const reader = fileStream.getReader();
      const readable: IReadable<Uint8Array> = {
        [Symbol.asyncIterator]: async function* () {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            if (value) {
              yield value;
            }
          }
        }
      } as any;
      return this._parseStream(readable, options);
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

      reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
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
      delimiter: options?.delimiter ?? options?.formatterOptions?.delimiter ?? ",",
      quote: options?.quote ?? options?.formatterOptions?.quote,
      rowDelimiter: options?.rowDelimiter ?? options?.formatterOptions?.rowDelimiter,
      alwaysQuote: options?.alwaysQuote ?? options?.formatterOptions?.alwaysQuote,
      escapeFormulae: options?.escapeFormulae ?? options?.formatterOptions?.escapeFormulae
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
      delimiter: options?.delimiter ?? options?.formatterOptions?.delimiter ?? ",",
      quote: options?.quote ?? options?.formatterOptions?.quote,
      rowDelimiter: options?.rowDelimiter ?? options?.formatterOptions?.rowDelimiter,
      alwaysQuote: options?.alwaysQuote ?? options?.formatterOptions?.alwaysQuote,
      escapeFormulae: options?.escapeFormulae ?? options?.formatterOptions?.escapeFormulae
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
    const decimalSeparator =
      options?.decimalSeparator ?? options?.valueMapperOptions?.decimalSeparator;
    const map = options?.map || createDefaultValueMapper(dateFormats, { decimalSeparator });
    const parser = new CsvParserStream(this._buildParserOptions(options));
    parser.on("data", (row: string[]) => worksheet.addRow(row.map(map)));
    return parser;
  }

  // ---------------------------------------------------------------------------
  // File Operations (Browser stubs - overridden in Node.js)
  // ---------------------------------------------------------------------------

  async readFile(_filename: string, _options?: CsvOptions): Promise<Worksheet> {
    throw new Error(
      "csv.readFile() is not available in browser.\n" +
        "Use csv.parse(url) or csv.parse(file) instead."
    );
  }

  async writeFile(_filename: string, _options?: CsvOptions): Promise<void> {
    throw new Error(
      "csv.writeFile() is not available in browser.\n" +
        "Use csv.toBuffer() and trigger a download instead."
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
export { CsvParserStream, CsvFormatterStream } from "@csv/csv-stream";
export { parseCsv, formatCsv, detectDelimiter } from "@csv/csv-core";
export type { CsvParseOptions, CsvFormatOptions } from "@csv/csv-core";
