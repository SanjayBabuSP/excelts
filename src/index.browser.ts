/**
 * Browser entry point - No Node.js dependencies
 * This version is optimized for browser environments with minimal bundle size
 */

// =============================================================================
// Main Classes (Browser-compatible)
// =============================================================================
export { Workbook } from "./modules/excel/workbook";
export { Worksheet } from "./modules/excel/worksheet";
export { Row } from "./modules/excel/row";
export { Column } from "./modules/excel/column";
export { Cell } from "./modules/excel/cell";
export { Range } from "./modules/excel/range";
export { Image } from "./modules/excel/image";
export * from "./modules/excel/anchor";
export { Table } from "./modules/excel/table";
export { DataValidations } from "./modules/excel/data-validations";

// =============================================================================
// Enums
// =============================================================================
export * from "./modules/excel/enums";

// =============================================================================
// Types
// =============================================================================

// Export all type definitions from types.ts
export * from "./modules/excel/types";

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
} from "./modules/excel/pivot-table";

// =============================================================================
// Utilities
// =============================================================================
export * from "./modules/excel/utils/sheet-utils";

// =============================================================================
// CSV support (using native RFC 4180 implementation)
// =============================================================================
export type {
  CsvReadOptions,
  CsvWriteOptions,
  CsvStreamReadOptions,
  CsvStreamWriteOptions
} from "./modules/csv/csv.browser";
export { CsvParserStream, CsvFormatterStream } from "./modules/csv/csv.browser";

// =============================================================================
// Streaming Writer (Browser-compatible)
// Uses cross-platform base implementation without Node.js fs
// =============================================================================

import { WorkbookWriter } from "./modules/excel/stream/workbook-writer.browser";
import { WorkbookReader } from "./modules/excel/stream/workbook-reader.browser";
import { WorksheetWriter } from "./modules/excel/stream/worksheet-writer";
import { WorksheetReader } from "./modules/excel/stream/worksheet-reader";

export { WorkbookWriter, WorkbookReader, WorksheetWriter, WorksheetReader };

// =============================================================================
// Stream Module - Cross-platform stream utilities
// Works in both Node.js and Browser environments
// =============================================================================

export {
  // Core stream classes (use these directly!)
  Readable,
  Writable,
  Transform,
  Duplex,
  PassThrough,
  EventEmitter,
  // Specialized streams
  Collector,
  PullStream,
  BufferedStream,
  // Factory functions (alternative to new Class())
  createReadable,
  createWritable,
  createTransform,
  createCollector,
  createPassThrough,
  createReadableFromArray,
  createReadableFromAsyncIterable,
  createReadableFromGenerator,
  createReadableFromPromise,
  createDuplex,
  createEmptyReadable,
  createNullWritable,
  // Pipeline utilities
  pipeline,
  finished,
  // High-level convenience functions (EASY TO USE!)
  collect,
  text,
  json,
  bytes,
  fromString,
  fromJSON,
  fromBytes,
  transform,
  filter,
  // Binary utilities (auto-convert between types!)
  toUint8Array,
  bufferToString,
  stringToUint8Array,
  uint8ArrayToString,
  uint8ArrayEquals,
  uint8ArrayIndexOf,
  concatUint8Arrays,
  // Stream utilities
  streamToUint8Array,
  streamToBuffer,
  streamToString,
  drainStream,
  copyStream,
  addAbortSignal,
  once,
  // Type guards
  isReadable,
  isWritable,
  isTransform,
  isDuplex,
  isStream,
  isDestroyed,
  // Consumers API (like Node.js stream/consumers)
  consumers,
  // Promises API (like Node.js stream/promises)
  promises
} from "./modules/stream/index.browser";

// =============================================================================
// NOTE: Node.js-only features not available in browser:
// - Reading from a file path is not supported (use Uint8Array/ArrayBuffer/Blob instead)
// - Writing to a file path is not supported (use writeBuffer() / stream output, then save as Blob/download)
// =============================================================================
