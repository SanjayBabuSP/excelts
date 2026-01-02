import { Workbook } from "../../../index";

const wb = new Workbook();
const ws = wb.addWorksheet("A1 Notation");

// A1 addressing
ws.getCell("A1").value = "A1";
ws.getCell("B2").value = "B2";

// Row/column addressing (1-based)
ws.getCell(1, 3).value = "C1";
ws.getCell(3, 1).value = "A3";

// Verify we can read values back with either style
console.log("A1 =", ws.getCell("A1").value);
console.log("B2 =", ws.getCell(2, 2).value);
console.log("C1 =", ws.getCell("C1").value);
console.log("A3 =", ws.getCell(3, 1).value);

console.log("Done.");
