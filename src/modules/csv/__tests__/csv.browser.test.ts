/**
 * CSV Browser Unit Tests - Worksheet Integration (Node.js)
 *
 * Runs shared CSV worksheet tests in Node.js environment.
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

describe("CSV Browser - Worksheet Integration", () => {
  const imports = {
    Workbook,
    parseCsvToWorksheet,
    formatWorksheetToCsv,
    createDefaultValueMapper,
    createDefaultWriteMapper
  } as CsvWorksheetModuleImportsGeneric<InstanceType<typeof Workbook>>;

  runCsvWorksheetTests(imports);
});
