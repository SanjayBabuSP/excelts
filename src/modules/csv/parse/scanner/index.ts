/**
 * CSV Scanner Module
 *
 * High-performance CSV field scanner using indexOf-based batch scanning.
 * Re-exports all scanner functionality from scanner.ts.
 */

// Types
export type {
  ScannerConfig,
  FieldScanResult,
  RowScanResult,
  ScannerState,
  Scanner
} from "./scanner";

// Constants and state factory
export { DEFAULT_SCANNER_CONFIG, createScannerState } from "./scanner";

// Core scanning functions
export { scanQuotedField, scanUnquotedField, scanRow } from "./scanner";

// Scanner factory and utilities
export { createScanner, scanAllRows, scanRowsAsync } from "./scanner";
