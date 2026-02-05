/**
 * True Streaming CSV Tests - Node.js
 *
 * Runs the shared true-streaming test suite against the Node.js CSV streams.
 */

import { beforeAll } from "vitest";
import { createTrueStreamingCsvTests } from "@stream/__tests__/streaming/true-streaming-csv-tests";

// Lazy imports
let CsvParserStream: any;
let CsvFormatterStream: any;

beforeAll(async () => {
  // Dynamic imports for Node.js environment
  const csvModule = await import("@csv/index");
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
