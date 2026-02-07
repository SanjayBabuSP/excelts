/**
 * CSV Parse Module - Public Exports
 *
 * Provides all CSV parsing functionality:
 * - parseCsv: Main synchronous parsing function
 * - parseFastMode, parseWithScanner: Low-level parsing generators
 * - Configuration and state types/factories
 */

// =============================================================================
// Synchronous Parsing
// =============================================================================

export { parseCsv, parseFastMode, parseWithScanner } from "./sync";

// =============================================================================
// Configuration
// =============================================================================

export type { ParseConfig, CreateParseConfigOptions, ParseConfigResult } from "./config";
export { createParseConfig, resolveParseConfig, makeTrimField } from "./config";

// =============================================================================
// State Management
// =============================================================================

export type { ParseState } from "./state";
export { createParseState, resetInfoState } from "./state";

// =============================================================================
// Row Processing
// =============================================================================

export type { RowProcessResult } from "./row-processor";
export { processCompletedRow, shouldSkipRow } from "./row-processor";

// =============================================================================
// Asynchronous Parsing
// =============================================================================

export { parseCsvAsync, parseCsvRows, parseCsvWithProgress } from "./async";
