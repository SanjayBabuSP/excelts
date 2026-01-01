/**
 * CSV Worksheet Integration Browser Tests
 *
 * Runs shared CSV worksheet tests in browser environment.
 */

import { describe } from "vitest";
import { Workbook } from "../../doc/workbook";
import {
  parseCsvToWorksheet,
  formatWorksheetToCsv,
  createDefaultValueMapper,
  createDefaultWriteMapper
} from "../../modules/csv/csv.browser";
import {
  runCsvWorksheetTests,
  type CsvWorksheetModuleImportsGeneric
} from "../../modules/csv/__test__/csv-worksheet.shared";

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
  } satisfies CsvWorksheetModuleImportsGeneric<InstanceType<typeof Workbook>>;

  runCsvWorksheetTests(imports);
});
