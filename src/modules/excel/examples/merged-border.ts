import { Workbook } from "../../../index";

const filename = process.argv[2];

const wb = new Workbook();
const ws = wb.addWorksheet("blort");

const borders = {
  thin: {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" }
  },
  doubleRed: {
    color: { argb: "FFFF0000" },
    top: { style: "double" },
    left: { style: "double" },
    bottom: { style: "double" },
    right: { style: "double" }
  }
} as const;

// Example 1: Set borders BEFORE merge — outer borders are preserved automatically
// No need to manually set borders on each cell after merge.
ws.getCell("B2").value = "Auto borders";
ws.getCell("B2").border = borders.thin;
ws.getCell("C2").border = borders.thin;
ws.mergeCells("B2:C2");
// Result: B2 gets {left, top, bottom}, C2 gets {right, top, bottom}

// Example 2: Rectangular merge — perimeter borders preserved, inner borders cleared
ws.getCell("E2").value = "Rect merge";
ws.getCell("E2").border = borders.thin;
ws.getCell("F2").border = borders.thin;
ws.getCell("E3").border = borders.thin;
ws.getCell("F3").border = borders.thin;
ws.mergeCells("E2:F3");
// Result: E2 = {left, top}, F2 = {right, top}, E3 = {left, bottom}, F3 = {right, bottom}

// Example 3: Set borders AFTER merge — still works as before
ws.getCell("H2").value = "Manual";
ws.mergeCells("H2:I3");
ws.getCell("H2").border = borders.doubleRed;
ws.getCell("I2").border = borders.doubleRed;
ws.getCell("H3").border = borders.doubleRed;
ws.getCell("I3").border = borders.doubleRed;

try {
  await wb.xlsx.writeFile(filename);
  console.log("Done.");
} catch (error) {
  console.log(error.message);
}
