// =============================================================================
// Main Classes
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
export { FormCheckbox } from "@excel/form-control";

// =============================================================================
// Node.js Only: Streaming Classes
// These can also be accessed via Workbook.createStreamWriter/createStreamReader
// =============================================================================

export { WorkbookWriter } from "@excel/stream/workbook-writer";
export { WorkbookReader } from "@excel/stream/workbook-reader";
export { WorksheetWriter } from "@excel/stream/worksheet-writer";
export { WorksheetReader } from "@excel/stream/worksheet-reader";

// =============================================================================
// Enums
// =============================================================================

export * from "@excel/enums";

// =============================================================================
// Types
// =============================================================================

// Export all type definitions from types.ts
export * from "@excel/types";

// Pivot table types
export type {
  PivotTable,
  PivotTableModel,
  PivotTableValue,
  PivotTableSource,
  CacheField,
  SharedItemValue,
  DataField,
  PivotTableSubtotal,
  RecordValue,
  ParsedCacheDefinition,
  ParsedCacheRecords
} from "@excel/pivot-table";

// Form control types
export type {
  FormCheckboxModel,
  FormCheckboxOptions,
  FormControlRange,
  FormControlAnchor
} from "@excel/form-control";

// Node.js Only: Streaming reader types
export type {
  WorkbookReaderOptions,
  ParseEvent,
  SharedStringEvent,
  WorksheetReadyEvent,
  HyperlinksEvent
} from "@excel/stream/workbook-reader";

export type {
  WorksheetReaderOptions,
  WorksheetEvent,
  RowEvent,
  HyperlinkEvent,
  WorksheetHyperlink
} from "@excel/stream/worksheet-reader";

// Node.js Only: Streaming writer types
export type { WorkbookWriterOptions, ZipOptions, ZlibOptions } from "@excel/stream/workbook-writer";

// Node.js CSV types (from workbook)
export type { CsvOptions, CsvInput } from "@excel/workbook";

// CSV stream classes
export {
  CsvParserStream,
  CsvFormatterStream,
  createCsvParserStream,
  createCsvFormatterStream
} from "@csv/stream";
export { parseCsv } from "@csv/parse";
export { parseCsvAsync, parseCsvRows, parseCsvWithProgress } from "@csv/parse";
export { formatCsv } from "@csv/format";

// CSV Generator (extras)
export {
  csvGenerate,
  csvGenerateRows,
  csvGenerateAsync,
  csvGenerateData,
  createCsvGenerator,
  type CsvGenerateOptions,
  type CsvGenerateResult,
  type ColumnDef,
  type GeneratorColumnConfig,
  type BuiltinColumnType,
  type GeneratorFn,
  type GeneratorContext,
  type StopCondition,
  type StopContext
} from "@csv/utils/generate";

// =============================================================================
// Utilities
// =============================================================================

export * from "@excel/utils/sheet-utils";

// =============================================================================
// Errors
// =============================================================================

export {
  ExcelError,
  isExcelError,
  ExcelFileError,
  ExcelDownloadError,
  ExcelNotSupportedError,
  ExcelStreamStateError,
  InvalidAddressError,
  ColumnOutOfBoundsError,
  RowOutOfBoundsError,
  MergeConflictError,
  InvalidValueTypeError,
  XmlParseError,
  WorksheetNameError,
  PivotTableError,
  TableError,
  ImageError,
  MaxItemsExceededError
} from "@excel/errors";

export { CsvError, CsvWorkerError } from "@csv/errors";
