/**
 * CSV Parse Engine
 *
 * Batch parsing implementation using shared parse-core primitives.
 * Provides generator-based parsing for sync CSV parsing.
 */

import type { CsvParseOptions, CsvParseError } from "./types";
import { isEmptyRow } from "./utils/parse";

// Import shared core functionality
import {
  type ParseConfig,
  type ParseState,
  type RowProcessResult,
  createParseConfig,
  createParseState,
  appendToField,
  completeField,
  resetInfoState,
  checkRowBytes,
  processCompletedRow,
  sharedTextEncoder
} from "./parse-core";

// Re-export types and functions for external use
export type { ParseConfig, ParseState, RowProcessResult };
export { createParseState, rowToRecord } from "./parse-core";

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

// =============================================================================
// Core Parsing Logic
// =============================================================================

/**
 * Parse input using fast mode (no quote detection)
 */
export function* parseFastMode(
  input: string,
  config: ParseConfig,
  state: ParseState,
  errors: CsvParseError[],
  invalidRows: { row: string[]; reason: string }[]
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

    // Check maxRowBytes in fastMode using shared encoder
    if (config.maxRowBytes !== undefined) {
      const lineBytes = sharedTextEncoder.encode(line).length;
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
  errors: CsvParseError[],
  invalidRows: { row: string[]; reason: string }[]
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
        state.currentRowBytes++;
        if (config.rawOption) {
          state.currentRawRow += input[i + 1];
        }
        i += 2;
        checkRowBytes(state.currentRowBytes, config.maxRowBytes);
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
          state.currentRowBytes++;
          i++;
          checkRowBytes(state.currentRowBytes, config.maxRowBytes);
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
          state.currentRowBytes++;
          i++;
          checkRowBytes(state.currentRowBytes, config.maxRowBytes);
        }
      } else {
        appendToField(state, char);
        state.currentRowBytes++;
        i++;
        checkRowBytes(state.currentRowBytes, config.maxRowBytes);
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
        state.currentRowBytes++;
        i++;
        checkRowBytes(state.currentRowBytes, config.maxRowBytes);
      } else if (char === config.delimiter) {
        state.currentRow.push(completeField(state, config.trimField, config.infoOption));
        state.currentRowBytes++;
        i++;
        checkRowBytes(state.currentRowBytes, config.maxRowBytes);
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
        state.currentRowBytes++;
        i++;
        checkRowBytes(state.currentRowBytes, config.maxRowBytes);
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
