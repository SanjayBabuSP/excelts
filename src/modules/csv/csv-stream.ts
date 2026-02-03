/**
 * CSV Streaming Support - Cross-Platform
 *
 * Provides true streaming CSV parsing and formatting using our cross-platform stream module.
 * Works identically in both Node.js and Browser environments.
 *
 * Uses shared parse-core for configuration, field building and row processing logic.
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
  RecordInfo,
  HeaderArray,
  CsvParseError
} from "./types";
import { isSyncTransform, isSyncValidate } from "./types";
import { detectDelimiter, stripBom } from "@csv/utils/detect";
import { createFormatConfig, formatRowWithLookup, type FormatConfig } from "@csv/format";
import { extractRowValues, detectRowKeys, processColumns } from "@csv/utils/row";
import { applyDynamicTypingToRow, applyDynamicTypingToArrayRow } from "@csv/utils/dynamic-typing";
import { convertRowToObject, filterValidHeaders } from "@csv/utils/parse";

// Import shared core functionality
import {
  type ParseConfig,
  type ParseState,
  DEFAULT_LINEBREAK_REGEX,
  sharedTextEncoder,
  createParseConfig,
  createParseState,
  appendToField as appendToFieldCore,
  takeCurrentField as takeCurrentFieldCore,
  processCompletedRow as processCompletedRowCore,
  shouldSkipRow as shouldSkipRowCore
} from "./parse-core";

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
  // -------------------------------------------------------------------------
  // Configuration & State (shared with parse-core)
  // -------------------------------------------------------------------------
  private options: CsvParseOptions;
  private parseConfig: ParseConfig;
  private parseState: ParseState;
  private parseErrors: CsvParseError[] = [];

  // -------------------------------------------------------------------------
  // Streaming-specific state (not in parse-core)
  // -------------------------------------------------------------------------
  private buffer: string = "";
  private decoder: TextDecoder;
  private _rowTransform: ((row: Row, cb: RowTransformCallback<Row>) => void) | null = null;
  private _rowValidator: ((row: Row, cb: RowValidateCallback) => void) | null = null;

  // Delimiter detection
  private autoDetectDelimiter: boolean = false;
  private delimiterDetected: boolean = false;

  // Chunk callback support
  private chunkBuffer: Row[] = [];
  private chunkSize: number;
  private totalRowsProcessed: number = 0;
  private isFirstChunk: boolean = true;
  private chunkAborted: boolean = false;

  // Pre-processing flags
  private beforeFirstChunkApplied: boolean = false;
  private bomStripped: boolean = false;

  // Stream control
  private toLineReached: boolean = false;
  private headersEmitted: boolean = false;
  private totalBytesProcessed: number = 0;

  constructor(options: CsvParseOptions = {}) {
    super({ objectMode: options.objectMode !== false });
    this.options = options;
    this.chunkSize = options.chunkSize ?? 1000;

    // Reuse a single decoder instance and enable streaming decode to correctly handle
    // multi-byte characters split across chunks.
    this.decoder = new TextDecoder();

    // Check if auto-detection is requested (delimiter === "")
    const delimiterOption = options.delimiter ?? ",";
    this.autoDetectDelimiter = delimiterOption === "";

    // Create unified config and state using parse-core factory
    const { config } = createParseConfig({ options });
    this.parseConfig = config;
    this.parseState = createParseState(config);

    // Apply transform/validate from options if provided
    if (options.transform) {
      this.transform(options.transform);
    }
    if (options.validate) {
      this.validate(options.validate);
    }
  }

  // -------------------------------------------------------------------------
  // Convenience accessors for frequently used config/state values
  // -------------------------------------------------------------------------
  private get delimiter(): string {
    return this.parseConfig.delimiter;
  }
  private set delimiter(value: string) {
    this.parseConfig.delimiter = value;
  }
  private get quote(): string {
    return this.parseConfig.quote;
  }
  private get escape(): string {
    return this.parseConfig.escape;
  }
  private get quoteEnabled(): boolean {
    return this.parseConfig.quoteEnabled;
  }
  private get fastMode(): boolean {
    return this.parseConfig.fastMode;
  }
  private get relaxQuotes(): boolean {
    return this.parseConfig.relaxQuotes;
  }
  private get trimField(): (s: string) => string {
    return this.parseConfig.trimField;
  }
  private get maxRowBytes(): number | undefined {
    return this.parseConfig.maxRowBytes;
  }
  private get infoOption(): boolean {
    return this.parseConfig.infoOption;
  }
  private get rawOption(): boolean {
    return this.parseConfig.rawOption;
  }

  // State accessors
  private get lineNumber(): number {
    return this.parseState.lineNumber;
  }
  private set lineNumber(value: number) {
    this.parseState.lineNumber = value;
  }
  private get currentRow(): string[] {
    return this.parseState.currentRow;
  }
  private set currentRow(value: string[]) {
    this.parseState.currentRow = value;
  }
  private get currentRowBytes(): number {
    return this.parseState.currentRowBytes;
  }
  private set currentRowBytes(value: number) {
    this.parseState.currentRowBytes = value;
  }
  private get inQuotes(): boolean {
    return this.parseState.inQuotes;
  }
  private set inQuotes(value: boolean) {
    this.parseState.inQuotes = value;
  }
  private get currentFieldLength(): number {
    return this.parseState.currentFieldLength;
  }
  private get headerRow(): HeaderArray | null {
    return this.parseState.headerRow;
  }
  private get originalHeaders(): HeaderArray | null {
    return this.parseState.originalHeaders;
  }
  private get rowCount(): number {
    return this.parseState.dataRowCount;
  }
  private set rowCount(value: number) {
    this.parseState.dataRowCount = value;
  }
  private get skippedDataRows(): number {
    return this.parseState.skippedDataRows;
  }
  private set skippedDataRows(value: number) {
    this.parseState.skippedDataRows = value;
  }
  private get currentRowStartLine(): number {
    return this.parseState.currentRowStartLine;
  }
  private set currentRowStartLine(value: number) {
    this.parseState.currentRowStartLine = value;
  }
  private get currentRowStartBytes(): number {
    return this.parseState.currentRowStartBytes;
  }
  private set currentRowStartBytes(value: number) {
    this.parseState.currentRowStartBytes = value;
  }
  private get currentFieldQuoted(): boolean {
    return this.parseState.currentFieldQuoted;
  }
  private set currentFieldQuoted(value: boolean) {
    this.parseState.currentFieldQuoted = value;
  }
  private get currentRowQuoted(): boolean[] {
    return this.parseState.currentRowQuoted;
  }
  private set currentRowQuoted(value: boolean[]) {
    this.parseState.currentRowQuoted = value;
  }
  private get currentRawRow(): string {
    return this.parseState.currentRawRow;
  }
  private set currentRawRow(value: string) {
    this.parseState.currentRawRow = value;
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
          const result = validateFunction(row as T);
          if (typeof result === "boolean") {
            cb(null, result);
          } else {
            cb(null, result.isValid, result.reason);
          }
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
      // Defer detection if buffer only contains comments/empty lines
      if (this.autoDetectDelimiter && !this.delimiterDetected) {
        // Quick check: find first non-comment, non-empty line without full split
        const comment = this.options.comment;
        let hasDataLine = false;
        let start = 0;
        const bufLen = this.buffer.length;

        while (start < bufLen) {
          // Find end of line
          let end = start;
          while (end < bufLen && this.buffer[end] !== "\n" && this.buffer[end] !== "\r") {
            end++;
          }

          const line = this.buffer.slice(start, end).trim();
          if (line !== "" && (!comment || !line.startsWith(comment))) {
            hasDataLine = true;
            break;
          }

          // Skip past newline(s)
          start = end;
          if (start < bufLen && this.buffer[start] === "\r") {
            start++;
          }
          if (start < bufLen && this.buffer[start] === "\n") {
            start++;
          }
          if (start === end) {
            break;
          } // No progress, avoid infinite loop
        }

        if (hasDataLine) {
          const shouldSkipEmpty = this.options.skipEmptyLines || this.options.ignoreEmpty;
          this.delimiter = detectDelimiter(
            this.buffer,
            this.quote || '"',
            this.options.delimitersToGuess,
            this.options.comment,
            shouldSkipEmpty
          );
          this.delimiterDetected = true;
          // Emit delimiter event so consumers can know which delimiter was detected
          this.emit("delimiter", this.delimiter);
        }
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
      // Process through the same path as normal rows for proper validation and onSkip handling
      const pendingRows: Row[] = [];
      if (!this.processCompletedRow(this.currentRow, pendingRows)) {
        this.currentRow = [];
        this.currentRowBytes = 0;
        this.processPendingRows(pendingRows, callback);
        return;
      }
      this.currentRow = [];
      this.currentRowBytes = 0;
      this.processPendingRows(pendingRows, callback);
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

    // Track row bytes for maxRowBytes limit (use real UTF-8 byte count)
    if (this.maxRowBytes !== undefined) {
      this.currentRowBytes += sharedTextEncoder.encode(text).length;
      if (this.currentRowBytes > this.maxRowBytes) {
        throw new Error(`Row exceeds the maximum size of ${this.maxRowBytes} bytes`);
      }
    }

    // Use shared core logic directly on parseState
    appendToFieldCore(this.parseState, text);
  }

  private takeCurrentField(): string {
    if (this.currentFieldLength === 0) {
      return "";
    }
    return takeCurrentFieldCore(this.parseState);
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
          // Handle CRLF boundary: if \r is at end of buffer, wait for next chunk
          // to see if \n follows (CRLF split across chunks)
          if (char === "\r" && i === len - 1) {
            // Keep \r in buffer for next chunk, preserve current parsing state
            this.buffer = this.buffer.slice(i);
            this.totalBytesProcessed = startByteOffset + i;
            this.processPendingRows(pendingRows, callback);
            return;
          }
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
    const lines = completeData.split(DEFAULT_LINEBREAK_REGEX);

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

  private buildRow(rawRow: string[], info?: RecordInfo): Row {
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
          this.headerRow ? filterValidHeaders(this.headerRow) : null,
          dynamicTyping || false,
          castDate
        );
      } else {
        record = rawRow;
      }
    }

    // Wrap with info if info option is enabled
    if (this.infoOption) {
      if (!info) {
        // Should not happen: parse-core provides info when infoOption is enabled.
        const fallback: RecordInfo = {
          index: 0,
          line: this.currentRowStartLine,
          bytes: this.currentRowStartBytes,
          quoted: [...this.currentRowQuoted],
          raw: this.rawOption ? this.currentRawRow : undefined
        };
        info = fallback;
      }
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
    // State is now unified via accessors - no manual sync needed
    const result = processCompletedRowCore(
      row,
      this.parseState,
      this.parseConfig,
      this.parseErrors,
      this.lineNumber
    );

    // Emit headers event when headers become available
    this.emitHeaders();

    // Column mismatch reporting (stream API) - emit event when reason is provided
    if (result.reason) {
      this.emit("data-invalid", row, result.reason);
    }

    if (result.stop) {
      return false;
    }

    if (result.skipped) {
      return true;
    }

    if (result.row) {
      pendingRows.push(this.buildRow(result.row, result.info));
    }
    return true;
  }

  private emitHeaders(): void {
    if (!this.headersEmitted && this.headerRow) {
      this.headersEmitted = true;
      this.emit("headers", filterValidHeaders(this.headerRow));
    }
  }

  /**
   * Check if a line should be skipped (comment or empty)
   */
  private shouldSkipRow(row: string[], shouldSkipEmpty: boolean | "greedy"): boolean {
    // Delegate to parse-core to keep sync/stream behavior aligned.
    // Note: row passed here is already split into fields.
    return shouldSkipRowCore(
      row,
      this.parseConfig.comment,
      shouldSkipEmpty,
      this.parseConfig.skipRecordsWithEmptyValues
    );
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
  /** Unified format configuration (shared with batch formatter) */
  private formatConfig: FormatConfig;
  private headerWritten: boolean = false;
  /** Keys to access data from source objects */
  private keys: string[] | null = null;
  /** Headers to write to output (may differ from keys) */
  private displayHeaders: string[] | null = null;
  /** Index of source row (before filtering), passed to transform.row */
  private sourceRowIndex: number = 0;
  /** Index of output data row (after filtering, excludes header), used for ctx.index */
  private outputRowIndex: number = 0;

  constructor(options: CsvFormatOptions = {}) {
    super({
      objectMode: options.objectMode !== false,
      writableObjectMode: options.objectMode !== false
    });
    this.options = options;

    // Use shared config factory (same as batch formatter)
    this.formatConfig = createFormatConfig(options);

    // Process columns config (takes precedence over headers)
    const columnsConfig = processColumns(options.columns);
    if (columnsConfig) {
      this.keys = columnsConfig.keys;
      this.displayHeaders = columnsConfig.headers;
    } else if (Array.isArray(options.headers)) {
      this.keys = options.headers;
      this.displayHeaders = options.headers;
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
      if (!this.headerWritten && this.formatConfig.bom) {
        this.push("\uFEFF");
      }

      // Handle header writing on first row
      if (!this.headerWritten) {
        // Auto-detect headers from first row if needed
        if (this.options.headers === true && !this.keys) {
          this.detectHeadersFromRow(chunk);
        }

        // Write headers if we should and have them
        if (this.formatConfig.writeHeaders && this.displayHeaders) {
          this.push(this.formatRow(this.displayHeaders, true));
        }
        this.headerWritten = true;
      }

      // Apply row-level transform if provided
      let processedChunk: Row | null = chunk;
      const sourceIndex = this.sourceRowIndex++;
      if (this.formatConfig.transform?.row) {
        processedChunk = this.formatConfig.transform.row(chunk, sourceIndex);
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
    // Handle writeHeaders: true with no data - still write headers
    if (!this.headerWritten && this.displayHeaders && this.formatConfig.writeHeaders) {
      if (this.formatConfig.bom) {
        this.push("\uFEFF");
      }
      this.push(this.formatRow(this.displayHeaders, true));
      this.headerWritten = true;
    }

    // Add trailing newline if trailingNewline is true
    // hasOutput = wrote header OR wrote any data row
    const hasOutput =
      (this.formatConfig.writeHeaders && this.displayHeaders) || this.outputRowIndex > 0;
    if (this.formatConfig.trailingNewline && hasOutput) {
      this.push(this.formatConfig.rowDelimiter);
    }

    callback();
  }

  private formatAndPush(chunk: Row): void {
    const row = extractRowValues(chunk, this.keys);
    this.push(this.formatRow(row, false));
  }

  private formatRow(row: unknown[], isHeader: boolean = false): string {
    const cfg = this.formatConfig;
    // Use pre-computed quote lookup for performance
    const quoteLookup = isHeader ? cfg.shouldQuoteHeader : cfg.shouldQuoteColumn;

    const formattedRow = formatRowWithLookup(row, cfg.regex, {
      quoteLookup,
      delimiter: cfg.delimiter,
      headers: this.displayHeaders ?? undefined,
      isHeader,
      outputRowIndex: this.outputRowIndex,
      quoteAll: cfg.quoteAll,
      escapeFormulae: cfg.escapeFormulae,
      decimalSeparator: cfg.decimalSeparator,
      transform: cfg.transform
    });

    // Use row delimiter as prefix (except for first output)
    // First output = header row OR (no header AND first data row)
    const isFirstLine =
      isHeader || (!(cfg.writeHeaders && this.displayHeaders) && this.outputRowIndex === 0);
    return isFirstLine ? formattedRow : cfg.rowDelimiter + formattedRow;
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
