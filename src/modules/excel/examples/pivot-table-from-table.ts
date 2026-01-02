// --------------------------------------------------
// This example demonstrates creating a pivot table
// from a Table source using the sourceTable property.
//
// Requirements for sourceTable:
// - Table must have headerRow enabled (default: true)
// - Table must have at least one data row
// - Table column names must be unique
// - Table can start at any cell (e.g., "A1", "C5", etc.)
// --------------------------------------------------

import { Workbook } from "../../../index";
import { HrStopwatch } from "@excel/examples/utils/hr-stopwatch";

function main(filepath: string) {
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet("Sheet1");

  // Create a table as the data source
  const table = worksheet.addTable({
    name: "SalesData",
    ref: "A1",
    columns: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }, { name: "E" }],
    rows: [
      ["a1", "b1", "c1", 4, 5],
      ["a1", "b2", "c1", 4, 5],
      ["a2", "b1", "c2", 14, 24],
      ["a2", "b2", "c2", 24, 35],
      ["a3", "b1", "c3", 34, 45],
      ["a3", "b2", "c3", 44, 45]
    ]
  });

  // Create a pivot table on a new worksheet using the table as source
  const worksheet2 = workbook.addWorksheet("Sheet2");
  worksheet2.addPivotTable({
    sourceTable: table,
    rows: ["A", "B"],
    columns: ["C"],
    values: ["E"], // Exactly 1 field
    metric: "sum" // Metric: 'sum' only
  });

  save(workbook, filepath);
}

function save(workbook: Workbook, filepath: string) {
  const stopwatch = new HrStopwatch();
  stopwatch.start();

  workbook.xlsx.writeFile(filepath).then(() => {
    const microseconds = stopwatch.microseconds;
    console.log("Done.");
    console.log("Time taken:", microseconds);
  });
}

const [, , filepath] = process.argv;
main(filepath);
