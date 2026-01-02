// --------------------------------------------------
// Generates a pivot-table workbook where the same field is
// used as both a pivot axis (rows) and as a value field.
// Output is written to the repo-root out/ directory.
// --------------------------------------------------

import fs from "node:fs";
import path from "node:path";

import { Workbook } from "../../../index";

async function main() {
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet("Data");

  // Shared-field scenario: field C is used for both rows and values
  const table = worksheet.addTable({
    name: "SalesData",
    ref: "A1",
    headerRow: true,
    columns: [{ name: "A" }, { name: "B" }, { name: "C" }],
    rows: [
      ["a1", "b1", 5],
      ["a1", "b2", 5],
      ["a2", "b1", 24],
      ["a2", "b2", 35],
      ["a3", "b1", 45],
      ["a3", "b2", 45]
    ]
  });

  const pivotSheet = workbook.addWorksheet("PivotTable");

  // Same field C used for both rows and values
  pivotSheet.addPivotTable({
    sourceTable: table,
    rows: ["C"],
    columns: ["B"],
    values: ["C"],
    metric: "sum"
  });

  const outDir = path.join(process.cwd(), "out");
  fs.mkdirSync(outDir, { recursive: true });
  const filename = path.join(outDir, "pivot-table-shared-field-row-and-value.xlsx");
  await workbook.xlsx.writeFile(filename);

  console.log(`✅ File generated: ${filename}`);
  console.log("");
  console.log("Source Data:");
  console.log("  A    B    C");
  console.log("  a1   b1   5");
  console.log("  a1   b2   5");
  console.log("  a2   b1   24");
  console.log("  a2   b2   35");
  console.log("  a3   b1   45");
  console.log("  a3   b2   45");
  console.log("");
  console.log("Pivot Table Config:");
  console.log('  rows: ["C"]');
  console.log('  columns: ["B"]');
  console.log('  values: ["C"] (Sum)');
  console.log("");
  console.log("Please open the file in Excel to verify the Pivot Table displays correctly.");
}

main().catch(console.error);
