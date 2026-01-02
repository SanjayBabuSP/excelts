import path from "node:path";
import { fileURLToPath } from "node:url";

import { Workbook } from "../../../index";

const inputFile = fileURLToPath(new URL("./data/comments.xlsx", import.meta.url));
const outputFile = path.join(path.dirname(inputFile), "comments-out.xlsx");

const wb = new Workbook();

wb.xlsx
  .readFile(inputFile)
  .then(() => {
    wb.worksheets.forEach(sheet => {
      console.info(sheet.getCell("A1").model);
      sheet.getCell("B2").value = "Zeb";
      sheet.getCell("B2").comment = {
        texts: [
          {
            font: {
              size: 12,
              color: { theme: 0 },
              name: "Calibri",
              family: 2,
              scheme: "minor"
            },
            text: "This is "
          },
          {
            font: {
              italic: true,
              size: 12,
              color: { theme: 0 },
              name: "Calibri",
              scheme: "minor"
            },
            text: "a"
          },
          {
            font: {
              size: 12,
              color: { theme: 1 },
              name: "Calibri",
              family: 2,
              scheme: "minor"
            },
            text: " "
          },
          {
            font: {
              size: 12,
              color: { argb: "FFFF6600" },
              name: "Calibri",
              scheme: "minor"
            },
            text: "colorful"
          },
          {
            font: {
              size: 12,
              color: { theme: 1 },
              name: "Calibri",
              family: 2,
              scheme: "minor"
            },
            text: " text "
          },
          {
            font: {
              size: 12,
              color: { argb: "FFCCFFCC" },
              name: "Calibri",
              scheme: "minor"
            },
            text: "with"
          },
          {
            font: {
              size: 12,
              color: { theme: 1 },
              name: "Calibri",
              family: 2,
              scheme: "minor"
            },
            text: " in-cell "
          },
          {
            font: {
              bold: true,
              size: 12,
              color: { theme: 1 },
              name: "Calibri",
              family: 2,
              scheme: "minor"
            },
            text: "format"
          }
        ]
      };
    });

    return wb.xlsx.writeFile(outputFile);
  })
  .then(() => {
    console.log("Wrote", outputFile);
  })
  .catch(console.error);
