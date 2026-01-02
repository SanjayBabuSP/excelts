/**
 * True Streaming CSV Tests - Browser Implementation
 *
 * Uses Browser-specific APIs to verify TRUE streaming behavior for CSV.
 */

import { createTrueStreamingCsvTests } from "@stream/__tests__/streaming/true-streaming-csv-tests";
import { CsvParserStream, CsvFormatterStream } from "@csv/csv.browser";

// ============================================================================
// Browser-Specific Test Context
// ============================================================================

function getBrowserContext() {
  return {
    isBrowser: true,

    // CSV Parser
    createCsvParser: (options?: { headers?: boolean }) => {
      return new CsvParserStream(options);
    },

    // CSV Formatter
    createCsvFormatter: () => {
      return new CsvFormatterStream();
    }
  };
}

// ============================================================================
// Run Shared Tests
// ============================================================================

createTrueStreamingCsvTests(getBrowserContext);
