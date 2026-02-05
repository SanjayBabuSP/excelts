/**
 * CSV Parser - Synchronous
 *
 * RFC 4180 compliant CSV parser.
 * Provides parseCsv function and low-level parsing generators.
 */

import type {
  CsvParseOptions,
  CsvParseArrayOptions,
  CsvParseObjectOptions,
  CsvParseResult,
  CsvParseResultWithObjname,
  CsvParseMeta,
  CsvRecordError,
  RecordWithInfo,
  DynamicTypingConfig,
  CastDateConfig
} from "../types";
import type { ParseConfig } from "./config";
import type { ParseState } from "./state";
import type { RowProcessResult } from "./row-processor";
import { resolveParseConfig } from "./config";
import { createParseState, resetInfoState, getUnquotedArray } from "./state";
import { processCompletedRow, rowToRecord } from "./row-processor";
import { applyDynamicTypingToArrayRow } from "../utils/dynamic-typing";
import { isEmptyRow } from "../utils/row";
import { getUtf8ByteLength } from "../constants";
import { scanRow as scanRowImpl, type ScannerConfig } from "./scanner";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Normalize validate result to { isValid, reason } form
 */
function normalizeValidateResult(result: boolean | { isValid: boolean; reason?: string }): {
  isValid: boolean;
  reason: string;
} {
  if (typeof result === "boolean") {
    return { isValid: result, reason: "Validation failed" };
  }
  return { isValid: result.isValid, reason: result.reason || "Validation failed" };
}

/**
 * Apply dynamic typing to an array row (wrapper to reduce code duplication)
 */
function applyArrayTyping(
  row: string[],
  dynamicTyping: DynamicTypingConfig | undefined,
  castDate: CastDateConfig | undefined
): unknown[] {
  return applyDynamicTypingToArrayRow(row, null, dynamicTyping || false, castDate);
}

/**
 * Return array only if non-empty, otherwise undefined
 */
function optionalArray<T>(arr: T[]): T[] | undefined {
  return arr.length > 0 ? arr : undefined;
}

/**
 * Convert ParseConfig to ScannerConfig
 */
function toScannerConfig(config: ParseConfig): ScannerConfig {
  return {
    delimiter: config.delimiter,
    quote: config.quote,
    escape: config.escape,
    quoteEnabled: config.quoteEnabled,
    relaxQuotes: config.relaxQuotes
  };
}

/**
 * Apply trim function to all fields in a row.
 * Uses cached trimFieldIsIdentity from config to avoid per-row checking.
 */
function trimFields(fields: string[], config: ParseConfig): string[] {
  // Fast path: if trim is identity function, return fields as-is
  if (config.trimFieldIsIdentity) {
    return fields;
  }
  return fields.map(config.trimField);
}

// =============================================================================
// Fast Mode Parser (No Quote Detection)
// =============================================================================

/**
 * Parse input using fast mode (no quote detection)
 */
export function* parseFastMode(
  input: string,
  config: ParseConfig,
  state: ParseState,
  errors: CsvRecordError[]
): Generator<RowProcessResult, void, undefined> {
  // Handle empty input - no rows to produce
  if (input === "") {
    return;
  }

  // Use pre-compiled linebreak regex from config
  const lines = input.split(config.linebreakRegex);

  // Track character offset for info.offset
  let currentCharOffset = 0;
  // We need to also track position in original input to detect line ending length
  let posInInput = 0;

  for (const line of lines) {
    // Calculate actual line ending length by looking at what follows the line in input
    const lineEndPos = posInInput + line.length;
    let lineEndingLength = 0;
    if (lineEndPos < input.length) {
      if (input[lineEndPos] === "\r") {
        lineEndingLength = input[lineEndPos + 1] === "\n" ? 2 : 1;
      } else if (input[lineEndPos] === "\n") {
        lineEndingLength = 1;
      }
    }
    const lineByteLength = line.length + lineEndingLength;

    state.lineNumber++;
    posInInput += lineByteLength;

    if (config.toLine !== undefined && state.lineNumber > config.toLine) {
      state.truncated = true;
      break;
    }
    if (state.lineNumber <= config.skipLines) {
      currentCharOffset += lineByteLength;
      continue;
    }
    // Only skip empty lines if skipEmptyLines option is enabled
    if (line === "" && config.shouldSkipEmpty) {
      currentCharOffset += lineByteLength;
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
      state.currentRowStartOffset = currentCharOffset;
    }
    if (config.rawOption) {
      state.currentRawRow = line;
    }

    const row = line.split(config.delimiter).map(config.trimField);

    if (config.infoOption) {
      state.currentRowQuoted = getUnquotedArray(row.length);
    }

    if (config.comment && row[0]?.startsWith(config.comment)) {
      currentCharOffset += lineByteLength;
      continue;
    }
    if (config.shouldSkipEmpty && isEmptyRow(row, config.shouldSkipEmpty)) {
      currentCharOffset += lineByteLength;
      continue;
    }

    const result = processCompletedRow(row, state, config, errors, state.lineNumber);
    currentCharOffset += lineByteLength;

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

// =============================================================================
// Scanner-based Parser (High-Performance)
// =============================================================================

/**
 * Parse input using Scanner-based batch scanning.
 * This is a high-performance alternative that uses indexOf-based field scanning
 * instead of character-by-character parsing.
 *
 * Key optimizations:
 * 1. Uses indexOf to find delimiters/quotes/newlines in bulk
 * 2. Uses slice for field extraction (avoids string concatenation)
 * 3. Processes entire rows at once instead of character-by-character
 */
export function* parseWithScanner(
  input: string,
  config: ParseConfig,
  state: ParseState,
  errors: CsvRecordError[]
): Generator<RowProcessResult, void, undefined> {
  const scannerConfig = toScannerConfig(config);
  const len = input.length;
  let pos = 0;

  if (config.infoOption) {
    state.currentRowStartLine = 1;
    state.currentRowStartOffset = 0;
  }

  while (pos < len) {
    // Scan one row at a time
    const scanResult = scanRowImpl(input, pos, scannerConfig, true);

    // No fields and no progress - should not happen with isEof=true
    if (scanResult.fields.length === 0 && scanResult.endPos === pos) {
      break;
    }

    // Apply trim to fields
    const row = trimFields(scanResult.fields, config);

    // Update line number
    state.lineNumber++;

    // Check toLine limit
    if (config.toLine !== undefined && state.lineNumber > config.toLine) {
      state.truncated = true;
      break;
    }

    // Calculate positions for raw/info tracking
    const nextByteOffset = scanResult.endPos;
    // Use rawEnd directly from scan result (position before newline)
    const rawEndPos = scanResult.rawEnd;

    // Check maxRowBytes limit
    if (config.maxRowBytes !== undefined) {
      const rawRow = input.slice(scanResult.rawStart, rawEndPos);
      const rowBytes = getUtf8ByteLength(rawRow);
      if (rowBytes > config.maxRowBytes) {
        throw new Error(`Row exceeds the maximum size of ${config.maxRowBytes} bytes`);
      }
    }

    // Skip lines at beginning
    if (state.lineNumber <= config.skipLines) {
      pos = scanResult.endPos;
      continue;
    }

    // Skip comment lines
    if (config.comment && row[0]?.startsWith(config.comment)) {
      pos = scanResult.endPos;
      continue;
    }

    // Skip empty lines
    const isEmpty = row.length === 1 && row[0] === "";
    if (
      config.shouldSkipEmpty &&
      (isEmpty || (config.shouldSkipEmpty === "greedy" && isEmptyRow(row, true)))
    ) {
      pos = scanResult.endPos;
      continue;
    }

    // Set up info tracking
    if (config.infoOption) {
      state.currentRowStartLine = state.lineNumber;
      state.currentRowStartOffset = scanResult.rawStart;
      state.currentRowQuoted = scanResult.quoted;
    }

    // Extract raw row using zero-copy from scan result
    if (config.rawOption) {
      state.currentRawRow = input.slice(scanResult.rawStart, rawEndPos);
    }

    // Populate state.currentRow for processCompletedRow
    state.currentRow = row;

    // Check for unterminated quotes and report error
    if (scanResult.unterminatedQuote) {
      // Line number for error is 1-based
      errors.push({
        code: "MissingQuotes",
        message: "Quoted field unterminated",
        line: state.lineNumber
      });
    }

    const result = processCompletedRow(row, state, config, errors, state.lineNumber);

    if (result.stop) {
      yield result;
      return;
    }

    if (!result.skipped || result.error) {
      yield result;
    }

    // Reset for next row
    state.currentRow = [];
    pos = scanResult.endPos;

    if (config.infoOption) {
      state.currentRowStartLine = state.lineNumber + 1;
      state.currentRowStartOffset = nextByteOffset;
    }
  }
}

// =============================================================================
// Function Overloads for Better Type Inference
// =============================================================================

/**
 * Parse CSV string - returns string[][] when no options provided.
 */
export function parseCsv(input: string): string[][];

/**
 * Parse CSV string - returns string[][] when headers is false/undefined and no info option.
 *
 * Note: When `info: true` is set, returns CsvParseResult instead.
 */
export function parseCsv(
  input: string,
  options: CsvParseArrayOptions & { info?: false }
): string[][];

/**
 * Parse CSV string - returns CsvParseResult with RecordWithInfo when info: true (array mode).
 */
export function parseCsv(
  input: string,
  options: CsvParseArrayOptions & { info: true }
): CsvParseResult<RecordWithInfo<string[]>>;

/**
 * Parse CSV string - returns CsvParseResult when headers are enabled.
 */
export function parseCsv(
  input: string,
  options: CsvParseObjectOptions & { info?: false }
): CsvParseResult<Record<string, unknown>>;

/**
 * Parse CSV string - returns CsvParseResult with RecordWithInfo when info: true (object mode).
 */
export function parseCsv(
  input: string,
  options: CsvParseObjectOptions & { info: true }
): CsvParseResult<RecordWithInfo<Record<string, unknown>>>;

/**
 * Parse CSV string - general overload for backward compatibility.
 */
export function parseCsv(
  input: string,
  options: CsvParseOptions
):
  | string[][]
  | CsvParseResult<Record<string, string>>
  | CsvParseResult<Record<string, unknown>>
  | CsvParseResult<RecordWithInfo<Record<string, unknown>>>
  | CsvParseResult<RecordWithInfo<string[]>>;

/**
 * Parse CSV string synchronously.
 *
 * @example
 * ```ts
 * // Simple array output (no headers)
 * const rows = parseCsv("a,b,c\n1,2,3");
 * // rows: string[][] = [["a","b","c"], ["1","2","3"]]
 *
 * // Object output with headers
 * const result = parseCsv("name,age\nAlice,30", { headers: true });
 * // result.rows: Record<string, unknown>[] = [{ name: "Alice", age: "30" }]
 *
 * // With info option
 * const result = parseCsv("a,b\n1,2", { info: true });
 * // result.rows: RecordWithInfo<string[]>[] = [{ record: ["a","b"], info: {...} }, ...]
 * ```
 */
export function parseCsv(
  input: string,
  options: CsvParseOptions = {}
):
  | string[][]
  | CsvParseResult<Record<string, string>>
  | CsvParseResult<Record<string, unknown>>
  | CsvParseResult<RecordWithInfo<Record<string, unknown>>>
  | CsvParseResult<RecordWithInfo<string[]>>
  | CsvParseResultWithObjname<Record<string, unknown>> {
  // Resolve config and preprocess input
  const { config, processedInput } = resolveParseConfig(input, options);

  // Initialize state
  const state = createParseState(config);
  const errors: CsvRecordError[] = [];
  const invalidRows: { row: string[]; reason: string }[] = [];

  // Choose parser based on mode
  const parser = config.fastMode
    ? parseFastMode(processedInput, config, state, errors)
    : parseWithScanner(processedInput, config, state, errors);

  // ==========================================================================
  // Single-pass processing: parse + transform + validate + dynamicTyping
  // ==========================================================================

  // Simple array output (no headers) - True single pass processing
  if (!state.useHeaders) {
    // Use unified type for both info and non-info mode to avoid two-pass zipping
    const processedRows: (string[] | unknown[] | RecordWithInfo<string[] | unknown[]>)[] = [];

    for (const result of parser) {
      if (result.row && !result.skipped) {
        let row: string[] | unknown[] = result.row;

        // Apply rowTransform if provided
        if (options.rowTransform) {
          const transformed = options.rowTransform(row as string[]);
          if (transformed === null || transformed === undefined) {
            continue;
          }
          row = transformed as string[] | unknown[];
        }

        // Apply validate if provided
        if (options.validate) {
          const { isValid, reason } = normalizeValidateResult(options.validate(row as string[]));
          if (!isValid) {
            invalidRows.push({ row: row as string[], reason });
            continue;
          }
        }

        // Apply dynamicTyping/castDate if configured
        if (config.dynamicTyping || config.castDate) {
          row = applyArrayTyping(row as string[], config.dynamicTyping, config.castDate);
        }

        // Push with or without info in single pass
        if (config.infoOption && result.info) {
          processedRows.push({ record: row, info: result.info });
        } else {
          processedRows.push(row);
        }
      } else if (result.row && result.skipped && result.error) {
        // Handle invalid rows from columnMismatch errors
        invalidRows.push({ row: result.row, reason: result.reason || result.error.message });
      }
      if (result.stop) {
        break;
      }
    }

    // Build metadata
    const meta: CsvParseMeta = {
      delimiter: config.delimiter,
      linebreak: config.linebreak,
      aborted: false,
      truncated: state.truncated,
      cursor: state.dataRowCount,
      fields: state.headerRow
        ? state.headerRow.filter((h): h is string => h !== null && h !== undefined)
        : undefined,
      renamedHeaders: state.renamedHeadersForMeta
    };

    // If info option is enabled, rows are already wrapped
    if (config.infoOption) {
      return {
        headers: undefined,
        rows: processedRows as RecordWithInfo<string[] | unknown[]>[],
        invalidRows: optionalArray(invalidRows),
        errors: optionalArray(errors),
        meta
      } as CsvParseResult<RecordWithInfo<string[]>>;
    }

    // If validate was used, always return result object for consistent API
    // This allows users to check invalidRows even when all rows pass validation
    if (options.validate) {
      return {
        headers: undefined,
        rows: processedRows,
        invalidRows: optionalArray(invalidRows),
        errors: optionalArray(errors),
        meta
      } as unknown as CsvParseResult<Record<string, unknown>>;
    }

    return processedRows as string[][];
  }

  // ==========================================================================
  // Object mode (with headers) - True single-pass processing
  // ==========================================================================

  // Process rows in single pass: parse + convert + transform + validate
  const objectRows: (Record<string, unknown> | RecordWithInfo<Record<string, unknown>>)[] = [];

  for (const result of parser) {
    if (result.row && !result.skipped) {
      // Convert to record immediately (single pass, no intermediate array)
      let record = rowToRecord(result.row, state, config);

      // Add extras if columnMismatch.more: 'keep' was used
      if (result.extras && result.extras.length > 0) {
        record._extra = result.extras;
      }

      // Apply rowTransform if provided
      if (options.rowTransform) {
        const transformed = options.rowTransform(record as Record<string, string>);
        if (transformed === null || transformed === undefined) {
          continue;
        }
        record = transformed as Record<string, unknown>;
      }

      // Apply validate if provided
      if (options.validate) {
        const { isValid, reason } = normalizeValidateResult(
          options.validate(record as Record<string, string>)
        );
        if (!isValid) {
          invalidRows.push({ row: result.row, reason });
          continue;
        }
      }

      if (config.infoOption && result.info) {
        objectRows.push({ record, info: result.info });
      } else {
        objectRows.push(record);
      }
    } else if (result.row && result.skipped && result.error) {
      invalidRows.push({ row: result.row, reason: result.reason || result.error.message });
    }
    if (result.stop) {
      break;
    }
  }

  // Build metadata
  const meta: CsvParseMeta = {
    delimiter: config.delimiter,
    linebreak: config.linebreak,
    aborted: false,
    truncated: state.truncated,
    cursor: state.dataRowCount,
    fields: state.headerRow
      ? state.headerRow.filter((h): h is string => h !== null && h !== undefined)
      : undefined,
    renamedHeaders: state.renamedHeadersForMeta
  };

  // Handle objname option
  const { objname } = options;
  if (objname && state.headerRow) {
    const objResult: Record<
      string,
      Record<string, unknown> | RecordWithInfo<Record<string, unknown>>
    > = {};
    for (const item of objectRows) {
      const rec = config.infoOption
        ? (item as RecordWithInfo<Record<string, unknown>>).record
        : item;
      const key = (rec as Record<string, unknown>)[objname];
      // Convert undefined/null to empty string, otherwise convert to string
      const keyStr = key === undefined || key === null ? "" : String(key);
      objResult[keyStr] = item;
    }
    return {
      headers: meta.fields,
      rows: objResult,
      invalidRows: optionalArray(invalidRows),
      errors: optionalArray(errors),
      meta
    } as CsvParseResultWithObjname<Record<string, unknown>>;
  }

  return {
    headers: meta.fields,
    rows: objectRows,
    invalidRows: optionalArray(invalidRows),
    errors: optionalArray(errors),
    meta
  } as CsvParseResult<Record<string, unknown>>;
}
