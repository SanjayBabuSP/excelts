/**
 * CSV Browser Unit Tests - Worksheet Integration (Node.js)
 *
 * Runs shared CSV worksheet tests in Node.js environment.
 */

import { describe } from "vitest";
import { Workbook } from "../../../doc/workbook";
import {
  parseCsvToWorksheet,
  formatWorksheetToCsv,
  createDefaultValueMapper,
  createDefaultWriteMapper
} from "../csv.browser";
import {
  runCsvWorksheetTests,
  type CsvWorksheetModuleImportsGeneric
} from "./csv-worksheet.shared";

describe("CSV Browser - Worksheet Integration", () => {
  const imports = {
    Workbook,
    parseCsvToWorksheet,
    formatWorksheetToCsv,
    createDefaultValueMapper,
    createDefaultWriteMapper
  } satisfies CsvWorksheetModuleImportsGeneric<InstanceType<typeof Workbook>>;

  runCsvWorksheetTests(imports);
});
