#!/usr/bin/env node
/**
 * Form Control Checkbox example
 *
 * Generates an XLSX file with legacy Form Control Checkboxes that work in:
 * - Microsoft Excel 2007+
 * - Microsoft 365 (both desktop and online)
 * - WPS Office
 * - LibreOffice Calc
 *
 * Unlike in-cell checkboxes (which only work in Microsoft 365), Form Control
 * Checkboxes are backward compatible with older Excel versions.
 *
 * Usage:
 *   npx nodemon src/modules/excel/examples/form-checkbox.ts [outputPath]
 */

import { Workbook } from "@excel/workbook";

async function main(): Promise<void> {
  const outputPath = process.argv[2] || "src/modules/excel/examples/data/form-checkbox.xlsx";

  const wb = new Workbook();
  wb.creator = "excelts";

  const ws = wb.addWorksheet("Form Controls");

  // Header
  ws.getCell("A1").value = "Form Control Checkbox Demo";
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.mergeCells("A1:E1");

  // Instructions
  ws.getCell("A3").value = "These are legacy Form Control Checkboxes.";
  ws.getCell("A4").value = "They work in Excel 2007+, WPS Office, and LibreOffice.";

  // Labels
  ws.getCell("A6").value = "Option";
  ws.getCell("C6").value = "Checkbox";
  ws.getCell("E6").value = "Linked Value";
  ws.getRow(6).font = { bold: true };

  // Data rows
  const options = [
    { name: "Enable feature A", checked: true, linkedCell: "E8" },
    { name: "Enable feature B", checked: false, linkedCell: "E10" },
    { name: "Accept terms", checked: true, linkedCell: "E12" },
    { name: "Subscribe newsletter", checked: false, linkedCell: "E14" }
  ];

  // Set row heights and add checkboxes
  options.forEach((opt, index) => {
    const rowNumber = 8 + index * 2;

    // Label
    ws.getCell(`A${rowNumber}`).value = opt.name;

    // Add form checkbox (placed in column B-C, spanning row height)
    // Range format: "startCell:endCell" - the checkbox will be positioned over this range
    ws.addFormCheckbox(`B${rowNumber}:C${rowNumber + 1}`, {
      checked: opt.checked,
      link: opt.linkedCell,
      text: "" // Empty text since we have label in column A
    });

    // Linked cell will display TRUE/FALSE based on checkbox state
    // (value is updated when user clicks checkbox in Excel)
    ws.getCell(opt.linkedCell).value = opt.checked;

    // Set row height
    ws.getRow(rowNumber).height = 25;
    ws.getRow(rowNumber + 1).height = 10;
  });

  // Column widths
  ws.getColumn("A").width = 25;
  ws.getColumn("B").width = 4;
  ws.getColumn("C").width = 10;
  ws.getColumn("D").width = 5;
  ws.getColumn("E").width = 15;

  // Additional example: Checkbox with text label inside
  ws.getCell("A18").value = "Checkbox with built-in label:";
  ws.addFormCheckbox("B18:D19", {
    checked: false,
    text: "I agree to the terms",
    link: "E18"
  });
  ws.getRow(18).height = 25;

  // Note about linked cells
  ws.getCell("A21").value = "Note: Click checkboxes in Excel to update linked cell values.";
  ws.getCell("A21").font = { italic: true, color: { argb: "FF666666" } };

  await wb.xlsx.writeFile(outputPath);

  console.log(`Wrote: ${outputPath}`);
  console.log("");
  console.log("Open the file in:");
  console.log("  - Microsoft Excel 2007 or later");
  console.log("  - WPS Office");
  console.log("  - LibreOffice Calc");
  console.log("");
  console.log("Click on checkboxes to toggle them and see linked cell values update.");
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
