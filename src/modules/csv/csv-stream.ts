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
  RowValidateCallback,
  ChunkMeta
} from "@csv/csv-core";
import {
  isSyncTransform,
  isSyncValidate,
  isRowHashArray,
  rowHashArrayMapByHeaders,
  rowHashArrayToValues,
  rowHashArrayToHeaders,
  detectDelimiter,
  escapeRegex,
  applyDynamicTypingToRow,
  applyDynamicTypingToArrayRow,
  deduplicateHeaders,
  stripBom,
  makeTrimField,
  startsWithFormulaChar
} from "@csv/csv-core";
import { formatNumberForCsv } from "@csv/csv-number";

const NON_WHITESPACE_RE = /\S/;

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
  private currentRowBytes: number = 0; // Track row size for maxRowBytes check
  private maxRowBytes: number | undefined; // Cached for hot path performance
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
  private fastMode: boolean;
  private trimField: (s: string) => string;
  private decoder: TextDecoder;
  private _rowTransform: ((row: Row, cb: RowTransformCallback<Row>) => void) | null = null;
  private _rowValidator: ((row: Row, cb: RowValidateCallback) => void) | null = null;
  private autoDetectDelimiter: boolean = false;
  private delimiterDetected: boolean = false;
  // Chunk callback support
  private chunkBuffer: Row[] = [];
  private chunkSize: number;
  private totalRowsProcessed: number = 0;
  private isFirstChunk: boolean = true;
  private chunkAborted: boolean = false;
  // beforeFirstChunk support
  private beforeFirstChunkApplied: boolean = false;
  private bomStripped: boolean = false;

  constructor(options: CsvParseOptions = {}) {
    super({ objectMode: options.objectMode !== false });
    this.options = options;
    this.chunkSize = options.chunkSize ?? 1000;

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

    // Fast mode - skip quote detection
    this.fastMode = options.fastMode ?? false;

    // Pre-compute trim function for performance
    const { trim = false, ltrim = false, rtrim = false } = options;
    this.trimField = makeTrimField(trim, ltrim, rtrim);

    // Cache maxRowBytes for hot path performance
    this.maxRowBytes = options.maxRowBytes;
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
    // If chunk callback aborted parsing, skip all further processing
    if (this.chunkAborted) {
      callback();
      return;
    }

    try {
      const data = typeof chunk === "string" ? chunk : this.decoder.decode(chunk, { stream: true });
      this.buffer += data;

      // Apply beforeFirstChunk on first chunk (PapaParse order: beforeFirstChunk runs before BOM stripping)
      if (!this.beforeFirstChunkApplied && this.options.beforeFirstChunk) {
        this.beforeFirstChunkApplied = true;
        const result = this.options.beforeFirstChunk(this.buffer);
        if (typeof result === "string") {
          this.buffer = result;
        }
      }

      // Strip BOM once, after beforeFirstChunk
      if (!this.bomStripped) {
        this.buffer = stripBom(this.buffer);
        this.bomStripped = true;
      }

      // Auto-detect delimiter on first chunk if requested
      if (this.autoDetectDelimiter && !this.delimiterDetected) {
        this.delimiter = detectDelimiter(
          this.buffer,
          this.quote || '"',
          this.options.delimitersToGuess,
          this.options.comment,
          this.options.skipEmptyLines
        );
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
    // If chunk callback aborted parsing, skip flush
    if (this.chunkAborted) {
      callback();
      return;
    }

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
          this.flushCurrentRow(err2 => {
            if (err2) {
              callback(err2);
              return;
            }
            this.flushFinalChunk(callback);
          });
        });
        return;
      }

      this.flushCurrentRow(err => {
        if (err) {
          callback(err);
          return;
        }
        this.flushFinalChunk(callback);
      });
    } catch (error) {
      callback(error as Error);
    }
  }

  private flushCurrentRow(callback: (error?: Error | null) => void): void {
    // In fastMode, parsing is line-based and does not use currentField/currentRow.
    // Flush any remaining buffer as a final line when there's no trailing newline.
    if (this.fastMode) {
      this.flushFastModeRemainder(callback);
      return;
    }

    // Process any remaining data without a trailing newline.
    if (this.currentFieldLength !== 0 || this.currentRow.length > 0) {
      this.currentRow.push(this.trimField(this.takeCurrentField()));
      // Use the same row processing path as normal rows for chunk callback support
      const row = this.buildRow(this.currentRow);
      this.currentRow = [];
      this.currentRowBytes = 0; // Reset row bytes counter
      this.processPendingRows([row], callback);
      return;
    }
    callback();
  }

  private flushFastModeRemainder(callback: (error?: Error | null) => void): void {
    const line = this.buffer;
    this.buffer = "";

    if (line === "") {
      callback();
      return;
    }

    const { skipLines = 0, skipEmptyLines = false, ignoreEmpty = false } = this.options;
    const shouldSkipEmpty = skipEmptyLines || ignoreEmpty;

    this.lineNumber++;

    if (this.lineNumber <= skipLines) {
      callback();
      return;
    }

    const pendingRows: Row[] = [];
    const row = line.split(this.delimiter).map(this.trimField);

    if (this.shouldSkipRow(row, shouldSkipEmpty)) {
      callback();
      return;
    }

    if (!this.processCompletedRow(row, pendingRows)) {
      this.processPendingRows(pendingRows, callback);
      return;
    }

    this.processPendingRows(pendingRows, callback);
  }

  /**
   * Push buffered rows to stream
   */
  private pushBufferedRows(rows: Row[]): void {
    const useJson = this.options.objectMode === false;
    for (const row of rows) {
      this.push(useJson ? JSON.stringify(row) : row);
    }
  }

  /**
   * Invoke chunk callback and handle result (sync or async)
   */
  private invokeChunkCallback(
    rows: Row[],
    meta: ChunkMeta,
    callback: (error?: Error | null) => void
  ): void {
    const result = this.options.chunk!(rows, meta);

    if (result instanceof Promise) {
      result
        .then(shouldContinue => {
          if (shouldContinue === false) {
            this.chunkAborted = true;
          }
          callback();
        })
        .catch(err => callback(err));
    } else {
      if (result === false) {
        this.chunkAborted = true;
      }
      callback();
    }
  }

  /**
   * Flush any remaining rows in the chunk buffer at the end of the stream
   */
  private flushFinalChunk(callback: (error?: Error | null) => void): void {
    if (this.chunkBuffer.length > 0 && this.options.chunk) {
      const chunkRowCount = this.chunkBuffer.length;
      const cursor = this.totalRowsProcessed - chunkRowCount;

      const meta: ChunkMeta = {
        cursor,
        rowCount: chunkRowCount,
        isFirstChunk: this.isFirstChunk,
        isLastChunk: true
      };

      // Push remaining rows to stream
      this.pushBufferedRows(this.chunkBuffer);

      // Call chunk callback
      const rows = this.chunkBuffer;
      this.chunkBuffer = [];
      this.invokeChunkCallback(rows, meta, callback);
    } else {
      callback();
    }
  }

  private appendToField(text: string): void {
    if (text.length === 0) {
      return;
    }

    const nextLength = this.currentFieldLength + text.length;

    // Track row bytes for maxRowBytes limit
    this.currentRowBytes += text.length;
    if (this.maxRowBytes !== undefined && this.currentRowBytes > this.maxRowBytes) {
      throw new Error(`Row exceeds the maximum size of ${this.maxRowBytes} bytes`);
    }

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
    const { skipEmptyLines = false, ignoreEmpty = false, skipLines = 0 } = this.options;
    const shouldSkipEmpty = skipEmptyLines || ignoreEmpty;

    // ==========================================================================
    // Fast Mode: Skip quote detection, split directly by delimiter
    // ==========================================================================
    if (this.fastMode) {
      this.processBufferFastMode(callback, shouldSkipEmpty);
      return;
    }

    // ==========================================================================
    // Standard Mode: Full RFC 4180 compliant parsing with quote handling
    // ==========================================================================
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
            this.currentRowBytes = 0; // Reset row bytes counter
            i++;
            continue;
          }

          // Skip comment/empty lines, also skips delimiter-only rows
          if (this.shouldSkipRow(this.currentRow, shouldSkipEmpty)) {
            this.currentRow = [];
            this.currentRowBytes = 0; // Reset row bytes counter
            i++;
            continue;
          }

          // Process completed row (handles headers, skipRows, column validation, maxRows)
          const rowToProcess = this.currentRow;
          this.currentRow = [];
          this.currentRowBytes = 0; // Reset row bytes counter
          if (!this.processCompletedRow(rowToProcess, pendingRows)) {
            this.buffer = "";
            this.processPendingRows(pendingRows, callback);
            return;
          }

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

  /**
   * Fast mode buffer processing - skips quote detection, splits directly by delimiter
   */
  private processBufferFastMode(
    callback: (error?: Error | null) => void,
    shouldSkipEmpty: boolean
  ): void {
    const { skipLines = 0 } = this.options;
    const pendingRows: Row[] = [];

    // Find last complete line in buffer
    const lastLF = this.buffer.lastIndexOf("\n");
    const lastCR = this.buffer.lastIndexOf("\r");
    const lastNewlineIndex = Math.max(lastLF, lastCR);

    // If no complete line, wait for more data
    if (lastNewlineIndex === -1) {
      callback();
      return;
    }

    // Process complete lines
    const completeData = this.buffer.slice(0, lastNewlineIndex + 1);
    this.buffer = this.buffer.slice(lastNewlineIndex + 1);

    // Split by lines, handling different line endings
    const lines = completeData.split(/\r\n|\r|\n/);

    for (const line of lines) {
      this.lineNumber++;

      // Skip lines at beginning
      if (this.lineNumber <= skipLines) {
        continue;
      }

      // FastMode: always auto-skip truly empty lines
      if (line === "") {
        continue;
      }

      // Split by delimiter (fast path - no quote detection)
      const row = line.split(this.delimiter).map(this.trimField);

      if (this.shouldSkipRow(row, shouldSkipEmpty)) {
        continue;
      }

      // Process completed row (handles headers, skipRows, column validation, maxRows)
      if (!this.processCompletedRow(row, pendingRows)) {
        this.processPendingRows(pendingRows, callback);
        return;
      }
    }

    this.processPendingRows(pendingRows, callback);
  }

  private buildRow(rawRow: string[]): Row {
    const { dynamicTyping } = this.options;

    if (this.options.headers && this.headerRow) {
      const obj: Record<string, string> = {};
      for (let index = 0; index < this.headerRow.length; index++) {
        const header = this.headerRow[index];
        obj[header] = rawRow[index] ?? "";
      }

      // Apply dynamicTyping if configured
      if (dynamicTyping) {
        return applyDynamicTypingToRow(obj, dynamicTyping) as Row;
      }

      return obj;
    }

    // Array mode
    if (dynamicTyping) {
      // For array mode, can only use dynamicTyping: true (all columns)
      // or per-column config if we happen to have headers
      return applyDynamicTypingToArrayRow(rawRow, this.headerRow, dynamicTyping) as Row;
    }

    return rawRow;
  }

  /**
   * Process a completed row (shared logic for standard and fast mode)
   * Returns true if processing should continue, false if maxRows reached
   */
  private processCompletedRow(row: string[], pendingRows: Row[]): boolean {
    const {
      headers = false,
      renameHeaders = false,
      maxRows,
      skipRows = 0,
      strictColumnHandling = false,
      discardUnmappedColumns = false
    } = this.options;

    // Handle headers - first row or provided array
    if (this.headerRow === null) {
      // Determine header source: function result, provided array, or first row
      let rawHeaders: string[];
      let skipCurrentRow = false;

      if (typeof headers === "function") {
        rawHeaders = headers(row).filter((h): h is string => h != null);
        skipCurrentRow = true;
      } else if (Array.isArray(headers)) {
        rawHeaders = headers.filter((h): h is string => h != null);
        skipCurrentRow = renameHeaders; // Skip first row only if renaming
      } else if (headers === true) {
        rawHeaders = row;
        skipCurrentRow = true;
      } else {
        // No headers mode - process row normally
        rawHeaders = [];
      }

      if (rawHeaders.length > 0) {
        this.headerRow = deduplicateHeaders(rawHeaders) as string[];
        this.emitHeaders();
        if (skipCurrentRow) {
          return true;
        }
      }
    }

    // Skip data rows
    if (this.skippedDataRows < skipRows) {
      this.skippedDataRows++;
      return true;
    }

    // Column validation
    if (this.headerRow && this.headerRow.length > 0) {
      const expectedCols = this.headerRow.length;
      const actualCols = row.length;

      if (actualCols !== expectedCols) {
        if (actualCols > expectedCols) {
          if (strictColumnHandling && !discardUnmappedColumns) {
            this.emit(
              "data-invalid",
              row,
              `Column mismatch: expected ${expectedCols}, got ${actualCols}`
            );
            return true;
          }
          row.length = expectedCols;
        } else {
          if (strictColumnHandling) {
            this.emit(
              "data-invalid",
              row,
              `Column mismatch: expected ${expectedCols}, got ${actualCols}`
            );
            return true;
          }
          while (row.length < expectedCols) {
            row.push("");
          }
        }
      }
    }

    this.rowCount++;
    if (maxRows !== undefined && this.rowCount > maxRows) {
      return false;
    }

    pendingRows.push(this.buildRow(row));
    return true;
  }

  private emitHeaders(): void {
    if (!this.headersEmitted) {
      this.headersEmitted = true;
      this.emit("headers", this.headerRow);
    }
  }

  /**
   * Check if a line should be skipped (comment or empty)
   */
  private shouldSkipRow(row: string[], shouldSkipEmpty: boolean): boolean {
    const { comment } = this.options;
    const firstField = row[0] ?? "";
    if (comment && firstField.startsWith(comment)) {
      return true;
    }

    if (!shouldSkipEmpty) {
      return false;
    }

    for (const field of row) {
      if (NON_WHITESPACE_RE.test(field)) {
        return false;
      }
    }
    return true;
  }

  private processPendingRows(rows: Row[], callback: (error?: Error | null) => void): void {
    if (rows.length === 0) {
      callback();
      return;
    }

    // If chunk callback aborted, skip processing
    if (this.chunkAborted) {
      callback();
      return;
    }

    // Fast path: no transform or validate, push all rows directly
    if (!this._rowTransform && !this._rowValidator) {
      let index = 0;

      const processNextBatch = (): void => {
        while (index < rows.length && !this.chunkAborted) {
          const row = rows[index++];

          if (this.options.chunk) {
            // Collect rows for chunk callback
            this.chunkBuffer.push(row);
            this.totalRowsProcessed++;

            // Check if chunk is full
            if (this.chunkBuffer.length >= this.chunkSize) {
              this.flushChunk(err => {
                if (err) {
                  callback(err);
                  return;
                }
                // If chunk callback aborted, stop processing
                if (this.chunkAborted) {
                  callback();
                  return;
                }
                // Continue processing remaining rows
                processNextBatch();
              });
              return;
            }
          } else {
            // No chunk callback, push directly
            this.pushBufferedRows([row]);
          }
        }
        callback();
      };

      processNextBatch();
      return;
    }

    // Slow path: process rows one by one with transform/validate
    let index = 0;
    const processNext = (): void => {
      if (index >= rows.length) {
        callback();
        return;
      }

      const row = rows[index++];
      this.transformAndValidateRow(row, (err, result) => {
        if (err) {
          callback(err);
          return;
        }

        if (result && result.isValid && result.row !== null) {
          if (this.options.chunk) {
            // Collect rows for chunk callback
            this.chunkBuffer.push(result.row);
            this.totalRowsProcessed++;

            // Check if chunk is full
            if (this.chunkBuffer.length >= this.chunkSize) {
              this.flushChunk(err2 => {
                if (err2) {
                  callback(err2);
                  return;
                }
                // Continue processing after chunk flush
                if (index % 1000 === 0) {
                  setTimeout(processNext, 0);
                } else {
                  processNext();
                }
              });
              return;
            }
          } else {
            // No chunk callback, push directly
            this.pushBufferedRows([result.row]);
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

  /**
   * Flush the current chunk buffer to the chunk callback
   */
  private flushChunk(callback: (error?: Error | null) => void): void {
    if (this.chunkBuffer.length === 0 || !this.options.chunk) {
      callback();
      return;
    }

    const chunkRowCount = this.chunkBuffer.length;
    const cursor = this.totalRowsProcessed - chunkRowCount;

    const meta: ChunkMeta = {
      cursor,
      rowCount: chunkRowCount,
      isFirstChunk: this.isFirstChunk,
      isLastChunk: false
    };

    this.isFirstChunk = false;

    // Take rows and clear buffer before callback
    const rows = this.chunkBuffer;
    this.chunkBuffer = [];

    // Push rows to stream, then invoke callback
    this.pushBufferedRows(rows);
    this.invokeChunkCallback(rows, meta, callback);
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
  private escapeFormulae: boolean;
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
    this.escapeFormulae = options.escapeFormulae ?? false;
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

    let str =
      typeof value === "number" ? formatNumberForCsv(value, this.decimalSeparator) : String(value);

    // Escape formulae to prevent CSV injection (OWASP recommendation)
    if (this.escapeFormulae && startsWithFormulaChar(str)) {
      str = "\t" + str;
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
