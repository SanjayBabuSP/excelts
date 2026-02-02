/**
 * CSV Module - Browser Public API
 *
 * Browser-compatible exports (no Node.js specific features).
 */

// =============================================================================
// Shared Exports (types, functions, utilities)
// =============================================================================

export * from "./index.shared";

// =============================================================================
// CSV Class (Workbook Integration) - Browser Version
// =============================================================================

export { CSV, createDefaultValueMapper, createDefaultWriteMapper } from "./csv.browser";
export type { CsvOptions, DefaultValueMapperOptions } from "./csv.browser";
