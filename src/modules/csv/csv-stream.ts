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
  ChunkMeta,
  TypeTransformMap,
  RecordInfo
} from "@csv/csv-core";
import { isSyncTransform, isSyncValidate, makeTrimField, processColumns } from "@csv/csv-core";
import {
  detectDelimiter,
  stripBom,
  normalizeQuoteOption,
  normalizeEscapeOption
} from "@csv/utils/detect";
import {
  createFormatRegex,
  createQuoteLookup,
  formatRowWithLookup,
  type CsvFormatRegex,
  type QuoteColumnConfig,
  type QuoteLookupFn
} from "@csv/utils/format";
import { extractRowValues, detectRowKeys } from "@csv/utils/row";
import { applyDynamicTypingToRow, applyDynamicTypingToArrayRow } from "@csv/utils/dynamic-typing";
import {
  processHeaders,
  validateAndAdjustColumns,
  isEmptyRow as isEmptyRowUtil,
  isCommentRow,
  hasAllEmptyValues,
  convertRowToObject,
  filterValidHeaders,
  LINE_SPLIT_REGEX,
  createOnSkipHandler,
  type CsvSkipError
} from "@csv/utils/parse";

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
  // Original (non-deduplicated) headers for groupColumnsByName support
  private originalHeaders: string[] | null = null;
  private headersEmitted: boolean = false;
  private delimiter: string;
  private quote: string;
  private escape: string;
  private quoteEnabled: boolean;
  private fastMode: boolean;
  private relaxQuotes: boolean;
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
  // toLine support
  private toLineReached: boolean = false;
  // info/raw support
  private infoOption: boolean = false;
  private rawOption: boolean = false;
  private dataRowIndex: number = 0; // 0-based index of data rows (excluding header)
  private totalBytesProcessed: number = 0; // Total bytes processed so far
  private currentRowStartLine: number = 0; // 1-based line number where current row started
  private currentRowStartBytes: number = 0; // Byte offset where current row started
  private currentFieldQuoted: boolean = false; // Whether current field started with a quote
  private currentRowQuoted: boolean[] = []; // Quote status for each field in current row
  private currentRawRow: string = ""; // Raw string of current row
  // Cached onSkip handler
  private invokeOnSkip:
    | ((error: CsvSkipError, record: string[] | null, line: number) => void)
    | null = null;

  constructor(options: CsvParseOptions = {}) {
    super({ objectMode: options.objectMode !== false });
    this.options = options;
    this.chunkSize = options.chunkSize ?? 1000;

    // Reuse a single decoder instance and enable streaming decode to correctly handle
    // multi-byte characters split across chunks.
    this.decoder = new TextDecoder();

    // Use centralized normalization utilities
    const { enabled: quoteEnabled, char: quote } = normalizeQuoteOption(options.quote);
    this.quoteEnabled = quoteEnabled;
    this.quote = quote;
    const escapeNormalized = normalizeEscapeOption(options.escape, quote);
    // When quoting is enabled, fall back to quote char if escape was disabled (RFC 4180)
    this.escape = quoteEnabled ? escapeNormalized.char || quote : escapeNormalized.char;

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

    // Relax quotes - allow unescaped quotes mid-field
    this.relaxQuotes = options.relaxQuotes ?? false;

    // Pre-compute trim function for performance
    const { trim = false, ltrim = false, rtrim = false } = options;
    this.trimField = makeTrimField(trim, ltrim, rtrim);

    // Cache maxRowBytes for hot path performance
    this.maxRowBytes = options.maxRowBytes;

    // Info/raw options
    this.infoOption = options.info ?? false;
    this.rawOption = options.raw ?? false;
    // Initialize row tracking for info option
    if (this.infoOption) {
      this.currentRowStartLine = 1;
      this.currentRowStartBytes = 0;
    }

    // Cache onSkip handler for performance
    this.invokeOnSkip = createOnSkipHandler(options.onSkip);
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
    // If chunk callback aborted parsing or toLine reached, skip all further processing
    if (this.chunkAborted || this.toLineReached) {
      callback();
      return;
    }

    try {
      const data = typeof chunk === "string" ? chunk : this.decoder.decode(chunk, { stream: true });
      this.buffer += data;

      // Apply beforeFirstChunk on first chunk
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
    // If chunk callback aborted parsing or toLine reached, skip flush
    if (this.chunkAborted || this.toLineReached) {
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
    // If toLine was reached, don't process remaining data
    if (this.toLineReached) {
      callback();
      return;
    }

    // In fastMode, parsing is line-based and does not use currentField/currentRow.
    // Flush any remaining buffer as a final line when there's no trailing newline.
    if (this.fastMode) {
      this.flushFastModeRemainder(callback);
      return;
    }

    // Process any remaining data without a trailing newline.
    if (this.currentFieldLength !== 0 || this.currentRow.length > 0) {
      // Check toLine for the final row
      const { toLine } = this.options;
      this.lineNumber++;
      if (toLine !== undefined && this.lineNumber > toLine) {
        this.toLineReached = true;
        callback();
        return;
      }

      this.currentRow.push(this.completeField());
      // Use the same row processing path as normal rows for chunk callback support
      const row = this.buildRow(this.currentRow);
      this.currentRow = [];
      this.currentRowBytes = 0;
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

    const { skipLines = 0, skipEmptyLines = false, ignoreEmpty = false, toLine } = this.options;
    const shouldSkipEmpty = skipEmptyLines || ignoreEmpty;

    this.lineNumber++;

    // Check toLine - stop parsing at specified line number
    if (toLine !== undefined && this.lineNumber > toLine) {
      this.toLineReached = true;
      callback();
      return;
    }

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

  /**
   * Complete current field and track quoted status for info option
   */
  private completeField(): string {
    const value = this.trimField(this.takeCurrentField());
    if (this.infoOption) {
      this.currentRowQuoted.push(this.currentFieldQuoted);
      this.currentFieldQuoted = false;
    }
    return value;
  }

  /**
   * Reset info state for next row (used when skipping rows or after processing)
   */
  private resetInfoState(nextByteOffset: number): void {
    if (this.infoOption) {
      this.currentRowQuoted = [];
      this.currentRowStartLine = this.lineNumber + 1;
      this.currentRowStartBytes = nextByteOffset;
    }
    if (this.rawOption) {
      this.currentRawRow = "";
    }
  }

  /**
   * Append character to raw row tracking
   */
  private appendToRaw(char: string): void {
    if (this.rawOption) {
      this.currentRawRow += char;
    }
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
    const startByteOffset = this.totalBytesProcessed;

    while (i < len) {
      const char = this.buffer[i];

      if (this.inQuotes && this.quoteEnabled) {
        // Track raw row data for quoted fields
        this.appendToRaw(char);

        if (this.escape && char === this.escape && this.buffer[i + 1] === this.quote) {
          this.appendToField(this.quote);
          this.appendToRaw(this.buffer[i + 1]);
          i += 2;
        } else if (char === this.quote) {
          // Check if this is truly end of quoted field or if relaxQuotes allows continuation
          const nextChar = this.buffer[i + 1];
          if (
            this.relaxQuotes &&
            nextChar !== undefined &&
            nextChar !== this.delimiter &&
            nextChar !== "\n" &&
            nextChar !== "\r"
          ) {
            // relaxQuotes: quote mid-field, treat as literal
            this.appendToField(char);
            i++;
          } else {
            this.inQuotes = false;
            i++;
          }
        } else if (i === len - 1) {
          // Need more data - preserve buffer from current position
          // Remove the char we just added to raw since it will be re-processed
          if (this.rawOption && this.currentRawRow.length > 0) {
            this.currentRawRow = this.currentRawRow.slice(0, -1);
          }
          this.buffer = this.buffer.slice(i);
          this.totalBytesProcessed = startByteOffset + i;
          this.processPendingRows(pendingRows, callback);
          return;
        } else if (char === "\r") {
          // Normalize CRLF to LF inside quoted fields
          if (this.buffer[i + 1] === "\n") {
            this.appendToRaw(this.buffer[i + 1]);
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
        // Track raw row data for unquoted fields (NOT newlines)
        if (char !== "\n" && char !== "\r") {
          this.appendToRaw(char);
        }

        if (this.quoteEnabled && char === this.quote && this.currentFieldLength === 0) {
          this.inQuotes = true;
          if (this.infoOption) {
            this.currentFieldQuoted = true;
          }
          i++;
        } else if (this.quoteEnabled && char === this.quote && this.relaxQuotes) {
          // relaxQuotes: quote mid-field (not at start), treat as literal
          this.appendToField(char);
          i++;
        } else if (char === this.delimiter) {
          this.currentRow.push(this.completeField());
          i++;
        } else if (char === "\n" || char === "\r") {
          // Handle \r\n (don't track in raw - newlines excluded from raw)
          if (char === "\r" && this.buffer[i + 1] === "\n") {
            i++;
          }

          this.currentRow.push(this.completeField());
          this.lineNumber++;
          const nextByteOffset = startByteOffset + i + 1;

          // Check toLine - stop parsing at specified line number
          const { toLine } = this.options;
          if (toLine !== undefined && this.lineNumber > toLine) {
            this.toLineReached = true;
            this.buffer = "";
            this.totalBytesProcessed = nextByteOffset;
            this.processPendingRows(pendingRows, callback);
            return;
          }

          // Skip lines at beginning
          if (this.lineNumber <= skipLines) {
            this.currentRow = [];
            this.currentRowBytes = 0;
            this.resetInfoState(nextByteOffset);
            i++;
            continue;
          }

          // Skip comment/empty lines, also skips delimiter-only rows
          if (this.shouldSkipRow(this.currentRow, shouldSkipEmpty)) {
            this.currentRow = [];
            this.currentRowBytes = 0;
            this.resetInfoState(nextByteOffset);
            i++;
            continue;
          }

          // Process completed row (handles headers, skipRows, column validation, maxRows)
          const rowToProcess = this.currentRow;
          this.currentRow = [];
          this.currentRowBytes = 0;
          if (!this.processCompletedRow(rowToProcess, pendingRows)) {
            this.buffer = "";
            this.totalBytesProcessed = nextByteOffset;
            this.processPendingRows(pendingRows, callback);
            return;
          }
          this.resetInfoState(nextByteOffset);

          i++;
        } else {
          this.appendToField(char);
          i++;
        }
      }
    }

    this.buffer = "";
    this.totalBytesProcessed = startByteOffset + len;
    this.processPendingRows(pendingRows, callback);
  }

  /**
   * Fast mode buffer processing - skips quote detection, splits directly by delimiter
   */
  private processBufferFastMode(
    callback: (error?: Error | null) => void,
    shouldSkipEmpty: boolean | "greedy"
  ): void {
    const { skipLines = 0 } = this.options;
    const pendingRows: Row[] = [];
    const startByteOffset = this.totalBytesProcessed;

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

    // Split by lines using pre-compiled regex for all line endings
    const lines = completeData.split(LINE_SPLIT_REGEX);

    let currentByteOffset = startByteOffset;

    for (const line of lines) {
      const lineByteLength = line.length + 1; // +1 for newline char
      this.lineNumber++;

      // Check toLine - stop parsing at specified line number
      const { toLine } = this.options;
      if (toLine !== undefined && this.lineNumber > toLine) {
        this.toLineReached = true;
        this.totalBytesProcessed = currentByteOffset;
        this.processPendingRows(pendingRows, callback);
        return;
      }

      // Skip lines at beginning
      if (this.lineNumber <= skipLines) {
        currentByteOffset += lineByteLength;
        continue;
      }

      // FastMode: always auto-skip truly empty lines
      if (line === "") {
        currentByteOffset += lineByteLength;
        continue;
      }

      // Set up info tracking state before processing row
      if (this.infoOption) {
        this.currentRowStartLine = this.lineNumber;
        this.currentRowStartBytes = currentByteOffset;
      }
      if (this.rawOption) {
        this.currentRawRow = line;
      }

      // Split by delimiter (fast path - no quote detection)
      const row = line.split(this.delimiter).map(this.trimField);

      // In fast mode, no fields are quoted
      if (this.infoOption) {
        this.currentRowQuoted = new Array(row.length).fill(false);
      }

      if (this.shouldSkipRow(row, shouldSkipEmpty)) {
        currentByteOffset += lineByteLength;
        continue;
      }

      // Process completed row (handles headers, skipRows, column validation, maxRows)
      if (!this.processCompletedRow(row, pendingRows)) {
        this.totalBytesProcessed = currentByteOffset + lineByteLength;
        this.processPendingRows(pendingRows, callback);
        return;
      }

      currentByteOffset += lineByteLength;
    }

    this.totalBytesProcessed = startByteOffset + completeData.length;
    this.processPendingRows(pendingRows, callback);
  }

  private buildRow(rawRow: string[]): Row {
    const { dynamicTyping, castDate, groupColumnsByName = false } = this.options;

    let record: Record<string, unknown> | unknown[];

    if (this.options.headers && this.headerRow) {
      // Use shared utility for row-to-object conversion
      const obj = convertRowToObject(
        rawRow,
        this.headerRow,
        this.originalHeaders,
        groupColumnsByName
      );

      // Apply dynamicTyping and/or castDate if configured
      if (dynamicTyping || castDate) {
        record = applyDynamicTypingToRow(
          obj as Record<string, string>,
          dynamicTyping || false,
          castDate
        );
      } else {
        record = obj;
      }
    } else {
      // Array mode
      if (dynamicTyping || castDate) {
        // For array mode, can only use dynamicTyping: true (all columns)
        // or per-column config if we happen to have headers
        record = applyDynamicTypingToArrayRow(
          rawRow,
          this.headerRow,
          dynamicTyping || false,
          castDate
        );
      } else {
        record = rawRow;
      }
    }

    // Wrap with info if info option is enabled
    if (this.infoOption) {
      const info: RecordInfo = {
        index: this.dataRowIndex,
        line: this.currentRowStartLine,
        bytes: this.currentRowStartBytes,
        quoted: [...this.currentRowQuoted]
      };
      if (this.rawOption) {
        info.raw = this.currentRawRow;
      }
      this.dataRowIndex++;
      // Use unknown cast - when info: true, Row type is extended to RecordWithInfo
      return { record, info } as unknown as Row;
    }

    return record as Row;
  }

  /**
   * Process a completed row (shared logic for standard and fast mode)
   * Returns true if processing should continue, false if maxRows/toLine reached
   */
  private processCompletedRow(row: string[], pendingRows: Row[]): boolean {
    const {
      headers = false,
      renameHeaders = false,
      maxRows,
      skipRows = 0,
      strictColumnHandling = false,
      discardUnmappedColumns = false,
      skipRecordsWithError = false,
      relaxColumnCountLess = false,
      relaxColumnCountMore = false,
      groupColumnsByName = false
    } = this.options;

    // Handle headers - first row or provided array
    if (this.headerRow === null) {
      // Use shared utility for header processing
      const result = processHeaders(row, { headers, renameHeaders, groupColumnsByName }, null);

      if (result && result.headers.length > 0) {
        // Filter to only string headers for stream API
        this.headerRow = filterValidHeaders(result.headers);
        // Store original headers for groupColumnsByName support
        if (result.originalHeaders) {
          this.originalHeaders = filterValidHeaders(result.originalHeaders);
        }
        this.emitHeaders();
        if (result.skipCurrentRow) {
          return true;
        }
      } else if (!result && headers === false) {
        // No headers mode - process row normally (handled below)
      }
    }

    // Skip data rows
    if (this.skippedDataRows < skipRows) {
      this.skippedDataRows++;
      return true;
    }

    // Column validation using shared utility
    if (this.headerRow && this.headerRow.length > 0) {
      const expectedCols = this.headerRow.length;

      const validation = validateAndAdjustColumns(row, expectedCols, {
        strictColumnHandling,
        discardUnmappedColumns,
        relaxColumnCountLess,
        relaxColumnCountMore
      });

      if (!validation.isValid) {
        // If skipRecordsWithError is enabled, invoke onSkip and continue
        if (skipRecordsWithError) {
          this.invokeOnSkip?.(
            {
              code: validation.errorCode || "ParseError",
              message: validation.reason || "Column count mismatch"
            },
            row,
            this.lineNumber
          );
          return true;
        }
        this.emit("data-invalid", row, validation.reason!);
        return true;
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
  private shouldSkipRow(row: string[], shouldSkipEmpty: boolean | "greedy"): boolean {
    const { comment, skipRecordsWithEmptyValues = false } = this.options;
    // Use shared utilities for comment and empty row detection
    if (isCommentRow(row, comment)) {
      return true;
    }
    if (isEmptyRowUtil(row, shouldSkipEmpty)) {
      return true;
    }
    // Skip records where all values are empty strings
    if (skipRecordsWithEmptyValues && hasAllEmptyValues(row)) {
      return true;
    }
    return false;
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
  private options: CsvFormatOptions;
  private delimiter: string;
  private rowDelimiter: string;
  private alwaysQuote: boolean;
  private decimalSeparator: "." | ",";
  private escapeFormulae: boolean;
  private headerWritten: boolean = false;
  /** Keys to access data from source objects */
  private keys: string[] | null = null;
  /** Headers to write to output (may differ from keys) */
  private displayHeaders: string[] | null = null;
  private shouldWriteHeaders: boolean;
  /** Index of source row (before filtering), passed to transform.row */
  private sourceRowIndex: number = 0;
  /** Index of output data row (after filtering, excludes header), used for ctx.index */
  private outputRowIndex: number = 0;
  private transform_: TypeTransformMap | null = null;
  // Pre-compiled format regex using shared utility
  private formatRegex: CsvFormatRegex;
  // Pre-computed quote lookup functions for performance
  private quoteColumnsLookup: QuoteLookupFn;
  private quoteHeadersLookup: QuoteLookupFn;

  constructor(options: CsvFormatOptions = {}) {
    super({
      objectMode: options.objectMode !== false,
      writableObjectMode: options.objectMode !== false
    });
    this.options = options;

    this.delimiter = options.delimiter ?? ",";
    this.rowDelimiter = options.rowDelimiter ?? "\n";
    this.alwaysQuote = options.alwaysQuote ?? false;
    this.decimalSeparator = options.decimalSeparator ?? ".";
    this.escapeFormulae = options.escapeFormulae ?? false;
    // writeHeaders defaults to true when headers is provided
    this.shouldWriteHeaders = options.writeHeaders ?? true;

    // Pre-compile regex for performance using shared utility
    this.formatRegex = createFormatRegex({
      quote: options.quote ?? '"',
      delimiter: this.delimiter,
      escape: options.escape
    });

    // Pre-compute quote lookup functions for performance
    this.quoteColumnsLookup = createQuoteLookup(options.quoteColumns as QuoteColumnConfig);
    this.quoteHeadersLookup = createQuoteLookup(options.quoteHeaders as QuoteColumnConfig);

    // Process columns config (takes precedence over headers)
    const columnsConfig = processColumns(options.columns);
    if (columnsConfig) {
      this.keys = columnsConfig.keys;
      this.displayHeaders = columnsConfig.headers;
    } else if (Array.isArray(options.headers)) {
      this.keys = options.headers;
      this.displayHeaders = options.headers;
    }

    // Set up transform from options
    if (options.transform) {
      this.transform_ = options.transform;
    }
  }

  /**
   * Auto-detect keys/headers from a row (object or RowHashArray)
   */
  private detectHeadersFromRow(chunk: Row): void {
    const detectedKeys = detectRowKeys(chunk);
    if (detectedKeys.length > 0) {
      this.keys = detectedKeys;
      this.displayHeaders = detectedKeys;
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
        if (this.options.headers === true && !this.keys) {
          this.detectHeadersFromRow(chunk);
        }

        // Write headers if we should and have them
        if (this.shouldWriteHeaders && this.displayHeaders) {
          this.push(this.formatRow(this.displayHeaders, true));
        }
        this.headerWritten = true;
      }

      // Apply row-level transform if provided
      let processedChunk: Row | null = chunk;
      const sourceIndex = this.sourceRowIndex++;
      if (this.transform_?.row) {
        processedChunk = this.transform_.row(chunk, sourceIndex);
        if (processedChunk === null) {
          callback();
          return;
        }
      }

      this.formatAndPush(processedChunk);
      this.outputRowIndex++;
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  override _flush(callback: (error?: Error | null) => void): void {
    // Handle alwaysWriteHeaders with no data
    if (
      !this.headerWritten &&
      this.options.alwaysWriteHeaders &&
      this.displayHeaders &&
      this.shouldWriteHeaders
    ) {
      if (this.options.writeBOM) {
        this.push("\uFEFF");
      }
      this.push(this.formatRow(this.displayHeaders, true));
      this.headerWritten = true;
    }

    // Add trailing row delimiter if includeEndRowDelimiter is true
    // hasOutput = wrote header OR wrote any data row
    const hasOutput = (this.shouldWriteHeaders && this.displayHeaders) || this.outputRowIndex > 0;
    if (this.options.includeEndRowDelimiter && hasOutput) {
      this.push(this.rowDelimiter);
    }

    callback();
  }

  private formatAndPush(chunk: Row): void {
    const row = extractRowValues(chunk, this.keys);
    this.push(this.formatRow(row, false));
  }

  private formatRow(row: unknown[], isHeader: boolean = false): string {
    // Use pre-computed quote lookup for performance
    const quoteLookup = isHeader ? this.quoteHeadersLookup : this.quoteColumnsLookup;

    const formattedRow = formatRowWithLookup(row, this.formatRegex, {
      quoteLookup,
      delimiter: this.delimiter,
      headers: this.displayHeaders ?? undefined,
      isHeader,
      outputRowIndex: this.outputRowIndex,
      alwaysQuote: this.alwaysQuote,
      escapeFormulae: this.escapeFormulae,
      decimalSeparator: this.decimalSeparator,
      transform: this.transform_ ?? undefined
    });

    // Use row delimiter as prefix (except for first output)
    // First output = header row OR (no header AND first data row)
    const isFirstLine =
      isHeader || (!(this.shouldWriteHeaders && this.displayHeaders) && this.outputRowIndex === 0);
    return isFirstLine ? formattedRow : this.rowDelimiter + formattedRow;
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
export function createCsvFormatterStream(options: CsvFormatOptions = {}): CsvFormatterStream {
  return new CsvFormatterStream(options);
}
