/**
 * CSV Format Module - Public Exports
 *
 * Provides all CSV formatting functionality:
 * - formatCsv: Main batch formatting function
 * - Low-level utilities for streaming formatters
 */

// =============================================================================
// Configuration
// =============================================================================

export type { FormatConfig } from "./config";
export { createFormatConfig } from "./config";

// =============================================================================
// Formatting
// =============================================================================

export { formatCsv, formatRowWithLookup } from "./formatter";
