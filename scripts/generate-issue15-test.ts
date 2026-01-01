import { Workbook } from "../src/index";

async function main() {
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet("Data");

  // Simulate issue #15 data: field C is used for both rows and values
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

  // Issue #15: Same field C used for both rows and values
  pivotSheet.addPivotTable({
    sourceTable: table,
    rows: ["C"],
    columns: ["B"],
    values: ["C"],
    metric: "sum"
  });

  await workbook.xlsx.writeFile("issue15-test.xlsx");

  console.log("✅ File generated: issue15-test.xlsx");
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
