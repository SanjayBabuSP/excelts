#!/usr/bin/env node
/**
 * Checkbox example
 *
 * Generates an XLSX file that uses in-cell checkbox UI (Office Online compatible).
 *
 * Usage:
 *   node src/modules/excel/examples/checkbox.ts [outputPath]
 */

import { Workbook } from "@excel/workbook";

async function main(): Promise<void> {
  const outputPath = process.argv[2] || "src/modules/excel/examples/data/checkbox.xlsx";

  const wb = new Workbook();
  wb.creator = "excelts";

  const ws = wb.addWorksheet("Checkbox");

  ws.getCell("A1").value = "Task";
  ws.getCell("B1").value = "Done";
  ws.getRow(1).font = { bold: true };

  const rows: Array<{ task: string; done: boolean; priority: "P0" | "P1" | "P2" }> = [
    { task: "Implement checkbox (Office Online)", done: true, priority: "P0" },
    { task: "Merge user styles with checkbox", done: true, priority: "P1" },
    { task: "Regression tests", done: true, priority: "P1" },
    { task: "Try opening in Excel/Office Online", done: false, priority: "P2" }
  ];

  rows.forEach((r, i) => {
    const rowNo = i + 2;
    ws.getCell(`A${rowNo}`).value = r.task;
    ws.getCell(`B${rowNo}`).value = { checkbox: r.done };
    ws.getCell(`C${rowNo}`).value = r.priority;
  });

  ws.getColumn(1).width = 46;
  ws.getColumn(2).width = 12;
  ws.getColumn(3).width = 10;

  // Add some styling to prove checkbox + user style merge works
  ws.getCell("B2").style.font = { bold: true };
  ws.getCell("B3").style.fill = {
    type: "gradient",
    gradient: "path",
    center: { left: 0.5, top: 0.5 },
    stops: [
      { position: 0, color: { argb: "FFB3E5FC" } },
      { position: 1, color: { argb: "FFFFFFFF" } }
    ]
  } as any;

  ws.getCell("A1").style.alignment = { vertical: "middle", horizontal: "center" } as any;
  ws.getCell("B1").style.alignment = { vertical: "middle", horizontal: "center" } as any;
  ws.getCell("C1").value = "Priority";

  await wb.xlsx.writeFile(outputPath);

  console.log(`Wrote: ${outputPath}`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
