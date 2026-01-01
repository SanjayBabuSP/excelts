import { describe, it, expect, beforeEach } from "vitest";
import { Workbook } from "../../../index";
import type { DataValidationWithFormulae } from "../../../types";
import fs from "fs";
import path from "path";
import os from "os";

describe("DataValidation Large Range Performance", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "excelts-test-"));
  });

  describe("parsing large range validations", () => {
    it("should parse entire column validation (B2:B1048576) efficiently", async () => {
      // Create a workbook with entire column validation
      const wb = new Workbook();
      const ws = wb.addWorksheet("Test");

      // Manually set up a large range validation in the model
      // This simulates what Excel does when you apply validation to entire column
      ws.dataValidations.model["range:B2:B1048576"] = {
        type: "list",
        formulae: ["Option1,Option2,Option3"],
        allowBlank: true,
        showInputMessage: true,
        showErrorMessage: true
      };

      const filePath = path.join(tempDir, "large-range.xlsx");
      await wb.xlsx.writeFile(filePath);

      // Now read it back and time it
      const wb2 = new Workbook();
      const start = performance.now();
      await wb2.xlsx.readFile(filePath);
      const elapsed = performance.now() - start;

      // Should parse in under 500ms (was 3+ seconds before fix)
      // Using 500ms to account for slower CI environments and Windows
      expect(elapsed).toBeLessThan(500);

      const ws2 = wb2.getWorksheet("Test");
      // Validation should be found for cells in the range
      expect(ws2?.getCell("B2").dataValidation).toBeDefined();
      expect(ws2?.getCell("B100").dataValidation).toBeDefined();
      expect(ws2?.getCell("B1000000").dataValidation).toBeDefined();
      // But not outside the range
      expect(ws2?.getCell("B1").dataValidation).toBeUndefined();
      expect(ws2?.getCell("A2").dataValidation).toBeUndefined();
    });

    it("should parse multiple entire column validations efficiently", async () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("Test");

      // 5 columns with entire column validations (like SKU.Template.11.xlsx)
      ws.dataValidations.model["range:B2:B1048576"] = {
        type: "list",
        formulae: ["A,B,C"],
        allowBlank: true
      };
      ws.dataValidations.model["range:C2:C1048576"] = {
        type: "list",
        formulae: ["X,Y,Z"],
        allowBlank: true
      };
      ws.dataValidations.model["range:D2:D1048576"] = {
        type: "whole",
        operator: "between",
        formulae: [1, 100],
        allowBlank: true
      };
      ws.dataValidations.model["range:E2:E1048576"] = {
        type: "decimal",
        operator: "greaterThan",
        formulae: [0],
        allowBlank: true
      };
      ws.dataValidations.model["range:F2:F1048576"] = {
        type: "date",
        operator: "greaterThan",
        formulae: [new Date("2020-01-01")],
        allowBlank: true
      };

      const filePath = path.join(tempDir, "multi-column.xlsx");
      await wb.xlsx.writeFile(filePath);

      const wb2 = new Workbook();
      const start = performance.now();
      await wb2.xlsx.readFile(filePath);
      const elapsed = performance.now() - start;

      // Should parse quickly even with 5 entire columns
      // Using 1000ms to account for slower CI environments and Windows
      expect(elapsed).toBeLessThan(1000);

      const ws2 = wb2.getWorksheet("Test");
      expect(ws2?.getCell("B100").dataValidation?.type).toBe("list");
      expect(ws2?.getCell("C100").dataValidation?.type).toBe("list");
      expect(ws2?.getCell("D100").dataValidation?.type).toBe("whole");
      expect(ws2?.getCell("E100").dataValidation?.type).toBe("decimal");
      expect(ws2?.getCell("F100").dataValidation?.type).toBe("date");
    });
  });

  describe("small range validations (range-based lookup)", () => {
    it("should allow cell lookup for small ranges", async () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("Test");

      // Apply validation to a small range (10x10 = 100 cells, under 1000 threshold)
      for (let row = 1; row <= 10; row++) {
        for (let col = 1; col <= 10; col++) {
          ws.getCell(row, col).dataValidation = {
            type: "list",
            formulae: ["Yes,No"],
            allowBlank: true
          };
        }
      }

      const filePath = path.join(tempDir, "small-range.xlsx");
      await wb.xlsx.writeFile(filePath);

      const wb2 = new Workbook();
      await wb2.xlsx.readFile(filePath);
      const ws2 = wb2.getWorksheet("Test");

      // All cells should have validation
      expect(ws2?.getCell("A1").dataValidation).toBeDefined();
      expect(ws2?.getCell("J10").dataValidation).toBeDefined();
      // Outside range should not
      expect(ws2?.getCell("K1").dataValidation).toBeUndefined();
    });

    it("should handle moderately sized ranges", async () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("Test");

      // 40x25 = 1000 cells
      ws.dataValidations.model["A1:Y40"] = {
        type: "list",
        formulae: ["Test"],
        allowBlank: true
      };

      const filePath = path.join(tempDir, "threshold.xlsx");
      await wb.xlsx.writeFile(filePath);

      const wb2 = new Workbook();
      await wb2.xlsx.readFile(filePath);
      const ws2 = wb2.getWorksheet("Test");

      // Should be accessible
      expect(ws2?.getCell("A1").dataValidation).toBeDefined();
      expect(ws2?.getCell("Y40").dataValidation).toBeDefined();
    });

    it("should NOT expand range just over threshold (1001+ cells)", async () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("Test");

      // 41x25 = 1025 cells - should NOT be expanded
      ws.dataValidations.model["range:A1:Y41"] = {
        type: "list",
        formulae: ["Test"],
        allowBlank: true
      };

      const filePath = path.join(tempDir, "over-threshold.xlsx");
      await wb.xlsx.writeFile(filePath);

      const wb2 = new Workbook();
      await wb2.xlsx.readFile(filePath);
      const ws2 = wb2.getWorksheet("Test");

      // Should still be accessible via range lookup
      expect(ws2?.getCell("A1").dataValidation).toBeDefined();
      expect(ws2?.getCell("Y41").dataValidation).toBeDefined();
    });
  });

  describe("edge cases", () => {
    it("should handle single cell validation", async () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("Test");

      ws.getCell("A1").dataValidation = {
        type: "whole",
        operator: "between",
        formulae: [1, 10]
      };

      const filePath = path.join(tempDir, "single-cell.xlsx");
      await wb.xlsx.writeFile(filePath);

      const wb2 = new Workbook();
      await wb2.xlsx.readFile(filePath);
      const ws2 = wb2.getWorksheet("Test");

      expect(ws2?.getCell("A1").dataValidation?.type).toBe("whole");
      expect(ws2?.getCell("A2").dataValidation).toBeUndefined();
    });

    it("should handle multiple disjoint ranges in same sqref (E4:L9 N4:U9)", async () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("Test");

      // Apply same validation to two separate small ranges
      const validation = {
        type: "list" as const,
        formulae: ["A,B,C"],
        allowBlank: true
      };

      // First range E4:L9
      for (let row = 4; row <= 9; row++) {
        for (let col = 5; col <= 12; col++) {
          // E=5, L=12
          ws.getCell(row, col).dataValidation = validation;
        }
      }
      // Second range N4:U9
      for (let row = 4; row <= 9; row++) {
        for (let col = 14; col <= 21; col++) {
          // N=14, U=21
          ws.getCell(row, col).dataValidation = validation;
        }
      }

      const filePath = path.join(tempDir, "disjoint.xlsx");
      await wb.xlsx.writeFile(filePath);

      const wb2 = new Workbook();
      await wb2.xlsx.readFile(filePath);
      const ws2 = wb2.getWorksheet("Test");

      // Both ranges should have validation
      expect(ws2?.getCell("E4").dataValidation).toBeDefined();
      expect(ws2?.getCell("L9").dataValidation).toBeDefined();
      expect(ws2?.getCell("N4").dataValidation).toBeDefined();
      expect(ws2?.getCell("U9").dataValidation).toBeDefined();
      // Between the ranges should not
      expect(ws2?.getCell("M4").dataValidation).toBeUndefined();
    });

    it("should handle validation without type (any type)", async () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("Test");

      ws.getCell("A1").dataValidation = {
        type: "any",
        promptTitle: "Input",
        prompt: "Enter any value"
      };

      const filePath = path.join(tempDir, "any-type.xlsx");
      await wb.xlsx.writeFile(filePath);

      const wb2 = new Workbook();
      await wb2.xlsx.readFile(filePath);
      const ws2 = wb2.getWorksheet("Test");

      expect(ws2?.getCell("A1").dataValidation?.type).toBe("any");
      expect(ws2?.getCell("A1").dataValidation?.prompt).toBe("Enter any value");
    });

    it("should handle large range with formula reference to another sheet", async () => {
      const wb = new Workbook();
      const ws1 = wb.addWorksheet("Data");
      const ws2 = wb.addWorksheet("Input");

      // Set up some data
      ws1.getCell("A1").value = "Option1";
      ws1.getCell("A2").value = "Option2";
      ws1.getCell("A3").value = "Option3";

      // Large range validation referencing another sheet
      ws2.dataValidations.model["range:A1:A1048576"] = {
        type: "list",
        formulae: ["Data!$A$1:$A$3"],
        allowBlank: true,
        showInputMessage: true,
        showErrorMessage: true
      };

      const filePath = path.join(tempDir, "cross-sheet-ref.xlsx");
      await wb.xlsx.writeFile(filePath);

      const wb3 = new Workbook();
      await wb3.xlsx.readFile(filePath);
      const ws2Loaded = wb3.getWorksheet("Input");

      const dv = ws2Loaded?.getCell("A100").dataValidation as
        | DataValidationWithFormulae
        | undefined;
      expect(dv?.type).toBe("list");
      expect(dv?.formulae?.[0]).toBe("Data!$A$1:$A$3");
    });

    it("should handle overlapping ranges correctly (last one wins)", async () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("Test");

      // First set a large range
      ws.dataValidations.model["range:A1:Z100"] = {
        type: "list",
        formulae: ["Large"],
        allowBlank: true
      };

      // Then override a specific cell
      ws.getCell("B2").dataValidation = {
        type: "list",
        formulae: ["Specific"],
        allowBlank: true
      };

      const filePath = path.join(tempDir, "overlap.xlsx");
      await wb.xlsx.writeFile(filePath);

      const wb2 = new Workbook();
      await wb2.xlsx.readFile(filePath);
      const ws2 = wb2.getWorksheet("Test");

      // Specific cell should have specific validation (direct match first)
      const dvB2 = ws2?.getCell("B2").dataValidation as DataValidationWithFormulae | undefined;
      const dvA1 = ws2?.getCell("A1").dataValidation as DataValidationWithFormulae | undefined;
      const dvZ100 = ws2?.getCell("Z100").dataValidation as DataValidationWithFormulae | undefined;
      expect(dvB2?.formulae?.[0]).toBe("Specific");
      // Other cells in range should have large range validation
      expect(dvA1?.formulae?.[0]).toBe("Large");
      expect(dvZ100?.formulae?.[0]).toBe("Large");
    });

    it("should preserve all validation properties through round-trip", async () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("Test");

      const fullValidation = {
        type: "list" as const,
        formulae: ["A,B,C"],
        allowBlank: true,
        showInputMessage: true,
        showErrorMessage: true,
        promptTitle: "Select Value",
        prompt: "Please select a value from the list",
        errorStyle: "warning" as const,
        errorTitle: "Invalid Input",
        error: "The value you entered is not valid"
      };

      ws.dataValidations.model["range:A1:A1048576"] = fullValidation;

      const filePath = path.join(tempDir, "full-props.xlsx");
      await wb.xlsx.writeFile(filePath);

      const wb2 = new Workbook();
      await wb2.xlsx.readFile(filePath);
      const ws2 = wb2.getWorksheet("Test");

      const dv = ws2?.getCell("A500").dataValidation as DataValidationWithFormulae | undefined;
      expect(dv?.type).toBe("list");
      expect(dv?.formulae).toEqual(["A,B,C"]);
      expect(dv?.allowBlank).toBe(true);
      expect(dv?.showInputMessage).toBe(true);
      expect(dv?.showErrorMessage).toBe(true);
      expect(dv?.promptTitle).toBe("Select Value");
      expect(dv?.prompt).toBe("Please select a value from the list");
      expect(dv?.errorStyle).toBe("warning");
      expect(dv?.errorTitle).toBe("Invalid Input");
      expect(dv?.error).toBe("The value you entered is not valid");
    });

    it("should handle removing validation from a cell", async () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("Test");

      ws.getCell("A1").dataValidation = {
        type: "list",
        formulae: ["Test"]
      };
      ws.getCell("A2").dataValidation = {
        type: "list",
        formulae: ["Test"]
      };

      // Remove validation from A1
      ws.dataValidations.remove("A1");

      // Before writing, A1 should return undefined
      expect(ws.getCell("A1").dataValidation).toBeUndefined();
      expect(ws.getCell("A2").dataValidation).toBeDefined();

      // After round-trip, removed validation should stay removed
      const filePath = path.join(tempDir, "remove.xlsx");
      await wb.xlsx.writeFile(filePath);

      const wb2 = new Workbook();
      await wb2.xlsx.readFile(filePath);
      const ws2 = wb2.getWorksheet("Test");

      expect(ws2?.getCell("A1").dataValidation).toBeUndefined();
      expect(ws2?.getCell("A2").dataValidation).toBeDefined();
    });
  });

  describe("DataValidations.find edge cases", () => {
    it("should return undefined for empty model", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("Test");

      expect(ws.dataValidations.find("A1")).toBeUndefined();
      expect(ws.dataValidations.find("Z999")).toBeUndefined();
    });

    it("should handle find with only range: keys", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("Test");

      ws.dataValidations.model["range:B2:D10"] = {
        type: "list",
        formulae: ["Test"]
      };

      // Inside range
      expect(ws.dataValidations.find("B2")).toBeDefined();
      expect(ws.dataValidations.find("C5")).toBeDefined();
      expect(ws.dataValidations.find("D10")).toBeDefined();

      // Outside range
      expect(ws.dataValidations.find("A1")).toBeUndefined();
      expect(ws.dataValidations.find("B1")).toBeUndefined();
      expect(ws.dataValidations.find("E2")).toBeUndefined();
      expect(ws.dataValidations.find("B11")).toBeUndefined();
    });

    it("should prioritize direct match over range match", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("Test");

      ws.dataValidations.model["range:A1:Z100"] = {
        type: "list",
        formulae: ["Range"]
      };
      ws.dataValidations.model["B5"] = {
        type: "list",
        formulae: ["Direct"]
      };

      expect(ws.dataValidations.find("B5")?.formulae?.[0]).toBe("Direct");
      expect(ws.dataValidations.find("B6")?.formulae?.[0]).toBe("Range");
    });
  });
});
