/**
 * CSV Scanner Types
 *
 * Type definitions for the high-performance CSV field scanner.
 * The scanner uses indexOf-based batch scanning instead of character-by-character parsing.
 */

// =============================================================================
// Scanner Configuration
// =============================================================================

/**
 * Scanner configuration options.
 * These are the low-level options needed for field scanning.
 */
export interface ScannerConfig {
  /** Field delimiter (supports multi-character, e.g., "||" or "\t\t") */
  delimiter: string;

  /** Quote character (single character, e.g., '"') */
  quote: string;

  /** Escape character (usually same as quote for RFC 4180, or backslash) */
  escape: string;

  /** Whether quoting is enabled */
  quoteEnabled: boolean;

  /** Allow unescaped quotes mid-field (relaxed parsing mode) */
  relaxQuotes: boolean;
}

/**
 * Default scanner configuration
 */
export const DEFAULT_SCANNER_CONFIG: ScannerConfig = {
  delimiter: ",",
  quote: '"',
  escape: '"',
  quoteEnabled: true,
  relaxQuotes: false
};

// =============================================================================
// Scan Result Types
// =============================================================================

/**
 * Result of scanning a single field.
 */
export interface FieldScanResult {
  /** The parsed field value (with quotes and escapes processed) */
  value: string;

  /** Whether the field was quoted */
  quoted: boolean;

  /** Position after the field (after delimiter or at line end) */
  endPos: number;

  /**
   * Whether parsing is incomplete and needs more data.
   * This happens when:
   * - A quoted field is unterminated at buffer boundary
   * - A CR is at the end of buffer (might be CRLF)
   */
  needMore: boolean;

  /**
   * For incomplete fields, the position to resume from.
   * The caller should retain input[resumePos:] and prepend to next chunk.
   */
  resumePos?: number;

  /** Whether the quoted field was unterminated (EOF inside quotes) */
  unterminated?: boolean;
}

/**
 * Result of scanning a complete row.
 */
export interface RowScanResult {
  /** Parsed field values */
  fields: string[];

  /** Whether each field was quoted (same length as fields) */
  quoted: boolean[];

  /** Position after the row (after newline) */
  endPos: number;

  /** Whether the row is complete (ends with newline or EOF) */
  complete: boolean;

  /**
   * Whether parsing needs more data.
   * True when:
   * - Row is incomplete (no newline found, not at EOF)
   * - A quoted field spans buffer boundary
   */
  needMore: boolean;

  /**
   * Position to resume from when needMore is true.
   * Data from this position should be retained for the next chunk.
   */
  resumePos?: number;

  /** The actual newline sequence found ("\n", "\r\n", or "\r") */
  newline?: string;

  /** Whether there was an unterminated quoted field (EOF inside quotes) */
  unterminatedQuote?: boolean;
}

// =============================================================================
// Scanner State (for streaming)
// =============================================================================

/**
 * Internal state for streaming scanner.
 */
export interface ScannerState {
  /** Buffered input data */
  buffer: string;

  /** Current position in buffer */
  position: number;

  /** Partial field from previous chunk (when needMore was true) */
  partialField: string;

  /** Whether we're in the middle of a quoted field */
  inQuotedField: boolean;

  /** Accumulated fields for current row (when spanning chunks) */
  partialRow: string[];

  /** Quoted flags for partial row */
  partialRowQuoted: boolean[];
}

/**
 * Create initial scanner state.
 */
export function createScannerState(): ScannerState {
  return {
    buffer: "",
    position: 0,
    partialField: "",
    inQuotedField: false,
    partialRow: [],
    partialRowQuoted: []
  };
}

// =============================================================================
// Scanner Interface
// =============================================================================

/**
 * High-performance CSV field scanner.
 *
 * The scanner provides two modes of operation:
 * 1. **Sync mode**: Use `scanRow()` for complete input strings
 * 2. **Streaming mode**: Use `feed()` + `nextRow()` for chunked input
 *
 * @example Sync mode
 * ```ts
 * const scanner = createScanner({ delimiter: "," });
 * const result = scanner.scanRow('a,"b,c",d\n');
 * // result.fields = ["a", "b,c", "d"]
 * ```
 *
 * @example Streaming mode
 * ```ts
 * const scanner = createScanner({ delimiter: "," });
 * scanner.feed('a,"b,c",d\ne,');  // First chunk
 * const row1 = scanner.nextRow(); // { fields: ["a", "b,c", "d"], complete: true }
 * scanner.feed('f,g\n');          // Second chunk
 * const row2 = scanner.nextRow(); // { fields: ["e", "f", "g"], complete: true }
 * ```
 */
export interface Scanner {
  /** Current scanner configuration */
  readonly config: ScannerConfig;

  /**
   * Scan a single row from input string.
   *
   * @param input - The input string to scan
   * @param offset - Starting position (default: 0)
   * @param isEof - Whether this is the end of input (default: false)
   * @returns Scan result with fields and position info
   */
  scanRow(input: string, offset?: number, isEof?: boolean): RowScanResult;

  /**
   * Feed data into the streaming buffer.
   *
   * @param chunk - Data chunk to append to buffer
   */
  feed(chunk: string): void;

  /**
   * Get the next complete row from the buffer.
   *
   * @returns Row result, or null if no complete row is available
   */
  nextRow(): RowScanResult | null;

  /**
   * Flush remaining data at end of input.
   * Call this when there's no more data to feed.
   *
   * @returns Final row result, or null if buffer is empty
   */
  flush(): RowScanResult | null;

  /**
   * Reset scanner state (for reuse).
   */
  reset(): void;

  /**
   * Get remaining buffered data.
   * Useful for error recovery or debugging.
   */
  getBuffer(): string;
}
