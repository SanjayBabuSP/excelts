// Generate test file for GitHub Issue #5 - PivotTable fix verification
import { Workbook } from "../src/index";

async function main() {
  const workbook = new Workbook();

  // Create source table worksheet
  const worksheet = workbook.addWorksheet("table");
  const table = worksheet.addTable({
    name: "table",
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

  // Create pivot table worksheet
  const worksheet2 = workbook.addWorksheet("Sheet2");
  worksheet2.addPivotTable({
    sourceTable: table,
    rows: ["A"],
    columns: ["B"],
    values: ["C"],
    metric: "sum"
  });

  // Write file
  const filename = "./test-pivot-issue5.xlsx";
  await workbook.xlsx.writeFile(filename);
  console.log(`Test file generated: ${filename}`);
  console.log("Open this file in Excel and check:");
  console.log("1. The PivotTable should display correctly in Sheet2");
  console.log('2. Click "Refresh" on PivotTable - should NOT show error');
  console.log("3. Row labels should show: a1, a2, a3, Grand Total");
  console.log("4. Column labels should show: b1, b2, Grand Total");
}

main().catch(console.error);
