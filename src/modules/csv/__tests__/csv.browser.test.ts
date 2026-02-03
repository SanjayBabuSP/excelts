/**
 * CSV Browser Module Tests - Worksheet Integration (Node.js Runtime)
 *
 * Tests the browser-compatible CSV module (csv.browser.ts) in Node.js environment.
 * This ensures the browser bundle works correctly in Node.js as well.
 *
 * Note: For actual browser runtime tests, see browser/csv.test.ts
 */

import { describe } from "vitest";
import { Workbook } from "@excel/workbook";
import {
  parseCsvToWorksheet,
  formatWorksheetToCsv,
  createDefaultValueMapper,
  createDefaultWriteMapper
} from "@csv/csv.browser";
import {
  runCsvWorksheetTests,
  type CsvWorksheetModuleImportsGeneric
} from "@csv/__tests__/csv-worksheet.shared";

describe("CSV Browser Module - Worksheet Integration (Node.js)", () => {
  const imports = {
    Workbook,
    parseCsvToWorksheet,
    formatWorksheetToCsv,
    createDefaultValueMapper,
    createDefaultWriteMapper
  } satisfies CsvWorksheetModuleImportsGeneric<InstanceType<typeof Workbook>>;

  runCsvWorksheetTests(imports);
});
