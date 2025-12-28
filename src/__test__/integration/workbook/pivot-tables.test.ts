import { describe, it, expect } from "vitest";
import fs from "fs";
import { promisify } from "util";

const fsReadFileAsync = promisify(fs.readFile);

import { ZipParser } from "../../../utils/unzip/zip-parser";

import { Workbook } from "../../../index";

const PIVOT_TABLE_FILEPATHS = [
  "xl/pivotCache/pivotCacheRecords1.xml",
  "xl/pivotCache/pivotCacheDefinition1.xml",
  "xl/pivotCache/_rels/pivotCacheDefinition1.xml.rels",
  "xl/pivotTables/pivotTable1.xml",
  "xl/pivotTables/_rels/pivotTable1.xml.rels"
];

import { testFilePath } from "../../utils/test-file-helper";

const TEST_XLSX_FILEPATH = testFilePath("workbook-pivot.test");
const TEST_XLSX_TABLE_FILEPATH = testFilePath("workbook-pivot-table.test");

const TEST_DATA = [
  ["A", "B", "C", "D", "E"],
  ["a1", "b1", "c1", 4, 5],
  ["a1", "b2", "c1", 4, 5],
  ["a2", "b1", "c2", 14, 24],
  ["a2", "b2", "c2", 24, 35],
  ["a3", "b1", "c3", 34, 45],
  ["a3", "b2", "c3", 44, 45]
];

// =============================================================================
// Tests

describe("Workbook", () => {
  describe("Pivot Tables", () => {
    it("if pivot table added with sourceSheet, then certain xml and rels files are added", async () => {
      const workbook = new Workbook();

      const worksheet1 = workbook.addWorksheet("Sheet1");
      worksheet1.addRows(TEST_DATA);

      const worksheet2 = workbook.addWorksheet("Sheet2");
      worksheet2.addPivotTable({
        sourceSheet: worksheet1,
        rows: ["A", "B"],
        columns: ["C"],
        values: ["E"],
        metric: "sum"
      });

      return workbook.xlsx.writeFile(TEST_XLSX_FILEPATH).then(async () => {
        const buffer = await fsReadFileAsync(TEST_XLSX_FILEPATH);
        const zipData = new ZipParser(buffer).extractAllSync();
        for (const filepath of PIVOT_TABLE_FILEPATHS) {
          expect(zipData[filepath]).toBeDefined();
        }
      });
    });

    it("if pivot table added with sourceTable, then certain xml and rels files are added", async () => {
      const workbook = new Workbook();

      const worksheet = workbook.addWorksheet("Sheet1");

      // Create a table with the same data structure as TEST_DATA
      const table = worksheet.addTable({
        name: "TestTable",
        ref: "A1",
        columns: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }, { name: "E" }],
        rows: [
          ["a1", "b1", "c1", 4, 5],
          ["a1", "b2", "c1", 4, 5],
          ["a2", "b1", "c2", 14, 24],
          ["a2", "b2", "c2", 24, 35],
          ["a3", "b1", "c3", 34, 45],
          ["a3", "b2", "c3", 44, 45]
        ]
      });

      const worksheet2 = workbook.addWorksheet("Sheet2");
      worksheet2.addPivotTable({
        sourceTable: table,
        rows: ["A", "B"],
        columns: ["C"],
        values: ["E"],
        metric: "sum"
      });

      return workbook.xlsx.writeFile(TEST_XLSX_TABLE_FILEPATH).then(async () => {
        const buffer = await fsReadFileAsync(TEST_XLSX_TABLE_FILEPATH);
        const zipData = new ZipParser(buffer).extractAllSync();
        for (const filepath of PIVOT_TABLE_FILEPATHS) {
          expect(zipData[filepath]).toBeDefined();
        }
      });
    });

    it("if pivot table NOT added, then certain xml and rels files are not added", () => {
      const workbook = new Workbook();

      const worksheet1 = workbook.addWorksheet("Sheet1");
      worksheet1.addRows(TEST_DATA);

      workbook.addWorksheet("Sheet2");

      return workbook.xlsx.writeFile(TEST_XLSX_FILEPATH).then(async () => {
        const buffer = await fsReadFileAsync(TEST_XLSX_FILEPATH);
        const zipData = new ZipParser(buffer).extractAllSync();
        for (const filepath of PIVOT_TABLE_FILEPATHS) {
          expect(zipData[filepath]).toBeUndefined();
        }
      });
    });

    it("throws error if neither sourceSheet nor sourceTable is provided", () => {
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet("Sheet1");

      expect(() => {
        worksheet.addPivotTable({
          rows: ["A"],
          columns: ["B"],
          values: ["C"],
          metric: "sum"
        } as any);
      }).toThrow("Either sourceSheet or sourceTable must be provided.");
    });

    it("throws error if both sourceSheet and sourceTable are provided", () => {
      const workbook = new Workbook();

      const worksheet1 = workbook.addWorksheet("Sheet1");
      worksheet1.addRows(TEST_DATA);

      const table = worksheet1.addTable({
        name: "TestTable",
        ref: "A1",
        columns: [{ name: "A" }, { name: "B" }, { name: "C" }],
        rows: [["a1", "b1", "c1"]]
      });

      const worksheet2 = workbook.addWorksheet("Sheet2");

      expect(() => {
        worksheet2.addPivotTable({
          sourceSheet: worksheet1,
          sourceTable: table,
          rows: ["A"],
          columns: ["B"],
          values: ["C"],
          metric: "sum"
        });
      }).toThrow("Cannot specify both sourceSheet and sourceTable. Choose one.");
    });

    it("throws error if header name not found in sourceTable", () => {
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet("Sheet1");

      const table = worksheet.addTable({
        name: "TestTable",
        ref: "A1",
        columns: [{ name: "A" }, { name: "B" }, { name: "C" }],
        rows: [["a1", "b1", "c1"]]
      });

      const worksheet2 = workbook.addWorksheet("Sheet2");

      expect(() => {
        worksheet2.addPivotTable({
          sourceTable: table,
          rows: ["A"],
          columns: ["NonExistent"],
          values: ["C"],
          metric: "sum"
        });
      }).toThrow('The header name "NonExistent" was not found in Sheet1.');
    });

    it("throws error if sourceTable has no data rows", () => {
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet("Sheet1");

      const table = worksheet.addTable({
        name: "EmptyTable",
        ref: "A1",
        columns: [{ name: "A" }, { name: "B" }, { name: "C" }],
        rows: [] // empty rows
      });

      const worksheet2 = workbook.addWorksheet("Sheet2");

      expect(() => {
        worksheet2.addPivotTable({
          sourceTable: table,
          rows: ["A"],
          columns: ["B"],
          values: ["C"],
          metric: "sum"
        });
      }).toThrow("Cannot create pivot table from an empty table. Add data rows to the table.");
    });

    it("throws error if sourceTable has duplicate column names", () => {
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet("Sheet1");

      const table = worksheet.addTable({
        name: "DuplicateColumnsTable",
        ref: "A1",
        columns: [{ name: "A" }, { name: "B" }, { name: "A" }], // duplicate 'A'
        rows: [["a1", "b1", "a2"]]
      });

      const worksheet2 = workbook.addWorksheet("Sheet2");

      expect(() => {
        worksheet2.addPivotTable({
          sourceTable: table,
          rows: ["A"],
          columns: ["B"],
          values: ["A"],
          metric: "sum"
        });
      }).toThrow(
        'Duplicate column name "A" found in table. Pivot tables require unique column names.'
      );
    });

    it("works with sourceTable not starting at A1", async () => {
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet("Sheet1");

      // Table starting at C5 instead of A1
      const table = worksheet.addTable({
        name: "OffsetTable",
        ref: "C5",
        columns: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }, { name: "E" }],
        rows: [
          ["a1", "b1", "c1", 4, 5],
          ["a1", "b2", "c1", 4, 5],
          ["a2", "b1", "c2", 14, 24]
        ]
      });

      const worksheet2 = workbook.addWorksheet("Sheet2");
      worksheet2.addPivotTable({
        sourceTable: table,
        rows: ["A"],
        columns: ["B"],
        values: ["E"],
        metric: "sum"
      });

      const offsetFilePath = testFilePath("workbook-pivot-offset.test");
      return workbook.xlsx.writeFile(offsetFilePath).then(async () => {
        const buffer = await fsReadFileAsync(offsetFilePath);
        const zipData = new ZipParser(buffer).extractAllSync();
        for (const filepath of PIVOT_TABLE_FILEPATHS) {
          expect(zipData[filepath]).toBeDefined();
        }
      });
    });

    it("supports multiple values when columns is empty", async () => {
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet("Sheet1");

      const table = worksheet.addTable({
        name: "MultiValuesTable",
        ref: "A1",
        columns: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }, { name: "E" }],
        rows: [
          ["a1", "b1", "c1", 4, 5],
          ["a1", "b2", "c1", 4, 5],
          ["a2", "b1", "c2", 14, 24],
          ["a2", "b2", "c2", 24, 35]
        ]
      });

      const worksheet2 = workbook.addWorksheet("Sheet2");
      worksheet2.addPivotTable({
        sourceTable: table,
        rows: ["A", "B"],
        columns: [], // Empty columns - allows multiple values
        values: ["D", "E"], // Multiple values
        metric: "sum"
      });

      const multiValuesFilePath = testFilePath("workbook-pivot-multi-values.test");
      return workbook.xlsx.writeFile(multiValuesFilePath).then(async () => {
        const buffer = await fsReadFileAsync(multiValuesFilePath);
        const zipData = new ZipParser(buffer).extractAllSync();
        for (const filepath of PIVOT_TABLE_FILEPATHS) {
          expect(zipData[filepath]).toBeDefined();
        }
      });
    });

    it("supports empty columns with single value", async () => {
      const workbook = new Workbook();
      const worksheet1 = workbook.addWorksheet("Sheet1");
      worksheet1.addRows(TEST_DATA);

      const worksheet2 = workbook.addWorksheet("Sheet2");
      worksheet2.addPivotTable({
        sourceSheet: worksheet1,
        rows: ["A", "B"],
        columns: [], // Empty columns
        values: ["E"],
        metric: "sum"
      });

      const emptyColsFilePath = testFilePath("workbook-pivot-empty-cols.test");
      return workbook.xlsx.writeFile(emptyColsFilePath).then(async () => {
        const buffer = await fsReadFileAsync(emptyColsFilePath);
        const zipData = new ZipParser(buffer).extractAllSync();
        for (const filepath of PIVOT_TABLE_FILEPATHS) {
          expect(zipData[filepath]).toBeDefined();
        }
      });
    });

    it("throws error if multiple values with non-empty columns", () => {
      const workbook = new Workbook();
      const worksheet1 = workbook.addWorksheet("Sheet1");
      worksheet1.addRows(TEST_DATA);

      const worksheet2 = workbook.addWorksheet("Sheet2");

      expect(() => {
        worksheet2.addPivotTable({
          sourceSheet: worksheet1,
          rows: ["A"],
          columns: ["B"], // Non-empty columns
          values: ["D", "E"], // Multiple values - not allowed with columns
          metric: "sum"
        });
      }).toThrow(
        "It is currently not possible to have multiple values when columns are specified. Please either supply an empty array for columns or a single value."
      );
    });

    it("throws error if no values specified", () => {
      const workbook = new Workbook();
      const worksheet1 = workbook.addWorksheet("Sheet1");
      worksheet1.addRows(TEST_DATA);

      const worksheet2 = workbook.addWorksheet("Sheet2");

      expect(() => {
        worksheet2.addPivotTable({
          sourceSheet: worksheet1,
          rows: ["A"],
          columns: ["B"],
          values: [], // No values
          metric: "sum"
        });
      }).toThrow("Must have at least one value.");
    });

    it("supports applyWidthHeightFormats option to preserve column widths", async () => {
      const workbook = new Workbook();
      const worksheet1 = workbook.addWorksheet("Sheet1");
      worksheet1.addRows(TEST_DATA);

      const worksheet2 = workbook.addWorksheet("Sheet2");

      // Set custom column widths before creating pivot table
      worksheet2.getColumn(1).width = 30;
      worksheet2.getColumn(2).width = 15;

      worksheet2.addPivotTable({
        sourceSheet: worksheet1,
        rows: ["A", "B"],
        columns: ["C"],
        values: ["D"],
        metric: "sum",
        applyWidthHeightFormats: "0" // Preserve worksheet column widths
      });

      await workbook.xlsx.writeFile(TEST_XLSX_FILEPATH);

      // Verify the pivot table XML contains the correct attribute
      const buffer = await fsReadFileAsync(TEST_XLSX_FILEPATH);
      const zipData = new ZipParser(buffer).extractAllSync();
      const pivotTableXml = new TextDecoder().decode(zipData["xl/pivotTables/pivotTable1.xml"]);

      expect(pivotTableXml).toContain('applyWidthHeightFormats="0"');
    });

    it("defaults applyWidthHeightFormats to 1 when not specified", async () => {
      const workbook = new Workbook();
      const worksheet1 = workbook.addWorksheet("Sheet1");
      worksheet1.addRows(TEST_DATA);

      const worksheet2 = workbook.addWorksheet("Sheet2");

      worksheet2.addPivotTable({
        sourceSheet: worksheet1,
        rows: ["A", "B"],
        columns: ["C"],
        values: ["D"],
        metric: "sum"
        // applyWidthHeightFormats not specified, should default to "1"
      });

      await workbook.xlsx.writeFile(TEST_XLSX_FILEPATH);

      // Verify the pivot table XML contains the default attribute
      const buffer = await fsReadFileAsync(TEST_XLSX_FILEPATH);
      const zipData = new ZipParser(buffer).extractAllSync();
      const pivotTableXml = new TextDecoder().decode(zipData["xl/pivotTables/pivotTable1.xml"]);

      expect(pivotTableXml).toContain('applyWidthHeightFormats="1"');
    });

    it("supports omitting columns (Excel uses 'Values' as column field)", async () => {
      const workbook = new Workbook();
      const worksheet1 = workbook.addWorksheet("Sheet1");
      worksheet1.addRows(TEST_DATA);

      const worksheet2 = workbook.addWorksheet("Sheet2");

      // Create pivot table without specifying columns
      worksheet2.addPivotTable({
        sourceSheet: worksheet1,
        rows: ["A", "B"],
        // columns is omitted - should default to []
        values: ["D"],
        metric: "sum"
      });

      await workbook.xlsx.writeFile(TEST_XLSX_FILEPATH);

      // Verify the file was created successfully
      const buffer = await fsReadFileAsync(TEST_XLSX_FILEPATH);
      const zipData = new ZipParser(buffer).extractAllSync();

      // Verify pivot table XML exists
      expect(zipData["xl/pivotTables/pivotTable1.xml"]).toBeDefined();
    });

    it("handles XML special characters in pivot table data", async () => {
      const workbook = new Workbook();
      const worksheet1 = workbook.addWorksheet("Sheet1");

      // Data with XML special characters: &, <, >, ", '
      // Use special characters in both row fields AND value field names
      worksheet1.addRows([
        ["Company", "Product", "Sales & Revenue"],
        ["Johnson & Johnson", "Drug A", 1000],
        ["BioTech <Special>", "Drug B", 1500],
        ['PharmaCorp "Elite"', "Drug C", 1200],
        ["Gene's Labs", "Drug D", 1800]
      ]);

      const worksheet2 = workbook.addWorksheet("Sheet2");

      worksheet2.addPivotTable({
        sourceSheet: worksheet1,
        rows: ["Company"],
        columns: ["Product"],
        values: ["Sales & Revenue"], // Value field name contains &
        metric: "sum"
      });

      await workbook.xlsx.writeFile(TEST_XLSX_FILEPATH);

      // Verify the file was created successfully
      const buffer = await fsReadFileAsync(TEST_XLSX_FILEPATH);
      const zipData = new ZipParser(buffer).extractAllSync();

      // Verify pivot cache definition contains properly escaped XML
      const cacheDefinition = new TextDecoder().decode(
        zipData["xl/pivotCache/pivotCacheDefinition1.xml"]
      );

      // Check that XML special characters are escaped in sharedItems
      expect(cacheDefinition).toContain("Johnson &amp; Johnson");
      expect(cacheDefinition).toContain("BioTech &lt;Special&gt;");
      expect(cacheDefinition).toContain("PharmaCorp &quot;Elite&quot;");
      expect(cacheDefinition).toContain("Gene&apos;s Labs");

      // Verify the XML is valid (no unescaped special chars)
      expect(cacheDefinition).not.toContain('v="Johnson & Johnson"');
      expect(cacheDefinition).not.toContain('v="BioTech <Special>"');

      // Verify pivot table definition has escaped dataField name
      const pivotTableXml = new TextDecoder().decode(zipData["xl/pivotTables/pivotTable1.xml"]);
      expect(pivotTableXml).toContain("Sum of Sales &amp; Revenue");
      expect(pivotTableXml).not.toContain("Sum of Sales & Revenue");
    });

    it("handles null and undefined values in pivot table data", async () => {
      const workbook = new Workbook();
      const worksheet1 = workbook.addWorksheet("Sheet1");

      // Data with null/undefined values
      worksheet1.addRows([
        ["Region", "Territory", "Amount"],
        ["North", "NE", 1000],
        ["South", null, 1500], // null territory
        ["East", undefined, 2000], // undefined territory
        ["West", "NW", 2200]
      ]);

      const worksheet2 = workbook.addWorksheet("Sheet2");

      worksheet2.addPivotTable({
        sourceSheet: worksheet1,
        rows: ["Region", "Territory"], // Territory has null/undefined values
        values: ["Amount"],
        metric: "sum"
      });

      await workbook.xlsx.writeFile(TEST_XLSX_FILEPATH);

      // Verify the file was created successfully (no crash)
      const buffer = await fsReadFileAsync(TEST_XLSX_FILEPATH);
      const zipData = new ZipParser(buffer).extractAllSync();

      // Verify pivot cache records contains <m /> for missing values
      const cacheRecords = new TextDecoder().decode(
        zipData["xl/pivotCache/pivotCacheRecords1.xml"]
      );

      // <m /> is OOXML standard for missing values
      expect(cacheRecords).toContain("<m />");

      // Verify pivot table XML exists
      expect(zipData["xl/pivotTables/pivotTable1.xml"]).toBeDefined();
    });

    it("supports multiple pivot tables from same source data", async () => {
      const workbook = new Workbook();

      // Create source data with multiple dimensions
      const sourceSheet = workbook.addWorksheet("Sales Data");
      sourceSheet.addRows([
        ["Region", "Product", "Salesperson", "Quarter", "Revenue", "Units"],
        ["North", "Widget A", "Alice", "Q1", 10000, 100],
        ["South", "Widget B", "Bob", "Q1", 15000, 150],
        ["North", "Widget A", "Alice", "Q2", 12000, 120],
        ["South", "Widget B", "Bob", "Q2", 18000, 180],
        ["East", "Widget C", "Charlie", "Q1", 20000, 200],
        ["West", "Widget C", "Diana", "Q2", 22000, 220]
      ]);

      // First pivot table: Revenue by Region and Product
      const pivot1Sheet = workbook.addWorksheet("Pivot 1 - Region x Product");
      pivot1Sheet.addPivotTable({
        sourceSheet,
        rows: ["Region", "Product"],
        columns: ["Quarter"],
        values: ["Revenue"],
        metric: "sum"
      });

      // Second pivot table: Units by Salesperson (completely different fields)
      const pivot2Sheet = workbook.addWorksheet("Pivot 2 - Salesperson");
      pivot2Sheet.addPivotTable({
        sourceSheet,
        rows: ["Salesperson"],
        columns: ["Quarter"],
        values: ["Units"],
        metric: "sum"
      });

      // Third pivot table: Another different configuration
      const pivot3Sheet = workbook.addWorksheet("Pivot 3 - Product x Region");
      pivot3Sheet.addPivotTable({
        sourceSheet,
        rows: ["Product"],
        columns: ["Region"],
        values: ["Revenue"],
        metric: "sum"
      });

      await workbook.xlsx.writeFile(TEST_XLSX_FILEPATH);

      // Verify the file was created successfully
      const buffer = await fsReadFileAsync(TEST_XLSX_FILEPATH);
      const zipData = new ZipParser(buffer).extractAllSync();

      // Verify all three pivot tables exist
      expect(zipData["xl/pivotTables/pivotTable1.xml"]).toBeDefined();
      expect(zipData["xl/pivotTables/pivotTable2.xml"]).toBeDefined();
      expect(zipData["xl/pivotTables/pivotTable3.xml"]).toBeDefined();

      // Verify all three pivot cache definitions exist
      expect(zipData["xl/pivotCache/pivotCacheDefinition1.xml"]).toBeDefined();
      expect(zipData["xl/pivotCache/pivotCacheDefinition2.xml"]).toBeDefined();
      expect(zipData["xl/pivotCache/pivotCacheDefinition3.xml"]).toBeDefined();

      // Verify each pivot table has unique cacheId
      const pivotTable1Xml = new TextDecoder().decode(zipData["xl/pivotTables/pivotTable1.xml"]);
      const pivotTable2Xml = new TextDecoder().decode(zipData["xl/pivotTables/pivotTable2.xml"]);
      const pivotTable3Xml = new TextDecoder().decode(zipData["xl/pivotTables/pivotTable3.xml"]);

      expect(pivotTable1Xml).toContain('cacheId="10"');
      expect(pivotTable2Xml).toContain('cacheId="11"');
      expect(pivotTable3Xml).toContain('cacheId="12"');
    });

    it("supports 'count' metric for pivot tables", async () => {
      const workbook = new Workbook();
      const worksheet1 = workbook.addWorksheet("Sheet1");
      worksheet1.addRows(TEST_DATA);

      const worksheet2 = workbook.addWorksheet("Sheet2");

      worksheet2.addPivotTable({
        sourceSheet: worksheet1,
        rows: ["A", "B"],
        columns: ["C"],
        values: ["D"],
        metric: "count"
      });

      await workbook.xlsx.writeFile(TEST_XLSX_FILEPATH);

      // Verify the file was created successfully
      const buffer = await fsReadFileAsync(TEST_XLSX_FILEPATH);
      const zipData = new ZipParser(buffer).extractAllSync();

      // Verify pivot table XML contains count-specific attributes
      const pivotTableXml = new TextDecoder().decode(zipData["xl/pivotTables/pivotTable1.xml"]);

      // dataField should have name="Count of D" and subtotal="count"
      expect(pivotTableXml).toContain("Count of D");
      expect(pivotTableXml).toContain('subtotal="count"');
      expect(pivotTableXml).not.toContain("Sum of");
    });

    it("defaults to 'sum' metric when not specified", async () => {
      const workbook = new Workbook();
      const worksheet1 = workbook.addWorksheet("Sheet1");
      worksheet1.addRows(TEST_DATA);

      const worksheet2 = workbook.addWorksheet("Sheet2");

      worksheet2.addPivotTable({
        sourceSheet: worksheet1,
        rows: ["A", "B"],
        columns: ["C"],
        values: ["D"]
        // metric not specified - should default to 'sum'
      });

      await workbook.xlsx.writeFile(TEST_XLSX_FILEPATH);

      const buffer = await fsReadFileAsync(TEST_XLSX_FILEPATH);
      const zipData = new ZipParser(buffer).extractAllSync();

      const pivotTableXml = new TextDecoder().decode(zipData["xl/pivotTables/pivotTable1.xml"]);

      // dataField should have name="Sum of D" and no subtotal attribute
      expect(pivotTableXml).toContain("Sum of D");
      expect(pivotTableXml).not.toContain('subtotal="count"');
    });

    it("throws error for unsupported metric", () => {
      const workbook = new Workbook();
      const worksheet1 = workbook.addWorksheet("Sheet1");
      worksheet1.addRows(TEST_DATA);

      const worksheet2 = workbook.addWorksheet("Sheet2");

      expect(() => {
        worksheet2.addPivotTable({
          sourceSheet: worksheet1,
          rows: ["A", "B"],
          columns: ["C"],
          values: ["D"],
          metric: "average" as any // unsupported metric
        });
      }).toThrow('Only the "sum" and "count" metrics are supported at this time.');
    });

    // ==========================================================================
    // Pivot Table Read and Preserve Tests (Issue #261)
    // ==========================================================================

    describe("Pivot Table Preservation (Load/Save)", () => {
      const ROUNDTRIP_FILEPATH = testFilePath("workbook-pivot-roundtrip.test");

      it("preserves pivot table through load/save cycle", async () => {
        // Step 1: Create workbook with pivot table
        const workbook = new Workbook();
        const worksheet1 = workbook.addWorksheet("Sheet1");
        worksheet1.addRows(TEST_DATA);

        const worksheet2 = workbook.addWorksheet("Sheet2");
        worksheet2.addPivotTable({
          sourceSheet: worksheet1,
          rows: ["A", "B"],
          columns: ["C"],
          values: ["E"],
          metric: "sum"
        });

        // Step 2: Save to file
        await workbook.xlsx.writeFile(ROUNDTRIP_FILEPATH);

        // Step 3: Read the file back
        const loadedWorkbook = new Workbook();
        await loadedWorkbook.xlsx.readFile(ROUNDTRIP_FILEPATH);

        // Step 4: Check that loaded workbook has pivot tables
        expect(loadedWorkbook.pivotTables.length).toBe(1);
        const loadedPivot = loadedWorkbook.pivotTables[0];
        expect(loadedPivot).toBeDefined();
        expect(loadedPivot.isLoaded).toBe(true);
        expect(loadedPivot.tableNumber).toBe(1);

        // Step 5: Save again
        const ROUNDTRIP_FILEPATH2 = testFilePath("workbook-pivot-roundtrip2.test");
        await loadedWorkbook.xlsx.writeFile(ROUNDTRIP_FILEPATH2);

        // Step 6: Verify pivot table files are present in the saved file
        const buffer = await fsReadFileAsync(ROUNDTRIP_FILEPATH2);
        const zipData = new ZipParser(buffer).extractAllSync();
        for (const filepath of PIVOT_TABLE_FILEPATHS) {
          expect(zipData[filepath]).toBeDefined();
        }
      });

      it("preserves multiple pivot tables through load/save cycle", async () => {
        // Step 1: Create workbook with multiple pivot tables
        const workbook = new Workbook();
        const sourceSheet = workbook.addWorksheet("Source");
        sourceSheet.addRows(TEST_DATA);

        const pivotSheet = workbook.addWorksheet("Pivots");

        // Add two pivot tables
        pivotSheet.addPivotTable({
          sourceSheet: sourceSheet,
          rows: ["A"],
          columns: ["C"],
          values: ["D"],
          metric: "sum"
        });

        pivotSheet.addPivotTable({
          sourceSheet: sourceSheet,
          rows: ["B"],
          columns: ["C"],
          values: ["E"],
          metric: "count"
        });

        expect(workbook.pivotTables.length).toBe(2);

        // Step 2: Save
        const MULTI_PIVOT_PATH = testFilePath("workbook-multi-pivot-roundtrip.test");
        await workbook.xlsx.writeFile(MULTI_PIVOT_PATH);

        // Step 3: Load
        const loadedWorkbook = new Workbook();
        await loadedWorkbook.xlsx.readFile(MULTI_PIVOT_PATH);

        // Step 4: Verify both pivot tables are loaded
        expect(loadedWorkbook.pivotTables.length).toBe(2);

        // Step 5: Save again
        const MULTI_PIVOT_PATH2 = testFilePath("workbook-multi-pivot-roundtrip2.test");
        await loadedWorkbook.xlsx.writeFile(MULTI_PIVOT_PATH2);

        // Step 6: Verify both pivot tables files exist
        const buffer = await fsReadFileAsync(MULTI_PIVOT_PATH2);
        const zipData = new ZipParser(buffer).extractAllSync();

        // Both pivot tables should have their files
        expect(zipData["xl/pivotTables/pivotTable1.xml"]).toBeDefined();
        expect(zipData["xl/pivotTables/pivotTable2.xml"]).toBeDefined();
        expect(zipData["xl/pivotCache/pivotCacheDefinition1.xml"]).toBeDefined();
        expect(zipData["xl/pivotCache/pivotCacheDefinition2.xml"]).toBeDefined();
      });

      it("preserves pivot table cache fields correctly", async () => {
        // Create workbook with specific data
        const workbook = new Workbook();
        const worksheet1 = workbook.addWorksheet("Data");
        worksheet1.addRows([
          ["Category", "Value"],
          ["Alpha", 100],
          ["Beta", 200],
          ["Alpha", 150]
        ]);

        const worksheet2 = workbook.addWorksheet("Pivot");
        worksheet2.addPivotTable({
          sourceSheet: worksheet1,
          rows: ["Category"],
          columns: [],
          values: ["Value"],
          metric: "sum"
        });

        const CACHE_FILEPATH = testFilePath("workbook-pivot-cache.test");
        await workbook.xlsx.writeFile(CACHE_FILEPATH);

        // Load and verify cache fields
        const loadedWorkbook = new Workbook();
        await loadedWorkbook.xlsx.readFile(CACHE_FILEPATH);

        expect(loadedWorkbook.pivotTables.length).toBe(1);
        const pivot = loadedWorkbook.pivotTables[0];
        expect(pivot.cacheFields).toBeDefined();
        expect(pivot.cacheFields.length).toBe(2);
        expect(pivot.cacheFields[0].name).toBe("Category");
        expect(pivot.cacheFields[1].name).toBe("Value");
      });

      it("preserves pivot table data fields correctly", async () => {
        const workbook = new Workbook();
        const worksheet1 = workbook.addWorksheet("Data");
        worksheet1.addRows(TEST_DATA);

        const worksheet2 = workbook.addWorksheet("Pivot");
        worksheet2.addPivotTable({
          sourceSheet: worksheet1,
          rows: ["A"],
          columns: [],
          values: ["D", "E"], // Multiple values
          metric: "sum"
        });

        const DATAFIELD_FILEPATH = testFilePath("workbook-pivot-datafields.test");
        await workbook.xlsx.writeFile(DATAFIELD_FILEPATH);

        // Load and verify data fields
        const loadedWorkbook = new Workbook();
        await loadedWorkbook.xlsx.readFile(DATAFIELD_FILEPATH);

        const pivot = loadedWorkbook.pivotTables[0];
        expect(pivot.dataFields).toBeDefined();
        expect(pivot.dataFields.length).toBe(2);
        expect(pivot.dataFields[0].name).toContain("D");
        expect(pivot.dataFields[1].name).toContain("E");
      });

      it("preserves count metric through load/save", async () => {
        const workbook = new Workbook();
        const worksheet1 = workbook.addWorksheet("Data");
        worksheet1.addRows(TEST_DATA);

        const worksheet2 = workbook.addWorksheet("Pivot");
        worksheet2.addPivotTable({
          sourceSheet: worksheet1,
          rows: ["A"],
          columns: [],
          values: ["D"],
          metric: "count"
        });

        const COUNT_FILEPATH = testFilePath("workbook-pivot-count.test");
        await workbook.xlsx.writeFile(COUNT_FILEPATH);

        // Load and verify metric
        const loadedWorkbook = new Workbook();
        await loadedWorkbook.xlsx.readFile(COUNT_FILEPATH);

        const pivot = loadedWorkbook.pivotTables[0];
        expect(pivot.metric).toBe("count");
      });

      it("preserves applyWidthHeightFormats option", async () => {
        const workbook = new Workbook();
        const worksheet1 = workbook.addWorksheet("Data");
        worksheet1.addRows(TEST_DATA);

        const worksheet2 = workbook.addWorksheet("Pivot");
        worksheet2.addPivotTable({
          sourceSheet: worksheet1,
          rows: ["A"],
          columns: ["C"],
          values: ["D"],
          applyWidthHeightFormats: "0" // Preserve column widths
        });

        const FORMATS_FILEPATH = testFilePath("workbook-pivot-formats.test");
        await workbook.xlsx.writeFile(FORMATS_FILEPATH);

        // Load and verify
        const loadedWorkbook = new Workbook();
        await loadedWorkbook.xlsx.readFile(FORMATS_FILEPATH);

        const pivot = loadedWorkbook.pivotTables[0];
        expect(pivot.applyWidthHeightFormats).toBe("0");
      });

      it("preserves XML special characters in cache field names", async () => {
        const workbook = new Workbook();
        const worksheet1 = workbook.addWorksheet("Data");
        worksheet1.addRows([
          ["Name<>", "Value&"],
          ["Test'1", 100],
          ['Test"2', 200]
        ]);

        const worksheet2 = workbook.addWorksheet("Pivot");
        worksheet2.addPivotTable({
          sourceSheet: worksheet1,
          rows: ["Name<>"],
          columns: [],
          values: ["Value&"],
          metric: "sum"
        });

        const SPECIAL_CHARS_FILEPATH = testFilePath("workbook-pivot-special-chars.test");
        await workbook.xlsx.writeFile(SPECIAL_CHARS_FILEPATH);

        // Load and verify special characters are preserved
        const loadedWorkbook = new Workbook();
        await loadedWorkbook.xlsx.readFile(SPECIAL_CHARS_FILEPATH);

        const pivot = loadedWorkbook.pivotTables[0];
        expect(pivot.cacheFields[0].name).toBe("Name<>");
        expect(pivot.cacheFields[1].name).toBe("Value&");
      });

      it("handles pivot table with shared items", async () => {
        const workbook = new Workbook();
        const worksheet1 = workbook.addWorksheet("Data");
        worksheet1.addRows(TEST_DATA);

        const worksheet2 = workbook.addWorksheet("Pivot");
        worksheet2.addPivotTable({
          sourceSheet: worksheet1,
          rows: ["A", "B"], // These columns will have shared items
          columns: ["C"],
          values: ["E"],
          metric: "sum"
        });

        const SHARED_ITEMS_FILEPATH = testFilePath("workbook-pivot-shared-items.test");
        await workbook.xlsx.writeFile(SHARED_ITEMS_FILEPATH);

        const loadedWorkbook = new Workbook();
        await loadedWorkbook.xlsx.readFile(SHARED_ITEMS_FILEPATH);

        const pivot = loadedWorkbook.pivotTables[0];
        // Check that row fields have shared items
        expect(pivot.cacheFields[0].sharedItems).toBeDefined();
        expect(pivot.cacheFields[0].sharedItems).toContain("a1");
        expect(pivot.cacheFields[1].sharedItems).toBeDefined();
        expect(pivot.cacheFields[1].sharedItems).toContain("b1");
      });
    });

    describe("Issue #1678: Pivot tables with non-sequential cacheId", () => {
      // This tests the fix for Issue #1678 where pivot tables with
      // non-sequential cache IDs (e.g., cacheId=23 instead of 10)
      // were not being properly linked to their cache data
      const NON_SEQ_CACHE_FILEPATH = testFilePath("workbook-pivot-non-seq-cache.test");

      it("should correctly load and save pivot tables with high cacheId values", async () => {
        // Create a workbook with pivot table
        const workbook = new Workbook();
        const sheet1 = workbook.addWorksheet("Data");
        sheet1.addRows(TEST_DATA);

        const sheet2 = workbook.addWorksheet("Pivot");
        sheet2.addPivotTable({
          sourceSheet: sheet1,
          rows: ["A"],
          columns: ["C"],
          values: ["D"],
          metric: "sum"
        });

        // Save it
        await workbook.xlsx.writeFile(NON_SEQ_CACHE_FILEPATH);

        // Load and resave
        const loadedWorkbook = new Workbook();
        await loadedWorkbook.xlsx.readFile(NON_SEQ_CACHE_FILEPATH);

        expect(loadedWorkbook.pivotTables.length).toBe(1);
        const pivot = loadedWorkbook.pivotTables[0];

        // Verify cache data is properly linked
        expect(pivot.isLoaded).toBe(true);
        expect(pivot.cacheDefinition).toBeDefined();
        expect(pivot.cacheRecords).toBeDefined();

        // Save again
        const RESAVED_FILEPATH = testFilePath("workbook-pivot-non-seq-cache-resaved.test");
        await loadedWorkbook.xlsx.writeFile(RESAVED_FILEPATH);

        // Load the resaved file
        const finalWorkbook = new Workbook();
        await finalWorkbook.xlsx.readFile(RESAVED_FILEPATH);

        // Verify pivot table is still intact
        expect(finalWorkbook.pivotTables.length).toBe(1);
        const finalPivot = finalWorkbook.pivotTables[0];
        expect(finalPivot.isLoaded).toBe(true);
        expect(finalPivot.cacheDefinition).toBeDefined();
        expect(finalPivot.cacheRecords).toBeDefined();

        // Verify the data is preserved
        expect(finalPivot.cacheFields.length).toBeGreaterThan(0);
        expect(finalPivot.cacheRecords.records.length).toBe(6); // 6 data rows

        // Clean up
        await promisify(fs.unlink)(NON_SEQ_CACHE_FILEPATH);
        await promisify(fs.unlink)(RESAVED_FILEPATH);
      });
    });

    describe("GitHub Issue #5 - rowItems/colItems/recordCount fix", () => {
      it("generates correct rowItems with all unique values plus grand total", async () => {
        const workbook = new Workbook();
        const worksheet = workbook.addWorksheet("table");

        const table = worksheet.addTable({
          name: "table",
          ref: "A1",
          headerRow: true,
          columns: [{ name: "A" }, { name: "B" }, { name: "C" }],
          rows: [
            ["a1", "b1", 5],
            ["a1", "b2", 5],
            ["a2", "b1", 24],
            ["a2", "b2", 35],
            ["a3", "b1", 45],
            ["a3", "b2", 45]
          ]
        });

        const worksheet2 = workbook.addWorksheet("Sheet2");
        worksheet2.addPivotTable({
          sourceTable: table,
          rows: ["A"],
          columns: ["B"],
          values: ["C"],
          metric: "sum"
        });

        const pivotFilePath = testFilePath("workbook-pivot-issue5.test");
        await workbook.xlsx.writeFile(pivotFilePath);

        // Read and parse the XML to verify correct structure
        const buffer = await fsReadFileAsync(pivotFilePath);
        const zipData = new ZipParser(buffer).extractAllSync();

        // Check pivotTable1.xml
        const pivotTableXml = zipData["xl/pivotTables/pivotTable1.xml"];
        expect(pivotTableXml).toBeDefined();
        const pivotTableStr = new TextDecoder().decode(pivotTableXml);

        // rowItems should have 4 items: a1, a2, a3, and grand total
        // The pattern should be: <rowItems count="4">
        expect(pivotTableStr).toMatch(/<rowItems count="4">/);
        // Should have 3 regular items: <i><x /></i>, <i><x v="1" /></i>, <i><x v="2" /></i>
        // Note: v="0" is omitted per Excel convention (v="0" is the default)
        expect(pivotTableStr).toMatch(/<i><x \/><\/i>/);
        expect(pivotTableStr).toMatch(/<i><x v="1" \/><\/i>/);
        expect(pivotTableStr).toMatch(/<i><x v="2" \/><\/i>/);
        // And grand total: <i t="grand"><x /></i>
        expect(pivotTableStr).toMatch(/<i t="grand"><x \/><\/i>/);

        // colItems should have 3 items: b1, b2, and grand total
        expect(pivotTableStr).toMatch(/<colItems count="3">/);

        // Check pivotCacheDefinition1.xml for correct recordCount
        const cacheDefXml = zipData["xl/pivotCache/pivotCacheDefinition1.xml"];
        expect(cacheDefXml).toBeDefined();
        const cacheDefStr = new TextDecoder().decode(cacheDefXml);

        // recordCount should be 6 (number of data rows)
        expect(cacheDefStr).toMatch(/recordCount="6"/);

        // Clean up
        await promisify(fs.unlink)(pivotFilePath);
      });

      it("generates correct colItems when columns is empty with single value", async () => {
        const workbook = new Workbook();
        const worksheet = workbook.addWorksheet("table");

        const table = worksheet.addTable({
          name: "table",
          ref: "A1",
          headerRow: true,
          columns: [{ name: "A" }, { name: "B" }, { name: "C" }],
          rows: [
            ["a1", "b1", 5],
            ["a2", "b2", 10]
          ]
        });

        const worksheet2 = workbook.addWorksheet("Sheet2");
        worksheet2.addPivotTable({
          sourceTable: table,
          rows: ["A"],
          columns: [], // empty columns
          values: ["C"],
          metric: "sum"
        });

        const pivotFilePath = testFilePath("workbook-pivot-no-cols.test");
        await workbook.xlsx.writeFile(pivotFilePath);

        const buffer = await fsReadFileAsync(pivotFilePath);
        const zipData = new ZipParser(buffer).extractAllSync();

        const pivotTableXml = zipData["xl/pivotTables/pivotTable1.xml"];
        const pivotTableStr = new TextDecoder().decode(pivotTableXml);

        // With no columns and single value, colItems should just have grand total
        expect(pivotTableStr).toMatch(/<colItems count="1">/);

        // Clean up
        await promisify(fs.unlink)(pivotFilePath);
      });

      it("generates correct colItems when columns is empty with multiple values", async () => {
        const workbook = new Workbook();
        const worksheet = workbook.addWorksheet("table");

        const table = worksheet.addTable({
          name: "table",
          ref: "A1",
          headerRow: true,
          columns: [{ name: "A" }, { name: "B" }, { name: "C" }],
          rows: [
            ["a1", "b1", 5],
            ["a2", "b2", 10]
          ]
        });

        const worksheet2 = workbook.addWorksheet("Sheet2");
        worksheet2.addPivotTable({
          sourceTable: table,
          rows: ["A"],
          columns: [], // empty columns
          values: ["B", "C"], // multiple values
          metric: "sum"
        });

        const pivotFilePath = testFilePath("workbook-pivot-multi-vals.test");
        await workbook.xlsx.writeFile(pivotFilePath);

        const buffer = await fsReadFileAsync(pivotFilePath);
        const zipData = new ZipParser(buffer).extractAllSync();

        const pivotTableXml = zipData["xl/pivotTables/pivotTable1.xml"];
        const pivotTableStr = new TextDecoder().decode(pivotTableXml);

        // With no columns and 2 values, colItems should have 3 items (2 values + grand total)
        expect(pivotTableStr).toMatch(/<colItems count="3">/);

        // Clean up
        await promisify(fs.unlink)(pivotFilePath);
      });
    });

    describe("GitHub Issue #5 - worksheetSource sheet name fix", () => {
      it("uses worksheet name (not table name) in pivotCacheDefinition worksheetSource", async () => {
        const workbook = new Workbook();
        // Create a worksheet named "DataSheet" with a table named "MyTable"
        const worksheet = workbook.addWorksheet("DataSheet");

        const table = worksheet.addTable({
          name: "MyTable", // Table name is different from worksheet name
          ref: "A1",
          headerRow: true,
          columns: [{ name: "Col1" }, { name: "Col2" }, { name: "Value" }],
          rows: [
            ["a", "x", 10],
            ["b", "y", 20]
          ]
        });

        const worksheet2 = workbook.addWorksheet("PivotSheet");
        worksheet2.addPivotTable({
          sourceTable: table,
          rows: ["Col1"],
          columns: ["Col2"],
          values: ["Value"],
          metric: "sum"
        });

        const pivotFilePath = testFilePath("workbook-pivot-worksheet-name.test");
        await workbook.xlsx.writeFile(pivotFilePath);

        const buffer = await fsReadFileAsync(pivotFilePath);
        const zipData = new ZipParser(buffer).extractAllSync();

        // Check pivotCacheDefinition1.xml
        const cacheDefXml = zipData["xl/pivotCache/pivotCacheDefinition1.xml"];
        const cacheDefStr = new TextDecoder().decode(cacheDefXml);

        // The worksheetSource sheet attribute should reference the worksheet name "DataSheet"
        // NOT the table name "MyTable"
        expect(cacheDefStr).toContain('sheet="DataSheet"');
        expect(cacheDefStr).not.toContain('sheet="MyTable"');

        // Clean up
        await promisify(fs.unlink)(pivotFilePath);
      });
    });

    describe("GitHub Issue #15 - same field in rows and values", () => {
      it("handles numeric field used as both row and value field correctly", async () => {
        const workbook = new Workbook();
        const worksheet = workbook.addWorksheet();

        const table = worksheet.addTable({
          name: "table",
          ref: "A1",
          headerRow: true,
          columns: [{ name: "A" }, { name: "B" }, { name: "C" }],
          rows: [
            ["a1", "b1", 5],
            ["a1", "b2", 5],
            ["a2", "b1", 24],
            ["a2", "b2", 35],
            ["a3", "b1", 45],
            ["a3", "b2", 45]
          ]
        });

        const worksheet2 = workbook.addWorksheet("Sheet2");
        // Use same field "C" for both rows and values
        worksheet2.addPivotTable({
          sourceTable: table,
          rows: ["C"],
          columns: ["B"],
          values: ["C"],
          metric: "sum"
        });

        const pivotFilePath = testFilePath("workbook-pivot-issue15.test");
        await workbook.xlsx.writeFile(pivotFilePath);

        const buffer = await fsReadFileAsync(pivotFilePath);
        const zipData = new ZipParser(buffer).extractAllSync();

        // Check pivotCacheDefinition1.xml
        const cacheDefXml = zipData["xl/pivotCache/pivotCacheDefinition1.xml"];
        const cacheDefStr = new TextDecoder().decode(cacheDefXml);

        // Field C should have numeric shared items (not string)
        // Should have containsNumber="1" and use <n v="..." /> format
        expect(cacheDefStr).toContain('name="C"');
        expect(cacheDefStr).toContain('containsNumber="1"');
        expect(cacheDefStr).toContain('<n v="5"');
        expect(cacheDefStr).toContain('<n v="24"');
        expect(cacheDefStr).toContain('<n v="35"');
        expect(cacheDefStr).toContain('<n v="45"');
        // Should NOT have string format for numeric values
        expect(cacheDefStr).not.toContain('<s v="5"');
        expect(cacheDefStr).not.toContain('<s v="24"');

        // Check pivotCacheRecords1.xml - records should use index references
        const cacheRecXml = zipData["xl/pivotCache/pivotCacheRecords1.xml"];
        const cacheRecStr = new TextDecoder().decode(cacheRecXml);

        // Records should use <x v="..." /> format for indexed lookup
        expect(cacheRecStr).toContain('<x v="');

        // Check pivotTable1.xml
        const pivotXml = zipData["xl/pivotTables/pivotTable1.xml"];
        const pivotStr = new TextDecoder().decode(pivotXml);

        // Should have dataField for "C" with Sum
        expect(pivotStr).toContain("Sum of C");

        // Clean up
        await promisify(fs.unlink)(pivotFilePath);
      });

      it("handles same numeric field used as both row and column", async () => {
        const workbook = new Workbook();
        const worksheet = workbook.addWorksheet();

        const table = worksheet.addTable({
          name: "table",
          ref: "A1",
          headerRow: true,
          columns: [{ name: "A" }, { name: "B" }, { name: "C" }],
          rows: [
            ["a1", 1, 100],
            ["a1", 2, 200],
            ["a2", 1, 300],
            ["a2", 2, 400]
          ]
        });

        const worksheet2 = workbook.addWorksheet("Sheet2");
        // Use numeric field "B" for rows and "C" for values
        worksheet2.addPivotTable({
          sourceTable: table,
          rows: ["B"],
          columns: ["A"],
          values: ["C"],
          metric: "sum"
        });

        const pivotFilePath = testFilePath("workbook-pivot-issue15-numeric-rows.test");
        await workbook.xlsx.writeFile(pivotFilePath);

        const buffer = await fsReadFileAsync(pivotFilePath);
        const zipData = new ZipParser(buffer).extractAllSync();

        // Check pivotCacheDefinition1.xml
        const cacheDefXml = zipData["xl/pivotCache/pivotCacheDefinition1.xml"];
        const cacheDefStr = new TextDecoder().decode(cacheDefXml);

        // Field B should have numeric shared items
        expect(cacheDefStr).toContain('name="B"');
        expect(cacheDefStr).toContain('<n v="1"');
        expect(cacheDefStr).toContain('<n v="2"');

        // Clean up
        await promisify(fs.unlink)(pivotFilePath);
      });
    });
  });
});
