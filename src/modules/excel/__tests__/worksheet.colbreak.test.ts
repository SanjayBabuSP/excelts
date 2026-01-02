import { describe, it, expect } from "vitest";
import { Workbook } from "../../../index";

describe("Worksheet", () => {
  describe("Column Page Breaks", () => {
    it("adds a single column break", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("test");

      // Add some data
      ws.getCell("A1").value = "A1";
      ws.getCell("B1").value = "B1";
      ws.getCell("C1").value = "C1";

      // Add page break after column A
      const col = ws.getColumn(1);
      col.addPageBreak();

      expect(ws.colBreaks.length).toBe(1);
      expect(ws.colBreaks[0]).toEqual({
        id: 1,
        max: 1048575,
        man: 1
      });
    });

    it("adds multiple column breaks", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("test");

      // Add some data
      for (let col = 1; col <= 10; col++) {
        ws.getCell(1, col).value = `Col ${col}`;
      }

      // Add page breaks after columns 3, 6, and 9
      ws.getColumn(3).addPageBreak();
      ws.getColumn(6).addPageBreak();
      ws.getColumn(9).addPageBreak();

      expect(ws.colBreaks.length).toBe(3);
      expect(ws.colBreaks[0].id).toBe(3);
      expect(ws.colBreaks[1].id).toBe(6);
      expect(ws.colBreaks[2].id).toBe(9);
    });

    it("adds column break with row constraints", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("test");

      // Add some data
      ws.getCell("A1").value = "A1";

      // Add page break after column B, from row 5 to row 100
      ws.getColumn("B").addPageBreak(5, 100);

      expect(ws.colBreaks.length).toBe(1);
      expect(ws.colBreaks[0]).toEqual({
        id: 2,
        max: 99, // 100 - 1 (0-indexed)
        min: 4, // 5 - 1 (0-indexed)
        man: 1
      });
    });

    it("adds column break using column letter", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("test");

      ws.getColumn("D").addPageBreak();

      expect(ws.colBreaks.length).toBe(1);
      expect(ws.colBreaks[0].id).toBe(4); // D is column 4
    });

    it("initializes colBreaks as empty array", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("test");

      expect(ws.colBreaks).toEqual([]);
    });

    it("colBreaks is included in worksheet model", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("test");

      ws.getColumn(2).addPageBreak();

      const model = ws.model;
      expect(model.colBreaks).toEqual([{ id: 2, max: 1048575, man: 1 }]);
    });
  });
});
