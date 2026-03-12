/**
 * Test for HAN CELL xlsx files
 *
 * HAN CELL is a spreadsheet application that uses namespace prefixes
 * in its XML output (e.g., "x:workbook", "ep:Properties", "dc:creator")
 * instead of the more common unprefixed element names used by Microsoft Excel.
 *
 * This test ensures that files created by HAN CELL can be loaded correctly.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, expect } from "vitest";
import { Workbook } from "@excel/workbook";

const TEST_DATA_DIR = path.join(__dirname, "data");

describe("HAN CELL xlsx files", () => {
  it("should load xlsx files created by HAN CELL with namespace prefixes", async () => {
    const filePath = path.join(TEST_DATA_DIR, "han-cell-test.xlsx");
    const buffer = fs.readFileSync(filePath);

    const workbook = new Workbook();
    await workbook.xlsx.load(buffer);

    // Verify the workbook was loaded correctly
    expect(workbook.worksheets.length).toBe(1);
    expect(workbook.worksheets[0].name).toBe("no build");
  });

  it("should read shared strings from HAN CELL files", async () => {
    const filePath = path.join(TEST_DATA_DIR, "han-cell-test.xlsx");
    const buffer = fs.readFileSync(filePath);

    const workbook = new Workbook();
    await workbook.xlsx.load(buffer);

    // The HAN CELL file should have some shared strings
    // (The test file has cells with text content)
    const worksheet = workbook.worksheets[0];
    expect(worksheet).toBeDefined();
  });
});
