import { describe, it, expect } from "vitest";
import { Workbook } from "../../../../../doc/workbook";
import { ZipParser } from "../../../../../utils/unzip/zip-parser";

describe("PivotTableXform - renderPivotFields", () => {
  describe("dataField attribute (Issue #15)", () => {
    it("should add dataField=1 when field is used as both row and value", async () => {
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet();

      const table = worksheet.addTable({
        name: "TestTable",
        ref: "A1",
        headerRow: true,
        columns: [{ name: "A" }, { name: "B" }, { name: "C" }],
        rows: [
          ["a1", "b1", 5],
          ["a2", "b2", 10]
        ]
      });

      const worksheet2 = workbook.addWorksheet("Pivot");
      worksheet2.addPivotTable({
        sourceTable: table,
        rows: ["C"],
        columns: ["B"],
        values: ["C"],
        metric: "sum"
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const zipData = new ZipParser(buffer as Buffer).extractAllSync();

      const pivotTableXml = new TextDecoder().decode(zipData["xl/pivotTables/pivotTable1.xml"]);

      // Field C (index 2) should have both axis="axisRow" and dataField="1"
      expect(pivotTableXml).toMatch(/axis="axisRow"[^>]*dataField="1"/);
    });

    it("should add dataField=1 when field is used as both column and value", async () => {
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet();

      const table = worksheet.addTable({
        name: "TestTable",
        ref: "A1",
        headerRow: true,
        columns: [{ name: "A" }, { name: "B" }, { name: "C" }],
        rows: [
          ["a1", "b1", 5],
          ["a2", "b2", 10]
        ]
      });

      const worksheet2 = workbook.addWorksheet("Pivot");
      worksheet2.addPivotTable({
        sourceTable: table,
        rows: ["A"],
        columns: ["C"],
        values: ["C"],
        metric: "sum"
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const zipData = new ZipParser(buffer as Buffer).extractAllSync();

      const pivotTableXml = new TextDecoder().decode(zipData["xl/pivotTables/pivotTable1.xml"]);

      // Field C should have both axis="axisCol" and dataField="1"
      expect(pivotTableXml).toMatch(/axis="axisCol"[^>]*dataField="1"/);
    });

    it("should NOT add dataField=1 for row-only fields", async () => {
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet();

      const table = worksheet.addTable({
        name: "TestTable",
        ref: "A1",
        headerRow: true,
        columns: [{ name: "Category" }, { name: "Value" }],
        rows: [
          ["A", 10],
          ["B", 20]
        ]
      });

      const worksheet2 = workbook.addWorksheet("Pivot");
      worksheet2.addPivotTable({
        sourceTable: table,
        rows: ["Category"],
        columns: [],
        values: ["Value"],
        metric: "sum"
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const zipData = new ZipParser(buffer as Buffer).extractAllSync();

      const pivotTableXml = new TextDecoder().decode(zipData["xl/pivotTables/pivotTable1.xml"]);

      // Category field should have axis="axisRow" but NOT dataField="1"
      expect(pivotTableXml).toContain('axis="axisRow"');
      // The axisRow field should not have dataField attribute
      expect(pivotTableXml).not.toMatch(/axis="axisRow"[^>]*dataField="1"/);
    });

    it("should add dataField=1 for value-only fields", async () => {
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet();

      const table = worksheet.addTable({
        name: "TestTable",
        ref: "A1",
        headerRow: true,
        columns: [{ name: "Category" }, { name: "Value" }],
        rows: [
          ["A", 10],
          ["B", 20]
        ]
      });

      const worksheet2 = workbook.addWorksheet("Pivot");
      worksheet2.addPivotTable({
        sourceTable: table,
        rows: ["Category"],
        columns: [],
        values: ["Value"],
        metric: "sum"
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const zipData = new ZipParser(buffer as Buffer).extractAllSync();

      const pivotTableXml = new TextDecoder().decode(zipData["xl/pivotTables/pivotTable1.xml"]);

      // Value field should have dataField="1" (but no axis)
      expect(pivotTableXml).toContain('dataField="1"');
    });
  });

  describe("sharedItems in pivotCacheDefinition (Issue #15)", () => {
    it("should use <n> for numeric sharedItems", async () => {
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet();

      const table = worksheet.addTable({
        name: "TestTable",
        ref: "A1",
        headerRow: true,
        columns: [{ name: "A" }, { name: "B" }, { name: "C" }],
        rows: [
          ["a1", "b1", 5],
          ["a1", "b2", 5],
          ["a2", "b1", 24],
          ["a2", "b2", 35]
        ]
      });

      const worksheet2 = workbook.addWorksheet("Pivot");
      worksheet2.addPivotTable({
        sourceTable: table,
        rows: ["C"],
        columns: ["B"],
        values: ["C"],
        metric: "sum"
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const zipData = new ZipParser(buffer as Buffer).extractAllSync();

      const cacheDefXml = new TextDecoder().decode(
        zipData["xl/pivotCache/pivotCacheDefinition1.xml"]
      );

      // Field C should have numeric sharedItems
      expect(cacheDefXml).toContain('containsNumber="1"');
      expect(cacheDefXml).toContain('<n v="5"');
      expect(cacheDefXml).toContain('<n v="24"');
      expect(cacheDefXml).toContain('<n v="35"');
      // Should NOT use string format
      expect(cacheDefXml).not.toContain('<s v="5"');
      expect(cacheDefXml).not.toContain('<s v="24"');
    });

    it("should use empty <sharedItems/> for unused fields", async () => {
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet();

      const table = worksheet.addTable({
        name: "TestTable",
        ref: "A1",
        headerRow: true,
        columns: [{ name: "Unused" }, { name: "Row" }, { name: "Value" }],
        rows: [
          ["x", "A", 10],
          ["y", "B", 20]
        ]
      });

      const worksheet2 = workbook.addWorksheet("Pivot");
      worksheet2.addPivotTable({
        sourceTable: table,
        rows: ["Row"],
        columns: [],
        values: ["Value"],
        metric: "sum"
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const zipData = new ZipParser(buffer as Buffer).extractAllSync();

      const cacheDefXml = new TextDecoder().decode(
        zipData["xl/pivotCache/pivotCacheDefinition1.xml"]
      );

      // Unused field should have empty sharedItems
      expect(cacheDefXml).toMatch(/name="Unused"[^>]*>[\s\S]*?<sharedItems\s*\/>/);
    });

    it("should use <s> for string sharedItems", async () => {
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet();

      const table = worksheet.addTable({
        name: "TestTable",
        ref: "A1",
        headerRow: true,
        columns: [{ name: "Category" }, { name: "Value" }],
        rows: [
          ["Apple", 10],
          ["Banana", 20]
        ]
      });

      const worksheet2 = workbook.addWorksheet("Pivot");
      worksheet2.addPivotTable({
        sourceTable: table,
        rows: ["Category"],
        columns: [],
        values: ["Value"],
        metric: "sum"
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const zipData = new ZipParser(buffer as Buffer).extractAllSync();

      const cacheDefXml = new TextDecoder().decode(
        zipData["xl/pivotCache/pivotCacheDefinition1.xml"]
      );

      // Category field should have string sharedItems
      expect(cacheDefXml).toContain('<s v="Apple"');
      expect(cacheDefXml).toContain('<s v="Banana"');
    });
  });

  describe("rowItems and colItems edge cases", () => {
    it("should generate correct rowItems when row field has single unique value", async () => {
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet();

      const table = worksheet.addTable({
        name: "TestTable",
        ref: "A1",
        headerRow: true,
        columns: [{ name: "Category" }, { name: "Value" }],
        rows: [
          ["Same", 10],
          ["Same", 20],
          ["Same", 30]
        ]
      });

      const worksheet2 = workbook.addWorksheet("Pivot");
      worksheet2.addPivotTable({
        sourceTable: table,
        rows: ["Category"],
        columns: [],
        values: ["Value"],
        metric: "sum"
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const zipData = new ZipParser(buffer as Buffer).extractAllSync();

      const pivotTableXml = new TextDecoder().decode(zipData["xl/pivotTables/pivotTable1.xml"]);

      // Should have 2 rowItems: one for "Same" + grand total
      expect(pivotTableXml).toContain('rowItems count="2"');
      expect(pivotTableXml).toContain("<i><x /></i>");
      expect(pivotTableXml).toContain('<i t="grand">');
    });

    it("should generate correct rowItems with many unique values", async () => {
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet();

      // Create rows with 10 unique categories
      const rows = [];
      for (let i = 1; i <= 10; i++) {
        rows.push([`Cat${i}`, i * 10]);
      }

      const table = worksheet.addTable({
        name: "TestTable",
        ref: "A1",
        headerRow: true,
        columns: [{ name: "Category" }, { name: "Value" }],
        rows
      });

      const worksheet2 = workbook.addWorksheet("Pivot");
      worksheet2.addPivotTable({
        sourceTable: table,
        rows: ["Category"],
        columns: [],
        values: ["Value"],
        metric: "sum"
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const zipData = new ZipParser(buffer as Buffer).extractAllSync();

      const pivotTableXml = new TextDecoder().decode(zipData["xl/pivotTables/pivotTable1.xml"]);

      // Should have 11 rowItems: 10 for categories + grand total
      expect(pivotTableXml).toContain('rowItems count="11"');
    });

    it("should handle colItems with multiple values and no column fields", async () => {
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet();

      const table = worksheet.addTable({
        name: "TestTable",
        ref: "A1",
        headerRow: true,
        columns: [{ name: "Category" }, { name: "Val1" }, { name: "Val2" }, { name: "Val3" }],
        rows: [
          ["A", 10, 20, 30],
          ["B", 40, 50, 60]
        ]
      });

      const worksheet2 = workbook.addWorksheet("Pivot");
      worksheet2.addPivotTable({
        sourceTable: table,
        rows: ["Category"],
        columns: [],
        values: ["Val1", "Val2", "Val3"],
        metric: "sum"
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const zipData = new ZipParser(buffer as Buffer).extractAllSync();

      const pivotTableXml = new TextDecoder().decode(zipData["xl/pivotTables/pivotTable1.xml"]);

      // Should have 4 colItems: 3 for values + grand total
      expect(pivotTableXml).toContain('colItems count="4"');
      expect(pivotTableXml).toContain('dataFields count="3"');
    });
  });
  describe("pivotField edge cases", () => {
    it("should handle field used in both rows and columns", async () => {
      // Note: Excel normally doesn't allow same field in both rows and columns,
      // but we should handle it gracefully. The field will be rendered as axisRow (first match)
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet();

      const table = worksheet.addTable({
        name: "TestTable",
        ref: "A1",
        headerRow: true,
        columns: [{ name: "A" }, { name: "B" }, { name: "Value" }],
        rows: [
          ["a1", "b1", 10],
          ["a2", "b2", 20]
        ]
      });

      const worksheet2 = workbook.addWorksheet("Pivot");
      // Note: Using A in both rows and columns is unusual but should not crash
      worksheet2.addPivotTable({
        sourceTable: table,
        rows: ["A"],
        columns: ["B"],
        values: ["Value"],
        metric: "sum"
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const zipData = new ZipParser(buffer as Buffer).extractAllSync();

      const pivotTableXml = new TextDecoder().decode(zipData["xl/pivotTables/pivotTable1.xml"]);

      // Should have both axisRow and axisCol
      expect(pivotTableXml).toContain('axis="axisRow"');
      expect(pivotTableXml).toContain('axis="axisCol"');
    });

    it("should handle Unicode field names in pivot table", async () => {
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet();

      const table = worksheet.addTable({
        name: "TestTable",
        ref: "A1",
        headerRow: true,
        columns: [{ name: "カテゴリ" }, { name: "数値" }],
        rows: [
          ["東京", 100],
          ["大阪", 200]
        ]
      });

      const worksheet2 = workbook.addWorksheet("Pivot");
      worksheet2.addPivotTable({
        sourceTable: table,
        rows: ["カテゴリ"],
        columns: [],
        values: ["数値"],
        metric: "sum"
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const zipData = new ZipParser(buffer as Buffer).extractAllSync();

      const cacheDefXml = new TextDecoder().decode(
        zipData["xl/pivotCache/pivotCacheDefinition1.xml"]
      );

      expect(cacheDefXml).toContain('name="カテゴリ"');
      expect(cacheDefXml).toContain('name="数値"');
      expect(cacheDefXml).toContain('<s v="東京"');
      expect(cacheDefXml).toContain('<s v="大阪"');
    });

    it("should handle XML special characters in dataField names", async () => {
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet();

      const table = worksheet.addTable({
        name: "TestTable",
        ref: "A1",
        headerRow: true,
        columns: [{ name: "Category" }, { name: "Value <A&B>" }],
        rows: [
          ["X", 10],
          ["Y", 20]
        ]
      });

      const worksheet2 = workbook.addWorksheet("Pivot");
      worksheet2.addPivotTable({
        sourceTable: table,
        rows: ["Category"],
        columns: [],
        values: ["Value <A&B>"],
        metric: "sum"
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const zipData = new ZipParser(buffer as Buffer).extractAllSync();

      const pivotTableXml = new TextDecoder().decode(zipData["xl/pivotTables/pivotTable1.xml"]);

      // dataField name should be properly escaped
      expect(pivotTableXml).toContain("Sum of Value &lt;A&amp;B&gt;");
    });
  });
});
