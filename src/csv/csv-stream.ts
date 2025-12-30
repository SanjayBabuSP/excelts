/**
 * CSV Streaming Support for Node.js
 *
 * Provides true streaming CSV parsing and formatting using Node.js streams.
 * This enables processing of large CSV files without loading them entirely into memory.
 */

import { Transform, type Readable, type TransformCallback } from "stream";
import type {
  CsvParseOptions,
  CsvFormatOptions,
  RowTransformFunction,
  RowValidateFunction,
  Row,
  RowTransformCallback,
  RowValidateCallback
} from "./csv-core";
import { isSyncTransform, isSyncValidate } from "./csv-core";

/**
 * Transform stream that parses CSV data row by row
 *
 * @example
 * ```ts
 * const parser = new CsvParserStream({ headers: true });
 * fs.createReadStream('data.csv')
 *   .pipe(parser)
 *   .on('data', (row) => console.log(row));
 * ```
 */
export class CsvParserStream extends Transform {
  private options: CsvParseOptions;
  private buffer: string = "";
  private currentRow: string[] = [];
  private currentField: string = "";
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
  private _rowTransform: ((row: Row, cb: RowTransformCallback<Row>) => void) | null = null;
  private _rowValidator: ((row: Row, cb: RowValidateCallback) => void) | null = null;
  private encoding: BufferEncoding;

  constructor(options: CsvParseOptions = {}) {
    super({ objectMode: options.objectMode !== false });
    this.options = options;
    this.encoding = options.encoding ?? "utf8";

    const quoteOption = options.quote ?? '"';
    this.quoteEnabled = quoteOption !== null && quoteOption !== false;
    this.quote = this.quoteEnabled ? String(quoteOption) : "";

    const escapeOption = options.escape ?? '"';
    this.escape =
      escapeOption !== null && escapeOption !== false ? String(escapeOption) : this.quote;

    this.delimiter = options.delimiter ?? ",";
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

  _transform(chunk: Buffer | string, encoding: BufferEncoding, callback: TransformCallback): void {
    try {
      const data = typeof chunk === "string" ? chunk : chunk.toString(this.encoding);
      this.buffer += data;
      this.processBuffer(callback);
    } catch (error) {
      callback(error as Error);
    }
  }

  _flush(callback: TransformCallback): void {
    try {
      // Process any remaining data
      if (this.currentField !== "" || this.currentRow.length > 0) {
        const { trim = false, ltrim = false, rtrim = false } = this.options;
        this.currentRow.push(this.applyTrim(this.currentField, trim, ltrim, rtrim));
        this.emitRow(callback);
      } else {
        callback();
      }
    } catch (error) {
      callback(error as Error);
    }
  }

  private applyTrim(field: string, trim: boolean, ltrim: boolean, rtrim: boolean): string {
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

  private processBuffer(callback: TransformCallback): void {
    const {
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
    } = this.options;

    const shouldSkipEmpty = skipEmptyLines || ignoreEmpty;
    let i = 0;
    const pendingRows: Array<{ row: Row; callback: () => void }> = [];

    while (i < this.buffer.length) {
      const char = this.buffer[i];
      const nextChar = this.buffer[i + 1];

      if (this.inQuotes && this.quoteEnabled) {
        if (this.escape && char === this.escape && nextChar === this.quote) {
          this.currentField += this.quote;
          i += 2;
        } else if (char === this.quote) {
          this.inQuotes = false;
          i++;
        } else if (i === this.buffer.length - 1) {
          // Need more data - preserve buffer from current position
          this.buffer = this.buffer.slice(i);
          this.processPendingRows(pendingRows, callback);
          return;
        } else {
          this.currentField += char;
          i++;
        }
      } else {
        if (this.quoteEnabled && char === this.quote && this.currentField === "") {
          this.inQuotes = true;
          i++;
        } else if (char === this.delimiter) {
          this.currentRow.push(this.applyTrim(this.currentField, trim, ltrim, rtrim));
          this.currentField = "";
          i++;
        } else if (char === "\n" || char === "\r") {
          // Handle \r\n
          if (char === "\r" && nextChar === "\n") {
            i++;
          }

          this.currentRow.push(this.applyTrim(this.currentField, trim, ltrim, rtrim));
          this.currentField = "";
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
          pendingRows.push({
            row: this.buildRow(rowToEmit),
            callback: () => {}
          });
          i++;
        } else {
          this.currentField += char;
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
      this.headerRow.forEach((header, index) => {
        obj[header] = rawRow[index] ?? "";
      });
      return obj;
    }
    return rawRow;
  }

  private processPendingRows(rows: Array<{ row: Row }>, callback: TransformCallback): void {
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

      const { row } = rows[index];
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

        // Use setImmediate to prevent stack overflow for large datasets
        if (index % 1000 === 0) {
          setImmediate(processNext);
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

  private emitRow(callback?: TransformCallback): void {
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
 * formatter.pipe(fs.createWriteStream('output.csv'));
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

  _transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback): void {
    try {
      // Write BOM if first chunk
      if (!this.headerWritten && this.options.writeBOM) {
        this.push("\uFEFF");
      }

      // Write headers if needed
      if (!this.headerWritten && this.headers && this.shouldWriteHeaders) {
        this.push(this.formatRow(this.headers, true));
        this.headerWritten = true;
      } else if (
        !this.headerWritten &&
        this.options.headers === true &&
        !Array.isArray(chunk) &&
        this.shouldWriteHeaders
      ) {
        // Auto-detect headers from first object
        this.headers = Object.keys(chunk);
        this.push(this.formatRow(this.headers, true));
        this.headerWritten = true;
      } else if (!this.headerWritten) {
        // Mark header as "written" even if we skip it (to handle subsequent rows)
        if (this.options.headers === true && !Array.isArray(chunk)) {
          this.headers = Object.keys(chunk);
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

  _flush(callback: TransformCallback): void {
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

  private formatAndPush(chunk: any): void {
    let row: any[];
    if (Array.isArray(chunk)) {
      row = chunk;
    } else if (typeof chunk === "object" && chunk !== null) {
      row = this.headers ? this.headers.map(h => chunk[h]) : Object.values(chunk);
    } else {
      row = [chunk];
    }

    this.push(this.formatRow(row, false));
  }

  private formatRow(row: any[], isHeader: boolean = false): string {
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

  private formatField(value: any, forceQuote: boolean = false): string {
    if (value === null || value === undefined) {
      return "";
    }

    let str: string;
    if (typeof value === "number" && this.decimalSeparator === ",") {
      str = String(value).split(".").join(",");
    } else {
      str = String(value);
    }

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
      const escaped = str.replace(
        new RegExp(escapeRegex(this.quote), "g"),
        this.escape + this.quote
      );
      return this.quote + escaped + this.quote;
    }

    return str;
  }
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Create a readable stream from an array of rows
 */
export function createCsvReadableStream(rows: any[][], options: CsvFormatOptions = {}): Readable {
  const formatter = new CsvFormatterStream(options);

  // Use setImmediate to allow piping before data flows
  setImmediate(() => {
    for (const row of rows) {
      formatter.write(row);
    }
    formatter.end();
  });

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
