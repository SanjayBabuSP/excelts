import { beforeEach, describe, expect, it } from "vitest";

import { Workbook } from "../../../index";
import { extractAll } from "../../../modules/archive/extract";

// Issue 2315: File corruption due to incorrect worksheet file naming
// When worksheets have non-sequential sheetIds (e.g., 1, 3 instead of 1, 2),
// the output should still use sequential file names (sheet1.xml, sheet2.xml)
// not sheetId-based names (sheet1.xml, sheet3.xml)
describe("github issues", () => {
  describe("issue 2315 - worksheet file naming with non-sequential sheetIds", () => {
    let workbook: Workbook;

    beforeEach(() => {
      workbook = new Workbook();
    });

    it("should use sequential file names regardless of sheetId values", async () => {
      // Create a workbook with two sheets and manually set non-sequential sheetIds
      const ws1 = workbook.addWorksheet("Sheet1");
      const ws2 = workbook.addWorksheet("Sheet2");

      // Simulate non-sequential sheetIds (as would happen when reading a file with deleted sheets)
      ws1.id = 1;
      ws2.id = 3; // Non-sequential: skipped id 2

      ws1.getCell("A1").value = "Sheet 1 Data";
      ws2.getCell("A1").value = "Sheet 2 Data";

      expect(workbook.worksheets.length).toBe(2);

      // Write to buffer
      const buffer = await workbook.xlsx.writeBuffer();

      // Parse the output to verify file structure
      const zipData = await extractAll(new Uint8Array(buffer));

      // Verify worksheet files use sequential naming (sheet1.xml, sheet2.xml)
      // not sheetId-based naming (sheet1.xml, sheet3.xml)
      expect(zipData.has("xl/worksheets/sheet1.xml")).toBe(true);
      expect(zipData.has("xl/worksheets/sheet2.xml")).toBe(true);

      // sheet3.xml should NOT exist since we only have 2 worksheets
      expect(zipData.has("xl/worksheets/sheet3.xml")).toBe(false);

      // Verify workbook.xml.rels references the correct files
      const relsData = zipData.get("xl/_rels/workbook.xml.rels");
      const relsContent = new TextDecoder().decode(relsData?.data);
      expect(relsContent).toContain("worksheets/sheet1.xml");
      expect(relsContent).toContain("worksheets/sheet2.xml");
      expect(relsContent).not.toContain("worksheets/sheet3.xml");
    });

    it("should preserve sheetId values in workbook.xml while using sequential file names", async () => {
      // Create a workbook with non-sequential sheetIds
      const ws1 = workbook.addWorksheet("Sheet1");
      const ws2 = workbook.addWorksheet("Sheet2");

      ws1.id = 1;
      ws2.id = 3; // Non-sequential

      ws1.getCell("A1").value = "Data 1";
      ws2.getCell("A1").value = "Data 2";

      const buffer = await workbook.xlsx.writeBuffer();
      const zipData = await extractAll(new Uint8Array(buffer));

      // Verify workbook.xml preserves original sheetId values
      const workbookData = zipData.get("xl/workbook.xml");
      const workbookContent = new TextDecoder().decode(workbookData?.data);

      // Original sheetIds should be preserved
      expect(workbookContent).toContain('sheetId="1"');
      expect(workbookContent).toContain('sheetId="3"');
    });
  });
});
