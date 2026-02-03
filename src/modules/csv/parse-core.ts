/**
 * CSV Parse Core
 *
 * Shared low-level parsing primitives used by both sync (parse-engine.ts)
 * and streaming (csv-stream.ts) parsers to avoid code duplication.
 *
 * This module provides:
 * - Unified parse state management
 * - ParseConfig factory for consistent configuration
 * - Field building with large-field optimization
 * - Row completion and info tracking
 * - Common row processing logic
 * - Shared TextEncoder instance for performance
 */

import type { CsvParseOptions, CsvParseError, HeaderArray, RecordInfo } from "./types";
import type { createOnSkipHandler } from "./utils/parse";
import {
  processHeaders,
  validateAndAdjustColumns,
  convertRowToObject,
  createOnSkipHandler as createOnSkipHandlerImpl
} from "./utils/parse";
import { isEmptyRow, hasAllEmptyValues } from "./utils/row";
import { applyDynamicTypingToRow } from "./utils/dynamic-typing";
import {
  normalizeQuoteOption,
  normalizeEscapeOption,
  detectDelimiter,
  detectLinebreak,
  stripBom
} from "./utils/detect";

// Import shared constants from centralized location (avoids circular deps)
import {
  LARGE_FIELD_THRESHOLD,
  DEFAULT_LINEBREAK_REGEX,
  sharedTextEncoder,
  getUtf8ByteLength
} from "./constants";

// Re-export for backward compatibility
export { LARGE_FIELD_THRESHOLD, DEFAULT_LINEBREAK_REGEX, sharedTextEncoder, getUtf8ByteLength };

// =============================================================================
// Constants (module-specific)
// =============================================================================

/**
 * Threshold for flushing accumulated parts in array mode
 */
const FIELD_PART_FLUSH_THRESHOLD = 512;

// =============================================================================
// Types
// =============================================================================

/**
 * Minimal state required for field building operations.
 * Used by streaming parser which manages its own properties.
 */
interface FieldState {
  currentField: string;
  currentFieldParts: string[] | null;
  currentFieldLength: number;
}

/**
 * Resolved parsing configuration (after option normalization)
 */
export interface ParseConfig {
  delimiter: string;
  linebreak: string;
  /** Pre-compiled regex for line splitting (used in fast mode) */
  linebreakRegex: RegExp | string;
  quote: string;
  escape: string;
  quoteEnabled: boolean;
  trimField: (s: string) => string;
  shouldSkipEmpty: boolean | "greedy";
  skipLines: number;
  skipRows: number;
  maxRows?: number;
  toLine?: number;
  maxRowBytes?: number;
  comment?: string;
  fastMode: boolean;
  relaxQuotes: boolean;
  strictColumnHandling: boolean;
  discardUnmappedColumns: boolean;
  relaxColumnCountLess: boolean;
  relaxColumnCountMore: boolean;
  groupColumnsByName: boolean;
  skipRecordsWithError: boolean;
  skipRecordsWithEmptyValues: boolean;
  infoOption: boolean;
  rawOption: boolean;
  dynamicTyping: CsvParseOptions["dynamicTyping"];
  castDate: CsvParseOptions["castDate"];
  invokeOnSkip: ReturnType<typeof createOnSkipHandler>;
  headers: CsvParseOptions["headers"];
  renameHeaders: boolean;
}

/**
 * Mutable parsing state - shared between sync and streaming parsers
 */
export interface ParseState {
  // Field/row building
  currentRow: string[];
  currentField: string;
  /** For large fields, we accumulate parts to avoid string concat overhead */
  currentFieldParts: string[] | null;
  /** Track current field length for threshold check */
  currentFieldLength: number;
  inQuotes: boolean;
  currentRowBytes: number;

  // Position tracking
  lineNumber: number;
  position: number;

  // Data row tracking
  dataRowCount: number;
  skippedDataRows: number;
  truncated: boolean;

  // Header state
  headerRow: HeaderArray | null;
  originalHeaders: HeaderArray | null;
  useHeaders: boolean;
  headerRowProcessed: boolean;
  renamedHeadersForMeta: Record<string, string> | null;

  // Info tracking (for info/raw options)
  currentRowStartLine: number;
  currentRowStartBytes: number;
  currentFieldQuoted: boolean;
  currentRowQuoted: boolean[];
  currentRawRow: string;
}

/**
 * Result of processing a single row
 */
export interface RowProcessResult {
  /** Whether to stop parsing (maxRows reached) */
  stop: boolean;
  /** Whether row was skipped (invalid, filtered, etc.) */
  skipped: boolean;
  /** Processed row data (if not skipped) */
  row?: string[];
  /** Record info (if info option enabled) */
  info?: RecordInfo;
  /** Error that occurred (if any) */
  error?: CsvParseError;
  /** Reason for skipping/invalidating the row */
  reason?: string;
}

// =============================================================================
// Configuration Factory
// =============================================================================

/**
 * Options for creating ParseConfig.
 * - For batch parsing: provide `input` for auto-detection and BOM stripping
 * - For streaming: omit `input` (will use defaults, detection handled separately)
 */
interface CreateParseConfigOptions {
  /** Raw input string (for batch parsing with auto-detection) */
  input?: string;
  /** CSV parse options */
  options: CsvParseOptions;
  /** Override delimiter (for streaming after detection) */
  detectedDelimiter?: string;
}

/**
 * Result of createParseConfig
 */
interface ParseConfigResult {
  /** Resolved parse configuration */
  config: ParseConfig;
  /** Processed input with BOM stripped and beforeFirstChunk applied (if input was provided) */
  processedInput?: string;
}

/**
 * Create a normalized ParseConfig from options.
 * This is the single source of truth for configuration normalization,
 * used by both sync (parse-engine.ts) and streaming (csv-stream.ts) parsers.
 *
 * @example Batch parsing
 * ```ts
 * const { config, processedInput } = createParseConfig({ input: csvString, options });
 * ```
 *
 * @example Streaming parsing
 * ```ts
 * const { config } = createParseConfig({ options });
 * // Later, after delimiter detection:
 * config.delimiter = detectedDelimiter;
 * ```
 */
export function createParseConfig(opts: CreateParseConfigOptions): ParseConfigResult {
  const { input, options, detectedDelimiter } = opts;
  const {
    delimiter: delimiterOption = ",",
    delimitersToGuess,
    newline: newlineOption = "",
    quote: quoteOption = '"',
    escape: escapeOption = '"',
    skipEmptyLines = false,
    ignoreEmpty = false,
    trim = false,
    ltrim = false,
    rtrim = false,
    headers = false,
    renameHeaders = false,
    comment,
    maxRows,
    toLine,
    skipLines = 0,
    skipRows = 0,
    strictColumnHandling = false,
    discardUnmappedColumns = false,
    relaxColumnCountLess = false,
    relaxColumnCountMore = false,
    groupColumnsByName = false,
    fastMode = false,
    dynamicTyping,
    castDate,
    beforeFirstChunk,
    info: infoOption = false,
    raw: rawOption = false,
    relaxQuotes = false,
    skipRecordsWithError = false,
    skipRecordsWithEmptyValues = false,
    onSkip,
    maxRowBytes
  } = options;

  // Process input if provided (batch mode)
  let processedInput: string | undefined;
  if (input !== undefined) {
    processedInput = input;

    // Apply beforeFirstChunk if provided
    if (beforeFirstChunk) {
      const result = beforeFirstChunk(processedInput);
      if (typeof result === "string") {
        processedInput = result;
      }
    }

    // Strip BOM
    processedInput = stripBom(processedInput);
  }

  const shouldSkipEmpty = skipEmptyLines || ignoreEmpty;

  // Normalize quote/escape
  const { enabled: quoteEnabled, char: quote } = normalizeQuoteOption(quoteOption);
  const escapeNormalized = normalizeEscapeOption(escapeOption, quote);
  const escape = quoteEnabled ? escapeNormalized.char || quote : escapeNormalized.char;

  // Determine delimiter
  let delimiter: string;
  if (detectedDelimiter !== undefined) {
    // Use externally detected delimiter (streaming mode)
    delimiter = detectedDelimiter;
  } else if (delimiterOption === "" && processedInput !== undefined) {
    // Auto-detect from input (batch mode)
    delimiter = detectDelimiter(
      processedInput,
      quote || '"',
      delimitersToGuess,
      comment,
      shouldSkipEmpty
    );
  } else if (delimiterOption === "") {
    // Streaming mode with auto-detect - use default, will be updated later
    delimiter = ",";
  } else {
    delimiter = delimiterOption;
  }

  // Determine linebreak
  const linebreak =
    newlineOption || (processedInput !== undefined ? detectLinebreak(processedInput) : "\n");

  // Pre-compile linebreak regex for fast mode
  const linebreakRegex =
    linebreak && linebreak !== "\n" && linebreak !== "\r\n" && linebreak !== "\r"
      ? linebreak
      : DEFAULT_LINEBREAK_REGEX;

  const config: ParseConfig = {
    delimiter,
    linebreak,
    linebreakRegex,
    quote,
    escape,
    quoteEnabled,
    trimField: makeTrimField(trim, ltrim, rtrim),
    shouldSkipEmpty,
    skipLines,
    skipRows,
    maxRows,
    toLine,
    maxRowBytes,
    comment,
    fastMode,
    relaxQuotes,
    strictColumnHandling,
    discardUnmappedColumns,
    relaxColumnCountLess,
    relaxColumnCountMore,
    groupColumnsByName,
    skipRecordsWithError,
    skipRecordsWithEmptyValues,
    infoOption,
    rawOption,
    dynamicTyping,
    castDate,
    invokeOnSkip: createOnSkipHandlerImpl(onSkip),
    headers,
    renameHeaders
  };

  return { config, processedInput };
}

// =============================================================================
// Trim Function Factory
// =============================================================================

/**
 * Create a trim function based on options
 */
function makeTrimField(trim: boolean, ltrim: boolean, rtrim: boolean): (s: string) => string {
  if (trim || (ltrim && rtrim)) {
    return (s: string) => s.trim();
  }
  if (ltrim) {
    return (s: string) => s.trimStart();
  }
  if (rtrim) {
    return (s: string) => s.trimEnd();
  }
  return (s: string) => s;
}

// =============================================================================
// State Management
// =============================================================================

/**
 * Create initial parse state with optional header configuration
 */
export function createParseState(
  config: Pick<
    ParseConfig,
    "headers" | "renameHeaders" | "groupColumnsByName" | "infoOption" | "rawOption"
  >
): ParseState {
  const state: ParseState = {
    currentRow: [],
    currentField: "",
    currentFieldParts: null,
    currentFieldLength: 0,
    inQuotes: false,
    currentRowBytes: 0,
    lineNumber: 0,
    position: 0,
    dataRowCount: 0,
    skippedDataRows: 0,
    truncated: false,
    headerRow: null,
    originalHeaders: null,
    useHeaders: false,
    headerRowProcessed: false,
    renamedHeadersForMeta: null,
    currentRowStartLine: config.infoOption ? 1 : 0,
    currentRowStartBytes: 0,
    currentFieldQuoted: false,
    currentRowQuoted: [],
    currentRawRow: ""
  };

  // Determine header mode
  const { headers, renameHeaders, groupColumnsByName } = config;
  if (headers === true) {
    state.useHeaders = true;
  } else if (Array.isArray(headers)) {
    const result = processHeaders([], { headers, renameHeaders, groupColumnsByName }, null);
    if (result) {
      state.headerRow = result.headers;
      state.originalHeaders = result.originalHeaders;
      state.renamedHeadersForMeta = result.renamedHeaders;
    }
    state.useHeaders = true;
    if (!renameHeaders) {
      state.headerRowProcessed = true;
    }
  } else if (typeof headers === "function") {
    state.useHeaders = true;
  }

  return state;
}

// =============================================================================
// Field Building Operations
// =============================================================================

/**
 * Append a character/string to the current field.
 * Uses array accumulation for large fields to avoid O(n²) string concat.
 */
export function appendToField(state: FieldState, char: string): void {
  const charLen = char.length;
  if (charLen === 0) {
    return;
  }

  state.currentFieldLength += charLen;

  // For large fields, switch to array-based accumulation
  if (state.currentFieldLength > LARGE_FIELD_THRESHOLD && state.currentFieldParts === null) {
    state.currentFieldParts = [state.currentField];
    state.currentField = char;
  } else if (state.currentFieldParts !== null) {
    // Already in array mode - periodically flush to parts array
    if (state.currentField.length > FIELD_PART_FLUSH_THRESHOLD) {
      state.currentFieldParts.push(state.currentField);
      state.currentField = char;
    } else {
      state.currentField += char;
    }
  } else {
    state.currentField += char;
  }
}

/**
 * Get the current field value and reset field state.
 * Handles both string and array accumulation modes.
 */
export function takeCurrentField(state: FieldState): string {
  if (state.currentFieldLength === 0) {
    return "";
  }

  let rawValue: string;
  if (state.currentFieldParts !== null) {
    state.currentFieldParts.push(state.currentField);
    rawValue = state.currentFieldParts.join("");
    state.currentFieldParts = null;
  } else {
    rawValue = state.currentField;
  }

  state.currentField = "";
  state.currentFieldLength = 0;
  return rawValue;
}

/**
 * Complete current field: take value, apply trim, track info
 */
export function completeField(
  state: ParseState,
  trimField: (s: string) => string,
  trackInfo: boolean
): string {
  const rawValue = takeCurrentField(state);
  const value = trimField(rawValue);

  if (trackInfo) {
    state.currentRowQuoted.push(state.currentFieldQuoted);
    state.currentFieldQuoted = false;
  }

  return value;
}

/**
 * Reset info state for next row
 */
export function resetInfoState(
  state: ParseState,
  trackInfo: boolean,
  trackRaw: boolean,
  nextLine: number,
  nextBytes: number
): void {
  if (trackInfo) {
    state.currentRowQuoted = [];
    state.currentRowStartLine = nextLine;
    state.currentRowStartBytes = nextBytes;
  }
  if (trackRaw) {
    state.currentRawRow = "";
  }
}

/**
 * Add bytes to row counter and check limit.
 * Uses optimized getUtf8ByteLength for accurate byte counting.
 */
export function addRowBytes(
  state: ParseState,
  text: string,
  maxRowBytes: number | undefined
): void {
  if (maxRowBytes === undefined) {
    return; // No limit, skip tracking entirely
  }
  state.currentRowBytes += getUtf8ByteLength(text);
  if (state.currentRowBytes > maxRowBytes) {
    throw new Error(`Row exceeds the maximum size of ${maxRowBytes} bytes`);
  }
}

// =============================================================================
// Row Processing
// =============================================================================

/**
 * Process headers from a row (first data row or configured headers)
 * Returns true if the row should be skipped (was used as headers)
 */
function processHeaderRow(
  row: string[],
  state: ParseState,
  config: Pick<ParseConfig, "headers" | "renameHeaders" | "groupColumnsByName">
): boolean {
  const result = processHeaders(
    row,
    {
      headers: config.headers as boolean | string[] | ((h: string[]) => HeaderArray),
      renameHeaders: config.renameHeaders,
      groupColumnsByName: config.groupColumnsByName
    },
    state.headerRow
  );

  if (result) {
    state.headerRow = result.headers;
    state.originalHeaders = result.originalHeaders;
    state.renamedHeadersForMeta = result.renamedHeaders;
    state.headerRowProcessed = true;
    return result.skipCurrentRow;
  }

  state.headerRowProcessed = true;
  return false;
}

/**
 * Validate row column count against headers
 * Returns error info if validation fails, null otherwise
 */
function validateRowColumns(
  row: string[],
  state: ParseState,
  config: Pick<
    ParseConfig,
    | "strictColumnHandling"
    | "discardUnmappedColumns"
    | "relaxColumnCountLess"
    | "relaxColumnCountMore"
  >
): {
  errorCode: "TooManyFields" | "TooFewFields";
  message: string;
  isValid: boolean;
  reason?: string;
} | null {
  if (!state.headerRow || state.headerRow.length === 0) {
    return null;
  }

  const expectedCols = state.headerRow.length;
  const actualCols = row.length;

  if (actualCols === expectedCols) {
    return null;
  }

  const validation = validateAndAdjustColumns(row, expectedCols, {
    strictColumnHandling: config.strictColumnHandling,
    discardUnmappedColumns: config.discardUnmappedColumns,
    relaxColumnCountLess: config.relaxColumnCountLess,
    relaxColumnCountMore: config.relaxColumnCountMore
  });

  if (validation.errorCode) {
    return {
      errorCode: validation.errorCode,
      message:
        validation.errorCode === "TooManyFields"
          ? `Too many fields: expected ${expectedCols}, found ${actualCols}`
          : `Too few fields: expected ${expectedCols}, found ${actualCols}`,
      isValid: validation.isValid,
      reason: validation.reason
    };
  }

  return null;
}

/**
 * Build record info for a completed row
 */
function buildRecordInfo(state: ParseState, dataRowIndex: number, includeRaw: boolean): RecordInfo {
  const info: RecordInfo = {
    index: dataRowIndex,
    line: state.currentRowStartLine,
    bytes: state.currentRowStartBytes,
    quoted: [...state.currentRowQuoted]
  };
  if (includeRaw) {
    info.raw = state.currentRawRow;
  }
  return info;
}

/**
 * Convert a raw row to an object record with optional dynamic typing
 */
export function rowToRecord(
  row: string[],
  state: ParseState,
  config: Pick<ParseConfig, "groupColumnsByName" | "dynamicTyping" | "castDate">
): Record<string, string | string[] | unknown> {
  if (state.headerRow) {
    let record: Record<string, string | string[] | unknown> = convertRowToObject(
      row,
      state.headerRow,
      state.originalHeaders,
      config.groupColumnsByName
    );
    if (config.dynamicTyping || config.castDate) {
      record = applyDynamicTypingToRow(
        record as Record<string, string>,
        config.dynamicTyping || false,
        config.castDate
      );
    }
    return record;
  }
  // No headers: use numeric indices as keys (O(n) instead of O(n²) reduce)
  const result: Record<number, string> = {};
  for (let i = 0; i < row.length; i++) {
    result[i] = row[i];
  }
  return result;
}

/**
 * Process a completed row through headers, validation, etc.
 * This is the core row processing logic shared between sync and streaming parsers.
 */
export function processCompletedRow(
  row: string[],
  state: ParseState,
  config: ParseConfig,
  errors: CsvParseError[],
  lineNumber: number
): RowProcessResult {
  // Header handling
  if (state.useHeaders && !state.headerRowProcessed) {
    const shouldSkip = processHeaderRow(row, state, config);
    if (shouldSkip) {
      return { stop: false, skipped: true };
    }
  }

  // Skip data rows
  if (state.skippedDataRows < config.skipRows) {
    state.skippedDataRows++;
    return { stop: false, skipped: true };
  }

  // Column validation
  const validationError = validateRowColumns(row, state, config);
  if (validationError) {
    const errorObj: CsvParseError = {
      code: validationError.errorCode,
      message: validationError.message,
      row: state.dataRowCount
    };
    errors.push(errorObj);

    if (!validationError.isValid) {
      if (config.skipRecordsWithError) {
        config.invokeOnSkip?.(
          { code: validationError.errorCode, message: validationError.reason || "Column mismatch" },
          row,
          lineNumber
        );
        return { stop: false, skipped: true };
      }
      if (config.strictColumnHandling) {
        // Include row and reason for invalidRows collection
        return {
          stop: false,
          skipped: true,
          row,
          error: errorObj,
          reason: validationError.reason || "Column mismatch"
        };
      }
    }
  }

  // Skip records with all empty values
  if (config.skipRecordsWithEmptyValues && hasAllEmptyValues(row)) {
    return { stop: false, skipped: true };
  }

  // Check maxRows BEFORE incrementing count
  if (config.maxRows !== undefined && state.dataRowCount >= config.maxRows) {
    state.truncated = true;
    return { stop: true, skipped: false };
  }

  state.dataRowCount++;

  // Build info if needed
  let info: RecordInfo | undefined;
  if (config.infoOption) {
    info = buildRecordInfo(state, state.dataRowCount - 1, config.rawOption);
  }

  return { stop: false, skipped: false, row, info };
}

/**
 * Check if a row should be skipped (comment or empty)
 */
export function shouldSkipRow(
  row: string[],
  comment: string | undefined,
  shouldSkipEmpty: boolean | "greedy",
  skipRecordsWithEmptyValues: boolean
): boolean {
  // Comment line check
  if (comment && row[0]?.startsWith(comment)) {
    return true;
  }
  // Empty row check
  if (isEmptyRow(row, shouldSkipEmpty)) {
    return true;
  }
  // All empty values check
  if (skipRecordsWithEmptyValues && hasAllEmptyValues(row)) {
    return true;
  }
  return false;
}

// =============================================================================
// Batch Parsing Functions (moved from parse-engine.ts)
// =============================================================================

/**
 * Resolve options into a normalized config object.
 * Convenience wrapper around createParseConfig that ensures processedInput is non-null.
 */
export function resolveParseConfig(
  input: string,
  options: CsvParseOptions
): { config: ParseConfig; processedInput: string } {
  const result = createParseConfig({ input, options });
  return {
    config: result.config,
    processedInput: result.processedInput!
  };
}

/**
 * Parse input using fast mode (no quote detection)
 */
export function* parseFastMode(
  input: string,
  config: ParseConfig,
  state: ParseState,
  errors: CsvParseError[]
): Generator<RowProcessResult, void, undefined> {
  // Use pre-compiled linebreak regex from config
  const lines = input.split(config.linebreakRegex);

  for (const line of lines) {
    state.lineNumber++;

    if (config.toLine !== undefined && state.lineNumber > config.toLine) {
      state.truncated = true;
      break;
    }
    if (state.lineNumber <= config.skipLines) {
      continue;
    }
    if (line === "") {
      continue;
    }

    // Check maxRowBytes in fastMode using optimized byte length calculation
    if (config.maxRowBytes !== undefined) {
      const lineBytes = getUtf8ByteLength(line);
      if (lineBytes > config.maxRowBytes) {
        throw new Error(`Row exceeds the maximum size of ${config.maxRowBytes} bytes`);
      }
    }

    if (config.infoOption) {
      state.currentRowStartLine = state.lineNumber;
    }
    if (config.rawOption) {
      state.currentRawRow = line;
    }

    const row = line.split(config.delimiter).map(config.trimField);

    if (config.infoOption) {
      state.currentRowQuoted = new Array(row.length).fill(false);
    }

    if (config.comment && row[0]?.startsWith(config.comment)) {
      continue;
    }
    if (config.shouldSkipEmpty && isEmptyRow(row, config.shouldSkipEmpty)) {
      continue;
    }

    const result = processCompletedRow(row, state, config, errors, state.lineNumber);
    if (result.stop) {
      yield result;
      return;
    }
    // Yield if not skipped, OR if skipped with an error (for invalidRows collection)
    if (!result.skipped || result.error) {
      yield result;
    }
    resetInfoState(state, config.infoOption, config.rawOption, state.lineNumber + 1, 0);
  }
}

/**
 * Parse input using standard RFC 4180 mode
 */
export function* parseStandardMode(
  input: string,
  config: ParseConfig,
  state: ParseState,
  errors: CsvParseError[]
): Generator<RowProcessResult, void, undefined> {
  const len = input.length;
  let i = 0;

  if (config.infoOption) {
    state.currentRowStartLine = 1;
    state.currentRowStartBytes = 0;
  }

  while (i < len) {
    const char = input[i];

    if (state.inQuotes && config.quoteEnabled) {
      if (config.rawOption) {
        state.currentRawRow += char;
      }

      if (config.escape && char === config.escape && input[i + 1] === config.quote) {
        appendToField(state, config.quote);
        addRowBytes(state, config.quote, config.maxRowBytes);
        if (config.rawOption) {
          state.currentRawRow += input[i + 1];
        }
        i += 2;
      } else if (char === config.quote) {
        const nextChar = input[i + 1];
        if (
          config.relaxQuotes &&
          nextChar !== undefined &&
          nextChar !== config.delimiter &&
          nextChar !== "\n" &&
          nextChar !== "\r"
        ) {
          appendToField(state, char);
          addRowBytes(state, char, config.maxRowBytes);
          i++;
        } else {
          state.inQuotes = false;
          i++;
        }
      } else if (char === "\r") {
        if (input[i + 1] === "\n") {
          if (config.rawOption) {
            state.currentRawRow += input[i + 1];
          }
          i++;
        } else {
          appendToField(state, "\n");
          addRowBytes(state, "\n", config.maxRowBytes);
          i++;
        }
      } else {
        appendToField(state, char);
        addRowBytes(state, char, config.maxRowBytes);
        i++;
      }
    } else {
      if (config.rawOption && char !== "\n" && char !== "\r") {
        state.currentRawRow += char;
      }

      if (config.quoteEnabled && char === config.quote && state.currentFieldLength === 0) {
        state.inQuotes = true;
        if (config.infoOption) {
          state.currentFieldQuoted = true;
        }
        i++;
      } else if (config.quoteEnabled && char === config.quote && config.relaxQuotes) {
        appendToField(state, char);
        addRowBytes(state, char, config.maxRowBytes);
        i++;
      } else if (char === config.delimiter) {
        state.currentRow.push(completeField(state, config.trimField, config.infoOption));
        addRowBytes(state, config.delimiter, config.maxRowBytes);
        i++;
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && input[i + 1] === "\n") {
          i++;
        }

        state.currentRow.push(completeField(state, config.trimField, config.infoOption));
        state.lineNumber++;
        const nextByteOffset = i + 1;

        if (config.toLine !== undefined && state.lineNumber > config.toLine) {
          state.truncated = true;
          break;
        }

        if (state.lineNumber <= config.skipLines) {
          state.currentRow = [];
          state.currentRowBytes = 0;
          resetInfoState(
            state,
            config.infoOption,
            config.rawOption,
            state.lineNumber + 1,
            nextByteOffset
          );
          i++;
          continue;
        }

        if (config.comment && state.currentRow[0]?.startsWith(config.comment)) {
          state.currentRow = [];
          state.currentRowBytes = 0;
          resetInfoState(
            state,
            config.infoOption,
            config.rawOption,
            state.lineNumber + 1,
            nextByteOffset
          );
          i++;
          continue;
        }

        const isEmpty = state.currentRow.length === 1 && state.currentRow[0] === "";
        if (
          config.shouldSkipEmpty &&
          (isEmpty || (config.shouldSkipEmpty === "greedy" && isEmptyRow(state.currentRow, true)))
        ) {
          state.currentRow = [];
          state.currentRowBytes = 0;
          resetInfoState(
            state,
            config.infoOption,
            config.rawOption,
            state.lineNumber + 1,
            nextByteOffset
          );
          i++;
          continue;
        }

        const result = processCompletedRow(
          state.currentRow,
          state,
          config,
          errors,
          state.lineNumber
        );
        if (result.stop) {
          yield result;
          return;
        }
        // Yield if not skipped, OR if skipped with an error (for invalidRows collection)
        if (!result.skipped || result.error) {
          yield result;
        }

        state.currentRow = [];
        state.currentRowBytes = 0;
        resetInfoState(
          state,
          config.infoOption,
          config.rawOption,
          state.lineNumber + 1,
          nextByteOffset
        );
        i++;
      } else {
        appendToField(state, char);
        addRowBytes(state, char, config.maxRowBytes);
        i++;
      }
    }
  }

  // Handle last row without trailing newline
  if (state.currentField !== "" || state.currentRow.length > 0 || state.currentFieldLength > 0) {
    // Check for unterminated quote
    if (state.inQuotes) {
      const errorObj: CsvParseError = {
        code: "MissingQuotes",
        message: "Quoted field unterminated",
        row: state.dataRowCount
      };
      errors.push(errorObj);

      // If skipRecordsWithError is enabled, skip this row and invoke onSkip
      if (config.skipRecordsWithError) {
        config.invokeOnSkip?.(
          { code: "MissingQuotes", message: "Quoted field unterminated" },
          state.currentRow,
          state.lineNumber
        );
        return;
      }
    }

    state.currentRow.push(completeField(state, config.trimField, config.infoOption));
    state.lineNumber++;

    // Check toLine limit - if exceeded, mark as truncated and skip
    if (config.toLine !== undefined && state.lineNumber > config.toLine) {
      state.truncated = true;
      return;
    }

    if (state.lineNumber <= config.skipLines) {
      return;
    }

    const isEmpty = state.currentRow.length === 1 && state.currentRow[0] === "";
    if (
      config.shouldSkipEmpty &&
      (isEmpty || (config.shouldSkipEmpty === "greedy" && isEmptyRow(state.currentRow, true)))
    ) {
      return;
    }

    if (config.comment && state.currentRow[0]?.startsWith(config.comment)) {
      return;
    }

    const result = processCompletedRow(state.currentRow, state, config, errors, state.lineNumber);
    // Yield if not skipped, OR if skipped with an error (for invalidRows collection)
    if (!result.skipped || result.error) {
      yield result;
    }
  }
}
