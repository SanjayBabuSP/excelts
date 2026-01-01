/**
 * True Streaming CSV Tests - Node.js Implementation
 *
 * Uses Node.js-specific APIs to verify TRUE streaming behavior for CSV.
 */

import { beforeAll } from "vitest";
import { createTrueStreamingCsvTests } from "../utils/true-streaming-csv-tests";

// Lazy imports
let CsvParserStream: any;
let CsvFormatterStream: any;

beforeAll(async () => {
  // Dynamic imports for Node.js environment
  const csvModule = await import("../../modules/csv/csv");
  CsvParserStream = csvModule.CsvParserStream;
  CsvFormatterStream = csvModule.CsvFormatterStream;
});

// ============================================================================
// Node.js-Specific Test Context
// ============================================================================

function getNodeContext() {
  return {
    isBrowser: false,

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

createTrueStreamingCsvTests(getNodeContext);
