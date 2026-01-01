// =============================================================================
// Main Classes
// =============================================================================

export { Workbook } from "./doc/workbook";
export { Worksheet } from "./doc/worksheet";
export { Row } from "./doc/row";
export { Column } from "./doc/column";
export { Cell } from "./doc/cell";
export { Range } from "./doc/range";
export { Image } from "./doc/image";
export * from "./doc/anchor";
export { Table } from "./doc/table";
export { DataValidations } from "./doc/data-validations";

// =============================================================================
// Node.js Only: Streaming Classes
// These can also be accessed via Workbook.createStreamWriter/createStreamReader
// =============================================================================

export { WorkbookWriter } from "./stream/workbook-writer";
export { WorkbookReader } from "./stream/workbook-reader";
export { WorksheetWriter } from "./stream/worksheet-writer";
export { WorksheetReader } from "./stream/worksheet-reader";

// =============================================================================
// Enums
// =============================================================================

export * from "./doc/enums";

// =============================================================================
// Types
// =============================================================================

// Export all type definitions from types.ts
export * from "./types";

// Pivot table types
export type {
  PivotTable,
  PivotTableModel,
  PivotTableSource,
  CacheField,
  DataField,
  PivotTableSubtotal,
  ParsedCacheDefinition,
  ParsedCacheRecords
} from "./doc/pivot-table";

// Node.js Only: Streaming reader types
export type {
  WorkbookReaderOptions,
  ParseEvent,
  SharedStringEvent,
  WorksheetReadyEvent,
  HyperlinksEvent
} from "./stream/workbook-reader";

export type {
  WorksheetReaderOptions,
  WorksheetEvent,
  RowEvent,
  HyperlinkEvent,
  WorksheetHyperlink
} from "./stream/worksheet-reader";

// Node.js Only: Streaming writer types
export type { WorkbookWriterOptions, ZipOptions, ZlibOptions } from "./stream/workbook-writer";

// Node.js CSV types and stream classes (native implementation)
export type {
  CsvReadOptions,
  CsvWriteOptions,
  CsvStreamReadOptions,
  CsvStreamWriteOptions
} from "./modules/csv/csv";
export { CsvParserStream, CsvFormatterStream } from "./modules/csv/csv";

// =============================================================================
// Utilities
// =============================================================================

export * from "./utils/sheet-utils";

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
} from "./modules/stream/index";
