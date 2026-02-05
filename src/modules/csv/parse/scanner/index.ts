/**
 * CSV Scanner Module
 *
 * High-performance CSV field scanner using indexOf-based batch scanning.
 *
 * @example Basic usage
 * ```ts
 * import { createScanner, scanAllRows } from './scanner';
 *
 * // One-shot parsing
 * const rows = scanAllRows('a,b,c\n1,2,3\n');
 *
 * // Or use scanner instance
 * const scanner = createScanner({ delimiter: '\t' });
 * const result = scanner.scanRow('a\tb\tc\n');
 * ```
 *
 * @example Streaming usage
 * ```ts
 * import { scanRowsAsync } from './scanner';
 *
 * async function* readChunks() {
 *   yield 'a,b,c\n';
 *   yield '1,2,3\n';
 * }
 *
 * for await (const row of scanRowsAsync(readChunks())) {
 *   console.log(row.fields);
 * }
 * ```
 */

// Types
export type { ScannerConfig, FieldScanResult, RowScanResult, ScannerState, Scanner } from "./types";

// Constants and state factory
export { DEFAULT_SCANNER_CONFIG, createScannerState } from "./types";

// Core scanning functions
export { scanQuotedField, scanUnquotedField, scanRow } from "./scan-field";

// Scanner factory and utilities
export { createScanner, scanAllRows, scanRowsAsync } from "./scanner";
