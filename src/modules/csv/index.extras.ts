/**
 * CSV Module - Extras
 *
 * Opt-in utilities that are useful but not required for core parsing/formatting.
 * Exported as a namespace via csvExtras from the main CSV entrypoints.
 */

// =============================================================================
// Dynamic Typing
// =============================================================================

export {
  convertValue,
  tryParseDate,
  shouldCastDate,
  applyDynamicTyping,
  applyDynamicTypingToRow,
  applyDynamicTypingToArrayRow
} from "./utils/dynamic-typing";

// =============================================================================
// CSV Generator
// =============================================================================

export {
  csvGenerate,
  csvGenerateRows,
  csvGenerateAsync,
  csvGenerateData,
  createCsvGenerator,
  type CsvGenerateOptions,
  type CsvGenerateResult,
  type ColumnDef,
  type ColumnConfig as GenerateColumnConfig,
  type BuiltinColumnType,
  type GeneratorFn,
  type GeneratorContext,
  type StopCondition,
  type StopContext
} from "./utils/generate";

// =============================================================================
// Number Formatting
// =============================================================================

export { formatNumberForCsv, parseNumberFromCsv, type DecimalSeparator } from "./csv-number";
