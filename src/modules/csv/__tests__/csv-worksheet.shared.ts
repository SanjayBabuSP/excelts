/**
 * CSV Worksheet Integration Shared Tests
 *
 * Unit tests that run identically in both Node.js and Browser environments.
 * These tests verify CSV-to-Worksheet and Worksheet-to-CSV functionality.
 *
 * Import this test suite from your platform-specific test file and call
 * runCsvWorksheetTests() with your platform's imports.
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { Workbook } from "@excel/workbook";
import type { Worksheet } from "@excel/worksheet";
import type { CsvOptions } from "@csv/csv.browser";

/**
 * CSV worksheet module interface - must be provided by platform-specific test
 */
export interface CsvWorksheetModuleImports {
  // Workbook constructor
  Workbook: new () => Workbook;

  // Functions
  parseCsvToWorksheet: (content: string, workbook: Workbook, options?: CsvOptions) => Worksheet;
  formatWorksheetToCsv: (worksheet: Worksheet | undefined, options?: CsvOptions) => string;
  createDefaultValueMapper: (
    dateFormats: readonly string[],
    options?: { decimalSeparator?: "," | "." }
  ) => (value: any) => any;
  createDefaultWriteMapper: (dateFormat?: string, dateUTC?: boolean) => (value: any) => any;
}

export interface CsvWorksheetModuleImportsGeneric<TWorkbook> {
  Workbook: new () => TWorkbook;

  parseCsvToWorksheet: (content: string, workbook: TWorkbook, options?: CsvOptions) => Worksheet;
  formatWorksheetToCsv: (worksheet: Worksheet | undefined, options?: CsvOptions) => string;
  createDefaultValueMapper: (
    dateFormats: readonly string[],
    options?: { decimalSeparator?: "," | "." }
  ) => (value: any) => any;
  createDefaultWriteMapper: (dateFormat?: string, dateUTC?: boolean) => (value: any) => any;
}

/**
 * Run all shared CSV worksheet tests with the provided module imports
 */
interface WorkbookLike {
  addWorksheet(name?: string): Worksheet;
}

export function runCsvWorksheetTests<TWorkbook extends WorkbookLike>(
  imports: CsvWorksheetModuleImportsGeneric<TWorkbook>
): void {
  const {
    Workbook,
    parseCsvToWorksheet,
    formatWorksheetToCsv,
    createDefaultValueMapper,
    createDefaultWriteMapper
  } = imports;

  let workbook: TWorkbook;

  beforeEach(() => {
    workbook = new Workbook();
  });

  // ===========================================================================
  // Section 1: parseCsvToWorksheet
  // ===========================================================================
  describe("parseCsvToWorksheet", () => {
    it("should create worksheet with CSV data", () => {
      const csv = "a,b,c\n1,2,3";
      const worksheet = parseCsvToWorksheet(csv, workbook);

      expect(worksheet.getCell("A1").value).toBe("a");
      expect(worksheet.getCell("B1").value).toBe("b");
      expect(worksheet.getCell("C1").value).toBe("c");
      expect(worksheet.getCell("A2").value).toBe(1);
      expect(worksheet.getCell("B2").value).toBe(2);
      expect(worksheet.getCell("C2").value).toBe(3);
    });

    it("should use custom sheet name", () => {
      const csv = "a,b,c";
      const worksheet = parseCsvToWorksheet(csv, workbook, { sheetName: "MySheet" });

      expect(worksheet.name).toBe("MySheet");
    });

    it("should parse numbers correctly", () => {
      const csv = "1,2.5,-3.14,0,1000000";
      const worksheet = parseCsvToWorksheet(csv, workbook);

      expect(worksheet.getCell("A1").value).toBe(1);
      expect(worksheet.getCell("B1").value).toBe(2.5);
      expect(worksheet.getCell("C1").value).toBe(-3.14);
      expect(worksheet.getCell("D1").value).toBe(0);
      expect(worksheet.getCell("E1").value).toBe(1000000);
    });

    it("should support comma decimalSeparator via valueMapperOptions", () => {
      const csv = "3,14;-0,5\n12,34;0";
      const worksheet = parseCsvToWorksheet(csv, workbook, {
        parserOptions: { delimiter: ";" },
        valueMapperOptions: { decimalSeparator: "," }
      });

      expect(worksheet.getCell("A1").value).toBe(3.14);
      expect(worksheet.getCell("B1").value).toBe(-0.5);
      expect(worksheet.getCell("A2").value).toBe(12.34);
      expect(worksheet.getCell("B2").value).toBe(0);
    });

    it("should convert empty strings to null", () => {
      const csv = "a,,c";
      const worksheet = parseCsvToWorksheet(csv, workbook);

      expect(worksheet.getCell("A1").value).toBe("a");
      expect(worksheet.getCell("B1").value).toBe(null);
      expect(worksheet.getCell("C1").value).toBe("c");
    });

    it("should parse boolean values", () => {
      const csv = "true,false,TRUE,FALSE";
      const worksheet = parseCsvToWorksheet(csv, workbook);

      expect(worksheet.getCell("A1").value).toBe(true);
      expect(worksheet.getCell("B1").value).toBe(false);
      // Note: only lowercase true/false are converted
      expect(worksheet.getCell("C1").value).toBe("TRUE");
      expect(worksheet.getCell("D1").value).toBe("FALSE");
    });

    it("should parse Excel error values", () => {
      const csv = "#N/A,#REF!,#NAME?,#DIV/0!,#NULL!,#VALUE!,#NUM!";
      const worksheet = parseCsvToWorksheet(csv, workbook);

      expect(worksheet.getCell("A1").value).toEqual({ error: "#N/A" });
      expect(worksheet.getCell("B1").value).toEqual({ error: "#REF!" });
      expect(worksheet.getCell("C1").value).toEqual({ error: "#NAME?" });
      expect(worksheet.getCell("D1").value).toEqual({ error: "#DIV/0!" });
      expect(worksheet.getCell("E1").value).toEqual({ error: "#NULL!" });
      expect(worksheet.getCell("F1").value).toEqual({ error: "#VALUE!" });
      expect(worksheet.getCell("G1").value).toEqual({ error: "#NUM!" });
    });

    it("should preserve strings that look like numbers but aren't", () => {
      const csv = "01234,00100,text123";
      const worksheet = parseCsvToWorksheet(csv, workbook);

      // These are parsed as numbers because they are valid numbers
      expect(worksheet.getCell("A1").value).toBe(1234);
      expect(worksheet.getCell("B1").value).toBe(100);
      // This stays as string
      expect(worksheet.getCell("C1").value).toBe("text123");
    });

    it("should handle custom parser options", () => {
      const csv = "a;b;c\n1;2;3";
      const worksheet = parseCsvToWorksheet(csv, workbook, {
        parserOptions: { delimiter: ";" }
      });

      expect(worksheet.getCell("A1").value).toBe("a");
      expect(worksheet.getCell("B1").value).toBe("b");
      expect(worksheet.getCell("C1").value).toBe("c");
    });

    it("should use custom value mapper", () => {
      const csv = "hello,world";
      const worksheet = parseCsvToWorksheet(csv, workbook, {
        map: value => value.toUpperCase()
      });

      expect(worksheet.getCell("A1").value).toBe("HELLO");
      expect(worksheet.getCell("B1").value).toBe("WORLD");
    });
  });

  // ===========================================================================
  // Section 2: Date Parsing
  // ===========================================================================
  describe("parseCsvToWorksheet - Date Parsing", () => {
    it("should parse ISO date format", () => {
      const csv = "2024-12-24";
      const worksheet = parseCsvToWorksheet(csv, workbook, {
        dateFormats: ["YYYY-MM-DD"]
      });

      const value = worksheet.getCell("A1").value as Date;
      expect(value).toBeInstanceOf(Date);
      expect(value.getFullYear()).toBe(2024);
      expect(value.getMonth()).toBe(11); // December (0-indexed)
      expect(value.getDate()).toBe(24);
    });

    it("should parse ISO datetime format", () => {
      const csv = "2024-12-24T10:30:00";
      const worksheet = parseCsvToWorksheet(csv, workbook, {
        dateFormats: ["YYYY-MM-DD[T]HH:mm:ss"]
      });

      const value = worksheet.getCell("A1").value as Date;
      expect(value).toBeInstanceOf(Date);
      expect(value.getHours()).toBe(10);
      expect(value.getMinutes()).toBe(30);
    });

    it("should parse custom date format", () => {
      const csv = "24/12/2024";
      const worksheet = parseCsvToWorksheet(csv, workbook, {
        dateFormats: ["DD-MM-YYYY"]
      });

      const value = worksheet.getCell("A1").value as Date;
      expect(value).toBeInstanceOf(Date);
      expect(value.getFullYear()).toBe(2024);
      expect(value.getMonth()).toBe(11);
      expect(value.getDate()).toBe(24);
    });

    it("should try multiple date formats", () => {
      const csv = "2024-12-24,12/24/2024";
      const worksheet = parseCsvToWorksheet(csv, workbook, {
        dateFormats: ["YYYY-MM-DD", "MM-DD-YYYY"]
      });

      const value1 = worksheet.getCell("A1").value as Date;
      const value2 = worksheet.getCell("B1").value as Date;

      expect(value1).toBeInstanceOf(Date);
      expect(value2).toBeInstanceOf(Date);
      expect(value1.getFullYear()).toBe(2024);
      expect(value2.getFullYear()).toBe(2024);
    });

    it("should not parse invalid dates", () => {
      const csv = "not-a-date,2024-99-99";
      const worksheet = parseCsvToWorksheet(csv, workbook, {
        dateFormats: ["YYYY-MM-DD"]
      });

      // Invalid dates stay as strings
      expect(worksheet.getCell("A1").value).toBe("not-a-date");
      expect(worksheet.getCell("B1").value).toBe("2024-99-99");
    });
  });

  // ===========================================================================
  // Section 3: formatWorksheetToCsv
  // ===========================================================================
  describe("formatWorksheetToCsv", () => {
    it("should format worksheet to CSV", () => {
      const worksheet = workbook.addWorksheet("Test");
      worksheet.getCell("A1").value = "a";
      worksheet.getCell("B1").value = "b";
      worksheet.getCell("A2").value = 1;
      worksheet.getCell("B2").value = 2;

      const csv = formatWorksheetToCsv(worksheet);

      expect(csv).toBe("a,b\n1,2");
    });

    it("should handle empty worksheet", () => {
      const worksheet = workbook.addWorksheet("Empty");

      const csv = formatWorksheetToCsv(worksheet);

      expect(csv).toBe("");
    });

    it("should handle undefined worksheet", () => {
      const csv = formatWorksheetToCsv(undefined);

      expect(csv).toBe("");
    });

    it("should format dates with custom format", () => {
      const worksheet = workbook.addWorksheet("Dates");
      worksheet.getCell("A1").value = new Date(2024, 11, 24, 10, 30, 0);

      const csv = formatWorksheetToCsv(worksheet, {
        dateFormat: "YYYY-MM-DD HH:mm:ss"
      });

      expect(csv).toBe("2024-12-24 10:30:00");
    });

    it("should format dates in UTC when dateUTC is true", () => {
      const worksheet = workbook.addWorksheet("UTC");
      const date = new Date(Date.UTC(2024, 11, 24, 10, 30, 0));
      worksheet.getCell("A1").value = date;

      const csv = formatWorksheetToCsv(worksheet, {
        dateFormat: "YYYY-MM-DD HH:mm:ss",
        dateUTC: true
      });

      expect(csv).toBe("2024-12-24 10:30:00");
    });

    it("should handle hyperlinks", () => {
      const worksheet = workbook.addWorksheet("Links");
      worksheet.getCell("A1").value = {
        text: "Click here",
        hyperlink: "https://example.com"
      };

      const csv = formatWorksheetToCsv(worksheet);

      expect(csv).toBe("https://example.com");
    });

    it("should handle formulas (output result)", () => {
      const worksheet = workbook.addWorksheet("Formulas");
      worksheet.getCell("A1").value = { formula: "SUM(B1:B10)", result: 100 };

      const csv = formatWorksheetToCsv(worksheet);

      expect(csv).toBe("100");
    });

    it("should handle error values", () => {
      const worksheet = workbook.addWorksheet("Errors");
      worksheet.getCell("A1").value = { error: "#DIV/0!" };
      worksheet.getCell("B1").value = { error: "#N/A" };

      const csv = formatWorksheetToCsv(worksheet);

      expect(csv).toBe("#DIV/0!,#N/A");
    });

    it("should include empty rows when includeEmptyRows is true", () => {
      const worksheet = workbook.addWorksheet("Sparse");
      worksheet.getCell("A1").value = "row1";
      worksheet.getCell("A3").value = "row3";

      const csv = formatWorksheetToCsv(worksheet, { includeEmptyRows: true });

      expect(csv).toBe("row1\n\nrow3");
    });

    it("should skip empty rows when includeEmptyRows is false", () => {
      const worksheet = workbook.addWorksheet("Sparse");
      worksheet.getCell("A1").value = "row1";
      worksheet.getCell("A3").value = "row3";

      const csv = formatWorksheetToCsv(worksheet, { includeEmptyRows: false });

      expect(csv).toBe("row1\nrow3");
    });

    it("should use custom formatter options", () => {
      const worksheet = workbook.addWorksheet("Custom");
      worksheet.getCell("A1").value = "a";
      worksheet.getCell("B1").value = "b";

      const csv = formatWorksheetToCsv(worksheet, {
        formatterOptions: { delimiter: "\t" }
      });

      expect(csv).toBe("a\tb");
    });

    it("should use custom value mapper", () => {
      const worksheet = workbook.addWorksheet("Custom");
      worksheet.getCell("A1").value = "hello";
      worksheet.getCell("B1").value = "world";

      const csv = formatWorksheetToCsv(worksheet, {
        map: value => (typeof value === "string" ? value.toUpperCase() : value)
      });

      expect(csv).toBe("HELLO,WORLD");
    });
  });

  // ===========================================================================
  // Section 4: Value Mappers
  // ===========================================================================
  describe("createDefaultValueMapper", () => {
    it("should convert empty string to null", () => {
      const mapper = createDefaultValueMapper([]);
      expect(mapper("")).toBe(null);
    });

    it("should convert valid numbers", () => {
      const mapper = createDefaultValueMapper([]);
      expect(mapper("123")).toBe(123);
      expect(mapper("3.14")).toBe(3.14);
      expect(mapper("-42")).toBe(-42);
      expect(mapper("0")).toBe(0);
    });

    it("should support comma decimalSeparator for numbers", () => {
      const mapper = createDefaultValueMapper([], { decimalSeparator: "," });
      expect(mapper("3,14")).toBe(3.14);
      expect(mapper("-0,5")).toBe(-0.5);
      // whitespace should be tolerated
      expect(mapper("  12,34  ")).toBe(12.34);
    });

    it("should preserve non-numeric strings", () => {
      const mapper = createDefaultValueMapper([]);
      expect(mapper("hello")).toBe("hello");
      expect(mapper("abc123")).toBe("abc123");
    });

    it("should handle Infinity as string", () => {
      const mapper = createDefaultValueMapper([]);
      expect(mapper("Infinity")).toBe("Infinity");
    });

    it("should convert special Excel values", () => {
      const mapper = createDefaultValueMapper([]);
      expect(mapper("true")).toBe(true);
      expect(mapper("false")).toBe(false);
      expect(mapper("#N/A")).toEqual({ error: "#N/A" });
    });
  });

  describe("createDefaultWriteMapper", () => {
    it("should handle hyperlinks", () => {
      const mapper = createDefaultWriteMapper();
      expect(mapper({ hyperlink: "https://example.com", text: "Link" })).toBe(
        "https://example.com"
      );
      expect(mapper({ text: "Text Only" })).toBe("Text Only");
    });

    it("should handle formulas", () => {
      const mapper = createDefaultWriteMapper();
      expect(mapper({ formula: "SUM(A1:A10)", result: 100 })).toBe(100);
      expect(mapper({ result: 50 })).toBe(50);
    });

    it("should format dates", () => {
      const mapper = createDefaultWriteMapper("YYYY-MM-DD");
      const date = new Date(2024, 11, 24);
      const result = mapper(date);
      expect(result).toBe("2024-12-24");
    });

    it("should format dates in UTC", () => {
      const mapper = createDefaultWriteMapper("YYYY-MM-DD", true);
      const date = new Date(Date.UTC(2024, 11, 24));
      const result = mapper(date);
      expect(result).toBe("2024-12-24");
    });

    it("should handle error values", () => {
      const mapper = createDefaultWriteMapper();
      expect(mapper({ error: "#DIV/0!" })).toBe("#DIV/0!");
    });

    it("should convert objects to JSON", () => {
      const mapper = createDefaultWriteMapper();
      expect(mapper({ foo: "bar" })).toBe('{"foo":"bar"}');
    });

    it("should pass through primitives", () => {
      const mapper = createDefaultWriteMapper();
      expect(mapper("hello")).toBe("hello");
      expect(mapper(123)).toBe(123);
      expect(mapper(true)).toBe(true);
      expect(mapper(null)).toBe(null);
      expect(mapper(undefined)).toBe(undefined);
    });
  });

  // ===========================================================================
  // Section 5: Round-trip Tests
  // ===========================================================================
  describe("Round-trip Tests", () => {
    it("should round-trip simple data", () => {
      // Write
      const ws1 = workbook.addWorksheet("Test");
      ws1.getCell("A1").value = "Name";
      ws1.getCell("B1").value = "Age";
      ws1.getCell("A2").value = "Alice";
      ws1.getCell("B2").value = 30;

      const csv = formatWorksheetToCsv(ws1);

      // Read back
      const wb2 = new Workbook();
      const ws2 = parseCsvToWorksheet(csv, wb2);

      expect(ws2.getCell("A1").value).toBe("Name");
      expect(ws2.getCell("B1").value).toBe("Age");
      expect(ws2.getCell("A2").value).toBe("Alice");
      expect(ws2.getCell("B2").value).toBe(30);
    });

    it("should round-trip data with special characters", () => {
      const ws1 = workbook.addWorksheet("Special");
      ws1.getCell("A1").value = "Hello, World";
      ws1.getCell("B1").value = 'Say "Hi"';
      ws1.getCell("A2").value = "Line1\nLine2";

      const csv = formatWorksheetToCsv(ws1);
      const wb2 = new Workbook();
      const ws2 = parseCsvToWorksheet(csv, wb2);

      expect(ws2.getCell("A1").value).toBe("Hello, World");
      expect(ws2.getCell("B1").value).toBe('Say "Hi"');
      expect(ws2.getCell("A2").value).toBe("Line1\nLine2");
    });

    it("should round-trip Unicode data", () => {
      const ws1 = workbook.addWorksheet("Unicode");
      ws1.getCell("A1").value = "日本語";
      ws1.getCell("B1").value = "中文";
      ws1.getCell("C1").value = "한국어";
      ws1.getCell("D1").value = "😀🎉";

      const csv = formatWorksheetToCsv(ws1);
      const wb2 = new Workbook();
      const ws2 = parseCsvToWorksheet(csv, wb2);

      expect(ws2.getCell("A1").value).toBe("日本語");
      expect(ws2.getCell("B1").value).toBe("中文");
      expect(ws2.getCell("C1").value).toBe("한국어");
      expect(ws2.getCell("D1").value).toBe("😀🎉");
    });

    it("should round-trip dates with explicit format", () => {
      const ws1 = workbook.addWorksheet("Dates");
      const date = new Date(2024, 11, 24);
      ws1.getCell("A1").value = date;

      const csv = formatWorksheetToCsv(ws1, { dateFormat: "YYYY-MM-DD" });
      const wb2 = new Workbook();
      const ws2 = parseCsvToWorksheet(csv, wb2, { dateFormats: ["YYYY-MM-DD"] });

      const result = ws2.getCell("A1").value as Date;
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(11);
      expect(result.getDate()).toBe(24);
    });
  });
}
