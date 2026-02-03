/**
 * CSV Parser - Synchronous
 *
 * RFC 4180 compliant CSV parser.
 * Uses the shared parse-core for core parsing logic.
 */

import type {
  CsvParseOptions,
  CsvParseArrayOptions,
  CsvParseObjectOptions,
  CsvParseResult,
  CsvParseMeta,
  CsvParseError,
  RecordInfo,
  RecordWithInfo,
  DynamicTypingConfig,
  CastDateConfig
} from "./types";
import {
  resolveParseConfig,
  createParseState,
  parseFastMode,
  parseStandardMode,
  rowToRecord
} from "./parse-core";
import { applyDynamicTypingToArrayRow } from "./utils/dynamic-typing";

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
  | CsvParseResult<RecordWithInfo<string[]>> {
  // Resolve config and preprocess input
  const { config, processedInput } = resolveParseConfig(input, options);

  // Initialize state
  const state = createParseState(config);
  const errors: CsvParseError[] = [];
  const invalidRows: { row: string[]; reason: string }[] = [];
  const rowInfos: RecordInfo[] = [];

  // Choose parser based on mode
  const parser = config.fastMode
    ? parseFastMode(processedInput, config, state, errors)
    : parseStandardMode(processedInput, config, state, errors);

  // ==========================================================================
  // Single-pass processing: parse + transform + validate + dynamicTyping
  // ==========================================================================

  // Simple array output (no headers) - Single pass processing
  if (!state.useHeaders) {
    const processedRows: (string[] | unknown[])[] = [];

    for (const result of parser) {
      if (result.row && !result.skipped) {
        let row: string[] | unknown[] = result.row;

        // Apply transform if provided
        if (options.transform) {
          const transformed = options.transform(row as string[]);
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

        processedRows.push(row);
        if (result.info) {
          rowInfos.push(result.info);
        }
      } else if (result.row && result.skipped && result.error) {
        // Handle invalid rows from strictColumnHandling
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

    // If info option is enabled, wrap in result object with info
    if (config.infoOption) {
      const arrayRowsWithInfo: RecordWithInfo<string[] | unknown[]>[] = [];
      for (let idx = 0; idx < processedRows.length; idx++) {
        arrayRowsWithInfo.push({ record: processedRows[idx], info: rowInfos[idx] });
      }
      return {
        headers: undefined,
        rows: arrayRowsWithInfo,
        invalidRows: optionalArray(invalidRows),
        errors: optionalArray(errors),
        meta
      } as CsvParseResult<RecordWithInfo<string[]>>;
    }

    // If validate was used AND there are invalidRows or errors, return result object
    if (options.validate && (invalidRows.length > 0 || errors.length > 0)) {
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
  // Object mode (with headers) - Single pass processing
  // ==========================================================================

  // Collect rows first (parser handles header extraction)
  const rows: string[][] = [];
  for (const result of parser) {
    if (result.row && !result.skipped) {
      rows.push(result.row);
      if (result.info) {
        rowInfos.push(result.info);
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

  // Single-pass: convert to record + transform + validate
  const objectRows: (Record<string, unknown> | RecordWithInfo<Record<string, unknown>>)[] = [];
  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    let record = rowToRecord(row, state, config);

    // Apply transform if provided
    if (options.transform) {
      const transformed = options.transform(record as Record<string, string>);
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
        invalidRows.push({ row, reason });
        continue;
      }
    }

    if (config.infoOption) {
      objectRows.push({ record, info: rowInfos[idx] });
    } else {
      objectRows.push(record);
    }
  }

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
      rows: objResult as unknown as Record<string, unknown>[],
      invalidRows: optionalArray(invalidRows),
      errors: optionalArray(errors),
      meta
    } as CsvParseResult<Record<string, unknown>>;
  }

  return {
    headers: meta.fields,
    rows: objectRows,
    invalidRows: optionalArray(invalidRows),
    errors: optionalArray(errors),
    meta
  } as CsvParseResult<Record<string, unknown>>;
}
