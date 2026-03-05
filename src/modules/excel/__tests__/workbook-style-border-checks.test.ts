import { describe, it, expect } from "vitest";
import { Workbook } from "../../../index";

/**
 * Tests for the style-handling fixes:
 *
 * 1. _mergeStyle: empty objects {} on row/col styles should NOT shadow
 *    real column/row styles when a new cell is constructed. The _isNonEmpty
 *    guard ensures empty {} is treated as "no style at this level".
 *
 * 2. merge() with ignoreStyle=true: master's border should propagate to
 *    slave cells that have no border of their own.
 *
 * 3. duplicateRow / spliceRows: style objects must be deep-copied via
 *    copyStyle() so that mutating a copied row's style does not affect
 *    the source row.
 */

describe("Style patch fixes", () => {
  // -----------------------------------------------------------------------
  // 1. _mergeStyle – empty object guard (_isNonEmpty)
  //
  // _mergeStyle is called during cell construction. It picks the row's
  // style prop first, falling back to the column's. The fix ensures that
  // if the row (or col) has an empty {} for a style prop, it is treated as
  // "no style" so the other level's real style can be used instead.
  // -----------------------------------------------------------------------
  describe("_mergeStyle with empty row/col style objects", () => {
    it("new cell inherits column font when row font is empty {}", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("sheet1");

      // Set a real font on column A
      const colFont = { name: "Arial", size: 12, bold: true };
      ws.getColumn("A").font = colFont;

      // Set the row's font to empty {} — this is the scenario the patch fixes.
      // Without the fix, the row's {} would be truthy and shadow the column font.
      ws.getRow(1).style = { font: {} };

      // Create a NEW cell at the intersection — triggers _mergeStyle
      const cell = ws.getCell("A1");
      expect(cell.font).toBeDefined();
      expect(cell.font!.name).toBe("Arial");
      expect(cell.font!.bold).toBe(true);
    });

    it("new cell inherits column alignment when row alignment is empty {}", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("sheet1");

      const colAlignment = { horizontal: "center" as const, vertical: "middle" as const };
      ws.getColumn("A").alignment = colAlignment;

      ws.getRow(2).style = { alignment: {} };

      const cell = ws.getCell("A2");
      expect(cell.alignment).toBeDefined();
      expect(cell.alignment!.horizontal).toBe("center");
      expect(cell.alignment!.vertical).toBe("middle");
    });

    it("new cell inherits column border when row border is empty {}", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("sheet1");

      const colBorder = {
        top: { style: "thin" as const },
        bottom: { style: "thin" as const }
      };
      ws.getColumn("A").border = colBorder;

      ws.getRow(3).style = { border: {} };

      const cell = ws.getCell("A3");
      expect(cell.border).toBeDefined();
      expect(cell.border!.top).toBeDefined();
      expect(cell.border!.top!.style).toBe("thin");
    });

    it("new cell inherits column fill when row fill is empty {}", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("sheet1");

      const colFill = {
        type: "pattern" as const,
        pattern: "solid" as const,
        fgColor: { argb: "FFFF0000" }
      };
      ws.getColumn("A").fill = colFill;

      ws.getRow(4).style = { fill: {} as any };

      const cell = ws.getCell("A4");
      expect(cell.fill).toBeDefined();
      expect((cell.fill as any).type).toBe("pattern");
    });

    it("new cell inherits column protection when row protection is empty {}", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("sheet1");

      const colProtection = { locked: true };
      ws.getColumn("A").protection = colProtection;

      ws.getRow(5).style = { protection: {} };

      const cell = ws.getCell("A5");
      expect(cell.protection).toBeDefined();
      expect(cell.protection!.locked).toBe(true);
    });

    it("still applies a non-empty row style property when present", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("sheet1");

      ws.getCell("A1").value = "test";

      // Set a real (non-empty) font on the row
      const rowFont = { name: "Times New Roman", size: 16 };
      ws.getRow(1).font = rowFont;

      // Getting a previously-unvisited cell in the same row should inherit this font
      const b1 = ws.getCell("B1");
      expect(b1.font).toBeDefined();
      expect(b1.font!.name).toBe("Times New Roman");
      expect(b1.font!.size).toBe(16);
    });

    it("row's real style takes priority over column's style (normal behavior)", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("sheet1");

      ws.getColumn("A").font = { name: "Arial", size: 10 };
      ws.getRow(1).style = { font: { name: "Helvetica", size: 14 } };

      const cell = ws.getCell("A1");
      expect(cell.font!.name).toBe("Helvetica");
      expect(cell.font!.size).toBe(14);
    });
  });

  // -----------------------------------------------------------------------
  // 2. merge() with ignoreStyle – border propagation
  // -----------------------------------------------------------------------
  describe("merge with ignoreStyle propagates borders", () => {
    it("propagates master border to slave cells when ignoreStyle is true", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("sheet1");

      const masterBorder = {
        top: { style: "double" as const, color: { argb: "FFFF0000" } },
        bottom: { style: "thin" as const },
        left: { style: "thick" as const },
        right: { style: "medium" as const }
      };

      // Set up master cell with a border
      ws.getCell("A1").value = "master";
      ws.getCell("A1").border = masterBorder;

      // Merge with ignoreStyle = true (like XLSX reader does)
      ws.mergeCellsWithoutStyle("A1:B2");

      // Slave cells should have the master's border propagated
      const b1 = ws.getCell("B1");
      const a2 = ws.getCell("A2");
      const b2 = ws.getCell("B2");

      expect(b1.style.border).toBeDefined();
      expect(b1.style.border!.top).toEqual(masterBorder.top);
      expect(b1.style.border!.bottom).toEqual(masterBorder.bottom);

      expect(a2.style.border).toBeDefined();
      expect(a2.style.border!.left).toEqual(masterBorder.left);

      expect(b2.style.border).toBeDefined();
      expect(b2.style.border!.right).toEqual(masterBorder.right);
    });

    it("does not overwrite existing slave border when ignoreStyle is true", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("sheet1");

      const masterBorder = {
        top: { style: "thin" as const }
      };
      const slaveBorder = {
        bottom: { style: "double" as const, color: { argb: "FF00FF00" } }
      };

      ws.getCell("A1").value = "master";
      ws.getCell("A1").border = masterBorder;

      // Pre-set a border on the slave cell
      ws.getCell("B1").border = slaveBorder;

      ws.mergeCellsWithoutStyle("A1:B1");

      // The slave should keep its own border since it already had one
      const b1 = ws.getCell("B1");
      expect(b1.style.border!.bottom).toEqual(slaveBorder.bottom);
    });

    it("border propagation creates a deep copy (not a reference)", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("sheet1");

      const masterBorder = {
        top: { style: "thin" as const, color: { argb: "FF000000" } }
      };

      ws.getCell("A1").value = "master";
      ws.getCell("A1").border = masterBorder;

      ws.mergeCellsWithoutStyle("A1:B1");

      const b1Border = ws.getCell("B1").style.border;
      expect(b1Border).toBeDefined();
      expect(b1Border!.top).toEqual(masterBorder.top);

      // Mutating the slave's border should NOT affect the master
      if (b1Border!.top) {
        (b1Border!.top as any).style = "thick";
      }

      expect(ws.getCell("A1").border!.top!.style).toBe("thin");
    });
  });

  // -----------------------------------------------------------------------
  // 3. duplicateRow / spliceRows – deep copy via copyStyle
  // -----------------------------------------------------------------------
  describe("duplicateRow deep-copies styles", () => {
    it("duplicated row style is independent from source row style", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("sheet1");

      // Set up source row with values and styles
      ws.getCell("A1").value = "Name";
      ws.getCell("A1").font = { name: "Calibri", size: 11, bold: true };
      ws.getCell("A1").border = {
        top: { style: "thin" as const },
        bottom: { style: "thin" as const }
      };
      ws.getCell("A1").fill = {
        type: "pattern" as const,
        pattern: "solid" as const,
        fgColor: { argb: "FFFFFF00" }
      };

      ws.getCell("B1").value = "Value";
      ws.getCell("B1").font = { name: "Arial", size: 10, italic: true };

      // Duplicate row 1 once (insert mode)
      ws.duplicateRow(1, 1, true);

      // Row 2 should have the same style values
      expect(ws.getCell("A2").font).toEqual(ws.getCell("A1").font);
      expect(ws.getCell("A2").border).toEqual(ws.getCell("A1").border);
      expect(ws.getCell("A2").fill).toEqual(ws.getCell("A1").fill);
      expect(ws.getCell("B2").font).toEqual(ws.getCell("B1").font);

      // Now mutate the duplicated row's style
      ws.getCell("A2").font = { name: "Courier", size: 14 };
      ws.getCell("A2").border = {
        top: { style: "double" as const }
      };

      // Original row 1 should be UNAFFECTED
      expect(ws.getCell("A1").font!.name).toBe("Calibri");
      expect(ws.getCell("A1").font!.bold).toBe(true);
      expect(ws.getCell("A1").border!.top!.style).toBe("thin");
      expect(ws.getCell("A1").border!.bottom!.style).toBe("thin");
    });

    it("duplicated row cell styles are independent objects (not shared references)", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("sheet1");

      ws.getCell("A1").value = "test";
      ws.getCell("A1").fill = {
        type: "pattern" as const,
        pattern: "solid" as const,
        fgColor: { argb: "FF0000FF" }
      };

      ws.duplicateRow(1, 1, true);

      // The fill objects should be equal in value but NOT the same reference
      const srcFill = ws.getCell("A1").fill;
      const dstFill = ws.getCell("A2").fill;
      expect(dstFill).toEqual(srcFill);
      expect(dstFill).not.toBe(srcFill);
    });
  });

  describe("spliceRows deep-copies styles when shifting rows", () => {
    it("inserting rows shifts existing rows with independent style copies", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("sheet1");

      // Set up row 1 and row 2
      ws.getCell("A1").value = "Row1";
      ws.getCell("A1").font = { name: "Helvetica", size: 12, bold: true };

      ws.getCell("A2").value = "Row2";
      ws.getCell("A2").font = { name: "Georgia", size: 14 };
      ws.getCell("A2").border = {
        left: { style: "thin" as const, color: { argb: "FF00FF00" } }
      };

      // Insert 1 empty row at position 2 (pushes old row 2 to row 3)
      ws.spliceRows(2, 0, []);

      // Row 3 should now have the old row 2's style
      expect(ws.getCell("A3").font!.name).toBe("Georgia");
      expect(ws.getCell("A3").border!.left!.style).toBe("thin");

      // Mutating the shifted row's style should not affect where it came from
      ws.getCell("A3").font = { name: "Verdana", size: 10 };

      // Row 1 should be completely unaffected
      expect(ws.getCell("A1").font!.name).toBe("Helvetica");
    });

    it("removing rows shifts remaining rows with independent style copies", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("sheet1");

      ws.getCell("A1").value = "Row1";
      ws.getCell("A2").value = "Row2";
      ws.getCell("A3").value = "Row3";
      ws.getCell("A3").font = { name: "Impact", size: 20, bold: true };
      ws.getCell("A3").fill = {
        type: "pattern" as const,
        pattern: "solid" as const,
        fgColor: { argb: "FF00FFFF" }
      };

      // Remove row 2 (row 3 shifts up to row 2)
      ws.spliceRows(2, 1);

      // Row 2 should now have old row 3's style
      expect(ws.getCell("A2").font!.name).toBe("Impact");
      expect(ws.getCell("A2").font!.bold).toBe(true);
      expect((ws.getCell("A2").fill as any).fgColor.argb).toBe("FF00FFFF");

      // Mutating the shifted cell style should be independent
      ws.getCell("A2").font = { name: "Comic Sans", size: 8 };

      // Row 1 should be completely unaffected
      expect(ws.getCell("A1").value).toBe("Row1");
    });
  });
});
