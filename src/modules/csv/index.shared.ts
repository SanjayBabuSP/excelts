/**
 * CSV Module - Shared Public API
 *
 * Common exports shared between Node.js (index.ts) and Browser (index.browser.ts) builds.
 * Platform-specific exports (CSV class variants) are handled by the individual index files.
 *
 * Design principles:
 * - Only export types and functions that are part of the PUBLIC API
 * - Internal utilities (like format helpers) are used internally but not exported
 * - This reduces bundle size and simplifies the public interface
 */

// =============================================================================
// Core Types (from types.ts)
// =============================================================================

export type {
  // Row types
  HeaderArray,
  RowHashArray,
  RowArray,
  RowMap,
  Row,
  ParsedRow,

  // Transform types
  HeaderTransformFunction,
  RowTransformCallback,
  RowTransformFunction,
  RowValidateCallback,
  RowValidateFunction,
  TransformContext,
  FormattedValue,
  TransformResult,
  TypeTransformMap,

  // Dynamic typing
  DynamicTypingConfig,
  CastDateConfig,

  // Column config
  ColumnConfig,

  // Skip error types
  CsvSkipErrorCode,
  CsvSkipError,
  OnSkipCallback,

  // Options (general)
  CsvBaseOptions,
  CsvParseOptions,
  CsvFormatOptions,

  // Options (type-safe variants for better inference)
  CsvParseArrayOptions,
  CsvParseObjectOptions,

  // Parse results
  ChunkMeta,
  CsvParseMeta,
  CsvParseErrorCode,
  CsvParseError,
  RecordInfo,
  RecordWithInfo,
  CsvParseResult
} from "./types";

// Type guards and helpers from types.ts
export { isFormattedValue, quoted, unquoted } from "./types";

// =============================================================================
// Core Functions
// =============================================================================

// Synchronous parser
export { parseCsv } from "./parse";

// Async generator parser
export { parseCsvAsync, parseCsvRows, parseCsvWithProgress } from "./parse-async";
export type { StreamParseMeta } from "./parse-async";

// Formatter
export { formatCsv } from "./format";

// =============================================================================
// Stream Classes (from csv-stream.ts)
// =============================================================================

export {
  CsvParserStream,
  CsvFormatterStream,
  createCsvReadableStream,
  createCsvParserStream,
  createCsvFormatterStream
} from "./csv-stream";

// =============================================================================
// Detection Utilities (commonly needed by users)
// =============================================================================

export { detectDelimiter, detectLinebreak, stripBom } from "./utils/detect";

// =============================================================================
// Row Utilities (commonly needed by users)
// =============================================================================

export {
  isRowHashArray,
  rowHashArrayToMap,
  rowHashArrayToValues,
  rowHashArrayToHeaders,
  rowHashArrayGet,
  rowHashArrayMapByHeaders,
  processColumns,
  deduplicateHeaders,
  deduplicateHeadersWithRenames
} from "./utils/row";

// =============================================================================
// Extras (opt-in utilities - namespace export for tree-shaking)
// =============================================================================

export * as csvExtras from "./index.extras";

// Browser worker pool (Node build exports stubs)
export * as csvWorker from "./worker";

// =============================================================================
// Errors
// =============================================================================

export { CsvError, CsvFileError, CsvDownloadError, CsvNotSupportedError } from "./errors";
