/**
 * CSV Parser - Synchronous
 *
 * RFC 4180 compliant CSV parser.
 * Uses the shared parse-engine for core parsing logic.
 */

import type {
  CsvParseOptions,
  CsvParseArrayOptions,
  CsvParseObjectOptions,
  CsvParseResult,
  CsvParseMeta,
  CsvParseError,
  RecordInfo,
  RecordWithInfo
} from "./types";
import {
  resolveConfig,
  createParseState,
  parseFastMode,
  parseStandardMode,
  rowToRecord
} from "./parse-engine";
import { applyDynamicTypingToArrayRow } from "./utils/dynamic-typing";

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
  const { config, processedInput } = resolveConfig(input, options);

  // Initialize state
  const state = createParseState(config);
  const errors: CsvParseError[] = [];
  const invalidRows: { row: string[]; reason: string }[] = [];
  const rows: string[][] = [];
  const rowInfos: RecordInfo[] = [];

  // Choose parser based on mode
  const parser = config.fastMode
    ? parseFastMode(processedInput, config, state, errors, invalidRows)
    : parseStandardMode(processedInput, config, state, errors, invalidRows);

  // Collect all rows
  for (const result of parser) {
    if (result.row) {
      // Only add to rows if not skipped due to validation error
      if (!result.skipped) {
        rows.push(result.row);
        if (result.info) {
          rowInfos.push(result.info);
        }
      } else if (result.error) {
        // Handle invalid rows from strictColumnHandling
        invalidRows.push({ row: result.row, reason: result.reason || result.error.message });
      }
    }
    if (result.stop) {
      break;
    }
  }

  // ==========================================================================
  // Build Result
  // ==========================================================================
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

  // Simple array output (no headers)
  if (!state.useHeaders) {
    // Apply transform if provided (in array mode, transform operates on string[])
    let processedRows: (string[] | unknown[])[] = rows;
    if (options.transform) {
      const transformedRows: (string[] | unknown[])[] = [];
      for (const row of rows) {
        const transformed = options.transform(row as string[]);
        if (transformed !== null && transformed !== undefined) {
          transformedRows.push(transformed as string[] | unknown[]);
        }
      }
      processedRows = transformedRows;
    }

    // Apply validate if provided (in array mode, validate operates on string[])
    if (options.validate) {
      const validatedRows: (string[] | unknown[])[] = [];
      for (let i = 0; i < processedRows.length; i++) {
        const row = processedRows[i];
        const validateResult = options.validate(row as string[]);
        const { isValid, reason } =
          typeof validateResult === "boolean"
            ? { isValid: validateResult, reason: "Validation failed" }
            : {
                isValid: validateResult.isValid,
                reason: validateResult.reason || "Validation failed"
              };

        if (isValid) {
          validatedRows.push(row);
        } else {
          invalidRows.push({ row: row as string[], reason });
        }
      }
      processedRows = validatedRows;
    }

    // If info option is enabled, wrap in result object with info
    if (config.infoOption) {
      const arrayRowsWithInfo: RecordWithInfo<string[] | unknown[]>[] = [];
      for (let idx = 0; idx < processedRows.length; idx++) {
        let row: string[] | unknown[] = processedRows[idx];
        // Apply dynamicTyping/castDate in array mode if configured
        if (config.dynamicTyping || config.castDate) {
          row = applyDynamicTypingToArrayRow(
            row as string[],
            null,
            config.dynamicTyping || false,
            config.castDate
          );
        }
        arrayRowsWithInfo.push({ record: row, info: rowInfos[idx] });
      }
      return {
        headers: undefined,
        rows: arrayRowsWithInfo,
        invalidRows: invalidRows.length > 0 ? invalidRows : undefined,
        errors: errors.length > 0 ? errors : undefined,
        meta
      } as CsvParseResult<RecordWithInfo<string[]>>;
    }

    // If validate was used AND there are invalidRows or errors, return result object
    // Otherwise, return plain array (backward compatible behavior)
    if (options.validate && (invalidRows.length > 0 || errors.length > 0)) {
      // Apply dynamicTyping/castDate if configured
      if (config.dynamicTyping || config.castDate) {
        processedRows = processedRows.map(row =>
          applyDynamicTypingToArrayRow(
            row as string[],
            null,
            config.dynamicTyping || false,
            config.castDate
          )
        );
      }
      return {
        headers: undefined,
        rows: processedRows,
        invalidRows: invalidRows.length > 0 ? invalidRows : undefined,
        errors: errors.length > 0 ? errors : undefined,
        meta
      } as unknown as CsvParseResult<Record<string, unknown>>;
    }

    // Apply dynamicTyping/castDate in array mode if configured
    if (config.dynamicTyping || config.castDate) {
      return processedRows.map(row =>
        applyDynamicTypingToArrayRow(
          row as string[],
          null,
          config.dynamicTyping || false,
          config.castDate
        )
      ) as string[][];
    }
    return processedRows as string[][];
  }

  // Build object rows
  let objectRows: (Record<string, unknown> | RecordWithInfo<Record<string, unknown>>)[] = [];
  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const record = rowToRecord(row, state, config);

    if (config.infoOption) {
      objectRows.push({ record, info: rowInfos[idx] });
    } else {
      objectRows.push(record);
    }
  }

  // Apply transform if provided (operates on object records)
  if (options.transform) {
    const transformedRows: (Record<string, unknown> | RecordWithInfo<Record<string, unknown>>)[] =
      [];
    for (const item of objectRows) {
      const record = config.infoOption
        ? (item as RecordWithInfo<Record<string, unknown>>).record
        : (item as Record<string, unknown>);
      const transformed = options.transform(record as Record<string, string>);
      if (transformed === null || transformed === undefined) {
        continue;
      }
      if (config.infoOption) {
        transformedRows.push({
          record: transformed as Record<string, unknown>,
          info: (item as RecordWithInfo<Record<string, unknown>>).info
        });
      } else {
        transformedRows.push(transformed as Record<string, unknown>);
      }
    }
    objectRows = transformedRows;
  }

  // Apply validate if provided (operates on object records)
  if (options.validate) {
    const validatedRows: typeof objectRows = [];
    for (let i = 0; i < objectRows.length; i++) {
      const item = objectRows[i];
      const record = config.infoOption
        ? (item as RecordWithInfo<Record<string, unknown>>).record
        : (item as Record<string, unknown>);
      // Pass the record to validate (it can be an object or array depending on mode)
      const validateResult = options.validate(record as Record<string, string>);
      const { isValid, reason } =
        typeof validateResult === "boolean"
          ? { isValid: validateResult, reason: "Validation failed" }
          : {
              isValid: validateResult.isValid,
              reason: validateResult.reason || "Validation failed"
            };

      if (isValid) {
        validatedRows.push(item);
      } else {
        // Get the original row for invalidRows
        if (i < rows.length) {
          invalidRows.push({ row: rows[i], reason });
        }
      }
    }
    objectRows = validatedRows;
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
      invalidRows: invalidRows.length > 0 ? invalidRows : undefined,
      errors: errors.length > 0 ? errors : undefined,
      meta
    } as CsvParseResult<Record<string, unknown>>;
  }

  return {
    headers: meta.fields,
    rows: objectRows,
    invalidRows: invalidRows.length > 0 ? invalidRows : undefined,
    errors: errors.length > 0 ? errors : undefined,
    meta
  } as CsvParseResult<Record<string, unknown>>;
}
