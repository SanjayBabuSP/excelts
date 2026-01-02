import { describe, it, expect } from "vitest";
import {
  decodeCol,
  encodeCol,
  decodeRow,
  encodeRow,
  decodeCell,
  encodeCell,
  decodeRange,
  encodeRange,
  jsonToSheet,
  sheetAddJson,
  sheetToJson,
  sheetToCsv,
  aoaToSheet,
  sheetAddAoa,
  sheetToAoa,
  bookNew,
  bookAppendSheet
} from "@excel/utils/sheet-utils";

describe("sheet-utils", () => {
  // ===========================================================================
  // Cell Address Encoding/Decoding
  // ===========================================================================

  describe("decodeCol", () => {
    it("should decode single letter columns", () => {
      expect(decodeCol("A")).toBe(0);
      expect(decodeCol("B")).toBe(1);
      expect(decodeCol("Z")).toBe(25);
    });

    it("should decode double letter columns", () => {
      expect(decodeCol("AA")).toBe(26);
      expect(decodeCol("AB")).toBe(27);
      expect(decodeCol("AZ")).toBe(51);
      expect(decodeCol("BA")).toBe(52);
    });

    it("should handle lowercase letters", () => {
      expect(decodeCol("a")).toBe(0);
      expect(decodeCol("aa")).toBe(26);
    });
  });

  describe("encodeCol", () => {
    it("should encode single letter columns", () => {
      expect(encodeCol(0)).toBe("A");
      expect(encodeCol(1)).toBe("B");
      expect(encodeCol(25)).toBe("Z");
    });

    it("should encode double letter columns", () => {
      expect(encodeCol(26)).toBe("AA");
      expect(encodeCol(27)).toBe("AB");
      expect(encodeCol(51)).toBe("AZ");
      expect(encodeCol(52)).toBe("BA");
    });
  });

  describe("decodeRow", () => {
    it("should decode row strings to 0-indexed numbers", () => {
      expect(decodeRow("1")).toBe(0);
      expect(decodeRow("10")).toBe(9);
      expect(decodeRow("100")).toBe(99);
    });
  });

  describe("encodeRow", () => {
    it("should encode 0-indexed numbers to row strings", () => {
      expect(encodeRow(0)).toBe("1");
      expect(encodeRow(9)).toBe("10");
      expect(encodeRow(99)).toBe("100");
    });
  });

  describe("decodeCell", () => {
    it("should decode cell references to CellAddress", () => {
      expect(decodeCell("A1")).toEqual({ c: 0, r: 0 });
      expect(decodeCell("B2")).toEqual({ c: 1, r: 1 });
      expect(decodeCell("AA10")).toEqual({ c: 26, r: 9 });
    });

    it("should handle lowercase references", () => {
      expect(decodeCell("a1")).toEqual({ c: 0, r: 0 });
      expect(decodeCell("b2")).toEqual({ c: 1, r: 1 });
    });
  });

  describe("encodeCell", () => {
    it("should encode CellAddress to cell references", () => {
      expect(encodeCell({ c: 0, r: 0 })).toBe("A1");
      expect(encodeCell({ c: 1, r: 1 })).toBe("B2");
      expect(encodeCell({ c: 26, r: 9 })).toBe("AA10");
    });
  });

  describe("decodeCell and encodeCell roundtrip", () => {
    it("should roundtrip correctly", () => {
      const addresses = ["A1", "B2", "Z100", "AA1", "XFD1048576"];
      for (const addr of addresses) {
        expect(encodeCell(decodeCell(addr))).toBe(addr);
      }
    });
  });

  describe("decodeRange", () => {
    it("should decode range strings", () => {
      expect(decodeRange("A1:B2")).toEqual({
        s: { c: 0, r: 0 },
        e: { c: 1, r: 1 }
      });
    });

    it("should decode single cell as range", () => {
      expect(decodeRange("A1")).toEqual({
        s: { c: 0, r: 0 },
        e: { c: 0, r: 0 }
      });
    });
  });

  describe("encodeRange", () => {
    it("should encode Range object", () => {
      expect(encodeRange({ s: { c: 0, r: 0 }, e: { c: 1, r: 1 } })).toBe("A1:B2");
    });

    it("should encode two CellAddress objects", () => {
      expect(encodeRange({ c: 0, r: 0 }, { c: 1, r: 1 })).toBe("A1:B2");
    });

    it("should return single cell for same start and end", () => {
      expect(encodeRange({ c: 0, r: 0 }, { c: 0, r: 0 })).toBe("A1");
    });
  });

  // ===========================================================================
  // Workbook/Worksheet Functions
  // ===========================================================================

  describe("bookNew", () => {
    it("should create empty workbook", () => {
      const wb = bookNew();
      expect(wb.worksheets).toHaveLength(0);
    });
  });

  describe("bookAppendSheet", () => {
    it("should append existing worksheet to workbook", () => {
      const wb = bookNew();
      const ws = jsonToSheet([{ name: "Alice", age: 30 }]);
      bookAppendSheet(wb, ws, "Sheet1");
      expect(wb.worksheets).toHaveLength(1);
      expect(wb.worksheets[0].name).toBe("Sheet1");
      expect(wb.worksheets[0].getCell("A1").value).toBe("name");
    });

    it("should auto-generate name if not provided", () => {
      const wb = bookNew();
      const ws = jsonToSheet([{ a: 1 }]);
      bookAppendSheet(wb, ws);
      expect(wb.worksheets[0].name).toBeTruthy();
    });
  });

  // ===========================================================================
  // JSON/Sheet Conversion
  // ===========================================================================

  describe("jsonToSheet", () => {
    it("should convert JSON array to worksheet with headers", () => {
      const data = [
        { name: "Alice", age: 30 },
        { name: "Bob", age: 25 }
      ];
      const ws = jsonToSheet(data);

      expect(ws.getCell("A1").value).toBe("name");
      expect(ws.getCell("B1").value).toBe("age");
      expect(ws.getCell("A2").value).toBe("Alice");
      expect(ws.getCell("B2").value).toBe(30);
      expect(ws.getCell("A3").value).toBe("Bob");
      expect(ws.getCell("B3").value).toBe(25);
    });

    it("should respect header option for ordering", () => {
      const data = [{ name: "Alice", age: 30, city: "NYC" }];
      const ws = jsonToSheet(data, { header: ["age", "name"] });

      // header specifies order, but all keys are included
      expect(ws.getCell("A1").value).toBe("age");
      expect(ws.getCell("B1").value).toBe("name");
      expect(ws.getCell("C1").value).toBe("city");
      expect(ws.getCell("A2").value).toBe(30);
      expect(ws.getCell("B2").value).toBe("Alice");
      expect(ws.getCell("C2").value).toBe("NYC");
    });

    it("should skip header when skipHeader is true", () => {
      const data = [{ name: "Alice", age: 30 }];
      const ws = jsonToSheet(data, { skipHeader: true });

      expect(ws.getCell("A1").value).toBe("Alice");
      expect(ws.getCell("B1").value).toBe(30);
    });
  });

  describe("sheetAddJson", () => {
    it("should add JSON data to existing worksheet", () => {
      const ws = aoaToSheet([["Header1", "Header2"]]);
      sheetAddJson(ws, [{ a: 1, b: 2 }], { origin: "A2", skipHeader: true });

      expect(ws.getCell("A1").value).toBe("Header1");
      expect(ws.getCell("A2").value).toBe(1);
      expect(ws.getCell("B2").value).toBe(2);
    });

    it("should append to bottom with origin: -1", () => {
      const ws = aoaToSheet([
        ["a", "b"],
        [1, 2]
      ]);
      sheetAddJson(ws, [{ c: 3, d: 4 }], { origin: -1 });

      expect(ws.getCell("A3").value).toBe("c");
      expect(ws.getCell("B3").value).toBe("d");
      expect(ws.getCell("A4").value).toBe(3);
      expect(ws.getCell("B4").value).toBe(4);
    });
  });

  describe("sheetToJson", () => {
    it("should convert worksheet to JSON array (default: first row as header)", () => {
      const ws = aoaToSheet([
        ["name", "age"],
        ["Alice", 30],
        ["Bob", 25]
      ]);

      const result = sheetToJson(ws);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ name: "Alice", age: 30 });
      expect(result[1]).toMatchObject({ name: "Bob", age: 25 });
    });

    it("should return array of arrays with header: 1", () => {
      const ws = aoaToSheet([
        ["name", "age"],
        ["Alice", 30],
        ["Bob", 25]
      ]);

      const result = sheetToJson(ws, { header: 1 });

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(["name", "age"]);
      expect(result[1]).toEqual(["Alice", 30]);
      expect(result[2]).toEqual(["Bob", 25]);
    });

    it("should use column letters as keys with header: 'A'", () => {
      const ws = aoaToSheet([
        ["name", "age"],
        ["Alice", 30]
      ]);

      const result = sheetToJson(ws, { header: "A" });

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ A: "name", B: "age" });
      expect(result[1]).toMatchObject({ A: "Alice", B: 30 });
    });

    it("should use custom keys with header: string[]", () => {
      const ws = aoaToSheet([
        ["Alice", 30],
        ["Bob", 25]
      ]);

      const result = sheetToJson(ws, { header: ["person", "years"] });

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ person: "Alice", years: 30 });
      expect(result[1]).toMatchObject({ person: "Bob", years: 25 });
    });

    it("should handle empty cells with defval", () => {
      const ws = aoaToSheet([
        ["col1", "col2"],
        ["value", null]
      ]);

      const result = sheetToJson(ws, { defval: "" });

      expect(result[0]).toMatchObject({ col1: "value", col2: "" });
    });

    it("should skip blank rows by default for objects", () => {
      const ws = aoaToSheet([["name"], ["Alice"], [null], ["Bob"]]);

      const result = sheetToJson(ws);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ name: "Alice" });
      expect(result[1]).toMatchObject({ name: "Bob" });
    });

    it("should include blank rows with blankrows: true for objects", () => {
      const ws = aoaToSheet([["name"], ["Alice"], [null], ["Bob"]]);

      const result = sheetToJson(ws, { blankrows: true });

      expect(result).toHaveLength(3);
    });

    it("should include blank rows by default with header: 1", () => {
      const ws = aoaToSheet([["name"], ["Alice"], [null], ["Bob"]]);

      const result = sheetToJson(ws, { header: 1 });

      expect(result).toHaveLength(4);
    });

    it("should disambiguate duplicate headers", () => {
      const ws = aoaToSheet([
        ["name", "name", "name"],
        ["Alice", "Bob", "Charlie"]
      ]);

      const result = sheetToJson(ws);

      expect(result[0]).toHaveProperty("name", "Alice");
      expect(result[0]).toHaveProperty("name_1", "Bob");
      expect(result[0]).toHaveProperty("name_2", "Charlie");
    });

    it("should return formatted text with raw: false", () => {
      const ws = aoaToSheet([
        ["name", "age", "birthday"],
        ["Alice", 30, new Date(1994, 5, 15)],
        ["Bob", 25, new Date(1999, 11, 25)]
      ]);

      const result = sheetToJson(ws, { raw: false });

      expect(result).toHaveLength(2);
      // With raw: false, all values should be strings (cell.text trimmed)
      expect(result[0]).toMatchObject({ name: "Alice", age: "30" });
      expect(result[1]).toMatchObject({ name: "Bob", age: "25" });
      // Dates should also be converted to string representation
      expect(typeof result[0].birthday).toBe("string");
      expect(typeof result[1].birthday).toBe("string");
    });

    it("should return raw values by default (raw: true/undefined)", () => {
      const date1 = new Date(1994, 5, 15);
      const date2 = new Date(1999, 11, 25);
      const ws = aoaToSheet([
        ["name", "age", "birthday"],
        ["Alice", 30, date1],
        ["Bob", 25, date2]
      ]);

      const result = sheetToJson(ws);

      expect(result).toHaveLength(2);
      // By default (raw: true), values should keep their original types
      expect(result[0]).toMatchObject({ name: "Alice", age: 30 });
      expect(result[1]).toMatchObject({ name: "Bob", age: 25 });
      // Dates should remain as Date objects
      expect(result[0].birthday).toEqual(date1);
      expect(result[1].birthday).toEqual(date2);
    });

    it("should format time values correctly with raw: false (timezone-independent)", () => {
      // Simulate what excelToDate produces for a time value
      // Excel serial 0.00037037... = 00:00:32 (32 seconds after midnight)
      // excelToDate does: new Date(Math.round((serial - 25569) * 86400000))
      const timeSerial = 32 / 86400; // 32 seconds = 0.00037037...
      const timeAsDate = new Date(Math.round((timeSerial - 25569) * 86400000));

      const wb = bookNew();
      const ws = wb.addWorksheet("Sheet1");

      // Set up header
      ws.getCell("A1").value = "time";

      // Set up time cell with Date value and time format
      const timeCell = ws.getCell("A2");
      timeCell.value = timeAsDate;
      timeCell.numFmt = "h:mm:ss"; // 24-hour time format

      const result = sheetToJson(ws, { raw: false });

      expect(result).toHaveLength(1);
      // Time 00:00:32 should format as "0:00:32"
      expect(result[0].time).toBe("0:00:32");
    });

    it("should format formula result with number result correctly", () => {
      // Formula with numeric result
      const wb = bookNew();
      const ws = wb.addWorksheet("Sheet1");

      ws.getCell("A1").value = "total";
      const formulaCell = ws.getCell("A2");
      formulaCell.value = {
        formula: "SUM(B1:B10)",
        result: 1234.567
      };
      formulaCell.numFmt = "#,##0.00";

      const result = sheetToJson(ws, { raw: false });

      expect(result[0].total).toBe("1,234.57");
    });

    it("should format formula result with elapsed time format", () => {
      // Elapsed time format [h]:mm:ss for durations > 24 hours
      // 1.5 days = 36 hours
      const durationSerial = 1.5;
      const durationAsDate = new Date(Math.round((durationSerial - 25569) * 86400000));

      const wb = bookNew();
      const ws = wb.addWorksheet("Sheet1");

      ws.getCell("A1").value = "elapsed";
      const formulaCell = ws.getCell("A2");
      formulaCell.value = {
        formula: "B1-C1",
        result: durationAsDate
      };
      formulaCell.numFmt = "[h]:mm:ss";

      const result = sheetToJson(ws, { raw: false });

      expect(result[0].elapsed).toBe("36:00:00");
    });
  });

  // ===========================================================================
  // AOA (Array of Arrays) Functions
  // ===========================================================================

  describe("aoaToSheet", () => {
    it("should convert array of arrays to worksheet", () => {
      const data = [
        ["Name", "Age"],
        ["Alice", 30],
        ["Bob", 25]
      ];
      const ws = aoaToSheet(data);

      expect(ws.getCell("A1").value).toBe("Name");
      expect(ws.getCell("B1").value).toBe("Age");
      expect(ws.getCell("A2").value).toBe("Alice");
      expect(ws.getCell("B2").value).toBe(30);
    });

    it("should handle origin option", () => {
      const data = [["a", "b"]];
      const ws = aoaToSheet(data, { origin: "C3" });

      expect(ws.getCell("C3").value).toBe("a");
      expect(ws.getCell("D3").value).toBe("b");
    });

    it("should handle different data types", () => {
      const date = new Date("2024-01-01");
      const data = [["string", 123, true, date, null]];
      const ws = aoaToSheet(data);

      expect(ws.getCell("A1").value).toBe("string");
      expect(ws.getCell("B1").value).toBe(123);
      expect(ws.getCell("C1").value).toBe(true);
      expect(ws.getCell("D1").value).toEqual(date);
    });
  });

  describe("sheetAddAoa", () => {
    it("should add array of arrays to existing worksheet", () => {
      const ws = aoaToSheet([["Header"]]);
      sheetAddAoa(ws, [["Data"]], { origin: "A2" });

      expect(ws.getCell("A1").value).toBe("Header");
      expect(ws.getCell("A2").value).toBe("Data");
    });

    it("should append with origin: -1", () => {
      const ws = aoaToSheet([["Row1"], ["Row2"]]);
      sheetAddAoa(ws, [["Row3"]], { origin: -1 });

      expect(ws.getCell("A3").value).toBe("Row3");
    });
  });

  describe("sheetToAoa", () => {
    it("should convert worksheet to array of arrays", () => {
      const ws = aoaToSheet([
        ["Name", "Age"],
        ["Alice", 30]
      ]);

      const result = sheetToAoa(ws);

      expect(result[0]).toEqual(["Name", "Age"]);
      expect(result[1]).toEqual(["Alice", 30]);
    });
  });

  // ===========================================================================
  // CSV Functions
  // ===========================================================================

  describe("sheetToCsv", () => {
    it("should convert worksheet to CSV string", () => {
      const ws = aoaToSheet([
        ["name", "age"],
        ["Alice", 30]
      ]);

      const csv = sheetToCsv(ws);

      expect(csv).toBe("name,age\nAlice,30");
    });

    it("should use custom field separator", () => {
      const ws = aoaToSheet([["a", "b"]]);

      const csv = sheetToCsv(ws, { FS: ";" });

      expect(csv).toBe("a;b");
    });

    it("should use custom record separator", () => {
      const ws = aoaToSheet([["a"], ["b"]]);

      const csv = sheetToCsv(ws, { RS: "\r\n" });

      expect(csv).toBe("a\r\nb");
    });

    it("should quote values containing separator", () => {
      const ws = aoaToSheet([["hello,world"]]);

      const csv = sheetToCsv(ws);

      expect(csv).toBe('"hello,world"');
    });

    it("should escape quotes", () => {
      const ws = aoaToSheet([['say "hello"']]);

      const csv = sheetToCsv(ws);

      expect(csv).toBe('"say ""hello"""');
    });
  });
});
