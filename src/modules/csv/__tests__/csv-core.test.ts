/**
 * CSV Core Unit Tests - RFC 4180 Compliance
 *
 * Tests the native CSV parser and formatter for compliance with RFC 4180:
 * @see https://tools.ietf.org/html/rfc4180
 *
 * RFC 4180 Key Points:
 * 1. Each record is on a separate line, delimited by CRLF
 * 2. Optional header line with same format as records
 * 3. Fields are separated by commas
 * 4. Fields containing commas, double-quotes, or line breaks must be enclosed in double-quotes
 * 5. Double-quotes in fields are escaped by doubling them
 * 6. Spaces are part of the field and should not be trimmed
 */

import { describe, it, expect } from "vitest";
import {
  parseCsv,
  formatCsv,
  parseCsvStream,
  isRowHashArray,
  rowHashArrayToMap,
  rowHashArrayToValues,
  rowHashArrayToHeaders,
  rowHashArrayMapByHeaders,
  rowHashArrayGet
} from "@csv/csv-core";

// ===========================================================================
// Helper Functions Tests
// ===========================================================================
describe("RowHashArray Helper Functions", () => {
  describe("isRowHashArray", () => {
    it("should return true for valid RowHashArray", () => {
      expect(
        isRowHashArray([
          ["name", "Alice"],
          ["age", 30]
        ])
      ).toBe(true);
    });

    it("should return false for plain array", () => {
      expect(isRowHashArray(["Alice", "30"])).toBe(false);
    });

    it("should return false for empty array", () => {
      expect(isRowHashArray([])).toBe(false);
    });

    it("should return false for object", () => {
      expect(isRowHashArray({ name: "Alice" })).toBe(false);
    });

    it("should return false for array with non-string keys", () => {
      expect(
        isRowHashArray([
          [123, "value"],
          ["key", "value"]
        ])
      ).toBe(false);
    });

    it("should return false for array with wrong tuple length", () => {
      expect(isRowHashArray([["name", "Alice", "extra"]])).toBe(false);
    });
  });

  describe("rowHashArrayToMap", () => {
    it("should convert RowHashArray to object", () => {
      const result = rowHashArrayToMap<string | number>([
        ["name", "Alice"],
        ["age", 30]
      ]);
      expect(result).toEqual({ name: "Alice", age: 30 });
    });

    it("should handle empty RowHashArray", () => {
      expect(rowHashArrayToMap([])).toEqual({});
    });
  });

  describe("rowHashArrayToValues", () => {
    it("should extract values from RowHashArray", () => {
      const result = rowHashArrayToValues<string | number>([
        ["name", "Alice"],
        ["age", 30]
      ]);
      expect(result).toEqual(["Alice", 30]);
    });

    it("should handle empty RowHashArray", () => {
      expect(rowHashArrayToValues([])).toEqual([]);
    });
  });

  describe("rowHashArrayToHeaders", () => {
    it("should extract headers from RowHashArray", () => {
      const data: [string, string | number][] = [
        ["name", "Alice"],
        ["age", 30]
      ];
      const result = rowHashArrayToHeaders(data);
      expect(result).toEqual(["name", "age"]);
    });

    it("should handle empty RowHashArray", () => {
      expect(rowHashArrayToHeaders([])).toEqual([]);
    });
  });

  describe("rowHashArrayGet", () => {
    it("should get value by key", () => {
      const row: [string, any][] = [
        ["name", "Alice"],
        ["age", 30]
      ];
      expect(rowHashArrayGet(row, "name")).toBe("Alice");
      expect(rowHashArrayGet(row, "age")).toBe(30);
    });

    it("should return undefined for non-existent key", () => {
      const row: [string, any][] = [["name", "Alice"]];
      expect(rowHashArrayGet(row, "city")).toBeUndefined();
    });
  });

  describe("rowHashArrayMapByHeaders", () => {
    it("should map values according to header order", () => {
      const row: [string, any][] = [
        ["name", "Alice"],
        ["age", 30],
        ["city", "NYC"]
      ];
      const result = rowHashArrayMapByHeaders(row, ["city", "name", "age"]);
      expect(result).toEqual(["NYC", "Alice", 30]);
    });

    it("should return undefined for missing keys", () => {
      const row: [string, any][] = [["name", "Alice"]];
      const result = rowHashArrayMapByHeaders(row, ["name", "age", "city"]);
      expect(result).toEqual(["Alice", undefined, undefined]);
    });

    it("should handle empty RowHashArray", () => {
      const result = rowHashArrayMapByHeaders([], ["name", "age"]);
      expect(result).toEqual([undefined, undefined]);
    });

    it("should handle empty headers", () => {
      const row: [string, any][] = [["name", "Alice"]];
      const result = rowHashArrayMapByHeaders(row, []);
      expect(result).toEqual([]);
    });

    it("should use optimized linear search for small headers", () => {
      // With <= 10 headers, uses linear search per header
      const row: [string, any][] = [
        ["a", 1],
        ["b", 2],
        ["c", 3]
      ];
      const result = rowHashArrayMapByHeaders(row, ["c", "a", "b"]);
      expect(result).toEqual([3, 1, 2]);
    });

    it("should handle large headers efficiently", () => {
      // With > 10 headers, builds a map once
      const row: [string, any][] = [];
      const headers: string[] = [];
      for (let i = 0; i < 15; i++) {
        row.push([`key${i}`, `value${i}`]);
        headers.push(`key${14 - i}`); // Reverse order
      }
      const result = rowHashArrayMapByHeaders(row, headers);
      // Should be reversed values
      expect(result[0]).toBe("value14");
      expect(result[14]).toBe("value0");
    });
  });
});

describe("CSV Core - RFC 4180 Compliance", () => {
  // ===========================================================================
  // Section 1: Basic Parsing
  // ===========================================================================
  describe("parseCsv - Basic Parsing", () => {
    it("should parse simple CSV with commas", () => {
      const input = "a,b,c\n1,2,3";
      const result = parseCsv(input);
      expect(result).toEqual([
        ["a", "b", "c"],
        ["1", "2", "3"]
      ]);
    });

    it("should handle CRLF line endings (RFC 4180 standard)", () => {
      const input = "a,b,c\r\n1,2,3\r\n4,5,6";
      const result = parseCsv(input);
      expect(result).toEqual([
        ["a", "b", "c"],
        ["1", "2", "3"],
        ["4", "5", "6"]
      ]);
    });

    it("should handle CR only line endings", () => {
      const input = "a,b,c\r1,2,3";
      const result = parseCsv(input);
      expect(result).toEqual([
        ["a", "b", "c"],
        ["1", "2", "3"]
      ]);
    });

    it("should handle LF only line endings", () => {
      const input = "a,b,c\n1,2,3";
      const result = parseCsv(input);
      expect(result).toEqual([
        ["a", "b", "c"],
        ["1", "2", "3"]
      ]);
    });

    it("should handle empty input", () => {
      const result = parseCsv("");
      expect(result).toEqual([]);
    });

    it("should handle single field", () => {
      const result = parseCsv("hello");
      expect(result).toEqual([["hello"]]);
    });

    it("should handle single row with multiple fields", () => {
      const result = parseCsv("a,b,c,d,e");
      expect(result).toEqual([["a", "b", "c", "d", "e"]]);
    });

    it("should handle trailing newline", () => {
      const input = "a,b,c\n1,2,3\n";
      const result = parseCsv(input);
      expect(result).toEqual([
        ["a", "b", "c"],
        ["1", "2", "3"]
      ]);
    });
  });

  // ===========================================================================
  // Section 2: Quoted Fields (RFC 4180 Section 2.5, 2.6, 2.7)
  // ===========================================================================
  describe("parseCsv - Quoted Fields", () => {
    it("should parse quoted fields containing commas", () => {
      const input = '"hello, world",test';
      const result = parseCsv(input);
      expect(result).toEqual([["hello, world", "test"]]);
    });

    it("should parse quoted fields containing newlines", () => {
      const input = '"line1\nline2",test';
      const result = parseCsv(input);
      expect(result).toEqual([["line1\nline2", "test"]]);
    });

    it("should parse quoted fields containing CRLF", () => {
      const input = '"line1\r\nline2",test';
      const result = parseCsv(input);
      // After normalization, \r\n becomes \n
      expect(result).toEqual([["line1\nline2", "test"]]);
    });

    it("should parse escaped double-quotes (RFC 4180 Section 2.7)", () => {
      const input = '"He said ""Hello""",test';
      const result = parseCsv(input);
      expect(result).toEqual([['He said "Hello"', "test"]]);
    });

    it("should handle multiple escaped quotes", () => {
      const input = '"""quoted""",""""';
      const result = parseCsv(input);
      expect(result).toEqual([['"quoted"', '"']]);
    });

    it("should handle empty quoted field", () => {
      const input = '"",test,""';
      const result = parseCsv(input);
      expect(result).toEqual([["", "test", ""]]);
    });

    it("should handle quoted field at end of row", () => {
      const input = 'a,b,"c,d"';
      const result = parseCsv(input);
      expect(result).toEqual([["a", "b", "c,d"]]);
    });

    it("should handle quoted field at start of row", () => {
      const input = '"a,b",c,d';
      const result = parseCsv(input);
      expect(result).toEqual([["a,b", "c", "d"]]);
    });

    it("should handle all quoted fields", () => {
      const input = '"a","b","c"';
      const result = parseCsv(input);
      expect(result).toEqual([["a", "b", "c"]]);
    });

    it("should handle quoted fields with only quotes inside", () => {
      const input = '""""';
      const result = parseCsv(input);
      expect(result).toEqual([['"']]);
    });
  });

  // ===========================================================================
  // Section 3: Empty Fields and Rows
  // ===========================================================================
  describe("parseCsv - Empty Fields and Rows", () => {
    it("should handle empty fields", () => {
      const input = "a,,c";
      const result = parseCsv(input);
      expect(result).toEqual([["a", "", "c"]]);
    });

    it("should handle multiple consecutive empty fields", () => {
      const input = "a,,,d";
      const result = parseCsv(input);
      expect(result).toEqual([["a", "", "", "d"]]);
    });

    it("should handle empty field at start", () => {
      const input = ",b,c";
      const result = parseCsv(input);
      expect(result).toEqual([["", "b", "c"]]);
    });

    it("should handle empty field at end", () => {
      const input = "a,b,";
      const result = parseCsv(input);
      expect(result).toEqual([["a", "b", ""]]);
    });

    it("should handle row with only empty fields", () => {
      const input = ",,";
      const result = parseCsv(input);
      expect(result).toEqual([["", "", ""]]);
    });

    it("should handle empty rows when skipEmptyLines is false", () => {
      const input = "a,b\n\nc,d";
      const result = parseCsv(input, { skipEmptyLines: false });
      expect(result).toEqual([["a", "b"], [""], ["c", "d"]]);
    });

    it("should skip empty rows when skipEmptyLines is true", () => {
      const input = "a,b\n\nc,d";
      const result = parseCsv(input, { skipEmptyLines: true });
      expect(result).toEqual([
        ["a", "b"],
        ["c", "d"]
      ]);
    });
  });

  // ===========================================================================
  // Section 4: Whitespace Handling (RFC 4180 Section 2.4)
  // ===========================================================================
  describe("parseCsv - Whitespace Handling", () => {
    it("should preserve leading/trailing spaces by default (RFC 4180)", () => {
      const input = " a , b , c ";
      const result = parseCsv(input);
      expect(result).toEqual([[" a ", " b ", " c "]]);
    });

    it("should trim whitespace when trim option is true", () => {
      const input = " a , b , c ";
      const result = parseCsv(input, { trim: true });
      expect(result).toEqual([["a", "b", "c"]]);
    });

    it("should preserve spaces inside quoted fields", () => {
      const input = '" a "," b "';
      const result = parseCsv(input);
      expect(result).toEqual([[" a ", " b "]]);
    });

    it("should preserve tabs as part of field", () => {
      const input = "a\tb,c";
      const result = parseCsv(input);
      expect(result).toEqual([["a\tb", "c"]]);
    });
  });

  // ===========================================================================
  // Section 5: Custom Delimiters
  // ===========================================================================
  describe("parseCsv - Custom Delimiters", () => {
    it("should support tab delimiter (TSV)", () => {
      const input = "a\tb\tc\n1\t2\t3";
      const result = parseCsv(input, { delimiter: "\t" });
      expect(result).toEqual([
        ["a", "b", "c"],
        ["1", "2", "3"]
      ]);
    });

    it("should support semicolon delimiter", () => {
      const input = "a;b;c\n1;2;3";
      const result = parseCsv(input, { delimiter: ";" });
      expect(result).toEqual([
        ["a", "b", "c"],
        ["1", "2", "3"]
      ]);
    });

    it("should support pipe delimiter", () => {
      const input = "a|b|c\n1|2|3";
      const result = parseCsv(input, { delimiter: "|" });
      expect(result).toEqual([
        ["a", "b", "c"],
        ["1", "2", "3"]
      ]);
    });

    it("should handle quoted fields with custom delimiter", () => {
      const input = '"a;b";c;d';
      const result = parseCsv(input, { delimiter: ";" });
      expect(result).toEqual([["a;b", "c", "d"]]);
    });
  });

  // ===========================================================================
  // Section 6: Custom Quote Character
  // ===========================================================================
  describe("parseCsv - Custom Quote Character", () => {
    it("should support single quote as quote character", () => {
      const input = "'hello, world',test";
      const result = parseCsv(input, { quote: "'" });
      expect(result).toEqual([["hello, world", "test"]]);
    });

    it("should handle escaped single quotes", () => {
      const input = "'It''s a test',value";
      const result = parseCsv(input, { quote: "'", escape: "'" });
      expect(result).toEqual([["It's a test", "value"]]);
    });

    it("should disable quoting when quote is null", () => {
      const input = '"hello",world';
      const result = parseCsv(input, { quote: null });
      // Without quoting, the quotes are literal characters
      expect(result).toEqual([['"hello"', "world"]]);
    });

    it("should disable quoting when quote is false", () => {
      const input = '"hello",world';
      const result = parseCsv(input, { quote: false });
      expect(result).toEqual([['"hello"', "world"]]);
    });
  });

  // ===========================================================================
  // Section 7: Headers Option
  // ===========================================================================
  describe("parseCsv - Headers", () => {
    it("should return objects when headers option is true", () => {
      const input = "name,age,city\nAlice,30,NYC\nBob,25,LA";
      const result = parseCsv(input, { headers: true }) as any;
      expect(result.headers).toEqual(["name", "age", "city"]);
      expect(result.rows).toEqual([
        { name: "Alice", age: "30", city: "NYC" },
        { name: "Bob", age: "25", city: "LA" }
      ]);
    });

    it("should handle missing fields in data rows", () => {
      const input = "a,b,c\n1,2";
      const result = parseCsv(input, { headers: true }) as any;
      expect(result.rows).toEqual([{ a: "1", b: "2", c: "" }]);
    });

    it("should handle extra fields in data rows", () => {
      const input = "a,b\n1,2,3";
      const result = parseCsv(input, { headers: true }) as any;
      expect(result.rows).toEqual([{ a: "1", b: "2" }]);
    });
  });

  // ===========================================================================
  // Section 8: Skip Lines and Comments
  // ===========================================================================
  describe("parseCsv - Skip Lines and Comments", () => {
    it("should skip lines at beginning", () => {
      const input = "header line\ncomment line\na,b,c\n1,2,3";
      const result = parseCsv(input, { skipLines: 2 });
      expect(result).toEqual([
        ["a", "b", "c"],
        ["1", "2", "3"]
      ]);
    });

    it("should skip comment lines", () => {
      const input = "a,b,c\n# this is a comment\n1,2,3";
      const result = parseCsv(input, { comment: "#" });
      expect(result).toEqual([
        ["a", "b", "c"],
        ["1", "2", "3"]
      ]);
    });

    it("should handle multiple comment lines", () => {
      const input = "# comment 1\n# comment 2\na,b,c";
      const result = parseCsv(input, { comment: "#" });
      expect(result).toEqual([["a", "b", "c"]]);
    });
  });

  // ===========================================================================
  // Section 9: Max Rows Option
  // ===========================================================================
  describe("parseCsv - Max Rows", () => {
    it("should limit number of rows parsed", () => {
      const input = "a,b\n1,2\n3,4\n5,6\n7,8";
      const result = parseCsv(input, { maxRows: 2 });
      expect(result).toEqual([
        ["a", "b"],
        ["1", "2"]
      ]);
    });

    it("should handle maxRows with headers", () => {
      const input = "name,age\nAlice,30\nBob,25\nCharlie,35";
      const result = parseCsv(input, { headers: true, maxRows: 2 }) as any;
      expect(result.headers).toEqual(["name", "age"]);
      expect(result.rows).toHaveLength(2);
    });
  });

  // ===========================================================================
  // Section 10: Unicode Support
  // ===========================================================================
  describe("parseCsv - Unicode Support", () => {
    it("should handle UTF-8 characters", () => {
      const input = "名前,年齢\n田中,30\n鈴木,25";
      const result = parseCsv(input);
      expect(result).toEqual([
        ["名前", "年齢"],
        ["田中", "30"],
        ["鈴木", "25"]
      ]);
    });

    it("should handle emoji", () => {
      const input = "emoji,text\n😀,smile\n🎉,party";
      const result = parseCsv(input);
      expect(result).toEqual([
        ["emoji", "text"],
        ["😀", "smile"],
        ["🎉", "party"]
      ]);
    });

    it("should handle Chinese characters in quoted fields", () => {
      const input = '"你好,世界",测试';
      const result = parseCsv(input);
      expect(result).toEqual([["你好,世界", "测试"]]);
    });

    it("should handle mixed scripts", () => {
      const input = "English,日本語,한국어,العربية";
      const result = parseCsv(input);
      expect(result).toEqual([["English", "日本語", "한국어", "العربية"]]);
    });
  });

  // ===========================================================================
  // Section 11: formatCsv - Basic Formatting
  // ===========================================================================
  describe("formatCsv - Basic Formatting", () => {
    it("should format simple 2D array", () => {
      const data = [
        ["a", "b", "c"],
        ["1", "2", "3"]
      ];
      const result = formatCsv(data);
      expect(result).toBe("a,b,c\n1,2,3");
    });

    it("should use LF as row delimiter by default", () => {
      const data = [["a"], ["b"]];
      const result = formatCsv(data);
      expect(result).toBe("a\nb");
      expect(result).toContain("");
    });

    it("should handle empty data", () => {
      const result = formatCsv([]);
      expect(result).toBe("");
    });

    it("should handle single row", () => {
      const result = formatCsv([["a", "b", "c"]]);
      expect(result).toBe("a,b,c");
    });

    it("should handle null and undefined values", () => {
      const data = [[null, undefined, "value"]];
      const result = formatCsv(data as any);
      expect(result).toBe(",,value");
    });

    it("should convert numbers and booleans to strings", () => {
      const data = [[1, 2.5, true, false]];
      const result = formatCsv(data as any);
      expect(result).toBe("1,2.5,true,false");
    });

    it("should format numbers with comma decimalSeparator", () => {
      const data = [[1, 2.5]];
      const result = formatCsv(data as any, { delimiter: ";", decimalSeparator: "," });
      expect(result).toBe("1;2,5");
    });
  });

  // ===========================================================================
  // Section 12: formatCsv - Quoting (RFC 4180 Section 2.5, 2.6, 2.7)
  // ===========================================================================
  describe("formatCsv - Quoting", () => {
    it("should quote fields containing commas", () => {
      const data = [["hello, world", "test"]];
      const result = formatCsv(data);
      expect(result).toBe('"hello, world",test');
    });

    it("should quote fields containing double-quotes and escape them", () => {
      const data = [['He said "Hello"', "test"]];
      const result = formatCsv(data);
      expect(result).toBe('"He said ""Hello""",test');
    });

    it("should quote fields containing newlines", () => {
      const data = [["line1\nline2", "test"]];
      const result = formatCsv(data);
      expect(result).toBe('"line1\nline2",test');
    });

    it("should quote fields containing CRLF", () => {
      const data = [["line1\r\nline2", "test"]];
      const result = formatCsv(data);
      expect(result).toBe('"line1\r\nline2",test');
    });

    it("should quote fields containing only quotes", () => {
      const data = [['"']];
      const result = formatCsv(data);
      expect(result).toBe('""""');
    });

    it("should handle alwaysQuote option", () => {
      const data = [["a", "b", "c"]];
      const result = formatCsv(data, { alwaysQuote: true });
      expect(result).toBe('"a","b","c"');
    });

    it("should not quote when quote is disabled (false)", () => {
      const data = [["hello, world", "test"]];
      const result = formatCsv(data, { quote: false });
      // When quoting is disabled, commas are literal (may break parsing)
      expect(result).toBe("hello, world,test");
    });

    it("should not quote when quote is disabled (null)", () => {
      const data = [["hello, world", "test"]];
      const result = formatCsv(data, { quote: null });
      expect(result).toBe("hello, world,test");
    });
  });

  // ===========================================================================
  // Section 13: formatCsv - Custom Options
  // ===========================================================================
  describe("formatCsv - Custom Options", () => {
    it("should support custom delimiter", () => {
      const data = [["a", "b", "c"]];
      const result = formatCsv(data, { delimiter: "\t" });
      expect(result).toBe("a\tb\tc");
    });

    it("should support custom quote character", () => {
      const data = [["hello, world", "test"]];
      const result = formatCsv(data, { quote: "'" });
      expect(result).toBe("'hello, world',test");
    });

    it("should support custom row delimiter", () => {
      const data = [
        ["a", "b"],
        ["1", "2"]
      ];
      const result = formatCsv(data, { rowDelimiter: "\n" });
      expect(result).toBe("a,b\n1,2");
    });

    it("should add BOM when writeBOM is true", () => {
      const data = [["a", "b"]];
      const result = formatCsv(data, { writeBOM: true });
      expect(result.charCodeAt(0)).toBe(0xfeff);
      expect(result).toBe("\uFEFFa,b");
    });
  });

  // ===========================================================================
  // Section 14: formatCsv - Headers
  // ===========================================================================
  describe("formatCsv - Headers", () => {
    it("should add custom headers to 2D array", () => {
      const data = [
        ["1", "2", "3"],
        ["4", "5", "6"]
      ];
      const result = formatCsv(data, { headers: ["a", "b", "c"] });
      expect(result).toBe("a,b,c\n1,2,3\n4,5,6");
    });

    it("should format array of objects with headers: true", () => {
      const data = [
        { name: "Alice", age: "30" },
        { name: "Bob", age: "25" }
      ];
      const result = formatCsv(data, { headers: true });
      expect(result).toBe("name,age\nAlice,30\nBob,25");
    });

    it("should format objects with custom header order", () => {
      const data = [
        { name: "Alice", age: "30", city: "NYC" },
        { name: "Bob", age: "25", city: "LA" }
      ];
      const result = formatCsv(data, { headers: ["city", "name", "age"] });
      expect(result).toBe("city,name,age\nNYC,Alice,30\nLA,Bob,25");
    });
  });

  // ===========================================================================
  // Section 15: formatCsv - Unicode
  // ===========================================================================
  describe("formatCsv - Unicode", () => {
    it("should format UTF-8 characters", () => {
      const data = [
        ["名前", "年齢"],
        ["田中", "30"]
      ];
      const result = formatCsv(data);
      expect(result).toBe("名前,年齢\n田中,30");
    });

    it("should quote Unicode fields containing delimiters", () => {
      const data = [["你好,世界", "测试"]];
      const result = formatCsv(data);
      expect(result).toBe('"你好,世界",测试');
    });
  });

  // ===========================================================================
  // Section 15.5: formatCsv - RowHashArray Support
  // ===========================================================================
  describe("formatCsv - RowHashArray Support", () => {
    it("should format RowHashArray (array of [key, value] tuples)", () => {
      const data: [string, any][][] = [
        [
          ["name", "Alice"],
          ["age", 30]
        ],
        [
          ["name", "Bob"],
          ["age", 25]
        ]
      ];
      const result = formatCsv(data);
      expect(result).toBe("Alice,30\nBob,25");
    });

    it("should format RowHashArray with headers: true", () => {
      const data: [string, any][][] = [
        [
          ["name", "Alice"],
          ["age", 30]
        ],
        [
          ["name", "Bob"],
          ["age", 25]
        ]
      ];
      const result = formatCsv(data, { headers: true });
      expect(result).toBe("name,age\nAlice,30\nBob,25");
    });

    it("should format RowHashArray with custom headers (reorder columns)", () => {
      const data: [string, any][][] = [
        [
          ["name", "Alice"],
          ["age", 30],
          ["city", "NYC"]
        ],
        [
          ["name", "Bob"],
          ["age", 25],
          ["city", "LA"]
        ]
      ];
      const result = formatCsv(data, { headers: ["city", "age", "name"] });
      expect(result).toBe("city,age,name\nNYC,30,Alice\nLA,25,Bob");
    });

    it("should handle RowHashArray with missing keys when using custom headers", () => {
      const data: [string, any][][] = [
        [
          ["name", "Alice"],
          ["age", 30]
        ],
        [
          ["name", "Bob"],
          ["city", "LA"]
        ]
      ];
      const result = formatCsv(data, { headers: ["name", "age", "city"] });
      expect(result).toBe("name,age,city\nAlice,30,\nBob,,LA");
    });

    it("should format single RowHashArray row", () => {
      const data: [string, any][][] = [
        [
          ["firstName", "John"],
          ["lastName", "Doe"]
        ]
      ];
      const result = formatCsv(data, { headers: true });
      expect(result).toBe("firstName,lastName\nJohn,Doe");
    });

    it("should format RowHashArray with special characters", () => {
      const data: [string, any][][] = [
        [
          ["message", "Hello, World"],
          ["note", 'He said "hi"']
        ]
      ];
      const result = formatCsv(data);
      expect(result).toBe('"Hello, World","He said ""hi"""');
    });

    it("should format empty RowHashArray with alwaysWriteHeaders", () => {
      const data: [string, any][][] = [];
      const result = formatCsv(data, {
        headers: ["name", "age"],
        alwaysWriteHeaders: true
      });
      expect(result).toBe("name,age");
    });

    it("should format RowHashArray without writing headers when writeHeaders: false", () => {
      const data: [string, any][][] = [
        [
          ["name", "Alice"],
          ["age", 30]
        ]
      ];
      const result = formatCsv(data, { headers: true, writeHeaders: false });
      expect(result).toBe("Alice,30");
    });
  });

  // ===========================================================================
  // Section 16: Round-trip Tests (Parse + Format)
  // ===========================================================================
  describe("Round-trip Tests", () => {
    it("should round-trip simple data", () => {
      const original = [
        ["a", "b", "c"],
        ["1", "2", "3"]
      ];
      const csv = formatCsv(original);
      const parsed = parseCsv(csv);
      expect(parsed).toEqual(original);
    });

    it("should round-trip data with commas", () => {
      const original = [["hello, world", "test"]];
      const csv = formatCsv(original);
      const parsed = parseCsv(csv);
      expect(parsed).toEqual(original);
    });

    it("should round-trip data with quotes", () => {
      const original = [['He said "Hello"', "test"]];
      const csv = formatCsv(original);
      const parsed = parseCsv(csv);
      expect(parsed).toEqual(original);
    });

    it("should round-trip data with newlines", () => {
      const original = [["line1\nline2", "test"]];
      const csv = formatCsv(original);
      const parsed = parseCsv(csv);
      expect(parsed).toEqual(original);
    });

    it("should round-trip Unicode data", () => {
      const original = [
        ["名前", "年齢"],
        ["田中,太郎", "30"]
      ];
      const csv = formatCsv(original);
      const parsed = parseCsv(csv);
      expect(parsed).toEqual(original);
    });

    it("should round-trip complex data", () => {
      const original = [
        ["Name", "Description", "Price"],
        ["Widget", 'A "great" product, really!', "19.99"],
        ["Gadget", "Multi-line\ndescription", "29.99"],
        ["Thing", "", "9.99"]
      ];
      const csv = formatCsv(original);
      const parsed = parseCsv(csv);
      expect(parsed).toEqual(original);
    });
  });

  // ===========================================================================
  // Section 17: Streaming Parser
  // ===========================================================================
  describe("parseCsvStream - Streaming Parser", () => {
    it("should stream parse simple CSV", async () => {
      const input = "a,b,c\n1,2,3\n4,5,6";
      const rows: string[][] = [];
      for await (const row of parseCsvStream(input)) {
        rows.push(row as string[]);
      }
      expect(rows).toEqual([
        ["a", "b", "c"],
        ["1", "2", "3"],
        ["4", "5", "6"]
      ]);
    });

    it("should stream parse with headers", async () => {
      const input = "name,age\nAlice,30\nBob,25";
      const rows: Record<string, string>[] = [];
      for await (const row of parseCsvStream(input, { headers: true })) {
        rows.push(row as Record<string, string>);
      }
      expect(rows).toEqual([
        { name: "Alice", age: "30" },
        { name: "Bob", age: "25" }
      ]);
    });

    it("should stream parse with maxRows limit", async () => {
      const input = "a,b\n1,2\n3,4\n5,6";
      const rows: string[][] = [];
      for await (const row of parseCsvStream(input, { maxRows: 2 })) {
        rows.push(row as string[]);
      }
      expect(rows).toEqual([
        ["a", "b"],
        ["1", "2"]
      ]);
    });

    it("should stream parse quoted fields", async () => {
      const input = '"hello, world",test\n"line1\nline2",value';
      const rows: string[][] = [];
      for await (const row of parseCsvStream(input)) {
        rows.push(row as string[]);
      }
      expect(rows).toEqual([
        ["hello, world", "test"],
        ["line1\nline2", "value"]
      ]);
    });

    it("should stream parse from async iterable", async () => {
      async function* chunks() {
        yield "a,b,";
        yield "c\n1,2,3";
      }
      const rows: string[][] = [];
      for await (const row of parseCsvStream(chunks())) {
        rows.push(row as string[]);
      }
      expect(rows).toEqual([
        ["a", "b", "c"],
        ["1", "2", "3"]
      ]);
    });

    it("should handle chunks splitting in middle of field", async () => {
      async function* chunks() {
        yield "hel";
        yield "lo,wor";
        yield "ld\n";
      }
      const rows: string[][] = [];
      for await (const row of parseCsvStream(chunks())) {
        rows.push(row as string[]);
      }
      expect(rows).toEqual([["hello", "world"]]);
    });

    it("should handle chunks splitting in middle of quoted field", async () => {
      async function* chunks() {
        yield '"hello, ';
        yield 'world",test\n';
      }
      const rows: string[][] = [];
      for await (const row of parseCsvStream(chunks())) {
        rows.push(row as string[]);
      }
      expect(rows).toEqual([["hello, world", "test"]]);
    });
  });

  // ===========================================================================
  // Section 18: Edge Cases
  // ===========================================================================
  describe("Edge Cases", () => {
    it("should handle very long fields", () => {
      const longString = "a".repeat(10000);
      const data = [[longString]];
      const csv = formatCsv(data);
      const parsed = parseCsv(csv);
      expect(parsed).toEqual(data);
    });

    it("should handle many columns", () => {
      const cols = Array.from({ length: 100 }, (_, i) => `col${i}`);
      const data = [cols];
      const csv = formatCsv(data);
      const parsed = parseCsv(csv);
      expect(parsed).toEqual(data);
    });

    it("should handle many rows", () => {
      const data = Array.from({ length: 1000 }, (_, i) => [`row${i}`, `value${i}`]);
      const csv = formatCsv(data);
      const parsed = parseCsv(csv);
      expect(parsed).toEqual(data);
    });

    it("should handle field with only whitespace", () => {
      const input = "   ,\t\t,   ";
      const result = parseCsv(input);
      expect(result).toEqual([["   ", "\t\t", "   "]]);
    });

    it("should handle numeric-looking strings", () => {
      const input = "01234,00100,1e10";
      const result = parseCsv(input);
      // Should be parsed as strings, not numbers
      expect(result).toEqual([["01234", "00100", "1e10"]]);
    });

    it("should handle special characters", () => {
      const input = "\\n,\\r,\\t,\\\\";
      const result = parseCsv(input);
      expect(result).toEqual([["\\n", "\\r", "\\t", "\\\\"]]);
    });
  });

  // ===========================================================================
  // Section 19: RFC 4180 Specific Tests
  // ===========================================================================
  describe("RFC 4180 Specific Compliance", () => {
    it("Rule 1: Each record on separate line with LF", () => {
      const data = [
        ["a", "b"],
        ["c", "d"]
      ];
      const csv = formatCsv(data);
      expect(csv).toBe("a,b\nc,d");
    });

    it("Rule 2: Optional header line", () => {
      const data = [{ col1: "val1", col2: "val2" }];
      const withHeader = formatCsv(data, { headers: true });
      expect(withHeader).toContain("col1,col2");
    });

    it("Rule 3: Fields separated by single comma", () => {
      const csv = "a,b,c";
      const result = parseCsv(csv);
      expect(result).toEqual([["a", "b", "c"]]);
    });

    it("Rule 4: Fields may be quoted", () => {
      const csv = '"a","b","c"';
      const result = parseCsv(csv);
      expect(result).toEqual([["a", "b", "c"]]);
    });

    it("Rule 5: Fields with CRLF, comma, or quotes MUST be quoted", () => {
      const data = [["hello,world", 'say "hi"', "line1\r\nline2"]];
      const csv = formatCsv(data);
      expect(csv).toContain('"hello,world"');
      expect(csv).toContain('"say ""hi"""');
      expect(csv).toContain('"line1\r\nline2"');
    });

    it("Rule 6: Quote character is double-quote", () => {
      // Default behavior should use double-quote
      const data = [["test"]];
      const csv = formatCsv(data, { alwaysQuote: true });
      expect(csv).toBe('"test"');
    });

    it("Rule 7: Quotes escaped by doubling", () => {
      const data = [['"quoted"']];
      const csv = formatCsv(data);
      expect(csv).toBe('"""quoted"""');

      // Verify round-trip
      const parsed = parseCsv(csv);
      expect(parsed).toEqual(data);
    });
  });
});

// =============================================================================
// Additional Parser Options Tests
// =============================================================================

describe("CSV Core - Parser Options", () => {
  // ===========================================================================
  // ignoreEmpty (alias for skipEmptyLines)
  // ===========================================================================
  describe("ignoreEmpty option", () => {
    it("should ignore empty rows when ignoreEmpty is true", () => {
      const input = "a,b\n\n1,2\n\n3,4";
      const result = parseCsv(input, { ignoreEmpty: true });
      expect(result).toEqual([
        ["a", "b"],
        ["1", "2"],
        ["3", "4"]
      ]);
    });

    it("should keep empty rows when ignoreEmpty is false", () => {
      const input = "a,b\n\n1,2";
      const result = parseCsv(input, { ignoreEmpty: false });
      expect(result).toEqual([["a", "b"], [""], ["1", "2"]]);
    });

    it("should work with headers", () => {
      const input = "name,age\n\nAlice,30\n\nBob,25";
      const result = parseCsv(input, { headers: true, ignoreEmpty: true }) as any;
      expect(result.rows).toEqual([
        { name: "Alice", age: "30" },
        { name: "Bob", age: "25" }
      ]);
    });

    it("should handle only newlines with ignoreEmpty", () => {
      expect(parseCsv("\n\n\n", { ignoreEmpty: true })).toEqual([]);
    });
  });

  // ===========================================================================
  // ltrim and rtrim
  // ===========================================================================
  describe("ltrim/rtrim options", () => {
    it("should left trim fields when ltrim is true", () => {
      const input = "  a,  b,  c\n  1,  2,  3";
      const result = parseCsv(input, { ltrim: true });
      expect(result).toEqual([
        ["a", "b", "c"],
        ["1", "2", "3"]
      ]);
    });

    it("should preserve right whitespace when only ltrim is true", () => {
      const input = "  a  ,  b  \n  1  ,  2  ";
      const result = parseCsv(input, { ltrim: true });
      expect(result).toEqual([
        ["a  ", "b  "],
        ["1  ", "2  "]
      ]);
    });

    it("should right trim fields when rtrim is true", () => {
      const input = "a  ,b  ,c  \n1  ,2  ,3  ";
      const result = parseCsv(input, { rtrim: true });
      expect(result).toEqual([
        ["a", "b", "c"],
        ["1", "2", "3"]
      ]);
    });

    it("should preserve left whitespace when only rtrim is true", () => {
      const input = "  a  ,  b  \n  1  ,  2  ";
      const result = parseCsv(input, { rtrim: true });
      expect(result).toEqual([
        ["  a", "  b"],
        ["  1", "  2"]
      ]);
    });

    it("should trim both sides when ltrim and rtrim are both true", () => {
      const input = "  a  ,  b  \n  1  ,  2  ";
      const result = parseCsv(input, { ltrim: true, rtrim: true });
      expect(result).toEqual([
        ["a", "b"],
        ["1", "2"]
      ]);
    });

    it("should work with trim: true (both sides)", () => {
      const input = "  a  ,  b  \n  1  ,  2  ";
      const result = parseCsv(input, { trim: true });
      expect(result).toEqual([
        ["a", "b"],
        ["1", "2"]
      ]);
    });

    it("ltrim should apply after quote extraction", () => {
      const input = '"  a  ","  b  "';
      const result = parseCsv(input, { ltrim: true });
      expect(result).toEqual([["a  ", "b  "]]);
    });

    it("rtrim should apply after quote extraction", () => {
      const input = '"  a  ","  b  "';
      const result = parseCsv(input, { rtrim: true });
      expect(result).toEqual([["  a", "  b"]]);
    });

    it("should handle fields with only whitespace", () => {
      const result = parseCsv("   ,   ", { trim: true });
      expect(result).toEqual([["", ""]]);
    });
  });

  // ===========================================================================
  // skipRows (after header detection)
  // ===========================================================================
  describe("skipRows option", () => {
    it("should skip data rows after headers", () => {
      const input = "name,age\nAlice,30\nBob,25\nCharlie,35";
      const result = parseCsv(input, { headers: true, skipRows: 1 }) as any;
      expect(result.headers).toEqual(["name", "age"]);
      expect(result.rows).toEqual([
        { name: "Bob", age: "25" },
        { name: "Charlie", age: "35" }
      ]);
    });

    it("should skip multiple data rows", () => {
      const input = "a,b\n1,2\n3,4\n5,6\n7,8";
      const result = parseCsv(input, { headers: true, skipRows: 2 }) as any;
      expect(result.rows).toEqual([
        { a: "5", b: "6" },
        { a: "7", b: "8" }
      ]);
    });

    it("should work with skipRows > available rows", () => {
      const input = "a,b\n1,2\n3,4";
      const result = parseCsv(input, { headers: true, skipRows: 10 }) as any;
      expect(result.rows).toEqual([]);
    });

    it("skipRows should be independent of skipLines", () => {
      const input = "comment\na,b\n1,2\n3,4\n5,6";
      const result = parseCsv(input, { headers: true, skipLines: 1, skipRows: 1 }) as any;
      expect(result.headers).toEqual(["a", "b"]);
      expect(result.rows).toEqual([
        { a: "3", b: "4" },
        { a: "5", b: "6" }
      ]);
    });
  });

  // ===========================================================================
  // renameHeaders
  // ===========================================================================
  describe("renameHeaders option", () => {
    it("should rename headers from first row", () => {
      const input = "h1,h2,h3\na,b,c";
      const result = parseCsv(input, {
        headers: ["first", "second", "third"],
        renameHeaders: true
      }) as any;
      expect(result.headers).toEqual(["first", "second", "third"]);
      expect(result.rows).toEqual([{ first: "a", second: "b", third: "c" }]);
    });

    it("should discard original header row", () => {
      const input = "old1,old2\nvalue1,value2";
      const result = parseCsv(input, {
        headers: ["new1", "new2"],
        renameHeaders: true
      }) as any;
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ new1: "value1", new2: "value2" });
    });

    it("should work without renameHeaders (use first row as data)", () => {
      const input = "a,b\n1,2";
      const result = parseCsv(input, {
        headers: ["col1", "col2"],
        renameHeaders: false
      }) as any;
      expect(result.rows).toEqual([
        { col1: "a", col2: "b" },
        { col1: "1", col2: "2" }
      ]);
    });
  });

  // ===========================================================================
  // strictColumnHandling
  // ===========================================================================
  describe("strictColumnHandling option", () => {
    it("should mark rows with too few columns as invalid", () => {
      const input = "a,b,c\n1,2\n3,4,5";
      const result = parseCsv(input, {
        headers: true,
        strictColumnHandling: true
      }) as any;

      expect(result.invalidRows).toBeDefined();
      expect(result.invalidRows).toHaveLength(1);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ a: "3", b: "4", c: "5" });
    });

    it("should mark rows with too many columns as invalid", () => {
      const input = "a,b\n1,2,3\n4,5";
      const result = parseCsv(input, {
        headers: true,
        strictColumnHandling: true
      }) as any;

      expect(result.invalidRows).toBeDefined();
      expect(result.invalidRows).toHaveLength(1);
      expect(result.rows).toHaveLength(1);
    });

    it("should include reason for invalid rows", () => {
      const input = "a,b\n1\n2,3";
      const result = parseCsv(input, {
        headers: true,
        strictColumnHandling: true
      }) as any;

      expect(result.invalidRows![0].reason).toContain("column");
      expect(result.invalidRows![0].reason).toContain("mismatch");
    });

    it("should not affect rows with correct column count", () => {
      const input = "a,b\n1,2\n3,4";
      const result = parseCsv(input, {
        headers: true,
        strictColumnHandling: true
      }) as any;

      expect(result.invalidRows).toBeUndefined();
      expect(result.rows).toHaveLength(2);
    });

    it("without strictColumnHandling, extra columns are silently discarded", () => {
      const input = "a,b\n1,2,3\n4,5";
      const result = parseCsv(input, { headers: true }) as any;

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({ a: "1", b: "2" });
    });

    it("without strictColumnHandling, missing columns are padded", () => {
      const input = "a,b,c\n1,2";
      const result = parseCsv(input, { headers: true }) as any;

      expect(result.rows[0]).toEqual({ a: "1", b: "2", c: "" });
    });
  });

  // ===========================================================================
  // discardUnmappedColumns
  // ===========================================================================
  describe("discardUnmappedColumns option", () => {
    it("should discard extra columns when discardUnmappedColumns is true", () => {
      const input = "a,b\n1,2,extra,data";
      const result = parseCsv(input, {
        headers: true,
        discardUnmappedColumns: true
      }) as any;

      expect(result.rows[0]).toEqual({ a: "1", b: "2" });
    });

    it("should work with strictColumnHandling=true (discard takes precedence)", () => {
      const input = "a,b\n1,2,3\n4,5";
      const result = parseCsv(input, {
        headers: true,
        strictColumnHandling: true,
        discardUnmappedColumns: true
      }) as any;

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({ a: "1", b: "2" });
    });

    it("should not affect rows with correct column count", () => {
      const input = "a,b\n1,2";
      const result = parseCsv(input, {
        headers: true,
        discardUnmappedColumns: true
      }) as any;

      expect(result.rows[0]).toEqual({ a: "1", b: "2" });
    });
  });

  // ===========================================================================
  // Header transform function
  // ===========================================================================
  describe("header transform function", () => {
    it("should transform headers using function", () => {
      const input = "First Name,Last Name\nJohn,Doe";
      const result = parseCsv(input, {
        headers: h => h.map(header => header.toLowerCase().replace(" ", "_"))
      }) as any;

      expect(result.headers).toEqual(["first_name", "last_name"]);
      expect(result.rows[0]).toEqual({ first_name: "John", last_name: "Doe" });
    });

    it("should allow skipping columns by returning undefined/null", () => {
      const input = "a,skip,b\n1,2,3";
      const result = parseCsv(input, {
        headers: h => h.map((header, i) => (i === 1 ? null : header))
      }) as any;

      expect(result.headers).toEqual(["a", "b"]);
      expect(result.rows[0]).toEqual({ a: "1", b: "3" });
    });

    it("should throw on duplicate headers after transform", () => {
      const input = "a,b,c\n1,2,3";
      expect(() =>
        parseCsv(input, {
          headers: () => ["same", "same", "other"]
        })
      ).toThrow(/duplicate/i);
    });
  });

  // ===========================================================================
  // Duplicate header detection
  // ===========================================================================
  describe("duplicate headers", () => {
    it("should throw error on duplicate headers", () => {
      const input = "a,b,a\n1,2,3";
      expect(() => parseCsv(input, { headers: true })).toThrow(/duplicate/i);
    });

    it("should throw error when custom headers have duplicates", () => {
      expect(() =>
        parseCsv("a,b,c\n1,2,3", {
          headers: ["x", "y", "x"]
        })
      ).toThrow(/duplicate/i);
    });

    it("should allow duplicate headers with null placeholders", () => {
      const input = "a,b,c\n1,2,3";
      const result = parseCsv(input, {
        headers: ["x", null, "x2"]
      }) as any;

      expect(result.headers).toEqual(["x", "x2"]);
      expect(result.rows[0]).toEqual({ x: "a", x2: "c" });
    });
  });

  // ===========================================================================
  // quote: false option
  // ===========================================================================
  describe("quote: false option", () => {
    it("should disable quote parsing when quote is false", () => {
      const input = '"a",b,c';
      const result = parseCsv(input, { quote: false });
      expect(result).toEqual([['"a"', "b", "c"]]);
    });

    it("should disable quote parsing when quote is null", () => {
      const input = '"a",b,"c"';
      const result = parseCsv(input, { quote: null });
      expect(result).toEqual([['"a"', "b", '"c"']]);
    });

    it("should parse quotes as regular characters", () => {
      const input = 'a"b,c"d';
      const result = parseCsv(input, { quote: false });
      expect(result).toEqual([['a"b', 'c"d']]);
    });
  });

  // ===========================================================================
  // Sync transform and validate in parseCsv
  // ===========================================================================
  describe("parseCsv sync transform/validate", () => {
    it("should apply sync transform to parsed rows with headers", () => {
      const input = "name,age\nAlice,30\nBob,25";
      const result = parseCsv(input, {
        headers: true,
        transform: (row: Record<string, string>) => ({
          ...row,
          age: String(Number(row.age) * 2)
        })
      }) as any;

      expect(result.rows).toEqual([
        { name: "Alice", age: "60" },
        { name: "Bob", age: "50" }
      ]);
    });

    it("should skip rows when transform returns null", () => {
      const input = "name,age\nAlice,30\nBob,25\nCharlie,35";
      const result = parseCsv(input, {
        headers: true,
        transform: (row: Record<string, string>) => {
          if (Number(row.age) < 30) {
            return null;
          }
          return row;
        }
      }) as any;

      expect(result.rows).toEqual([
        { name: "Alice", age: "30" },
        { name: "Charlie", age: "35" }
      ]);
    });

    it("should apply sync transform to array rows (no headers)", () => {
      const input = "Alice,30\nBob,25";
      const result = parseCsv(input, {
        transform: (row: string[]) => [row[0].toUpperCase(), row[1]]
      }) as string[][];

      expect(result).toEqual([
        ["ALICE", "30"],
        ["BOB", "25"]
      ]);
    });

    it("should apply sync validate to parsed rows with headers", () => {
      const input = "name,age\nAlice,30\nBob,25\nCharlie,35";
      const result = parseCsv(input, {
        headers: true,
        validate: (row: Record<string, string>) => Number(row.age) >= 30
      }) as any;

      expect(result.rows).toEqual([
        { name: "Alice", age: "30" },
        { name: "Charlie", age: "35" }
      ]);
      expect(result.invalidRows).toEqual([{ row: ["Bob", "25"], reason: "Validation failed" }]);
    });

    it("should apply sync validate with custom reason", () => {
      const input = "name,age\nAlice,30\nBob,25";
      const result = parseCsv(input, {
        headers: true,
        validate: (row: Record<string, string>) => {
          if (Number(row.age) < 30) {
            return { isValid: false, reason: `Age ${row.age} is below minimum` };
          }
          return { isValid: true };
        }
      }) as any;

      expect(result.rows).toEqual([{ name: "Alice", age: "30" }]);
      expect(result.invalidRows).toEqual([
        { row: ["Bob", "25"], reason: "Age 25 is below minimum" }
      ]);
    });

    it("should apply sync validate to array rows (no headers)", () => {
      const input = "Alice,30\nBob,25\nCharlie,35";
      const result = parseCsv(input, {
        validate: (row: string[]) => Number(row[1]) >= 30
      }) as any;

      expect(result.rows).toEqual([
        ["Alice", "30"],
        ["Charlie", "35"]
      ]);
      expect(result.invalidRows).toEqual([{ row: ["Bob", "25"], reason: "Validation failed" }]);
    });

    it("should apply transform before validate", () => {
      const input = "name,age\nAlice,15\nBob,25";
      const result = parseCsv(input, {
        headers: true,
        transform: (row: Record<string, string>) => ({
          ...row,
          age: String(Number(row.age) * 2)
        }),
        validate: (row: Record<string, string>) => Number(row.age) >= 30
      }) as any;

      expect(result.rows).toEqual([
        { name: "Alice", age: "30" },
        { name: "Bob", age: "50" }
      ]);
    });

    it("should handle transform and validate with skipped rows", () => {
      const input = "name,age\nAlice,30\n,25\nCharlie,35";
      const result = parseCsv(input, {
        headers: true,
        transform: (row: Record<string, string>) => {
          if (!row.name) {
            return null;
          }
          return row;
        },
        validate: (row: Record<string, string>) => Number(row.age) >= 30
      }) as any;

      expect(result.rows).toEqual([
        { name: "Alice", age: "30" },
        { name: "Charlie", age: "35" }
      ]);
      expect(result.invalidRows).toBeUndefined();
    });
  });
});

// =============================================================================
// Additional Formatter Options Tests
// =============================================================================

describe("CSV Core - Formatter Options", () => {
  // ===========================================================================
  // quoteColumns and quoteHeaders
  // ===========================================================================
  describe("quoteColumns/quoteHeaders options", () => {
    it("should quote all columns when quoteColumns is true", () => {
      const result = formatCsv(
        [
          ["a", "b"],
          ["1", "2"]
        ],
        { quoteColumns: true, includeEndRowDelimiter: false }
      );
      expect(result).toBe('"a","b"\n"1","2"');
    });

    it("should quote specific columns by index", () => {
      const result = formatCsv(
        [
          ["a", "b", "c"],
          ["1", "2", "3"]
        ],
        { quoteColumns: [true, false, true], includeEndRowDelimiter: false }
      );
      expect(result).toBe('"a",b,"c"\n"1",2,"3"');
    });

    it("should quote specific columns by name", () => {
      const result = formatCsv([{ name: "John", age: "30", city: "NYC" }], {
        headers: ["name", "age", "city"],
        quoteColumns: { name: true, city: true },
        includeEndRowDelimiter: false
      });
      expect(result).toBe('name,age,city\n"John",30,"NYC"');
    });

    it("should quote headers when quoteHeaders is true", () => {
      const result = formatCsv([["1", "2"]], {
        headers: ["col1", "col2"],
        quoteHeaders: true,
        includeEndRowDelimiter: false
      });
      expect(result).toBe('"col1","col2"\n1,2');
    });

    it("should quote specific headers by index", () => {
      const result = formatCsv([["1", "2", "3"]], {
        headers: ["a", "b", "c"],
        quoteHeaders: [true, false, true],
        includeEndRowDelimiter: false
      });
      expect(result).toBe('"a",b,"c"\n1,2,3');
    });
  });

  // ===========================================================================
  // includeEndRowDelimiter and alwaysWriteHeaders
  // ===========================================================================
  describe("includeEndRowDelimiter/alwaysWriteHeaders options", () => {
    it("should not include trailing newline by default", () => {
      const result = formatCsv([["a", "b"]]);
      expect(result.endsWith("\n")).toBe(false);
      expect(result).toBe("a,b");
    });

    it("should include trailing newline when includeEndRowDelimiter is true", () => {
      const result = formatCsv([["a", "b"]], { includeEndRowDelimiter: true });
      expect(result.endsWith("\n")).toBe(true);
    });

    it("should write headers with no data when alwaysWriteHeaders is true", () => {
      const result = formatCsv([], {
        headers: ["name", "age"],
        alwaysWriteHeaders: true,
        includeEndRowDelimiter: false
      });
      expect(result).toBe("name,age");
    });

    it("should write empty string with no data when alwaysWriteHeaders is false", () => {
      const result = formatCsv([], {
        headers: ["name", "age"],
        alwaysWriteHeaders: false
      });
      expect(result).toBe("");
    });
  });

  // ===========================================================================
  // escape option
  // ===========================================================================
  describe("escape option", () => {
    it("should use default escape (same as quote)", () => {
      const result = formatCsv([['a"b']], { includeEndRowDelimiter: false });
      expect(result).toBe('"a""b"');
    });

    it("should use custom escape character", () => {
      const result = formatCsv([['a"b']], {
        escape: "\\",
        includeEndRowDelimiter: false
      });
      expect(result).toBe('"a\\"b"');
    });

    it("should handle null escape (disable escaping)", () => {
      const result = formatCsv([["a,b"]], {
        escape: null,
        quote: null,
        includeEndRowDelimiter: false
      });
      expect(result).toBe("a,b");
    });
  });

  // ===========================================================================
  // BOM handling
  // ===========================================================================
  describe("BOM handling", () => {
    it("should write BOM when writeBOM is true", () => {
      const result = formatCsv([["a", "b"]], { writeBOM: true, includeEndRowDelimiter: false });
      expect(result.charCodeAt(0)).toBe(0xfeff);
      expect(result.slice(1)).toBe("a,b");
    });

    it("should not write BOM by default", () => {
      const result = formatCsv([["a", "b"]], { includeEndRowDelimiter: false });
      expect(result.charCodeAt(0)).not.toBe(0xfeff);
    });
  });

  // ===========================================================================
  // writeHeaders option
  // ===========================================================================
  describe("writeHeaders option", () => {
    it("should write headers by default when headers option is set", () => {
      const result = formatCsv([["1", "2"]], {
        headers: ["a", "b"]
      });
      expect(result).toBe("a,b\n1,2");
    });

    it("should not write headers when writeHeaders is false", () => {
      const result = formatCsv([["1", "2"]], {
        headers: ["a", "b"],
        writeHeaders: false
      });
      expect(result).toBe("1,2");
    });

    it("should write headers when writeHeaders is true", () => {
      const result = formatCsv([["1", "2"]], {
        headers: ["a", "b"],
        writeHeaders: true
      });
      expect(result).toBe("a,b\n1,2");
    });

    it("should work with objects and writeHeaders: false", () => {
      const result = formatCsv([{ name: "Alice", age: "30" }], {
        headers: true,
        writeHeaders: false
      });
      expect(result).toBe("Alice,30");
    });

    it("should respect header order with writeHeaders: false", () => {
      const result = formatCsv([{ b: "2", a: "1" }], {
        headers: ["a", "b"],
        writeHeaders: false
      });
      expect(result).toBe("1,2");
    });
  });

  // ===========================================================================
  // rowDelimiter option
  // ===========================================================================
  describe("rowDelimiter option", () => {
    it("should use LF by default", () => {
      const result = formatCsv([
        ["a", "b"],
        ["1", "2"]
      ]);
      expect(result).toBe("a,b\n1,2");
      expect(result).toContain("\n");
      expect(result).not.toContain("\r\n");
    });

    it("should support custom rowDelimiter", () => {
      const result = formatCsv(
        [
          ["a", "b"],
          ["1", "2"]
        ],
        { rowDelimiter: "\r\n" }
      );
      expect(result).toBe("a,b\r\n1,2");
    });

    it("should support arbitrary rowDelimiter", () => {
      const result = formatCsv(
        [
          ["a", "b"],
          ["1", "2"]
        ],
        { rowDelimiter: "||" }
      );
      expect(result).toBe("a,b||1,2");
    });

    it("should quote fields containing default row delimiters", () => {
      const result = formatCsv([["a\nb", "c"]]);
      expect(result).toBe('"a\nb",c');
    });
  });

  // ===========================================================================
  // Sync transform in formatCsv
  // ===========================================================================
  describe("formatCsv sync transform", () => {
    it("should apply sync transform to formatted rows (objects)", () => {
      const result = formatCsv(
        [
          { name: "alice", age: "30" },
          { name: "bob", age: "25" }
        ],
        {
          headers: true,
          transform: (row: Record<string, string>) => ({
            ...row,
            name: row.name.toUpperCase()
          })
        }
      );
      expect(result).toBe("name,age\nALICE,30\nBOB,25");
    });

    it("should skip rows when transform returns null (objects)", () => {
      const result = formatCsv(
        [
          { name: "Alice", age: "30" },
          { name: "Bob", age: "25" },
          { name: "Charlie", age: "35" }
        ],
        {
          headers: true,
          transform: (row: Record<string, string>) => {
            if (Number(row.age) < 30) {
              return null;
            }
            return row;
          }
        }
      );
      expect(result).toBe("name,age\nAlice,30\nCharlie,35");
    });

    it("should apply sync transform to formatted rows (arrays)", () => {
      const result = formatCsv(
        [
          ["alice", "30"],
          ["bob", "25"]
        ],
        {
          transform: (row: string[]) => [row[0].toUpperCase(), row[1]]
        }
      );
      expect(result).toBe("ALICE,30\nBOB,25");
    });

    it("should skip rows when transform returns null (arrays)", () => {
      const result = formatCsv(
        [
          ["Alice", "30"],
          ["Bob", "25"],
          ["Charlie", "35"]
        ],
        {
          transform: (row: string[]) => {
            if (Number(row[1]) < 30) {
              return null;
            }
            return row;
          }
        }
      );
      expect(result).toBe("Alice,30\nCharlie,35");
    });

    it("should work with headers and transform together", () => {
      const result = formatCsv(
        [
          ["alice", "30"],
          ["bob", "25"]
        ],
        {
          headers: ["Name", "Age"],
          transform: (row: string[]) => [row[0].toUpperCase(), row[1]]
        }
      );
      expect(result).toBe("Name,Age\nALICE,30\nBOB,25");
    });
  });

  // ===========================================================================
  // Combined options
  // ===========================================================================
  describe("combined options", () => {
    it("should work with all formatter options combined", () => {
      const result = formatCsv([{ name: "Alice", age: "30" }], {
        headers: ["name", "age"],
        writeHeaders: true,
        delimiter: ";",
        quote: "'",
        escape: "'",
        rowDelimiter: "\r\n",
        quoteColumns: true,
        quoteHeaders: true,
        includeEndRowDelimiter: true,
        writeBOM: false
      });
      expect(result).toBe("'name';'age'\r\n'Alice';'30'\r\n");
    });

    it("should work with all parser options combined", () => {
      const input = "  NAME  ;  AGE  \n  Alice  ;  30  ";
      const result = parseCsv(input, {
        headers: true,
        delimiter: ";",
        trim: true,
        ignoreEmpty: true
      }) as any;
      expect(result.rows).toEqual([{ NAME: "Alice", AGE: "30" }]);
    });
  });

  // ===========================================================================
  // Edge cases - Empty and Special Values
  // ===========================================================================
  describe("edge cases - empty and special values", () => {
    it("should handle completely empty input", () => {
      const result = parseCsv("");
      expect(result).toEqual([]);
    });

    it("should handle whitespace-only input", () => {
      const result = parseCsv("   ");
      expect(result).toEqual([["   "]]);
    });

    it("should handle single quoted field", () => {
      const result = parseCsv('"value"');
      expect(result).toEqual([["value"]]);
    });

    it("should handle empty quoted field", () => {
      const result = parseCsv('""\n');
      expect(result).toEqual([[""]]);
    });

    it("should handle multiple empty quoted fields", () => {
      const result = parseCsv('"","",""');
      expect(result).toEqual([["", "", ""]]);
    });

    it("should handle mixed empty and non-empty fields", () => {
      const result = parseCsv('a,,b,"",c');
      expect(result).toEqual([["a", "", "b", "", "c"]]);
    });

    it("should handle field with only quotes", () => {
      const result = parseCsv('""""');
      expect(result).toEqual([['"']]);
    });

    it("should handle consecutive delimiters", () => {
      const result = parseCsv("a,,,,b");
      expect(result).toEqual([["a", "", "", "", "b"]]);
    });

    it("should handle trailing delimiter", () => {
      const result = parseCsv("a,b,");
      expect(result).toEqual([["a", "b", ""]]);
    });

    it("should handle leading delimiter", () => {
      const result = parseCsv(",a,b");
      expect(result).toEqual([["", "a", "b"]]);
    });

    it("should handle only delimiters", () => {
      const result = parseCsv(",,,");
      expect(result).toEqual([["", "", "", ""]]);
    });

    it("should handle newline in quoted field followed by empty line", () => {
      const input = '"line1\nline2"\n\na,b';
      const result = parseCsv(input, { ignoreEmpty: true });
      expect(result).toEqual([["line1\nline2"], ["a", "b"]]);
    });

    it("should format empty array of objects", () => {
      const result = formatCsv([] as Record<string, any>[], {
        headers: ["a", "b"],
        alwaysWriteHeaders: false
      });
      expect(result).toBe("");
    });

    it("should format objects with undefined values", () => {
      const result = formatCsv([{ a: "1", b: undefined }], { headers: true });
      expect(result).toBe("a,b\n1,");
    });

    it("should format objects with null values", () => {
      const result = formatCsv([{ a: "1", b: null }], { headers: true });
      expect(result).toBe("a,b\n1,");
    });

    it("should handle very long quoted field with special chars", () => {
      const longValue = 'a"b,c\n'.repeat(1000);
      const input = `"${longValue.replace(/"/g, '""')}"`;
      const result = parseCsv(input);
      expect(result[0][0]).toBe(longValue);
    });
  });
});
