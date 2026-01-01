import { describe, it, expect } from "vitest";
import { join } from "path";
import { readFileSync } from "fs";
import { Workbook } from "../../../index";
import { testDataPath } from "../../../modules/excel/utils/__test__/test-file-helper";

const fileName = testDataPath("test-issue-2925.xlsx");

describe("github issues", () => {
  describe("issue 2925 - Out of Memory while loading file with many definedNames", () => {
    /**
     * This test verifies that files with many definedNames (35,000+) containing
     * array constants wrapped in {} are handled correctly without causing OOM.
     *
     * The root cause was that array constants like {"'Sheet1'!$A$1:$B$10"} were
     * being incorrectly parsed as cell ranges, causing colCache.decodeEx to
     * misinterpret the {} characters and create massive fake ranges.
     *
     * For example:
     * - Correct: "'Sheet1'!$S$1:$AE$53" -> 13 cols × 53 rows = 689 cells
     * - Bug: "{'Sheet1'!$S$1:$AE$53}" -> 10182 cols × 48 rows = 488,736 cells
     */
    it("should load file with many definedNames without memory issues", async () => {
      const wb = new Workbook();
      await wb.xlsx.readFile(fileName);

      // File should be loaded successfully
      expect(wb.worksheets.length).toBeGreaterThan(0);

      // Verify that definedNames were processed (some valid ones exist)
      // The file has ~35,000 definedNames but most are invalid (#REF!, #N/A, or array constants)
      // Only a small number should be valid cell references
      const definedNamesModel = wb.definedNames.model;
      expect(Array.isArray(definedNamesModel)).toBe(true);

      // The valid ranges should be much fewer than total definedNames in the file
      // This ensures array constants like {"'Sheet'!$A$1"} are filtered out
      expect(definedNamesModel.length).toBeLessThan(1000);
    });

    it("should load file from buffer without memory issues", async () => {
      const filePath = join(process.cwd(), fileName);
      const buffer = readFileSync(filePath);
      const wb = new Workbook();
      await wb.xlsx.load(buffer);

      // File should be loaded successfully
      expect(wb.worksheets.length).toBeGreaterThan(0);
    });

    it("should correctly filter out array constants from definedNames", async () => {
      const wb = new Workbook();
      await wb.xlsx.readFile(fileName);

      // Get all ranges from definedNames
      const allRanges: string[] = [];
      wb.definedNames.model.forEach((dn: { ranges: string[] }) => {
        allRanges.push(...dn.ranges);
      });

      // No range should start or end with { or }
      allRanges.forEach(range => {
        expect(range.startsWith("{")).toBe(false);
        expect(range.endsWith("}")).toBe(false);
      });
    });
  });
});
