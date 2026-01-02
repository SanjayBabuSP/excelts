/**
 * Browser entry point - No Node.js dependencies
 * This version is optimized for browser environments with minimal bundle size
 */

// =============================================================================
// Main Classes (Browser-compatible)
// =============================================================================
export { Workbook } from "@excel/workbook";
export { Worksheet } from "@excel/worksheet";
export { Row } from "@excel/row";
export { Column } from "@excel/column";
export { Cell } from "@excel/cell";
export { Range } from "@excel/range";
export { Image } from "@excel/image";
export * from "@excel/anchor";
export { Table } from "@excel/table";
export { DataValidations } from "@excel/data-validations";

// =============================================================================
// Enums
// =============================================================================
export * from "@excel/enums";

// =============================================================================
// Types
// =============================================================================

// Export all type definitions from types.ts
export * from "@excel/types";

// Export pivot table types (type-only, no runtime dependency)
export type {
  PivotTable,
  PivotTableModel,
  PivotTableSource,
  CacheField,
  DataField,
  PivotTableSubtotal,
  ParsedCacheDefinition,
  ParsedCacheRecords
} from "@excel/pivot-table";

// =============================================================================
// Utilities
// =============================================================================
export * from "@excel/utils/sheet-utils";

// =============================================================================
// CSV support (using native RFC 4180 implementation)
// =============================================================================
export type {
  CsvReadOptions,
  CsvWriteOptions,
  CsvStreamReadOptions,
  CsvStreamWriteOptions
} from "@csv/csv.browser";
export { CsvParserStream, CsvFormatterStream } from "@csv/csv.browser";

// =============================================================================
// Streaming Writer (Browser-compatible)
// Uses cross-platform base implementation without Node.js fs
// =============================================================================

import { WorkbookWriter } from "@excel/stream/workbook-writer.browser";
import { WorkbookReader } from "@excel/stream/workbook-reader.browser";
import { WorksheetWriter } from "@excel/stream/worksheet-writer";
import { WorksheetReader } from "@excel/stream/worksheet-reader";

export { WorkbookWriter, WorkbookReader, WorksheetWriter, WorksheetReader };

// =============================================================================
// NOTE: Node.js-only features not available in browser:
// - Reading from a file path is not supported (use Uint8Array/ArrayBuffer/Blob instead)
// - Writing to a file path is not supported (use writeBuffer() / stream output, then save as Blob/download)
// =============================================================================
