/**
 * CSV Streaming Support - Cross-Platform
 *
 * Provides true streaming CSV parsing and formatting using our cross-platform stream module.
 * Works identically in both Node.js and Browser environments.
 */

import { Transform } from "@stream";
import type { IReadable } from "@stream/types";
import type {
  CsvParseOptions,
  CsvFormatOptions,
  RowTransformFunction,
  RowValidateFunction,
  Row,
  RowTransformCallback,
  RowValidateCallback
} from "@csv/csv-core";
import {
  isSyncTransform,
  isSyncValidate,
  isRowHashArray,
  rowHashArrayMapByHeaders,
  rowHashArrayToValues,
  rowHashArrayToHeaders,
  detectDelimiter,
  escapeRegex
} from "@csv/csv-core";
import { formatNumberForCsv } from "@csv/csv-number";

/**
 * Transform stream that parses CSV data row by row
 *
 * @example
 * ```ts
 * const parser = new CsvParserStream({ headers: true });
 * readable.pipe(parser).on('data', (row) => console.log(row));
 * ```
 */
export class CsvParserStream extends Transform {
  private options: CsvParseOptions;
  private buffer: string = "";
  private currentRow: string[] = [];
  private currentField: string = "";
  private currentFieldParts: string[] | null = null;
  private currentFieldLength: number = 0;
  private inQuotes: boolean = false;
  private lineNumber: number = 0;
  private rowCount: number = 0;
  private skippedDataRows: number = 0;
  private headerRow: string[] | null = null;
  private headersEmitted: boolean = false;
  private delimiter: string;
  private quote: string;
  private escape: string;
  private quoteEnabled: boolean;
  private trimField: (s: string) => string;
  private decoder: TextDecoder;
  private _rowTransform: ((row: Row, cb: RowTransformCallback<Row>) => void) | null = null;
  private _rowValidator: ((row: Row, cb: RowValidateCallback) => void) | null = null;
  private autoDetectDelimiter: boolean = false;
  private delimiterDetected: boolean = false;

  constructor(options: CsvParseOptions = {}) {
    super({ objectMode: options.objectMode !== false });
    this.options = options;

    // Reuse a single decoder instance and enable streaming decode to correctly handle
    // multi-byte characters split across chunks.
    this.decoder = new TextDecoder();

    const quoteOption = options.quote ?? '"';
    this.quoteEnabled = quoteOption !== null && quoteOption !== false;
    this.quote = this.quoteEnabled ? String(quoteOption) : "";

    const escapeOption = options.escape ?? '"';
    this.escape =
      escapeOption !== null && escapeOption !== false ? String(escapeOption) : this.quote;

    // Check if auto-detection is requested (delimiter === "")
    const delimiterOption = options.delimiter ?? ",";
    if (delimiterOption === "") {
      this.autoDetectDelimiter = true;
      this.delimiter = ","; // Default fallback, will be detected on first chunk
    } else {
      this.delimiter = delimiterOption;
    }

    // Pre-compute trim function for performance
    const { trim = false, ltrim = false, rtrim = false } = options;
    this.trimField =
      trim || (ltrim && rtrim)
        ? (s: string) => s.trim()
        : ltrim
          ? (s: string) => s.trimStart()
          : rtrim
            ? (s: string) => s.trimEnd()
            : (s: string) => s;
  }

  /**
   * Set a transform function to modify rows before emitting
   * Supports both sync and async transforms
   */
  transform<I extends Row = Row, O extends Row = Row>(
    transformFunction: RowTransformFunction<I, O>
  ): this {
    if (typeof transformFunction !== "function") {
      throw new TypeError("The transform should be a function");
    }

    if (isSyncTransform(transformFunction)) {
      this._rowTransform = (row: Row, cb: RowTransformCallback<Row>): void => {
        try {
          const result = transformFunction(row as I);
          cb(null, result as Row);
        } catch (e) {
          cb(e as Error);
        }
      };
    } else {
      this._rowTransform = transformFunction as (row: Row, cb: RowTransformCallback<Row>) => void;
    }
    return this;
  }

  /**
   * Set a validate function to filter rows
   * Invalid rows emit 'data-invalid' event
   */
  validate<T extends Row = Row>(validateFunction: RowValidateFunction<T>): this {
    if (typeof validateFunction !== "function") {
      throw new TypeError("The validate should be a function");
    }

    if (isSyncValidate(validateFunction)) {
      this._rowValidator = (row: Row, cb: RowValidateCallback): void => {
        try {
          const isValid = validateFunction(row as T);
          cb(null, isValid);
        } catch (e) {
          cb(e as Error);
        }
      };
    } else {
      this._rowValidator = validateFunction as (row: Row, cb: RowValidateCallback) => void;
    }
    return this;
  }

  override _transform(
    chunk: Uint8Array | string,
    _encoding: string,
    callback: (error?: Error | null, data?: Row) => void
  ): void {
    try {
      const data = typeof chunk === "string" ? chunk : this.decoder.decode(chunk, { stream: true });
      this.buffer += data;

      // Auto-detect delimiter on first chunk if requested
      if (this.autoDetectDelimiter && !this.delimiterDetected) {
        this.delimiter = detectDelimiter(this.buffer, this.quote || '"');
        this.delimiterDetected = true;
        // Emit delimiter event so consumers can know which delimiter was detected
        this.emit("delimiter", this.delimiter);
      }

      this.processBuffer(callback);
    } catch (error) {
      callback(error as Error);
    }
  }

  override _flush(callback: (error?: Error | null) => void): void {
    try {
      const remainingDecoded = this.decoder.decode();
      if (remainingDecoded) {
        this.buffer += remainingDecoded;
      }

      if (this.buffer) {
        this.processBuffer(err => {
          if (err) {
            callback(err);
            return;
          }
          this.flushCurrentRow(callback);
        });
        return;
      }

      this.flushCurrentRow(callback);
    } catch (error) {
      callback(error as Error);
    }
  }

  private flushCurrentRow(callback: (error?: Error | null) => void): void {
    // Process any remaining data without a trailing newline.
    if (this.currentFieldLength !== 0 || this.currentRow.length > 0) {
      this.currentRow.push(this.trimField(this.takeCurrentField()));
      this.emitRow(callback);
      return;
    }
    callback();
  }

  private appendToField(text: string): void {
    if (text.length === 0) {
      return;
    }

    const nextLength = this.currentFieldLength + text.length;

    // For small fields, string concatenation is fast enough.
    // For very large fields, switch to chunk accumulation to avoid pathological O(n^2) behavior.
    const LARGE_FIELD_THRESHOLD = 1024;
    if (!this.currentFieldParts && nextLength <= LARGE_FIELD_THRESHOLD) {
      this.currentField += text;
      this.currentFieldLength = nextLength;
      return;
    }

    if (!this.currentFieldParts) {
      this.currentFieldParts = this.currentFieldLength === 0 ? [text] : [this.currentField, text];
      this.currentField = "";
      this.currentFieldLength = nextLength;
      return;
    }

    this.currentFieldParts.push(text);
    this.currentFieldLength = nextLength;
  }

  private takeCurrentField(): string {
    if (this.currentFieldLength === 0) {
      return "";
    }

    const value = this.currentFieldParts ? this.currentFieldParts.join("") : this.currentField;
    this.currentField = "";
    this.currentFieldParts = null;
    this.currentFieldLength = 0;
    return value;
  }

  private processBuffer(callback: (error?: Error | null) => void): void {
    const {
      skipEmptyLines = false,
      ignoreEmpty = false,
      headers = false,
      renameHeaders = false,
      comment,
      maxRows,
      skipLines = 0,
      skipRows = 0,
      strictColumnHandling = false,
      discardUnmappedColumns = false
    } = this.options;

    const shouldSkipEmpty = skipEmptyLines || ignoreEmpty;
    let i = 0;
    const len = this.buffer.length;
    const pendingRows: Row[] = [];

    while (i < len) {
      const char = this.buffer[i];

      if (this.inQuotes && this.quoteEnabled) {
        if (this.escape && char === this.escape && this.buffer[i + 1] === this.quote) {
          this.appendToField(this.quote);
          i += 2;
        } else if (char === this.quote) {
          this.inQuotes = false;
          i++;
        } else if (i === len - 1) {
          // Need more data - preserve buffer from current position
          this.buffer = this.buffer.slice(i);
          this.processPendingRows(pendingRows, callback);
          return;
        } else if (char === "\r") {
          // Normalize CRLF to LF inside quoted fields
          if (this.buffer[i + 1] === "\n") {
            i++; // Skip \r, will add \n on next iteration
          } else {
            this.appendToField("\n"); // Convert standalone \r to \n
            i++;
          }
        } else {
          this.appendToField(char);
          i++;
        }
      } else {
        if (this.quoteEnabled && char === this.quote && this.currentFieldLength === 0) {
          this.inQuotes = true;
          i++;
        } else if (char === this.delimiter) {
          this.currentRow.push(this.trimField(this.takeCurrentField()));
          i++;
        } else if (char === "\n" || char === "\r") {
          // Handle \r\n
          if (char === "\r" && this.buffer[i + 1] === "\n") {
            i++;
          }

          this.currentRow.push(this.trimField(this.takeCurrentField()));
          this.lineNumber++;

          // Skip lines at beginning
          if (this.lineNumber <= skipLines) {
            this.currentRow = [];
            i++;
            continue;
          }

          // Skip comment lines
          if (comment && this.currentRow[0]?.startsWith(comment)) {
            this.currentRow = [];
            i++;
            continue;
          }

          // Skip empty lines
          const isEmpty = this.currentRow.length === 1 && this.currentRow[0] === "";
          if (shouldSkipEmpty && isEmpty) {
            this.currentRow = [];
            i++;
            continue;
          }

          // Handle headers
          if (
            (headers === true ||
              typeof headers === "function" ||
              (Array.isArray(headers) && renameHeaders)) &&
            this.headerRow === null
          ) {
            if (typeof headers === "function") {
              const transformed = headers(this.currentRow);
              this.headerRow = transformed.filter((h): h is string => h != null);
            } else if (Array.isArray(headers) && renameHeaders) {
              // Discard first row, use provided headers
              this.headerRow = headers.filter((h): h is string => h != null);
            } else {
              this.headerRow = this.currentRow;
            }
            // Emit headers event
            if (!this.headersEmitted) {
              this.headersEmitted = true;
              this.emit("headers", this.headerRow);
            }
            this.currentRow = [];
            i++;
            continue;
          }

          // Use provided headers array directly if no renameHeaders
          if (Array.isArray(headers) && !renameHeaders && this.headerRow === null) {
            this.headerRow = headers.filter((h): h is string => h != null);
            // Emit headers event for provided headers
            if (!this.headersEmitted) {
              this.headersEmitted = true;
              this.emit("headers", this.headerRow);
            }
          }

          // Skip data rows
          if (this.skippedDataRows < skipRows) {
            this.skippedDataRows++;
            this.currentRow = [];
            i++;
            continue;
          }

          // Column validation
          if (this.headerRow && this.headerRow.length > 0) {
            const expectedCols = this.headerRow.length;
            const actualCols = this.currentRow.length;

            if (actualCols > expectedCols) {
              if (strictColumnHandling && !discardUnmappedColumns) {
                // Emit data-invalid event
                this.emit(
                  "data-invalid",
                  this.currentRow,
                  `Column mismatch: expected ${expectedCols}, got ${actualCols}`
                );
                this.currentRow = [];
                i++;
                continue;
              } else {
                // Discard extra columns
                this.currentRow.length = expectedCols;
              }
            } else if (actualCols < expectedCols) {
              if (strictColumnHandling) {
                this.emit(
                  "data-invalid",
                  this.currentRow,
                  `Column mismatch: expected ${expectedCols}, got ${actualCols}`
                );
                this.currentRow = [];
                i++;
                continue;
              }
              // Pad with empty strings
              while (this.currentRow.length < expectedCols) {
                this.currentRow.push("");
              }
            }
          }

          this.rowCount++;

          // Check max rows
          if (maxRows !== undefined && this.rowCount > maxRows) {
            this.buffer = "";
            this.processPendingRows(pendingRows, callback);
            return;
          }

          // Queue this row for emission
          const rowToEmit = this.currentRow;
          this.currentRow = [];
          pendingRows.push(this.buildRow(rowToEmit));
          i++;
        } else {
          this.appendToField(char);
          i++;
        }
      }
    }

    this.buffer = "";
    this.processPendingRows(pendingRows, callback);
  }

  private buildRow(rawRow: string[]): Row {
    if (this.options.headers && this.headerRow) {
      const obj: Record<string, string> = {};
      for (let index = 0; index < this.headerRow.length; index++) {
        const header = this.headerRow[index];
        obj[header] = rawRow[index] ?? "";
      }
      return obj;
    }
    return rawRow;
  }

  private processPendingRows(rows: Row[], callback: (error?: Error | null) => void): void {
    if (rows.length === 0) {
      callback();
      return;
    }

    let index = 0;
    const processNext = (): void => {
      if (index >= rows.length) {
        callback();
        return;
      }

      const row = rows[index];
      index++;

      this.transformAndValidateRow(row, (err, result) => {
        if (err) {
          callback(err);
          return;
        }

        if (result && result.isValid && result.row !== null) {
          // Push the row (respect objectMode)
          if (this.options.objectMode === false) {
            this.push(JSON.stringify(result.row));
          } else {
            this.push(result.row);
          }
        } else if (result && !result.isValid) {
          this.emit("data-invalid", result.row, result.reason);
        }

        // Use setTimeout to prevent stack overflow for large datasets
        if (index % 1000 === 0) {
          setTimeout(processNext, 0);
        } else {
          processNext();
        }
      });
    };

    processNext();
  }

  private transformAndValidateRow(
    row: Row,
    callback: (
      err: Error | null,
      result?: { row: Row | null; isValid: boolean; reason?: string }
    ) => void
  ): void {
    // First apply transform
    if (this._rowTransform) {
      this._rowTransform(row, (transformErr, transformedRow) => {
        if (transformErr) {
          callback(transformErr);
          return;
        }

        if (transformedRow === null || transformedRow === undefined) {
          callback(null, { row: null, isValid: true });
          return;
        }

        // Then validate
        this.validateRow(transformedRow, callback);
      });
    } else {
      this.validateRow(row, callback);
    }
  }

  private validateRow(
    row: Row,
    callback: (
      err: Error | null,
      result?: { row: Row | null; isValid: boolean; reason?: string }
    ) => void
  ): void {
    if (this._rowValidator) {
      this._rowValidator(row, (validateErr, isValid, reason) => {
        if (validateErr) {
          callback(validateErr);
          return;
        }

        callback(null, { row, isValid: isValid ?? false, reason });
      });
    } else {
      callback(null, { row, isValid: true });
    }
  }

  private emitRow(callback?: (error?: Error | null) => void): void {
    const row = this.buildRow(this.currentRow);
    this.transformAndValidateRow(row, (err, result) => {
      if (err) {
        if (callback) {
          callback(err);
        }
        return;
      }

      if (result && result.isValid && result.row !== null) {
        if (this.options.objectMode === false) {
          this.push(JSON.stringify(result.row));
        } else {
          this.push(result.row);
        }
      } else if (result && !result.isValid) {
        this.emit("data-invalid", result.row, result.reason);
      }

      if (callback) {
        callback();
      }
    });
  }
}

/**
 * Options for CSV formatter stream
 */
export interface CsvFormatterStreamOptions extends CsvFormatOptions {
  /** Whether input is objects (vs arrays) */
  objectMode?: boolean;
}

/**
 * Transform stream that formats rows to CSV
 *
 * @example
 * ```ts
 * const formatter = new CsvFormatterStream({ headers: ['name', 'age'] });
 * formatter.pipe(writable);
 * formatter.write(['Alice', 30]);
 * formatter.write(['Bob', 25]);
 * formatter.end();
 * ```
 */
export class CsvFormatterStream extends Transform {
  private options: CsvFormatterStreamOptions;
  private delimiter: string;
  private quote: string;
  private escape: string;
  private rowDelimiter: string;
  private quoteEnabled: boolean;
  private alwaysQuote: boolean;
  private decimalSeparator: "." | ",";
  private headerWritten: boolean = false;
  private headers: string[] | null = null;
  private shouldWriteHeaders: boolean;
  private rowCount: number = 0;
  private _rowTransform: ((row: Row, cb: RowTransformCallback<Row>) => void) | null = null;
  // Pre-compiled regex for quote escaping
  private escapeQuoteRegex: RegExp | null = null;
  private escapedQuote: string = "";

  constructor(options: CsvFormatterStreamOptions = {}) {
    super({
      objectMode: options.objectMode !== false,
      writableObjectMode: options.objectMode !== false
    });
    this.options = options;

    const quoteOption = options.quote ?? '"';
    this.quoteEnabled = quoteOption !== null && quoteOption !== false;
    this.quote = this.quoteEnabled ? String(quoteOption) : "";

    const escapeOption = options.escape;
    this.escape =
      escapeOption !== undefined && escapeOption !== null && escapeOption !== false
        ? String(escapeOption)
        : this.quote;

    this.delimiter = options.delimiter ?? ",";
    this.rowDelimiter = options.rowDelimiter ?? "\n";
    this.alwaysQuote = options.alwaysQuote ?? false;
    this.decimalSeparator = options.decimalSeparator ?? ".";
    // writeHeaders defaults to true when headers is provided
    this.shouldWriteHeaders = options.writeHeaders ?? true;

    // Pre-compile regex for performance
    if (this.quoteEnabled) {
      this.escapeQuoteRegex = new RegExp(escapeRegex(this.quote), "g");
      this.escapedQuote = this.escape + this.quote;
    }

    if (Array.isArray(options.headers)) {
      this.headers = options.headers;
    }

    // Set up transform from options
    if (options.transform) {
      this.transform(options.transform);
    }
  }

  /**
   * Set a transform function to modify rows before formatting
   */
  transform<I extends Row = Row, O extends Row = Row>(
    transformFunction: RowTransformFunction<I, O>
  ): this {
    if (typeof transformFunction !== "function") {
      throw new TypeError("The transform should be a function");
    }

    if (isSyncTransform(transformFunction)) {
      this._rowTransform = (row: Row, cb: RowTransformCallback<Row>): void => {
        try {
          const result = transformFunction(row as I);
          cb(null, result as Row);
        } catch (e) {
          cb(e as Error);
        }
      };
    } else {
      this._rowTransform = transformFunction as (row: Row, cb: RowTransformCallback<Row>) => void;
    }
    return this;
  }

  /**
   * Auto-detect headers from a row (object or RowHashArray)
   */
  private detectHeadersFromRow(chunk: Row): void {
    if (isRowHashArray(chunk)) {
      this.headers = rowHashArrayToHeaders(chunk);
    } else if (!Array.isArray(chunk) && typeof chunk === "object" && chunk !== null) {
      this.headers = Object.keys(chunk);
    }
  }

  override _transform(
    chunk: Row,
    _encoding: string,
    callback: (error?: Error | null, data?: string) => void
  ): void {
    try {
      // Write BOM if first chunk
      if (!this.headerWritten && this.options.writeBOM) {
        this.push("\uFEFF");
      }

      // Handle header writing on first row
      if (!this.headerWritten) {
        // Auto-detect headers from first row if needed
        if (this.options.headers === true && !this.headers) {
          this.detectHeadersFromRow(chunk);
        }

        // Write headers if we should and have them
        if (this.shouldWriteHeaders && this.headers) {
          this.push(this.formatRow(this.headers, true));
        }
        this.headerWritten = true;
      }

      // Apply transform if set
      if (this._rowTransform) {
        this._rowTransform(chunk, (err, transformedRow) => {
          if (err) {
            callback(err);
            return;
          }

          if (transformedRow === null || transformedRow === undefined) {
            callback();
            return;
          }

          this.formatAndPush(transformedRow);
          callback();
        });
      } else {
        this.formatAndPush(chunk);
        callback();
      }
    } catch (error) {
      callback(error as Error);
    }
  }

  override _flush(callback: (error?: Error | null) => void): void {
    // Handle alwaysWriteHeaders with no data
    if (
      !this.headerWritten &&
      this.options.alwaysWriteHeaders &&
      this.headers &&
      this.shouldWriteHeaders
    ) {
      if (this.options.writeBOM) {
        this.push("\uFEFF");
      }
      this.push(this.formatRow(this.headers, true));
      this.headerWritten = true;
    }

    // Add trailing row delimiter if includeEndRowDelimiter is true
    if (this.options.includeEndRowDelimiter && this.rowCount > 0) {
      this.push(this.rowDelimiter);
    }

    callback();
  }

  private formatAndPush(chunk: Row): void {
    let row: unknown[];
    if (isRowHashArray(chunk)) {
      // Handle RowHashArray: array of [key, value] tuples
      // Optimized: use rowHashArrayMapByHeaders for header ordering, else preserve tuple order
      row = this.headers
        ? rowHashArrayMapByHeaders(chunk, this.headers)
        : rowHashArrayToValues(chunk);
    } else if (Array.isArray(chunk)) {
      row = chunk;
    } else if (typeof chunk === "object" && chunk !== null) {
      row = this.headers
        ? this.headers.map(h => (chunk as Record<string, unknown>)[h])
        : Object.values(chunk);
    } else {
      row = [chunk];
    }

    this.push(this.formatRow(row, false));
  }

  private formatRow(row: unknown[], isHeader: boolean = false): string {
    const { quoteColumns, quoteHeaders } = this.options;
    const quoteConfig = isHeader ? quoteHeaders : quoteColumns;

    const fields = row.map((field, index) => {
      const headerName = this.headers?.[index];
      const shouldForceQuote = this.shouldQuoteField(index, headerName, quoteConfig);
      return this.formatField(field, shouldForceQuote);
    });

    const formattedRow = fields.join(this.delimiter);

    // Use row delimiter as prefix (except for first row)
    // rowDelimiter separates rows, no trailing delimiter by default
    if (this.rowCount === 0) {
      this.rowCount++;
      return formattedRow;
    }

    this.rowCount++;
    return this.rowDelimiter + formattedRow;
  }

  private shouldQuoteField(
    index: number,
    header: string | undefined,
    quoteConfig: boolean | boolean[] | Record<string, boolean> | undefined
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

  private formatField(value: unknown, forceQuote: boolean = false): string {
    if (value === null || value === undefined) {
      return "";
    }

    const str =
      typeof value === "number" ? formatNumberForCsv(value, this.decimalSeparator) : String(value);

    if (!this.quoteEnabled) {
      return str;
    }

    // Check if quoting is needed
    const needsQuote =
      this.alwaysQuote ||
      forceQuote ||
      str.includes(this.delimiter) ||
      str.includes(this.quote) ||
      str.includes("\r") ||
      str.includes("\n");

    if (needsQuote) {
      // Use pre-compiled regex for escaping
      const escaped = str.replace(this.escapeQuoteRegex!, this.escapedQuote);
      return this.quote + escaped + this.quote;
    }

    return str;
  }
}

/**
 * Create a readable stream from an array of rows
 */
export function createCsvReadableStream(
  rows: unknown[][],
  options: CsvFormatOptions = {}
): IReadable<any> {
  const formatter = new CsvFormatterStream(options);

  // Use setTimeout to allow piping before data flows
  setTimeout(() => {
    for (const row of rows) {
      formatter.write(row);
    }
    formatter.end();
  }, 0);

  return formatter;
}

/**
 * Create parser stream factory
 */
export function createCsvParserStream(options: CsvParseOptions = {}): CsvParserStream {
  return new CsvParserStream(options);
}

/**
 * Create formatter stream factory
 */
export function createCsvFormatterStream(
  options: CsvFormatterStreamOptions = {}
): CsvFormatterStream {
  return new CsvFormatterStream(options);
}
