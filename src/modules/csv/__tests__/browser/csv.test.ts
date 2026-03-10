/**
 * CSV Worksheet Integration Browser Tests
 *
 * Runs shared CSV worksheet tests in browser environment.
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

// =============================================================================
// Run Shared Tests
// =============================================================================
describe("CSV Worksheet - Browser", () => {
  const imports = {
    Workbook,
    parseCsvToWorksheet,
    formatWorksheetToCsv,
    createDefaultValueMapper,
    createDefaultWriteMapper
  } as CsvWorksheetModuleImportsGeneric<InstanceType<typeof Workbook>>;

  runCsvWorksheetTests(imports);
});
