import { describe, it, expect } from "vitest";
import { colCache } from "@excel/utils/col-cache";
import { Workbook } from "../../../index";
import { extractAll } from "@archive/unzip/extract";

const spliceArray = (a: any[], index: number, count: number, ...rest: any[]) => {
  const clone = [...a];
  clone.splice(index, count, ...rest);
  return clone;
};

const values = [
  ["Date", "Id", "Word"],
  [new Date("2019-08-01"), 1, "Bird"],
  [new Date("2019-08-02"), 2, "is"],
  [new Date("2019-08-03"), 3, "the"],
  [new Date("2019-08-04"), 4, "Word"],
  ["Totals", { formula: "SUBTOTAL(104,TestTable[Id])", result: 4 }, null]
];

function addTable(ref: string, ws: any) {
  return ws.addTable({
    name: "TestTable",
    ref,
    headerRow: true,
    totalsRow: true,
    style: {
      theme: "TableStyleDark3",
      showRowStripes: true
    },
    columns: [
      { name: "Date", totalsRowLabel: "Totals", filterButton: true },
      {
        name: "Id",
        totalsRowFunction: "max",
        filterButton: true,
        totalsRowResult: 4
      },
      {
        name: "Word",
        filterButton: false,
        style: { font: { bold: true, name: "Comic Sans MS" } }
      }
    ],
    rows: [
      [new Date("2019-08-01"), 1, "Bird"],
      [new Date("2019-08-02"), 2, "is"],
      [new Date("2019-08-03"), 3, "the"],
      [new Date("2019-08-04"), 4, "Word"]
    ]
  });
}

function checkTable(ref: string, ws: any, testValues: any[]) {
  const a = colCache.decodeAddress(ref);

  for (let i = -1; i <= testValues.length + 1; i++) {
    const vRow = testValues[i];
    const nRow = i + a.row;
    const row = nRow >= 1 && ws.getRow(nRow);
    if (!row) {
      continue;
    }
    for (let j = -1; j <= testValues[0].length + 1; j++) {
      const value = (vRow && vRow[j]) || null;
      const nCol = j + a.col;
      const cellValue = nCol >= 1 && row.getCell(nCol).value;
      if (!cellValue) {
        continue;
      }

      if (value instanceof Date) {
        expect(cellValue).toEqual(value);
      } else if (value === null) {
        expect(cellValue).toBeNull();
      } else if (typeof value === "object") {
        expect(cellValue).toEqual(value);
      } else {
        expect(cellValue).toBe(value);
      }
    }
  }
}

describe("Worksheet", () => {
  describe("Table", () => {
    it("creates a table", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("blort");
      addTable("A1", ws);

      checkTable("A1", ws, values);
    });

    it("removes header", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("blort");
      const table = addTable("A1", ws);

      table.headerRow = false;
      table.commit();

      const newValues = spliceArray(values, 0, 1);
      checkTable("A1", ws, newValues);
    });

    it("removes totals", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("blort");
      const table = addTable("A1", ws);

      table.totalsRow = false;
      table.commit();

      const newValues = spliceArray(values, 5, 1);
      checkTable("A1", ws, newValues);
    });

    it("moves the table", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("blort");
      const table = addTable("A1", ws);

      table.ref = "C2";
      table.commit();

      checkTable("C2", ws, values);
    });

    it("removes a row", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("blort");
      const table = addTable("A1", ws);

      table.removeRows(1);
      table.commit();

      const newValues = spliceArray(values, 2, 1);
      checkTable("A1", ws, newValues);
    });

    it("adds a row", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("blort");
      const table = addTable("A1", ws);

      table.addRow([new Date("2019-08-05"), 5, "Bird"]);
      table.commit();

      const newValues = spliceArray(values, 5, 0, [new Date("2019-08-05"), 5, "Bird"]);
      checkTable("A1", ws, newValues);
    });

    it("removes a column", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("blort");
      const table = addTable("A1", ws);

      table.removeColumns(1);
      table.commit();

      const newValues = values.map(rVals => spliceArray(rVals, 1, 1));
      checkTable("A1", ws, newValues);
    });

    it("adds a column", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("blort");
      const table = addTable("A1", ws);

      table.addColumn(
        {
          name: "Letter",
          totalsRowFunction: "custom",
          totalsRowFormula: "ROW()",
          totalsRowResult: 6,
          filterButton: true
        },
        ["a", "b", "c", "d"],
        2
      );
      table.commit();

      const colValues = ["Letter", "a", "b", "c", "d", { formula: "ROW()", result: 6 }];
      const newValues = values.map((rVals, i) => spliceArray(rVals, 2, 0, colValues[i]));
      checkTable("A1", ws, newValues);
    });

    it("renames a column", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("blort");
      const table = addTable("A1", ws);

      const column = table.getColumn(1);
      column.name = "Code";
      table.commit();

      const newValues = [...values];
      newValues.splice(0, 1, ["Date", "Code", "Word"]);
      newValues.splice(5, 1, [
        "Totals",
        { formula: "SUBTOTAL(104,TestTable[Code])", result: 4 },
        null
      ]);

      checkTable("A1", ws, newValues);
    });

    it("keeps implicit structured references by default", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("blort");

      ws.addTable({
        name: "TestTable",
        ref: "A1",
        headerRow: true,
        columns: [{ name: "A" }, { name: "B" }],
        rows: [["a1", { formula: "[@A]" }]]
      });

      const cellValue = ws.getRow(2).getCell(2).value;
      expect(cellValue).toEqual({ formula: "[@A]" });
    });

    it("qualifies implicit structured references when enabled", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("blort");

      ws.addTable({
        name: "TestTable",
        ref: "A1",
        headerRow: true,
        qualifyImplicitStructuredReferences: true,
        columns: [{ name: "A" }, { name: "B" }],
        rows: [["a1", { formula: "[@A]" }]]
      });

      const cellValue = ws.getRow(2).getCell(2).value;
      expect(cellValue).toEqual({ formula: "TestTable[[#This Row],[A]]" });
    });

    it("writes CONCAT([@A]) without leading @", async () => {
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet();

      worksheet.addTable({
        name: "table",
        ref: "A1",
        headerRow: true,
        columns: [{ name: "A" }, { name: "B" }],
        rows: [["a1", { formula: "CONCAT([@A])" }]]
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const zipData = await extractAll(new Uint8Array(buffer));

      const sheet1 = zipData.get("xl/worksheets/sheet1.xml");
      expect(sheet1).toBeDefined();

      const xml = new TextDecoder().decode(sheet1!.data);
      const match = xml.match(/<c[^>]*\br="B2"[^>]*>[\s\S]*?<f[^>]*>([^<]*)<\/f>/);
      expect(match).toBeTruthy();

      const formula = match![1];
      expect(formula).toBe("CONCAT([@A])");
      expect(formula.startsWith("@")).toBe(false);
    });

    it("loads a table with calculatedColumnFormula without crashing (issue #76)", async () => {
      // Create a workbook with a 3-column table
      const wb1 = new Workbook();
      const ws1: any = wb1.addWorksheet("Data");

      ws1.addTable({
        name: "CalcTable",
        ref: "A1",
        headerRow: true,
        totalsRow: false,
        columns: [
          { name: "Value", filterButton: true },
          { name: "Double", filterButton: true },
          { name: "Label", filterButton: true }
        ],
        rows: [
          [10, 20, "a"],
          [30, 60, "b"]
        ]
      });

      const buffer = await wb1.xlsx.writeBuffer();

      // Manually inject a <calculatedColumnFormula> child element into the table XML
      // to simulate what Excel produces for calculated columns.
      const zipData = await extractAll(new Uint8Array(buffer));
      const tablePath = [...zipData.keys()].find(k => k.startsWith("xl/tables/"));
      expect(tablePath).toBeDefined();

      const tableXml = new TextDecoder().decode(zipData.get(tablePath!)!.data);
      // Replace the self-closing <tableColumn> for "Double" with one that has a child element
      const modifiedXml = tableXml.replace(
        /(<tableColumn id="2" name="Double"[^/]*)\/>/,
        "$1><calculatedColumnFormula>[Value]*2</calculatedColumnFormula></tableColumn>"
      );
      expect(modifiedXml).toContain("<calculatedColumnFormula>");

      zipData.get(tablePath!)!.data = new TextEncoder().encode(modifiedXml);

      // Re-pack into a ZIP buffer
      const { createZip } = await import("@archive/zip/zip-bytes");
      const entries = [...zipData.entries()].map(([name, file]) => ({
        name,
        data: file.data
      }));
      const modifiedBuffer = await createZip(entries);

      // This should NOT throw: "Cannot read properties of undefined (reading 'style')"
      const wb2 = new Workbook();
      await wb2.xlsx.load(modifiedBuffer);

      const ws2: any = wb2.getWorksheet("Data");
      expect(ws2).toBeDefined();

      const table2 = ws2.getTable("CalcTable");
      expect(table2).toBeDefined();
      expect(table2.table.columns).toHaveLength(3);
      expect(table2.table.columns[0].name).toBe("Value");
      expect(table2.table.columns[1].name).toBe("Double");
      expect(table2.table.columns[1].calculatedColumnFormula).toBe("[Value]*2");
      expect(table2.table.columns[2].name).toBe("Label");

      // Round-trip: write and reload — calculatedColumnFormula should survive
      const buffer2 = await wb2.xlsx.writeBuffer();
      const wb3 = new Workbook();
      await wb3.xlsx.load(buffer2);
      const ws3: any = wb3.getWorksheet("Data");
      const table3 = ws3.getTable("CalcTable");
      expect(table3.table.columns[1].calculatedColumnFormula).toBe("[Value]*2");
    });
  });
});
