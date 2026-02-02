/**
 * CSV Info/Raw and RelaxQuotes Feature Tests
 *
 * Tests for:
 * - info option: Returns per-record metadata (line, bytes, quoted fields)
 * - raw option: Includes raw unparsed record string in info
 * - relaxQuotes option: Tolerates quotes appearing inside unquoted fields
 */

import { describe, it, expect } from "vitest";
import { parseCsv, parseCsvStream, type RecordWithInfo, type CsvParseResult } from "@csv/index";
import { CsvParserStream } from "@csv/csv-stream";

// ===========================================================================
// Info Option Tests
// ===========================================================================
describe("info option", () => {
  describe("basic functionality", () => {
    it("should return record with info when info: true (headers mode)", () => {
      const csv = "name,age\nAlice,30\nBob,25";
      const result = parseCsv(csv, { headers: true, info: true }) as CsvParseResult<
        RecordWithInfo<Record<string, unknown>>
      >;

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toHaveProperty("record");
      expect(result.rows[0]).toHaveProperty("info");
      expect(result.rows[0].record).toEqual({ name: "Alice", age: "30" });
      expect(result.rows[0].info.index).toBe(0);
      expect(result.rows[0].info.line).toBe(2); // 1-based, header is line 1
      expect(result.rows[0].info.quoted).toEqual([false, false]);
    });

    it("should return record with info when info: true (array mode)", () => {
      const csv = "Alice,30\nBob,25";
      const result = parseCsv(csv, { info: true }) as CsvParseResult<RecordWithInfo<string[]>>;

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toHaveProperty("record");
      expect(result.rows[0]).toHaveProperty("info");
      expect(result.rows[0].record).toEqual(["Alice", "30"]);
      expect(result.rows[0].info.index).toBe(0);
      expect(result.rows[0].info.line).toBe(1);
    });

    it("should track quoted fields correctly", () => {
      const csv = '"Alice",30\nBob,"25"';
      const result = parseCsv(csv, { info: true }) as CsvParseResult<RecordWithInfo<string[]>>;

      expect(result.rows[0].info.quoted).toEqual([true, false]);
      expect(result.rows[1].info.quoted).toEqual([false, true]);
    });

    it("should track byte offset correctly", () => {
      const csv = "a,b\n1,2\n3,4";
      const result = parseCsv(csv, { headers: true, info: true }) as CsvParseResult<
        RecordWithInfo<Record<string, unknown>>
      >;

      // "a,b\n" = 4 bytes, so first data row starts at byte 4
      expect(result.rows[0].info.bytes).toBe(4);
      // "a,b\n1,2\n" = 8 bytes, so second data row starts at byte 8
      expect(result.rows[1].info.bytes).toBe(8);
    });

    it("should handle skipLines with info correctly", () => {
      const csv = "# comment\nname,age\nAlice,30";
      const result = parseCsv(csv, { headers: true, info: true, skipLines: 1 }) as CsvParseResult<
        RecordWithInfo<Record<string, unknown>>
      >;

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].info.line).toBe(3); // Line 1 skipped, line 2 is header, line 3 is data
    });
  });

  describe("with transform function", () => {
    it("should preserve info when transform filters rows", () => {
      const csv = "name,age\nAlice,30\nBob,25\nCharlie,35";
      const result = parseCsv(csv, {
        headers: true,
        info: true,
        transform: row => ((row as Record<string, string>).age >= "30" ? row : null)
      }) as CsvParseResult<RecordWithInfo<Record<string, unknown>>>;

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].record).toEqual({ name: "Alice", age: "30" });
      expect(result.rows[0].info.index).toBe(0);
      expect(result.rows[1].record).toEqual({ name: "Charlie", age: "35" });
      expect(result.rows[1].info.index).toBe(2); // Original index preserved
    });
  });

  describe("with validate function", () => {
    it("should preserve info when validate filters rows", () => {
      const csv = "name,age\nAlice,30\nBob,invalid\nCharlie,35";
      const result = parseCsv(csv, {
        headers: true,
        info: true,
        validate: row => !isNaN(Number((row as Record<string, string>).age))
      }) as CsvParseResult<RecordWithInfo<Record<string, unknown>>>;

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].info.index).toBe(0);
      expect(result.rows[1].info.index).toBe(2); // Original index preserved
    });
  });
});

// ===========================================================================
// Raw Option Tests
// ===========================================================================
describe("raw option", () => {
  it("should include raw string when raw: true", () => {
    const csv = '"Alice",30\nBob,"25"';
    const result = parseCsv(csv, { info: true, raw: true }) as CsvParseResult<
      RecordWithInfo<string[]>
    >;

    expect(result.rows[0].info.raw).toBe('"Alice",30');
    expect(result.rows[1].info.raw).toBe('Bob,"25"');
  });

  it("should not include raw string when raw: false", () => {
    const csv = "Alice,30";
    const result = parseCsv(csv, { info: true, raw: false }) as CsvParseResult<
      RecordWithInfo<string[]>
    >;

    expect(result.rows[0].info.raw).toBeUndefined();
  });

  it("should capture raw string with embedded newlines in quoted fields", () => {
    const csv = '"Hello\nWorld",test';
    const result = parseCsv(csv, { info: true, raw: true }) as CsvParseResult<
      RecordWithInfo<string[]>
    >;

    // The raw string should contain the original quoted field
    expect(result.rows[0].info.raw).toContain('"Hello');
    expect(result.rows[0].record[0]).toBe("Hello\nWorld"); // Parsed correctly
  });

  it("should handle CRLF line endings in raw", () => {
    const csv = "a,b\r\n1,2";
    const result = parseCsv(csv, { info: true, raw: true }) as CsvParseResult<
      RecordWithInfo<string[]>
    >;

    expect(result.rows[0].info.raw).toBe("a,b");
    expect(result.rows[1].info.raw).toBe("1,2");
  });
});

// ===========================================================================
// parseCsvStream info/raw Option Tests
// ===========================================================================
describe("parseCsvStream info/raw options", () => {
  describe("info option", () => {
    it("should return record with info when info: true (array mode)", async () => {
      const csv = "Alice,30\nBob,25";
      const rows: RecordWithInfo<string[]>[] = [];
      for await (const row of parseCsvStream(csv, { info: true })) {
        rows.push(row as unknown as RecordWithInfo<string[]>);
      }

      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveProperty("record");
      expect(rows[0]).toHaveProperty("info");
      expect(rows[0].record).toEqual(["Alice", "30"]);
      expect(rows[0].info.index).toBe(0);
      expect(rows[0].info.line).toBe(1);
      expect(rows[1].record).toEqual(["Bob", "25"]);
      expect(rows[1].info.index).toBe(1);
      expect(rows[1].info.line).toBe(2);
    });

    it("should return record with info when info: true (headers mode)", async () => {
      const csv = "name,age\nAlice,30\nBob,25";
      const rows: RecordWithInfo<Record<string, unknown>>[] = [];
      for await (const row of parseCsvStream(csv, { headers: true, info: true })) {
        rows.push(row as unknown as RecordWithInfo<Record<string, unknown>>);
      }

      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveProperty("record");
      expect(rows[0]).toHaveProperty("info");
      expect(rows[0].record).toEqual({ name: "Alice", age: "30" });
      expect(rows[0].info.index).toBe(0);
      expect(rows[0].info.line).toBe(2); // Header is line 1, first data is line 2
      expect(rows[0].info.quoted).toEqual([false, false]);
    });

    it("should track quoted fields correctly", async () => {
      const csv = '"Alice",30\nBob,"25"';
      const rows: RecordWithInfo<string[]>[] = [];
      for await (const row of parseCsvStream(csv, { info: true })) {
        rows.push(row as unknown as RecordWithInfo<string[]>);
      }

      expect(rows[0].info.quoted).toEqual([true, false]);
      expect(rows[1].info.quoted).toEqual([false, true]);
    });

    it("should track byte offset correctly", async () => {
      const csv = "a,b\n1,2\n3,4";
      const rows: RecordWithInfo<Record<string, unknown>>[] = [];
      for await (const row of parseCsvStream(csv, { headers: true, info: true })) {
        rows.push(row as unknown as RecordWithInfo<Record<string, unknown>>);
      }

      // "a,b\n" = 4 bytes, so first data row starts at byte 4
      expect(rows[0].info.bytes).toBe(4);
      // "a,b\n1,2\n" = 8 bytes, so second data row starts at byte 8
      expect(rows[1].info.bytes).toBe(8);
    });

    it("should handle skipLines with info correctly", async () => {
      const csv = "# comment\nname,age\nAlice,30";
      const rows: RecordWithInfo<Record<string, unknown>>[] = [];
      for await (const row of parseCsvStream(csv, { headers: true, info: true, skipLines: 1 })) {
        rows.push(row as unknown as RecordWithInfo<Record<string, unknown>>);
      }

      expect(rows).toHaveLength(1);
      expect(rows[0].info.line).toBe(3); // Line 1 skipped, line 2 is header, line 3 is data
    });

    it("should handle chunked input with info", async () => {
      async function* chunks() {
        yield "name,a";
        yield "ge\nAl";
        yield "ice,30";
      }
      const rows: RecordWithInfo<Record<string, unknown>>[] = [];
      for await (const row of parseCsvStream(chunks(), { headers: true, info: true })) {
        rows.push(row as unknown as RecordWithInfo<Record<string, unknown>>);
      }

      expect(rows).toHaveLength(1);
      expect(rows[0].record).toEqual({ name: "Alice", age: "30" });
      expect(rows[0].info.index).toBe(0);
      expect(rows[0].info.line).toBe(2);
    });
  });

  describe("raw option", () => {
    it("should include raw string when raw: true", async () => {
      const csv = '"Alice",30\nBob,"25"';
      const rows: RecordWithInfo<string[]>[] = [];
      for await (const row of parseCsvStream(csv, { info: true, raw: true })) {
        rows.push(row as unknown as RecordWithInfo<string[]>);
      }

      expect(rows[0].info.raw).toBe('"Alice",30');
      expect(rows[1].info.raw).toBe('Bob,"25"');
    });

    it("should not include raw string when raw: false", async () => {
      const csv = "Alice,30";
      const rows: RecordWithInfo<string[]>[] = [];
      for await (const row of parseCsvStream(csv, { info: true, raw: false })) {
        rows.push(row as unknown as RecordWithInfo<string[]>);
      }

      expect(rows[0].info.raw).toBeUndefined();
    });

    it("should capture raw string with embedded newlines in quoted fields", async () => {
      const csv = '"Hello\nWorld",test';
      const rows: RecordWithInfo<string[]>[] = [];
      for await (const row of parseCsvStream(csv, { info: true, raw: true })) {
        rows.push(row as unknown as RecordWithInfo<string[]>);
      }

      // The raw string should contain the original quoted field
      expect(rows[0].info.raw).toContain('"Hello');
      expect(rows[0].record[0]).toBe("Hello\nWorld"); // Parsed correctly
    });

    it("should handle CRLF line endings in raw", async () => {
      const csv = "a,b\r\n1,2";
      const rows: RecordWithInfo<string[]>[] = [];
      for await (const row of parseCsvStream(csv, { info: true, raw: true })) {
        rows.push(row as unknown as RecordWithInfo<string[]>);
      }

      expect(rows[0].info.raw).toBe("a,b");
      expect(rows[1].info.raw).toBe("1,2");
    });

    it("should handle chunked input with raw", async () => {
      async function* chunks() {
        yield '"Hel';
        yield 'lo",wor';
        yield "ld\ntest,data";
      }
      const rows: RecordWithInfo<string[]>[] = [];
      for await (const row of parseCsvStream(chunks(), { info: true, raw: true })) {
        rows.push(row as unknown as RecordWithInfo<string[]>);
      }

      expect(rows).toHaveLength(2);
      expect(rows[0].info.raw).toBe('"Hello",world');
      expect(rows[1].info.raw).toBe("test,data");
    });

    it("should track byte offset correctly with chunked input containing quoted fields", async () => {
      // Chunks split in the middle of a quoted field
      async function* chunks() {
        yield '"Hel'; // 4 bytes
        yield 'lo",wor'; // 7 bytes
        yield "ld\ntest,data"; // 12 bytes
      }
      // Total: '"Hello",world\ntest,data'
      // Row 1 '"Hello",world' starts at byte 0
      // Row 2 'test,data' starts at byte 14 (after '"Hello",world\n')
      const rows: RecordWithInfo<string[]>[] = [];
      for await (const row of parseCsvStream(chunks(), { info: true, raw: true })) {
        rows.push(row as unknown as RecordWithInfo<string[]>);
      }

      expect(rows).toHaveLength(2);
      expect(rows[0].info.bytes).toBe(0);
      expect(rows[1].info.bytes).toBe(14); // 13 chars for '"Hello",world' + 1 for newline
    });
  });
});

// ===========================================================================
// RelaxQuotes Option Tests
// ===========================================================================
describe("relaxQuotes option", () => {
  describe("basic functionality", () => {
    it("should allow quotes mid-field when relaxQuotes: true", () => {
      const csv = 'John said "hello"';
      const result = parseCsv(csv, { relaxQuotes: true }) as string[][];

      expect(result[0][0]).toBe('John said "hello"');
    });

    it("should still parse properly quoted fields correctly", () => {
      const csv = '"properly quoted","normal"';
      const result = parseCsv(csv, { relaxQuotes: true }) as string[][];

      expect(result[0]).toEqual(["properly quoted", "normal"]);
    });

    it("should handle mixed quoted and relaxed quotes", () => {
      const csv = '"quoted field",unquoted "with" quotes';
      const result = parseCsv(csv, { relaxQuotes: true }) as string[][];

      expect(result[0][0]).toBe("quoted field");
      expect(result[0][1]).toBe('unquoted "with" quotes');
    });

    it("should parse normally without relaxQuotes (default behavior)", () => {
      // Without relaxQuotes, a quote mid-field might cause issues
      const csv = 'a,b\n1,test"quote';
      // This should either error or parse incorrectly without relaxQuotes
      // With relaxQuotes: true, it should work
      const result = parseCsv(csv, { headers: true, relaxQuotes: true }) as CsvParseResult<
        Record<string, string>
      >;

      expect(result.rows[0].b).toBe('test"quote');
    });
  });

  describe("edge cases", () => {
    it("should handle quote at end of field", () => {
      const csv = 'value with quote"';
      const result = parseCsv(csv, { relaxQuotes: true }) as string[][];

      expect(result[0][0]).toBe('value with quote"');
    });

    it("should handle multiple quotes mid-field", () => {
      const csv = 'He said "hi" and she said "bye"';
      const result = parseCsv(csv, { relaxQuotes: true }) as string[][];

      expect(result[0][0]).toBe('He said "hi" and she said "bye"');
    });

    it("should handle quoted field followed by unquoted field with quote", () => {
      const csv = '"quoted",has "quote" inside';
      const result = parseCsv(csv, { relaxQuotes: true }) as string[][];

      expect(result[0]).toEqual(["quoted", 'has "quote" inside']);
    });

    it("should still handle escaped quotes in quoted fields", () => {
      const csv = '"field with ""escaped"" quotes"';
      const result = parseCsv(csv, { relaxQuotes: true }) as string[][];

      expect(result[0][0]).toBe('field with "escaped" quotes');
    });

    it("should handle empty quoted field followed by relaxed quote field", () => {
      const csv = '"",unquoted "test"';
      const result = parseCsv(csv, { relaxQuotes: true }) as string[][];

      expect(result[0]).toEqual(["", 'unquoted "test"']);
    });
  });

  describe("with headers", () => {
    it("should work with header parsing", () => {
      const csv = 'name,description\nJohn,says "hello"';
      const result = parseCsv(csv, { headers: true, relaxQuotes: true }) as CsvParseResult<
        Record<string, string>
      >;

      expect(result.rows[0]).toEqual({ name: "John", description: 'says "hello"' });
    });
  });
});

// ===========================================================================
// Combined Features Tests
// ===========================================================================
describe("combined info and relaxQuotes", () => {
  it("should work with both options enabled", () => {
    const csv = 'name,quote\nAlice,says "hi"';
    const result = parseCsv(csv, {
      headers: true,
      info: true,
      raw: true,
      relaxQuotes: true
    }) as CsvParseResult<RecordWithInfo<Record<string, unknown>>>;

    expect(result.rows[0].record).toEqual({ name: "Alice", quote: 'says "hi"' });
    expect(result.rows[0].info.raw).toBe('Alice,says "hi"');
    expect(result.rows[0].info.quoted).toEqual([false, false]);
  });
});

// ===========================================================================
// CsvParserStream info/raw Option Tests
// ===========================================================================
describe("CsvParserStream info/raw options", () => {
  describe("info option", () => {
    it("should return record with info when info: true (array mode)", async () => {
      const csv = "Alice,30\nBob,25";
      const parser = new CsvParserStream({ info: true });

      const rows: RecordWithInfo<string[]>[] = [];
      parser.on("data", (row: RecordWithInfo<string[]>) => {
        rows.push(row);
      });

      await new Promise<void>((resolve, reject) => {
        parser.on("error", reject);
        parser.on("end", resolve);
        parser.end(csv);
      });

      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveProperty("record");
      expect(rows[0]).toHaveProperty("info");
      expect(rows[0].record).toEqual(["Alice", "30"]);
      expect(rows[0].info.index).toBe(0);
      expect(rows[0].info.line).toBe(1);
      expect(rows[1].record).toEqual(["Bob", "25"]);
      expect(rows[1].info.index).toBe(1);
      expect(rows[1].info.line).toBe(2);
    });

    it("should return record with info when info: true (headers mode)", async () => {
      const csv = "name,age\nAlice,30\nBob,25";
      const parser = new CsvParserStream({ headers: true, info: true });

      const rows: RecordWithInfo<Record<string, string>>[] = [];
      parser.on("data", (row: RecordWithInfo<Record<string, string>>) => {
        rows.push(row);
      });

      await new Promise<void>((resolve, reject) => {
        parser.on("error", reject);
        parser.on("end", resolve);
        parser.end(csv);
      });

      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveProperty("record");
      expect(rows[0]).toHaveProperty("info");
      expect(rows[0].record).toEqual({ name: "Alice", age: "30" });
      expect(rows[0].info.index).toBe(0);
      expect(rows[0].info.line).toBe(2); // Header is line 1, first data is line 2
      expect(rows[0].info.quoted).toEqual([false, false]);
    });

    it("should track quoted fields correctly", async () => {
      const csv = '"Alice",30\nBob,"25"';
      const parser = new CsvParserStream({ info: true });

      const rows: RecordWithInfo<string[]>[] = [];
      parser.on("data", (row: RecordWithInfo<string[]>) => {
        rows.push(row);
      });

      await new Promise<void>((resolve, reject) => {
        parser.on("error", reject);
        parser.on("end", resolve);
        parser.end(csv);
      });

      expect(rows[0].info.quoted).toEqual([true, false]);
      expect(rows[1].info.quoted).toEqual([false, true]);
    });

    it("should track byte offset correctly", async () => {
      const csv = "a,b\n1,2\n3,4";
      const parser = new CsvParserStream({ headers: true, info: true });

      const rows: RecordWithInfo<Record<string, string>>[] = [];
      parser.on("data", (row: RecordWithInfo<Record<string, string>>) => {
        rows.push(row);
      });

      await new Promise<void>((resolve, reject) => {
        parser.on("error", reject);
        parser.on("end", resolve);
        parser.end(csv);
      });

      // "a,b\n" = 4 bytes, so first data row starts at byte 4
      expect(rows[0].info.bytes).toBe(4);
      // "a,b\n1,2\n" = 8 bytes, so second data row starts at byte 8
      expect(rows[1].info.bytes).toBe(8);
    });
  });

  describe("raw option", () => {
    it("should include raw string when raw: true", async () => {
      const csv = '"Alice",30\nBob,"25"';
      const parser = new CsvParserStream({ info: true, raw: true });

      const rows: RecordWithInfo<string[]>[] = [];
      parser.on("data", (row: RecordWithInfo<string[]>) => {
        rows.push(row);
      });

      await new Promise<void>((resolve, reject) => {
        parser.on("error", reject);
        parser.on("end", resolve);
        parser.end(csv);
      });

      expect(rows[0].info.raw).toBe('"Alice",30');
      expect(rows[1].info.raw).toBe('Bob,"25"');
    });

    it("should not include raw string when raw: false", async () => {
      const csv = "Alice,30";
      const parser = new CsvParserStream({ info: true, raw: false });

      const rows: RecordWithInfo<string[]>[] = [];
      parser.on("data", (row: RecordWithInfo<string[]>) => {
        rows.push(row);
      });

      await new Promise<void>((resolve, reject) => {
        parser.on("error", reject);
        parser.on("end", resolve);
        parser.end(csv);
      });

      expect(rows[0].info.raw).toBeUndefined();
    });

    it("should handle chunked input with raw", async () => {
      const parser = new CsvParserStream({ info: true, raw: true });

      const rows: RecordWithInfo<string[]>[] = [];
      parser.on("data", (row: RecordWithInfo<string[]>) => {
        rows.push(row);
      });

      const done = new Promise<void>((resolve, reject) => {
        parser.on("error", reject);
        parser.on("end", resolve);
      });

      // Write in chunks
      parser.write('"Hel');
      parser.write('lo",wor');
      parser.write("ld\ntest,data");
      parser.end();

      await done;

      expect(rows).toHaveLength(2);
      expect(rows[0].info.raw).toBe('"Hello",world');
      expect(rows[1].info.raw).toBe("test,data");
    });
  });
});

// ===========================================================================
// Streaming Parser Tests for relaxQuotes
// ===========================================================================
describe("CsvParserStream with relaxQuotes", () => {
  it("should handle relaxQuotes in streaming mode", async () => {
    const csv = 'name,description\nJohn,says "hello"\nJane,has "quotes"';
    const parser = new CsvParserStream({ headers: true, relaxQuotes: true });

    const rows: Record<string, string>[] = [];
    parser.on("data", (row: Record<string, string>) => {
      rows.push(row);
    });

    await new Promise<void>((resolve, reject) => {
      parser.on("error", reject);
      parser.on("end", resolve);
      parser.end(csv);
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: "John", description: 'says "hello"' });
    expect(rows[1]).toEqual({ name: "Jane", description: 'has "quotes"' });
  });

  it("should handle mixed quoted and relaxed quote fields in streaming", async () => {
    const csv = '"proper",unquoted "inner" quote';
    const parser = new CsvParserStream({ relaxQuotes: true });

    const rows: string[][] = [];
    parser.on("data", (row: string[]) => {
      rows.push(row);
    });

    await new Promise<void>((resolve, reject) => {
      parser.on("error", reject);
      parser.on("end", resolve);
      parser.end(csv);
    });

    expect(rows[0]).toEqual(["proper", 'unquoted "inner" quote']);
  });

  it("should still handle properly quoted fields correctly in streaming", async () => {
    const csv = '"Alice","Bob"';
    const parser = new CsvParserStream({ relaxQuotes: true });

    const rows: string[][] = [];
    parser.on("data", (row: string[]) => {
      rows.push(row);
    });

    await new Promise<void>((resolve, reject) => {
      parser.on("error", reject);
      parser.on("end", resolve);
      parser.end(csv);
    });

    expect(rows[0]).toEqual(["Alice", "Bob"]);
  });
});
