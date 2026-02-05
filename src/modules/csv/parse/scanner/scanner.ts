/**
 * CSV Scanner Implementation
 *
 * High-performance CSV scanner using indexOf-based batch scanning.
 * Provides both synchronous and streaming interfaces.
 */

import type { ScannerConfig, Scanner, RowScanResult } from "./types";
import { DEFAULT_SCANNER_CONFIG, createScannerState } from "./types";
import { scanRow as scanRowImpl } from "./scan-field";

// =============================================================================
// Scanner Factory
// =============================================================================

/**
 * Create a new CSV scanner with the given configuration.
 *
 * @param config - Partial scanner configuration (defaults applied)
 * @returns Scanner instance
 *
 * @example Basic usage
 * ```ts
 * const scanner = createScanner({ delimiter: "," });
 * const result = scanner.scanRow('a,b,c\n');
 * console.log(result.fields); // ["a", "b", "c"]
 * ```
 *
 * @example Streaming usage
 * ```ts
 * const scanner = createScanner({ delimiter: "\t" });
 *
 * // Process chunks as they arrive
 * scanner.feed("name\tage\n");
 * scanner.feed("Alice\t30\n");
 *
 * let row;
 * while ((row = scanner.nextRow()) !== null) {
 *   console.log(row.fields);
 * }
 * ```
 */
export function createScanner(config?: Partial<ScannerConfig>): Scanner {
  const resolvedConfig: ScannerConfig = {
    ...DEFAULT_SCANNER_CONFIG,
    ...config
  };

  let state = createScannerState();
  // Track the global offset of the buffer start for zero-copy raw row extraction
  let bufferStartOffset = 0;

  // Reusable arrays for streaming mode (S3 optimization)
  // Safe to reuse because:
  // - fields: CsvParserStream always uses .map() which creates new array
  // - quoted: buildRecordInfo copies the array before exposing to user
  const reuseFields: string[] = [];
  const reuseQuoted: boolean[] = [];

  return {
    get config() {
      return resolvedConfig;
    },

    scanRow(input: string, offset = 0, isEof = false): RowScanResult {
      // Sync mode: don't reuse arrays (caller may store results)
      return scanRowImpl(input, offset, resolvedConfig, isEof);
    },

    feed(chunk: string): void {
      // Append to buffer, adjusting position if needed
      state.buffer += chunk;
    },

    nextRow(): RowScanResult | null {
      if (state.position >= state.buffer.length) {
        return null;
      }

      // Streaming mode: reuse arrays for reduced allocations
      const result = scanRowImpl(
        state.buffer,
        state.position,
        resolvedConfig,
        false,
        reuseFields,
        reuseQuoted
      );

      if (result.needMore) {
        // Not enough data for a complete row
        // Keep buffer intact, will get more data from feed()
        return null;
      }

      if (result.complete) {
        // Extract raw row BEFORE potentially compacting the buffer
        // This enables zero-copy raw row extraction in streaming mode
        result.raw = state.buffer.slice(result.rawStart, result.rawEnd);

        state.position = result.endPos;

        // Compact buffer when:
        // 1. We've consumed more than 64KB of data, OR
        // 2. We've consumed more than 50% of the buffer (prevents unbounded growth)
        const consumedBytes = state.position;
        const bufferLength = state.buffer.length;
        if (consumedBytes > 65536 || (consumedBytes > bufferLength / 2 && consumedBytes > 4096)) {
          // Update global offset before compacting
          bufferStartOffset += state.position;
          state.buffer = state.buffer.slice(state.position);
          state.position = 0;
        }

        return result;
      }

      // Incomplete row without needMore - shouldn't happen in streaming
      return null;
    },

    flush(): RowScanResult | null {
      if (state.position >= state.buffer.length) {
        return null;
      }

      // At EOF, scan remaining data as complete (reuse arrays)
      const result = scanRowImpl(
        state.buffer,
        state.position,
        resolvedConfig,
        true,
        reuseFields,
        reuseQuoted
      );

      if (result.fields.length === 0 && result.endPos === state.position) {
        return null;
      }

      // Extract raw row for streaming mode
      result.raw = state.buffer.slice(result.rawStart, result.rawEnd);

      state.position = result.endPos;
      return result;
    },

    reset(): void {
      state = createScannerState();
      bufferStartOffset = 0;
      // Clear reusable arrays
      reuseFields.length = 0;
      reuseQuoted.length = 0;
    },

    getBuffer(): string {
      return state.buffer.slice(state.position);
    },

    getBufferOffset(): number {
      // Return the global offset where current buffer position starts
      return bufferStartOffset + state.position;
    }
  };
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Scan all rows from a complete input string.
 *
 * This is a convenience function for parsing complete CSV data in one call.
 * For large files or streaming data, use the Scanner interface instead.
 *
 * @param input - Complete CSV input string
 * @param config - Scanner configuration
 * @returns Array of row scan results
 *
 * @example
 * ```ts
 * const rows = scanAllRows('a,b,c\n1,2,3\n', { delimiter: ',' });
 * // rows = [
 * //   { fields: ['a', 'b', 'c'], quoted: [false, false, false], ... },
 * //   { fields: ['1', '2', '3'], quoted: [false, false, false], ... }
 * // ]
 * ```
 */
export function scanAllRows(input: string, config?: Partial<ScannerConfig>): RowScanResult[] {
  const resolvedConfig: ScannerConfig = {
    ...DEFAULT_SCANNER_CONFIG,
    ...config
  };

  const results: RowScanResult[] = [];
  let pos = 0;
  const len = input.length;

  while (pos < len) {
    const result = scanRowImpl(input, pos, resolvedConfig, true);

    if (result.fields.length > 0 || result.endPos > pos) {
      results.push(result);
    }

    if (result.endPos <= pos) {
      // Safety: prevent infinite loop
      break;
    }

    pos = result.endPos;
  }

  return results;
}

/**
 * Create an async iterator for scanning rows from chunks.
 *
 * @param chunks - Async iterable of string chunks
 * @param config - Scanner configuration
 * @returns Async iterator of row scan results
 *
 * @example
 * ```ts
 * const chunks = (async function*() {
 *   yield 'a,b,c\n';
 *   yield '1,2,3\n';
 * })();
 *
 * for await (const row of scanRowsAsync(chunks, { delimiter: ',' })) {
 *   console.log(row.fields);
 * }
 * ```
 */
export async function* scanRowsAsync(
  chunks: AsyncIterable<string>,
  config?: Partial<ScannerConfig>
): AsyncGenerator<RowScanResult, void, undefined> {
  const scanner = createScanner(config);

  for await (const chunk of chunks) {
    scanner.feed(chunk);

    let row: RowScanResult | null;
    while ((row = scanner.nextRow()) !== null) {
      yield row;
    }
  }

  // Flush remaining data
  const lastRow = scanner.flush();
  if (lastRow !== null) {
    yield lastRow;
  }
}
