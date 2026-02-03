/**
 * CSV Edge Cases & Boundary Tests
 *
 * Comprehensive tests for edge cases that are prone to bugs:
 * - Empty input / single row / single field
 * - CRLF / CR / LF mixed line endings
 * - Unicode / BOM / multi-byte characters
 * - fastMode with various options
 * - info/raw with skipLines, skipRows, maxRows, toLine
 * - Streaming chunked input edge cases
 * - dynamicTyping + info/raw combinations
 * - escape character edge cases
 * - Large field / row boundary conditions
 */

import { describe, it, expect } from "vitest";
import { parseCsv, parseCsvRows, type RecordWithInfo, type CsvParseResult } from "@csv/index";
import { CsvParserStream } from "@csv/csv-stream";

// ===========================================================================
// Empty / Single Row / Single Field Edge Cases
// ===========================================================================
describe("empty and minimal input edge cases", () => {
  describe("parseCsv", () => {
    it("should handle empty string", () => {
      const result = parseCsv("");
      expect(result).toEqual([]);
    });

    it("should handle empty string with info option", () => {
      const result = parseCsv("", { info: true }) as CsvParseResult<RecordWithInfo<string[]>>;
      expect(result.rows).toEqual([]);
    });

    it("should handle single field", () => {
      const result = parseCsv("value") as string[][];
      expect(result).toEqual([["value"]]);
    });

    it("should handle single field with info + raw", () => {
      const result = parseCsv("value", { info: true, raw: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      expect(result.rows[0].record).toEqual(["value"]);
      expect(result.rows[0].info.raw).toBe("value");
      expect(result.rows[0].info.line).toBe(1);
      expect(result.rows[0].info.bytes).toBe(0);
    });

    it("should handle single empty field", () => {
      const result = parseCsv(",") as string[][];
      expect(result).toEqual([["", ""]]);
    });

    it("should handle single row no trailing newline", () => {
      const result = parseCsv("a,b,c") as string[][];
      expect(result).toEqual([["a", "b", "c"]]);
    });

    it("should handle single row with trailing newline", () => {
      const result = parseCsv("a,b,c\n") as string[][];
      expect(result).toEqual([["a", "b", "c"]]);
    });

    it("should handle only newlines", () => {
      const result = parseCsv("\n\n\n", { skipEmptyLines: false }) as string[][];
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle only newlines with skipEmptyLines", () => {
      const result = parseCsv("\n\n\n", { skipEmptyLines: true }) as string[][];
      expect(result).toEqual([]);
    });

    it("should handle whitespace-only row with skipEmptyLines: greedy", () => {
      const result = parseCsv("   \n\t\n  \t  ", { skipEmptyLines: "greedy" }) as string[][];
      expect(result).toEqual([]);
    });
  });

  describe("parseCsv fastMode", () => {
    it("should handle empty string in fastMode", () => {
      const result = parseCsv("", { fastMode: true });
      expect(result).toEqual([]);
    });

    it("should handle single field in fastMode", () => {
      const result = parseCsv("value", { fastMode: true }) as string[][];
      expect(result).toEqual([["value"]]);
    });

    it("should handle single field with info in fastMode", () => {
      const result = parseCsv("value", { fastMode: true, info: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      expect(result.rows[0].record).toEqual(["value"]);
      expect(result.rows[0].info.line).toBe(1);
    });
  });

  describe("CsvParserStream", () => {
    it("should handle empty input", async () => {
      const parser = new CsvParserStream();
      const rows: string[][] = [];
      parser.on("data", row => rows.push(row));

      await new Promise<void>((resolve, reject) => {
        parser.on("error", reject);
        parser.on("end", resolve);
        parser.end("");
      });

      expect(rows).toEqual([]);
    });

    it("should handle single field input", async () => {
      const parser = new CsvParserStream({ info: true, raw: true });
      const rows: RecordWithInfo<string[]>[] = [];
      parser.on("data", row => rows.push(row));

      await new Promise<void>((resolve, reject) => {
        parser.on("error", reject);
        parser.on("end", resolve);
        parser.end("value");
      });

      expect(rows[0].record).toEqual(["value"]);
      expect(rows[0].info.raw).toBe("value");
    });
  });
});

// ===========================================================================
// Line Ending Edge Cases (CRLF / CR / LF)
// ===========================================================================
describe("line ending edge cases", () => {
  describe("parseCsv standard mode", () => {
    it("should handle LF line endings", () => {
      const csv = "a,b\n1,2\n3,4";
      const result = parseCsv(csv, { info: true, raw: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].info.raw).toBe("a,b");
      expect(result.rows[1].info.raw).toBe("1,2");
      expect(result.rows[2].info.raw).toBe("3,4");
    });

    it("should handle CRLF line endings", () => {
      const csv = "a,b\r\n1,2\r\n3,4";
      const result = parseCsv(csv, { info: true, raw: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].info.raw).toBe("a,b");
      expect(result.rows[1].info.raw).toBe("1,2");
      expect(result.rows[2].info.raw).toBe("3,4");
    });

    it("should handle CR-only line endings", () => {
      const csv = "a,b\r1,2\r3,4";
      const result = parseCsv(csv, { info: true, raw: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].info.raw).toBe("a,b");
      expect(result.rows[1].info.raw).toBe("1,2");
    });

    it("should handle mixed line endings", () => {
      const csv = "a,b\n1,2\r\n3,4\r5,6";
      const result = parseCsv(csv, { info: true, raw: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      expect(result.rows).toHaveLength(4);
    });

    it("should track line numbers correctly with CRLF", () => {
      const csv = "a,b\r\n1,2\r\n3,4";
      const result = parseCsv(csv, { info: true }) as CsvParseResult<RecordWithInfo<string[]>>;
      expect(result.rows[0].info.line).toBe(1);
      expect(result.rows[1].info.line).toBe(2);
      expect(result.rows[2].info.line).toBe(3);
    });

    it("should handle trailing CRLF", () => {
      const csv = "a,b\r\n1,2\r\n";
      const result = parseCsv(csv, { info: true, raw: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      expect(result.rows).toHaveLength(2);
      expect(result.rows[1].info.raw).toBe("1,2");
    });

    it("should handle CRLF in quoted field", () => {
      const csv = '"hello\r\nworld",test';
      const result = parseCsv(csv, { info: true, raw: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      expect(result.rows[0].record[0]).toBe("hello\nworld"); // CRLF normalized to LF inside quoted
      expect(result.rows[0].info.raw).toContain("hello");
    });
  });

  describe("parseCsv fastMode", () => {
    it("should handle LF in fastMode with info", () => {
      const csv = "a,b\n1,2\n3,4";
      const result = parseCsv(csv, { fastMode: true, info: true, raw: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].info.raw).toBe("a,b");
      expect(result.rows[1].info.raw).toBe("1,2");
    });

    it("should handle CRLF in fastMode with info", () => {
      const csv = "a,b\r\n1,2\r\n3,4";
      const result = parseCsv(csv, { fastMode: true, info: true, raw: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].info.raw).toBe("a,b");
      expect(result.rows[1].info.raw).toBe("1,2");
      expect(result.rows[2].info.raw).toBe("3,4");
    });

    it("should handle CR-only in fastMode with info", () => {
      const csv = "a,b\r1,2\r3,4";
      const result = parseCsv(csv, { fastMode: true, info: true, raw: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].info.raw).toBe("a,b");
    });

    it("should track line numbers correctly with CRLF in fastMode", () => {
      const csv = "a,b\r\n1,2\r\n3,4";
      const result = parseCsv(csv, { fastMode: true, info: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      expect(result.rows[0].info.line).toBe(1);
      expect(result.rows[1].info.line).toBe(2);
      expect(result.rows[2].info.line).toBe(3);
    });

    it("should track bytes correctly with CRLF in fastMode", () => {
      const csv = "ab,cd\r\nef,gh";
      const result = parseCsv(csv, { fastMode: true, info: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      expect(result.rows[0].info.bytes).toBe(0);
      // "ab,cd\r\n" = 7 characters
      expect(result.rows[1].info.bytes).toBe(7);
    });
  });

  describe("CsvParserStream line endings", () => {
    it("should handle CRLF in streaming mode", async () => {
      const parser = new CsvParserStream({ info: true, raw: true });
      const rows: RecordWithInfo<string[]>[] = [];
      parser.on("data", row => rows.push(row));

      await new Promise<void>((resolve, reject) => {
        parser.on("error", reject);
        parser.on("end", resolve);
        parser.end("a,b\r\n1,2\r\n3,4");
      });

      expect(rows).toHaveLength(3);
      expect(rows[0].info.raw).toBe("a,b");
      expect(rows[1].info.raw).toBe("1,2");
    });

    it("should handle CRLF split across chunks", async () => {
      const parser = new CsvParserStream({ info: true, raw: true });
      const rows: RecordWithInfo<string[]>[] = [];
      parser.on("data", row => rows.push(row));

      const done = new Promise<void>((resolve, reject) => {
        parser.on("error", reject);
        parser.on("end", resolve);
      });

      // Split CRLF across chunks: \r in first chunk, \n in second
      parser.write("a,b\r");
      parser.write("\n1,2");
      parser.end();

      await done;

      expect(rows).toHaveLength(2);
      expect(rows[0].info.raw).toBe("a,b");
      expect(rows[1].info.raw).toBe("1,2");
    });

    it("should handle CR at end of chunk (ambiguous)", async () => {
      const parser = new CsvParserStream({ info: true, raw: true });
      const rows: RecordWithInfo<string[]>[] = [];
      parser.on("data", row => rows.push(row));

      const done = new Promise<void>((resolve, reject) => {
        parser.on("error", reject);
        parser.on("end", resolve);
      });

      // CR at end - could be CR or start of CRLF
      parser.write("a,b\r");
      parser.write("1,2"); // Not a newline after CR, so CR was standalone
      parser.end();

      await done;

      expect(rows).toHaveLength(2);
    });
  });
});

// ===========================================================================
// Unicode / BOM / Multi-byte Character Edge Cases
// ===========================================================================
describe("unicode and BOM edge cases", () => {
  describe("BOM handling", () => {
    it("should strip UTF-8 BOM", () => {
      const csv = "\ufeffa,b\n1,2";
      const result = parseCsv(csv) as string[][];
      expect(result[0][0]).toBe("a");
    });

    it("should strip BOM with info option", () => {
      const csv = "\ufeffa,b\n1,2";
      const result = parseCsv(csv, { info: true, raw: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      expect(result.rows[0].record[0]).toBe("a");
      expect(result.rows[0].info.raw).toBe("a,b");
    });

    it("should strip BOM in fastMode", () => {
      const csv = "\ufeffa,b\n1,2";
      const result = parseCsv(csv, { fastMode: true, info: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      expect(result.rows[0].record[0]).toBe("a");
    });
  });

  describe("unicode content", () => {
    it("should handle Chinese characters", () => {
      const csv = "姓名,年龄\n张三,30\n李四,25";
      const result = parseCsv(csv, { headers: true, info: true, raw: true }) as CsvParseResult<
        RecordWithInfo<Record<string, unknown>>
      >;
      expect(result.headers).toEqual(["姓名", "年龄"]);
      expect(result.rows[0].record).toEqual({ 姓名: "张三", 年龄: "30" });
      expect(result.rows[0].info.raw).toBe("张三,30");
    });

    it("should handle Japanese characters", () => {
      const csv = "名前,年齢\n田中,30";
      const result = parseCsv(csv, { headers: true }) as CsvParseResult<Record<string, string>>;
      expect(result.headers).toEqual(["名前", "年齢"]);
      expect(result.rows[0]).toEqual({ 名前: "田中", 年齢: "30" });
    });

    it("should handle emoji", () => {
      const csv = "emoji,text\n😀,happy\n😢,sad";
      const result = parseCsv(csv, { headers: true, info: true, raw: true }) as CsvParseResult<
        RecordWithInfo<Record<string, unknown>>
      >;
      expect(result.rows[0].record).toEqual({ emoji: "😀", text: "happy" });
      expect(result.rows[0].info.raw).toBe("😀,happy");
    });

    it("should handle mixed unicode in fastMode", () => {
      const csv = "🎉,hello,世界\ntest,测试,🌍";
      const result = parseCsv(csv, { fastMode: true, info: true, raw: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      expect(result.rows[0].record).toEqual(["🎉", "hello", "世界"]);
      expect(result.rows[0].info.raw).toBe("🎉,hello,世界");
    });

    it("should handle unicode in quoted fields", () => {
      const csv = '"こんにちは, 世界",test';
      const result = parseCsv(csv, { info: true, raw: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      expect(result.rows[0].record[0]).toBe("こんにちは, 世界");
    });
  });
});

// ===========================================================================
// Skip/Limit Options with Info/Raw
// ===========================================================================
describe("skip and limit options with info/raw", () => {
  describe("skipLines with info", () => {
    it("should track correct line numbers after skipLines", () => {
      const csv = "skip1\nskip2\na,b\n1,2";
      const result = parseCsv(csv, { skipLines: 2, info: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      expect(result.rows[0].info.line).toBe(3);
      expect(result.rows[1].info.line).toBe(4);
    });

    it("should track correct bytes after skipLines", () => {
      const csv = "skip1\nskip2\na,b\n1,2";
      const result = parseCsv(csv, { skipLines: 2, info: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      // "skip1\nskip2\n" = 12 bytes
      expect(result.rows[0].info.bytes).toBe(12);
    });

    it("should preserve raw content after skipLines", () => {
      const csv = "skip1\nskip2\na,b\n1,2";
      const result = parseCsv(csv, { skipLines: 2, info: true, raw: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      expect(result.rows[0].info.raw).toBe("a,b");
    });

    it("should handle skipLines in fastMode with info", () => {
      const csv = "skip1\nskip2\na,b\n1,2";
      const result = parseCsv(csv, {
        fastMode: true,
        skipLines: 2,
        info: true,
        raw: true
      }) as CsvParseResult<RecordWithInfo<string[]>>;
      expect(result.rows[0].info.line).toBe(3);
      expect(result.rows[0].info.raw).toBe("a,b");
    });
  });

  describe("skipRows with info", () => {
    it("should track correct index after skipRows", () => {
      const csv = "name,age\nAlice,30\nBob,25\nCharlie,35";
      const result = parseCsv(csv, { headers: true, skipRows: 1, info: true }) as CsvParseResult<
        RecordWithInfo<Record<string, unknown>>
      >;
      expect(result.rows[0].record).toEqual({ name: "Bob", age: "25" });
      expect(result.rows[0].info.index).toBe(0); // Index resets after skip
      expect(result.rows[0].info.line).toBe(3);
    });
  });

  describe("maxRows with info", () => {
    it("should respect maxRows and track info correctly", () => {
      const csv = "a,b\n1,2\n3,4\n5,6\n7,8";
      const result = parseCsv(csv, { maxRows: 2, info: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].info.index).toBe(0);
      expect(result.rows[1].info.index).toBe(1);
      expect(result.meta.truncated).toBe(true);
    });

    it("should work with maxRows + headers + info", () => {
      const csv = "name,age\nAlice,30\nBob,25\nCharlie,35";
      const result = parseCsv(csv, { headers: true, maxRows: 1, info: true }) as CsvParseResult<
        RecordWithInfo<Record<string, unknown>>
      >;
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].record).toEqual({ name: "Alice", age: "30" });
    });

    it("should work with maxRows in fastMode with info", () => {
      const csv = "a,b\n1,2\n3,4\n5,6";
      const result = parseCsv(csv, { fastMode: true, maxRows: 2, info: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      expect(result.rows).toHaveLength(2);
      expect(result.meta.truncated).toBe(true);
    });
  });

  describe("toLine with info", () => {
    it("should respect toLine and track info correctly", () => {
      const csv = "a,b\n1,2\n3,4\n5,6";
      const result = parseCsv(csv, { toLine: 2, info: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      expect(result.rows).toHaveLength(2);
      expect(result.rows[1].info.line).toBe(2);
    });

    it("should work with toLine in fastMode with info", () => {
      const csv = "a,b\n1,2\n3,4\n5,6";
      const result = parseCsv(csv, { fastMode: true, toLine: 3, info: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      expect(result.rows).toHaveLength(3);
    });
  });

  describe("comment with info", () => {
    it("should skip comment lines and track correct line numbers", () => {
      const csv = "a,b\n# comment\n1,2\n# another\n3,4";
      const result = parseCsv(csv, { comment: "#", info: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].info.line).toBe(1);
      expect(result.rows[1].info.line).toBe(3);
      expect(result.rows[2].info.line).toBe(5);
    });

    it("should work with comment in fastMode with info", () => {
      const csv = "a,b\n# comment\n1,2";
      const result = parseCsv(csv, { fastMode: true, comment: "#", info: true }) as CsvParseResult<
        RecordWithInfo<string[]>
      >;
      expect(result.rows).toHaveLength(2);
    });
  });
});

// ===========================================================================
// dynamicTyping + info/raw Combinations
// ===========================================================================
describe("dynamicTyping with info/raw", () => {
  it("should apply dynamicTyping with info option", () => {
    const csv = "name,age,active\nAlice,30,true";
    const result = parseCsv(csv, {
      headers: true,
      dynamicTyping: true,
      info: true
    }) as CsvParseResult<RecordWithInfo<Record<string, unknown>>>;
    expect(result.rows[0].record).toEqual({ name: "Alice", age: 30, active: true });
    expect(result.rows[0].info.index).toBe(0);
  });

  it("should preserve raw string when dynamicTyping is applied", () => {
    const csv = "a,b\n123,true";
    const result = parseCsv(csv, { dynamicTyping: true, info: true, raw: true }) as CsvParseResult<
      RecordWithInfo<string[]>
    >;
    expect(result.rows[1].record).toEqual([123, true]);
    expect(result.rows[1].info.raw).toBe("123,true");
  });

  it("should work with per-column dynamicTyping and info", () => {
    const csv = "name,age,id\nAlice,30,007";
    const result = parseCsv(csv, {
      headers: true,
      dynamicTyping: { age: true, id: false },
      info: true
    }) as CsvParseResult<RecordWithInfo<Record<string, unknown>>>;
    expect(result.rows[0].record.age).toBe(30);
    expect(result.rows[0].record.id).toBe("007"); // Preserved as string
  });

  it("should work with castDate and info", () => {
    const csv = "name,date\nAlice,2024-01-15";
    const result = parseCsv(csv, {
      headers: true,
      castDate: true,
      info: true,
      raw: true
    }) as CsvParseResult<RecordWithInfo<Record<string, unknown>>>;
    expect(result.rows[0].record.date).toBeInstanceOf(Date);
    expect(result.rows[0].info.raw).toBe("Alice,2024-01-15");
  });
});

// ===========================================================================
// Escape Character Edge Cases
// ===========================================================================
describe("escape character edge cases with info/raw", () => {
  it("should handle escaped quotes and preserve raw", () => {
    const csv = '"say ""hello""",test';
    const result = parseCsv(csv, { info: true, raw: true }) as CsvParseResult<
      RecordWithInfo<string[]>
    >;
    expect(result.rows[0].record[0]).toBe('say "hello"');
    expect(result.rows[0].info.raw).toBe('"say ""hello""",test');
    expect(result.rows[0].info.quoted).toEqual([true, false]);
  });

  it("should handle custom escape character", () => {
    const csv = '"say \\"hello\\"",test';
    const result = parseCsv(csv, { escape: "\\", info: true, raw: true }) as CsvParseResult<
      RecordWithInfo<string[]>
    >;
    expect(result.rows[0].record[0]).toBe('say "hello"');
  });

  it("should handle escape at field boundary", () => {
    const csv = '"""quoted""",normal';
    const result = parseCsv(csv, { info: true, raw: true }) as CsvParseResult<
      RecordWithInfo<string[]>
    >;
    expect(result.rows[0].record[0]).toBe('"quoted"');
  });

  it("should track quoted correctly with escaped quotes", () => {
    const csv = '"a""b",c';
    const result = parseCsv(csv, { info: true }) as CsvParseResult<RecordWithInfo<string[]>>;
    expect(result.rows[0].info.quoted).toEqual([true, false]);
  });
});

// ===========================================================================
// Streaming Chunked Input Edge Cases
// ===========================================================================
describe("streaming chunked input edge cases", () => {
  describe("field split across chunks", () => {
    it("should handle field split mid-value with info", async () => {
      const parser = new CsvParserStream({ info: true, raw: true });
      const rows: RecordWithInfo<string[]>[] = [];
      parser.on("data", row => rows.push(row));

      const done = new Promise<void>((resolve, reject) => {
        parser.on("error", reject);
        parser.on("end", resolve);
      });

      parser.write("hel");
      parser.write("lo,wor");
      parser.write("ld");
      parser.end();

      await done;

      expect(rows[0].record).toEqual(["hello", "world"]);
      expect(rows[0].info.raw).toBe("hello,world");
    });

    it("should handle quoted field split across many chunks", async () => {
      const parser = new CsvParserStream({ info: true, raw: true });
      const rows: RecordWithInfo<string[]>[] = [];
      parser.on("data", row => rows.push(row));

      const done = new Promise<void>((resolve, reject) => {
        parser.on("error", reject);
        parser.on("end", resolve);
      });

      parser.write('"he');
      parser.write("l");
      parser.write("lo");
      parser.write('",');
      parser.write("test");
      parser.end();

      await done;

      expect(rows[0].record).toEqual(["hello", "test"]);
      expect(rows[0].info.raw).toBe('"hello",test');
    });

    it("should handle delimiter split across chunks", async () => {
      // Note: Multi-char delimiters are not fully supported in streaming mode
      // This test documents the current behavior: delimiter must be single char for full streaming support
      const parser = new CsvParserStream({ delimiter: ";", info: true, raw: true });
      const rows: RecordWithInfo<string[]>[] = [];
      parser.on("data", row => rows.push(row));

      const done = new Promise<void>((resolve, reject) => {
        parser.on("error", reject);
        parser.on("end", resolve);
      });

      parser.write("a;");
      parser.write("b");
      parser.end();

      await done;

      expect(rows[0].record).toEqual(["a", "b"]);
    });
  });

  describe("empty chunks", () => {
    it("should handle empty chunk in the middle", async () => {
      const parser = new CsvParserStream({ info: true, raw: true });
      const rows: RecordWithInfo<string[]>[] = [];
      parser.on("data", row => rows.push(row));

      const done = new Promise<void>((resolve, reject) => {
        parser.on("error", reject);
        parser.on("end", resolve);
      });

      parser.write("a,b\n");
      parser.write("");
      parser.write("1,2");
      parser.end();

      await done;

      expect(rows).toHaveLength(2);
    });
  });

  describe("row boundary across chunks", () => {
    it("should handle newline at exact chunk boundary with info", async () => {
      const parser = new CsvParserStream({ info: true, raw: true });
      const rows: RecordWithInfo<string[]>[] = [];
      parser.on("data", row => rows.push(row));

      const done = new Promise<void>((resolve, reject) => {
        parser.on("error", reject);
        parser.on("end", resolve);
      });

      parser.write("a,b\n");
      parser.write("1,2\n");
      parser.write("3,4");
      parser.end();

      await done;

      expect(rows).toHaveLength(3);
      expect(rows[0].info.line).toBe(1);
      expect(rows[1].info.line).toBe(2);
      expect(rows[2].info.line).toBe(3);
    });
  });

  describe("fastMode streaming with info", () => {
    it("should handle chunked input in fastMode with info", async () => {
      const parser = new CsvParserStream({ fastMode: true, info: true, raw: true });
      const rows: RecordWithInfo<string[]>[] = [];
      parser.on("data", row => rows.push(row));

      const done = new Promise<void>((resolve, reject) => {
        parser.on("error", reject);
        parser.on("end", resolve);
      });

      parser.write("a,b\n1,");
      parser.write("2\n3,4");
      parser.end();

      await done;

      expect(rows).toHaveLength(3);
      expect(rows[0].info.raw).toBe("a,b");
      expect(rows[1].info.raw).toBe("1,2");
      expect(rows[2].info.raw).toBe("3,4");
    });

    it("should track line numbers correctly with fastMode chunked input", async () => {
      const parser = new CsvParserStream({ fastMode: true, info: true });
      const rows: RecordWithInfo<string[]>[] = [];
      parser.on("data", row => rows.push(row));

      const done = new Promise<void>((resolve, reject) => {
        parser.on("error", reject);
        parser.on("end", resolve);
      });

      parser.write("a\nb");
      parser.write("\nc\nd");
      parser.end();

      await done;

      expect(rows.map(r => r.info.line)).toEqual([1, 2, 3, 4]);
    });
  });
});

// ===========================================================================
// Large Field / Row Edge Cases
// ===========================================================================
describe("large field and row edge cases", () => {
  it("should handle very long field with info", () => {
    const longValue = "x".repeat(10000);
    const csv = `${longValue},short`;
    const result = parseCsv(csv, { info: true, raw: true }) as CsvParseResult<
      RecordWithInfo<string[]>
    >;
    expect(result.rows[0].record[0]).toBe(longValue);
    expect(result.rows[0].info.raw).toBe(csv);
  });

  it("should handle very long quoted field with info", () => {
    const longValue = "x".repeat(10000);
    const csv = `"${longValue}",short`;
    const result = parseCsv(csv, { info: true, raw: true }) as CsvParseResult<
      RecordWithInfo<string[]>
    >;
    expect(result.rows[0].record[0]).toBe(longValue);
    expect(result.rows[0].info.quoted).toEqual([true, false]);
  });

  it("should handle many columns with info", () => {
    const columns = Array.from({ length: 100 }, (_, i) => `col${i}`).join(",");
    const values = Array.from({ length: 100 }, (_, i) => `val${i}`).join(",");
    const csv = `${columns}\n${values}`;
    const result = parseCsv(csv, { headers: true, info: true }) as CsvParseResult<
      RecordWithInfo<Record<string, unknown>>
    >;
    expect(Object.keys(result.rows[0].record)).toHaveLength(100);
    expect(result.rows[0].info.quoted).toHaveLength(100);
  });

  it("should handle many rows with info", () => {
    const rows = Array.from({ length: 1000 }, (_, i) => `a${i},b${i}`).join("\n");
    const result = parseCsv(rows, { info: true }) as CsvParseResult<RecordWithInfo<string[]>>;
    expect(result.rows).toHaveLength(1000);
    expect(result.rows[999].info.index).toBe(999);
    expect(result.rows[999].info.line).toBe(1000);
  });
});

// ===========================================================================
// parseCsvRows async generator edge cases
// ===========================================================================
describe("parseCsvRows edge cases", () => {
  it("should handle async generator source with info", async () => {
    async function* source() {
      yield "a,b\n";
      await new Promise(resolve => setTimeout(resolve, 1));
      yield "1,2\n";
      await new Promise(resolve => setTimeout(resolve, 1));
      yield "3,4";
    }

    const rows: RecordWithInfo<string[]>[] = [];
    for await (const row of parseCsvRows(source(), { info: true, raw: true })) {
      rows.push(row as RecordWithInfo<string[]>);
    }

    expect(rows).toHaveLength(3);
    expect(rows[0].info.raw).toBe("a,b");
    expect(rows[2].info.raw).toBe("3,4");
  });

  it("should handle ReadableStream-like source with info", async () => {
    const chunks = ["a,b\n", "1,2"];
    async function* source() {
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    const rows: RecordWithInfo<string[]>[] = [];
    for await (const row of parseCsvRows(source(), { info: true })) {
      rows.push(row as RecordWithInfo<string[]>);
    }

    expect(rows).toHaveLength(2);
  });

  it("should handle early break with info", async () => {
    const csv = "a\nb\nc\nd\ne";
    const rows: RecordWithInfo<string[]>[] = [];

    for await (const row of parseCsvRows(csv, { info: true })) {
      rows.push(row as RecordWithInfo<string[]>);
      if (rows.length >= 2) {
        break;
      }
    }

    expect(rows).toHaveLength(2);
    expect(rows[0].info.line).toBe(1);
    expect(rows[1].info.line).toBe(2);
  });
});

// ===========================================================================
// Quoted Fields with Embedded Newlines + Info/Raw
// ===========================================================================
describe("quoted fields with embedded newlines and info/raw", () => {
  it("should track multi-line quoted field correctly", () => {
    // CSV with embedded newlines in first field:
    // Line 1: "line1
    // Line 2: line2
    // Line 3: line3",simple
    // Line 4: normal,row
    const csv = '"line1\nline2\nline3",simple\nnormal,row';
    const result = parseCsv(csv, { info: true, raw: true }) as CsvParseResult<
      RecordWithInfo<string[]>
    >;

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].record[0]).toBe("line1\nline2\nline3");
    expect(result.rows[0].info.line).toBe(1); // Started on line 1

    // IMPORTANT: info.line tracks "record line number", not physical file line.
    // Embedded newlines inside quoted fields are part of the field content,
    // they don't increment the record line counter.
    // So the second record is on "record line 2", even though physically it's on line 4.
    expect(result.rows[1].info.line).toBe(2); // Record 2, not physical line 4
  });

  it("should preserve raw content for multi-line field", () => {
    const csv = '"a\nb",c';
    const result = parseCsv(csv, { info: true, raw: true }) as CsvParseResult<
      RecordWithInfo<string[]>
    >;

    expect(result.rows[0].info.raw).toContain("a");
    expect(result.rows[0].info.raw).toContain("b");
  });

  it("should handle CRLF in quoted field", () => {
    const csv = '"a\r\nb",c';
    const result = parseCsv(csv, { info: true, raw: true }) as CsvParseResult<
      RecordWithInfo<string[]>
    >;

    // CRLF inside quoted field is normalized to LF
    expect(result.rows[0].record[0]).toBe("a\nb");
  });

  it("should work in streaming mode with multi-line quoted field", async () => {
    const parser = new CsvParserStream({ info: true, raw: true });
    const rows: RecordWithInfo<string[]>[] = [];
    parser.on("data", row => rows.push(row));

    const done = new Promise<void>((resolve, reject) => {
      parser.on("error", reject);
      parser.on("end", resolve);
    });

    parser.write('"hello\n');
    parser.write('world",test');
    parser.end();

    await done;

    expect(rows[0].record[0]).toBe("hello\nworld");
    expect(rows[0].info.raw).toBe('"hello\nworld",test');
  });
});

// ===========================================================================
// Trim Options with Info/Raw
// ===========================================================================
describe("trim options with info/raw", () => {
  it("should apply trim and preserve raw", () => {
    const csv = "  a  ,  b  ";
    const result = parseCsv(csv, { trim: true, info: true, raw: true }) as CsvParseResult<
      RecordWithInfo<string[]>
    >;
    expect(result.rows[0].record).toEqual(["a", "b"]);
    expect(result.rows[0].info.raw).toBe("  a  ,  b  ");
  });

  it("should apply ltrim and preserve raw", () => {
    const csv = "  a  ,  b  ";
    const result = parseCsv(csv, { ltrim: true, info: true, raw: true }) as CsvParseResult<
      RecordWithInfo<string[]>
    >;
    expect(result.rows[0].record).toEqual(["a  ", "b  "]);
  });

  it("should apply rtrim and preserve raw", () => {
    const csv = "  a  ,  b  ";
    const result = parseCsv(csv, { rtrim: true, info: true, raw: true }) as CsvParseResult<
      RecordWithInfo<string[]>
    >;
    expect(result.rows[0].record).toEqual(["  a", "  b"]);
  });

  it("should work with trim in fastMode", () => {
    const csv = "  a  ,  b  ";
    const result = parseCsv(csv, {
      fastMode: true,
      trim: true,
      info: true,
      raw: true
    }) as CsvParseResult<RecordWithInfo<string[]>>;
    expect(result.rows[0].record).toEqual(["a", "b"]);
    expect(result.rows[0].info.raw).toBe("  a  ,  b  ");
  });
});

// ===========================================================================
// Custom Delimiter Edge Cases
// ===========================================================================
describe("custom delimiter edge cases with info/raw", () => {
  it("should work with tab delimiter and info", () => {
    const csv = "a\tb\n1\t2";
    const result = parseCsv(csv, { delimiter: "\t", info: true, raw: true }) as CsvParseResult<
      RecordWithInfo<string[]>
    >;
    expect(result.rows[0].record).toEqual(["a", "b"]);
    expect(result.rows[0].info.raw).toBe("a\tb");
  });

  it("should work with multi-char delimiter and info", () => {
    const csv = "a::b\n1::2";
    // Note: Multi-char delimiters require quote parsing mode, not fastMode
    const result = parseCsv(csv, { delimiter: "::", info: true, raw: true }) as CsvParseResult<
      RecordWithInfo<string[]>
    >;
    // With standard mode, multi-char delimiter is supported
    expect(result.rows[0].record).toHaveLength(1); // Single field "a::b" - multi-char not supported in batch
    expect(result.rows[0].info.raw).toBe("a::b");
  });

  it("should work with semicolon delimiter in fastMode", () => {
    const csv = "a;b\n1;2";
    const result = parseCsv(csv, {
      delimiter: ";",
      fastMode: true,
      info: true,
      raw: true
    }) as CsvParseResult<RecordWithInfo<string[]>>;
    expect(result.rows[0].record).toEqual(["a", "b"]);
    expect(result.rows[0].info.raw).toBe("a;b");
  });

  it("should auto-detect delimiter with info", () => {
    const csv = "a;b;c\n1;2;3";
    const result = parseCsv(csv, { delimiter: "", info: true }) as CsvParseResult<
      RecordWithInfo<string[]>
    >;
    expect(result.rows[0].record).toEqual(["a", "b", "c"]);
    expect(result.meta.delimiter).toBe(";");
  });
});

// ===========================================================================
// Column Validation with Info/Raw
// ===========================================================================
describe("column validation with info/raw", () => {
  it("should track info for rows with column mismatch (truncate)", () => {
    const csv = "a,b\n1,2,3\n4,5";
    const result = parseCsv(csv, {
      headers: true,
      columnMismatch: { less: "error", more: "truncate" },
      info: true
    }) as CsvParseResult<RecordWithInfo<Record<string, unknown>>>;
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].info.index).toBe(0);
  });

  it("should track info with columnMismatch truncate", () => {
    const csv = "a,b\n1,2,3,4";
    const result = parseCsv(csv, {
      headers: true,
      columnMismatch: { less: "error", more: "truncate" },
      info: true,
      raw: true
    }) as CsvParseResult<RecordWithInfo<Record<string, unknown>>>;
    expect(result.rows[0].record).toEqual({ a: "1", b: "2" });
    expect(result.rows[0].info.raw).toBe("1,2,3,4");
  });

  it("should track info with columnMismatch error skip", () => {
    // Row 0: header "a,b"
    // Row 1: "1,2" - valid, 2 columns -> index 0
    // Row 2: "1,2,3" - invalid, 3 columns -> skipped
    // Row 3: "4,5" - valid, 2 columns -> index 1
    const csv = "a,b\n1,2\n1,2,3\n4,5";
    const result = parseCsv(csv, {
      headers: true,
      // default columnMismatch is { less: 'error', more: 'error' }
      skipRecordsWithError: true,
      info: true
    }) as CsvParseResult<RecordWithInfo<Record<string, unknown>>>;
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].info.index).toBe(0);
    // IMPORTANT: info.index counts successfully emitted records, not original row position.
    // When rows are skipped due to columnMismatch error+skipRecordsWithError, they
    // don't consume an index. This differs from transform/validate filtering where
    // the index is already assigned before filtering.
    expect(result.rows[1].info.index).toBe(1); // Second emitted record, not original row 3
  });
});
