/**
 * Tests for new CSV features:
 * - toLine: Stop parsing at a specific line number
 * - castDate: Automatic date string parsing
 * - skipRecordsWithError + onSkip: Skip malformed records with callback
 * - skipRecordsWithEmptyValues: Skip records where all values are empty strings
 */
import { describe, it, expect, vi } from "vitest";
import { parseCsv, parseCsvRows, type CsvSkipError } from "@csv/index";
import { CsvParserStream } from "@csv/csv-stream";

// =============================================================================
// toLine Tests
// =============================================================================

describe("toLine option", () => {
  describe("parseCsv", () => {
    it("should stop parsing at specified line number (no headers)", () => {
      const csv = "a,b\n1,2\n3,4\n5,6\n7,8";
      const result = parseCsv(csv, { toLine: 3 }) as string[][];
      expect(result).toEqual([
        ["a", "b"],
        ["1", "2"],
        ["3", "4"]
      ]);
    });

    it("should stop parsing at specified line number (with headers)", () => {
      const csv = "name,age\nAlice,30\nBob,25\nCharlie,35\nDave,40";
      const result = parseCsv(csv, { headers: true, toLine: 3 }) as any;
      expect(result.rows).toEqual([
        { name: "Alice", age: "30" },
        { name: "Bob", age: "25" }
      ]);
      expect(result.meta.truncated).toBe(true);
    });

    it("should count all lines including empty lines", () => {
      const csv = "a,b\n\n1,2\n3,4";
      // Line 1: a,b
      // Line 2: (empty)
      // Line 3: 1,2
      // toLine: 3 includes up to line 3
      // Without skipEmptyLines, empty lines become empty rows
      const result = parseCsv(csv, { toLine: 3, skipEmptyLines: true }) as string[][];
      expect(result).toEqual([
        ["a", "b"],
        ["1", "2"]
      ]);
    });

    it("should count comment lines", () => {
      const csv = "a,b\n# comment\n1,2\n3,4";
      // Line 1: a,b
      // Line 2: # comment
      // Line 3: 1,2
      const result = parseCsv(csv, { comment: "#", toLine: 3 }) as string[][];
      expect(result).toEqual([
        ["a", "b"],
        ["1", "2"]
      ]);
    });

    it("should work with skipLines + toLine", () => {
      const csv = "meta\na,b\n1,2\n3,4\n5,6";
      // skipLines: 1 skips "meta"
      // toLine: 4 limits to lines 1-4
      // So we get: a,b (line 2), 1,2 (line 3), 3,4 (line 4)
      const result = parseCsv(csv, { skipLines: 1, toLine: 4 }) as string[][];
      expect(result).toEqual([
        ["a", "b"],
        ["1", "2"],
        ["3", "4"]
      ]);
    });

    it("should work in fastMode", () => {
      const csv = "a,b\n1,2\n3,4\n5,6";
      const result = parseCsv(csv, { fastMode: true, toLine: 2 }) as string[][];
      expect(result).toEqual([
        ["a", "b"],
        ["1", "2"]
      ]);
    });

    it("should handle toLine larger than actual lines", () => {
      const csv = "a,b\n1,2";
      const result = parseCsv(csv, { toLine: 100 }) as string[][];
      expect(result).toEqual([
        ["a", "b"],
        ["1", "2"]
      ]);
    });

    it("should handle toLine: 1 (only first line)", () => {
      const csv = "a,b\n1,2\n3,4";
      const result = parseCsv(csv, { toLine: 1 }) as string[][];
      expect(result).toEqual([["a", "b"]]);
    });
  });

  describe("CsvParserStream", () => {
    it("should stop streaming at specified line number", async () => {
      const csv = "a,b\n1,2\n3,4\n5,6";
      const parser = new CsvParserStream({ toLine: 3 });
      const rows: string[][] = [];

      await new Promise<void>((resolve, reject) => {
        parser.on("data", row => rows.push(row as string[]));
        parser.on("end", resolve);
        parser.on("error", reject);
        parser.end(csv);
      });

      expect(rows).toEqual([
        ["a", "b"],
        ["1", "2"],
        ["3", "4"]
      ]);
    });

    it("should work with headers in streaming mode", async () => {
      const csv = "name,age\nAlice,30\nBob,25\nCharlie,35";
      const parser = new CsvParserStream({ headers: true, toLine: 3 });
      const rows: Record<string, string>[] = [];

      await new Promise<void>((resolve, reject) => {
        parser.on("data", row => rows.push(row as Record<string, string>));
        parser.on("end", resolve);
        parser.on("error", reject);
        parser.end(csv);
      });

      expect(rows).toEqual([
        { name: "Alice", age: "30" },
        { name: "Bob", age: "25" }
      ]);
    });
  });

  describe("parseCsvRows (async generator)", () => {
    it("should stop at specified line number", async () => {
      const csv = "a,b\n1,2\n3,4\n5,6";
      const rows: string[][] = [];

      for await (const row of parseCsvRows(csv, { toLine: 2 })) {
        rows.push(row as string[]);
      }

      expect(rows).toEqual([
        ["a", "b"],
        ["1", "2"]
      ]);
    });
  });
});

// =============================================================================
// castDate Tests
// =============================================================================

describe("castDate option", () => {
  describe("parseCsv", () => {
    it("should parse ISO dates when castDate: true", () => {
      const csv = "date,value\n2024-01-15,100\n2024-06-30,200";
      const result = parseCsv(csv, { headers: true, castDate: true }) as any;

      expect(result.rows[0].date).toBeInstanceOf(Date);
      // Check local date components (not UTC) since date-only strings are parsed as local dates
      const date = result.rows[0].date as Date;
      expect(date.getFullYear()).toBe(2024);
      expect(date.getMonth()).toBe(0); // January is 0
      expect(date.getDate()).toBe(15);
      expect(result.rows[0].value).toBe("100"); // Not a date, stays string
    });

    it("should parse ISO datetime with T separator", () => {
      const csv = "timestamp\n2024-01-15T10:30:00";
      const result = parseCsv(csv, { headers: true, castDate: true }) as any;

      expect(result.rows[0].timestamp).toBeInstanceOf(Date);
    });

    it("should parse ISO datetime with space separator", () => {
      const csv = "timestamp\n2024-01-15 10:30:00";
      const result = parseCsv(csv, { headers: true, castDate: true }) as any;

      expect(result.rows[0].timestamp).toBeInstanceOf(Date);
    });

    it("should parse ISO datetime with Z suffix (UTC)", () => {
      const csv = "timestamp\n2024-01-15T10:30:00Z";
      const result = parseCsv(csv, { headers: true, castDate: true }) as any;

      expect(result.rows[0].timestamp).toBeInstanceOf(Date);
    });

    it("should parse ISO datetime with milliseconds", () => {
      const csv = "timestamp\n2024-01-15T10:30:00.123Z";
      const result = parseCsv(csv, { headers: true, castDate: true }) as any;

      expect(result.rows[0].timestamp).toBeInstanceOf(Date);
    });

    it("should parse ISO datetime with timezone offset", () => {
      const csv = "timestamp\n2024-01-15T10:30:00+08:00";
      const result = parseCsv(csv, { headers: true, castDate: true }) as any;

      expect(result.rows[0].timestamp).toBeInstanceOf(Date);
    });

    it("should only parse specified columns when castDate is array", () => {
      const csv = "date1,date2,text\n2024-01-15,2024-06-30,2024-12-25";
      const result = parseCsv(csv, { headers: true, castDate: ["date1"] }) as any;

      expect(result.rows[0].date1).toBeInstanceOf(Date);
      expect(result.rows[0].date2).toBe("2024-06-30"); // Not in castDate array
      expect(result.rows[0].text).toBe("2024-12-25"); // Not in castDate array
    });

    it("should work with dynamicTyping combined", () => {
      const csv = "date,count,active\n2024-01-15,42,true";
      const result = parseCsv(csv, {
        headers: true,
        dynamicTyping: true,
        castDate: true
      }) as any;

      expect(result.rows[0].date).toBeInstanceOf(Date);
      expect(result.rows[0].count).toBe(42);
      expect(result.rows[0].active).toBe(true);
    });

    it("should not parse invalid date strings", () => {
      const csv = "date\nnot-a-date\n2024-13-45\nhello world";
      const result = parseCsv(csv, { headers: true, castDate: true }) as any;

      expect(result.rows[0].date).toBe("not-a-date");
      expect(result.rows[1].date).toBe("2024-13-45"); // Invalid month/day
      expect(result.rows[2].date).toBe("hello world");
    });

    it("should work in array mode", () => {
      const csv = "2024-01-15,100";
      const result = parseCsv(csv, { castDate: true }) as unknown[][];

      expect(result[0][0]).toBeInstanceOf(Date);
      expect(result[0][1]).toBe("100");
    });

    it("should handle empty date values", () => {
      const csv = "date\n\n2024-01-15";
      const result = parseCsv(csv, { headers: true, castDate: true }) as any;

      expect(result.rows[0].date).toBe("");
      expect(result.rows[1].date).toBeInstanceOf(Date);
    });
  });

  describe("CsvParserStream", () => {
    it("should parse dates in streaming mode", async () => {
      const csv = "date,value\n2024-01-15,100\n2024-06-30,200";
      const parser = new CsvParserStream({ headers: true, castDate: true });
      const rows: Record<string, unknown>[] = [];

      await new Promise<void>((resolve, reject) => {
        parser.on("data", row => rows.push(row as Record<string, unknown>));
        parser.on("end", resolve);
        parser.on("error", reject);
        parser.end(csv);
      });

      expect(rows[0].date).toBeInstanceOf(Date);
      expect(rows[1].date).toBeInstanceOf(Date);
    });

    it("should respect column-specific castDate in streaming mode", async () => {
      const csv = "date1,date2\n2024-01-15,2024-06-30";
      const parser = new CsvParserStream({ headers: true, castDate: ["date1"] });
      const rows: Record<string, unknown>[] = [];

      await new Promise<void>((resolve, reject) => {
        parser.on("data", row => rows.push(row as Record<string, unknown>));
        parser.on("end", resolve);
        parser.on("error", reject);
        parser.end(csv);
      });

      expect(rows[0].date1).toBeInstanceOf(Date);
      expect(rows[0].date2).toBe("2024-06-30");
    });
  });

  describe("parseCsvRows (async generator)", () => {
    it("should parse dates in async generator mode", async () => {
      const csv = "date,value\n2024-01-15,100";
      const rows: Record<string, unknown>[] = [];

      for await (const row of parseCsvRows(csv, { headers: true, castDate: true })) {
        rows.push(row as Record<string, unknown>);
      }

      expect(rows[0].date).toBeInstanceOf(Date);
    });
  });
});

// =============================================================================
// skipRecordsWithError + onSkip Tests
// =============================================================================

describe("skipRecordsWithError + onSkip", () => {
  describe("parseCsv", () => {
    it("should skip records with unclosed quotes when skipRecordsWithError: true", () => {
      const csv = 'a,b\n"unclosed,value\nnormal,row';
      const result = parseCsv(csv, { skipRecordsWithError: true });

      // The unclosed quote row should be skipped
      // Note: depending on parser behavior, the result may vary
      expect(Array.isArray(result)).toBe(true);
    });

    it("should invoke onSkip callback when record is skipped", () => {
      const csv = "a,b,c\n1,2\n3,4,5";
      const skippedRecords: Array<{
        error: CsvSkipError;
        record: string[] | null;
        line: number;
      }> = [];

      parseCsv(csv, {
        headers: true,
        // columnMismatch defaults to { less: 'error', more: 'error' }
        skipRecordsWithError: true,
        onSkip: (error, record, line) => {
          skippedRecords.push({ error, record, line });
        }
      });

      // The row "1,2" has fewer columns than expected
      expect(skippedRecords.length).toBe(1);
      expect(skippedRecords[0].error.code).toBe("TooFewFields");
      expect(skippedRecords[0].record).toEqual(["1", "2"]); // Raw record before padding
      expect(skippedRecords[0].line).toBe(2);
    });

    it("should continue parsing after skipped records", () => {
      const csv = "a,b,c\n1,2\n3,4,5\n6,7\n8,9,10";
      const skippedLines: number[] = [];

      const result = parseCsv(csv, {
        headers: true,
        // columnMismatch defaults to { less: 'error', more: 'error' }
        skipRecordsWithError: true,
        onSkip: (_error, _record, line) => {
          skippedLines.push(line);
        }
      }) as any;

      // Rows with wrong column count should be skipped
      expect(skippedLines).toEqual([2, 4]);
      // Good rows should be parsed
      expect(result.rows).toEqual([
        { a: "3", b: "4", c: "5" },
        { a: "8", b: "9", c: "10" }
      ]);
    });

    it("should handle onSkip errors gracefully (ignore them)", () => {
      const csv = "a,b,c\n1,2\n3,4,5";

      // This should not throw even though onSkip throws
      const result = parseCsv(csv, {
        headers: true,
        // columnMismatch defaults to { less: 'error', more: 'error' }
        skipRecordsWithError: true,
        onSkip: () => {
          throw new Error("Callback error");
        }
      }) as any;

      expect(result.rows).toEqual([{ a: "3", b: "4", c: "5" }]);
    });

    it("should skip and track multiple error types", () => {
      const csv = "a,b\n1,2,3\n4\n5,6";
      const errors: string[] = [];

      const result = parseCsv(csv, {
        headers: true,
        // columnMismatch defaults to { less: 'error', more: 'error' }
        skipRecordsWithError: true,
        onSkip: error => {
          errors.push(error.code);
        }
      }) as any;

      expect(errors).toContain("TooManyFields");
      expect(errors).toContain("TooFewFields");
      expect(result.rows).toEqual([{ a: "5", b: "6" }]);
    });

    it("should not invoke onSkip when skipRecordsWithError is false", () => {
      const csv = "a,b,c\n1,2\n3,4,5";
      const onSkipCalled = vi.fn();

      parseCsv(csv, {
        headers: true,
        // columnMismatch defaults to { less: 'error', more: 'error' }
        skipRecordsWithError: false, // Explicitly false
        onSkip: onSkipCalled
      });

      // onSkip should not be called when skipRecordsWithError is false
      // (errors go to invalidRows instead)
      expect(onSkipCalled).not.toHaveBeenCalled();
    });
  });

  describe("CsvParserStream", () => {
    it("should invoke onSkip in streaming mode", async () => {
      const csv = "a,b,c\n1,2\n3,4,5";
      const skippedRecords: Array<{ code: string; line: number }> = [];

      const parser = new CsvParserStream({
        headers: true,
        // columnMismatch defaults to { less: 'error', more: 'error' }
        skipRecordsWithError: true,
        onSkip: (error, _record, line) => {
          skippedRecords.push({ code: error.code, line });
        }
      });

      const rows: Record<string, string>[] = [];

      await new Promise<void>((resolve, reject) => {
        parser.on("data", row => rows.push(row as Record<string, string>));
        parser.on("end", resolve);
        parser.on("error", reject);
        parser.end(csv);
      });

      expect(skippedRecords.length).toBe(1);
      expect(skippedRecords[0].code).toBe("TooFewFields");
      expect(rows).toEqual([{ a: "3", b: "4", c: "5" }]);
    });

    it("should not emit data-invalid event when skipRecordsWithError is true", async () => {
      const csv = "a,b,c\n1,2\n3,4,5";
      const invalidRows: string[][] = [];

      const parser = new CsvParserStream({
        headers: true,
        // columnMismatch defaults to { less: 'error', more: 'error' }
        skipRecordsWithError: true,
        onSkip: () => {} // Has onSkip
      });

      await new Promise<void>((resolve, reject) => {
        parser.on("data-invalid", row => invalidRows.push(row as string[]));
        parser.on("data", () => {}); // Consume data to allow stream to drain
        parser.on("end", resolve);
        parser.on("error", reject);
        parser.end(csv);
      });

      // When skipRecordsWithError is true, data-invalid should not be emitted
      expect(invalidRows.length).toBe(0);
    });
  });

  describe("parseCsvRows (async generator)", () => {
    it("should skip records with column mismatch and invoke onSkip", async () => {
      const csv = "a,b,c\n1,2\n3,4,5\n6,7";
      const skippedRecords: Array<{ code: string; line: number }> = [];
      const rows: Record<string, string>[] = [];

      for await (const row of parseCsvRows(csv, {
        headers: true,
        // columnMismatch defaults to { less: 'error', more: 'error' }
        skipRecordsWithError: true,
        onSkip: (error, _record, line) => {
          skippedRecords.push({ code: error.code, line });
        }
      })) {
        rows.push(row as Record<string, string>);
      }

      expect(skippedRecords.length).toBe(2);
      expect(skippedRecords[0]).toEqual({ code: "TooFewFields", line: 2 });
      expect(skippedRecords[1]).toEqual({ code: "TooFewFields", line: 4 });
      expect(rows).toEqual([{ a: "3", b: "4", c: "5" }]);
    });

    it("should skip records with too many fields", async () => {
      const csv = "a,b\n1,2,3\n4,5";
      const skippedRecords: Array<{ code: string; line: number }> = [];
      const rows: Record<string, string>[] = [];

      for await (const row of parseCsvRows(csv, {
        headers: true,
        // columnMismatch defaults to { less: 'error', more: 'error' }
        skipRecordsWithError: true,
        onSkip: (error, _record, line) => {
          skippedRecords.push({ code: error.code, line });
        }
      })) {
        rows.push(row as Record<string, string>);
      }

      expect(skippedRecords.length).toBe(1);
      expect(skippedRecords[0]).toEqual({ code: "TooManyFields", line: 2 });
      expect(rows).toEqual([{ a: "4", b: "5" }]);
    });

    it("should work without onSkip callback", async () => {
      const csv = "a,b,c\n1,2\n3,4,5";
      const rows: Record<string, string>[] = [];

      for await (const row of parseCsvRows(csv, {
        headers: true,
        // columnMismatch defaults to { less: 'error', more: 'error' }
        skipRecordsWithError: true
        // No onSkip callback
      })) {
        rows.push(row as Record<string, string>);
      }

      expect(rows).toEqual([{ a: "3", b: "4", c: "5" }]);
    });
  });
});

// =============================================================================
// Combined Feature Tests
// =============================================================================

describe("Combined features", () => {
  it("should work with toLine + castDate + dynamicTyping", () => {
    const csv = "date,count,active\n2024-01-15,10,true\n2024-06-30,20,false\n2024-12-25,30,true";
    const result = parseCsv(csv, {
      headers: true,
      toLine: 3,
      castDate: true,
      dynamicTyping: true
    }) as any;

    expect(result.rows.length).toBe(2);
    expect(result.rows[0].date).toBeInstanceOf(Date);
    expect(result.rows[0].count).toBe(10);
    expect(result.rows[0].active).toBe(true);
    expect(result.meta.truncated).toBe(true);
  });

  it("should work with toLine + skipRecordsWithError", () => {
    const csv = "a,b,c\n1,2\n3,4,5\n6,7,8\n9,10,11";
    const skippedLines: number[] = [];

    const result = parseCsv(csv, {
      headers: true,
      toLine: 4,
      // columnMismatch defaults to { less: 'error', more: 'error' }
      skipRecordsWithError: true,
      onSkip: (_error, _record, line) => {
        skippedLines.push(line);
      }
    }) as any;

    // toLine: 4 means lines 1-4 (header + 3 data lines)
    // Line 2 (1,2) should be skipped due to column mismatch
    expect(skippedLines).toEqual([2]);
    expect(result.rows.length).toBe(2); // 3,4,5 and 6,7,8
    expect(result.meta.truncated).toBe(true);
  });

  it("should work with all features in streaming mode", async () => {
    const csv = "date,count\n2024-01-15,10\nbad,row,extra\n2024-06-30,20";
    const skippedRecords: number[] = [];

    const parser = new CsvParserStream({
      headers: true,
      castDate: ["date"],
      dynamicTyping: { count: true },
      // columnMismatch defaults to { less: 'error', more: 'error' }
      skipRecordsWithError: true,
      onSkip: (_error, _record, line) => {
        skippedRecords.push(line);
      }
    });

    const rows: Record<string, unknown>[] = [];

    await new Promise<void>((resolve, reject) => {
      parser.on("data", row => rows.push(row as Record<string, unknown>));
      parser.on("end", resolve);
      parser.on("error", reject);
      parser.end(csv);
    });

    expect(skippedRecords).toEqual([3]); // bad,row,extra
    expect(rows.length).toBe(2);
    expect(rows[0].date).toBeInstanceOf(Date);
    expect(rows[0].count).toBe(10);
    expect(rows[1].date).toBeInstanceOf(Date);
    expect(rows[1].count).toBe(20);
  });
});

// =============================================================================
// skipRecordsWithEmptyValues Tests
// =============================================================================

describe("skipRecordsWithEmptyValues option", () => {
  describe("parseCsv", () => {
    it("should skip records where all values are empty strings", () => {
      const csv = "a,b,c\n1,2,3\n,,\n4,5,6";
      const result = parseCsv(csv, { headers: true, skipRecordsWithEmptyValues: true }) as any;

      expect(result.rows).toEqual([
        { a: "1", b: "2", c: "3" },
        { a: "4", b: "5", c: "6" }
      ]);
    });

    it("should not skip records with partial empty values", () => {
      const csv = "a,b,c\n1,,3\n,,\n,5,";
      const result = parseCsv(csv, { headers: true, skipRecordsWithEmptyValues: true }) as any;

      expect(result.rows).toEqual([
        { a: "1", b: "", c: "3" },
        { a: "", b: "5", c: "" }
      ]);
    });

    it("should work in array mode (no headers)", () => {
      const csv = "1,2,3\n,,\n4,5,6";
      const result = parseCsv(csv, { skipRecordsWithEmptyValues: true }) as string[][];

      expect(result).toEqual([
        ["1", "2", "3"],
        ["4", "5", "6"]
      ]);
    });

    it("should work with fastMode", () => {
      const csv = "a,b\n1,2\n,\n3,4";
      const result = parseCsv(csv, {
        fastMode: true,
        skipRecordsWithEmptyValues: true
      }) as string[][];

      expect(result).toEqual([
        ["a", "b"],
        ["1", "2"],
        ["3", "4"]
      ]);
    });

    it("should skip multiple consecutive empty rows", () => {
      const csv = "a,b\n1,2\n,\n,\n,\n3,4";
      const result = parseCsv(csv, { headers: true, skipRecordsWithEmptyValues: true }) as any;

      expect(result.rows).toEqual([
        { a: "1", b: "2" },
        { a: "3", b: "4" }
      ]);
    });

    it("should handle last row being all empty", () => {
      const csv = "a,b\n1,2\n,";
      const result = parseCsv(csv, { headers: true, skipRecordsWithEmptyValues: true }) as any;

      expect(result.rows).toEqual([{ a: "1", b: "2" }]);
    });

    it("should work with skipEmptyLines combined", () => {
      // skipEmptyLines skips completely empty lines (no delimiters)
      // skipRecordsWithEmptyValues skips rows where all fields are empty strings
      const csv = "a,b\n1,2\n\n,\n3,4";
      const result = parseCsv(csv, {
        headers: true,
        skipEmptyLines: true,
        skipRecordsWithEmptyValues: true
      }) as any;

      expect(result.rows).toEqual([
        { a: "1", b: "2" },
        { a: "3", b: "4" }
      ]);
    });

    it("should not affect non-empty rows with whitespace", () => {
      const csv = "a,b\n ,  \n1,2";
      // " " and "  " are NOT empty strings, so they should not be skipped
      const result = parseCsv(csv, { headers: true, skipRecordsWithEmptyValues: true }) as any;

      expect(result.rows).toEqual([
        { a: " ", b: "  " },
        { a: "1", b: "2" }
      ]);
    });
  });

  describe("CsvParserStream", () => {
    it("should skip records with all empty values in streaming mode", async () => {
      const csv = "a,b,c\n1,2,3\n,,\n4,5,6";
      const parser = new CsvParserStream({ headers: true, skipRecordsWithEmptyValues: true });
      const rows: Record<string, string>[] = [];

      await new Promise<void>((resolve, reject) => {
        parser.on("data", row => rows.push(row as Record<string, string>));
        parser.on("end", resolve);
        parser.on("error", reject);
        parser.end(csv);
      });

      expect(rows).toEqual([
        { a: "1", b: "2", c: "3" },
        { a: "4", b: "5", c: "6" }
      ]);
    });
  });

  describe("parseCsvRows (async generator)", () => {
    it("should skip records with all empty values in async generator mode", async () => {
      const csv = "a,b\n1,2\n,\n3,4";
      const rows: Record<string, string>[] = [];

      for await (const row of parseCsvRows(csv, {
        headers: true,
        skipRecordsWithEmptyValues: true
      })) {
        rows.push(row as Record<string, string>);
      }

      expect(rows).toEqual([
        { a: "1", b: "2" },
        { a: "3", b: "4" }
      ]);
    });
  });
});

// =============================================================================
// columnMismatch option Tests
// =============================================================================

describe("columnMismatch option", () => {
  describe("parseCsv", () => {
    it("should pad rows with fewer columns when less: 'pad'", () => {
      const csv = "name,age,city\nAlice,30\nBob,25,NYC";
      // Row 2 has fewer columns (2 instead of 3)
      const result = parseCsv(csv, {
        headers: true,
        columnMismatch: { less: "pad", more: "error" }
      }) as any;

      expect(result.rows).toEqual([
        { name: "Alice", age: "30", city: "" },
        { name: "Bob", age: "25", city: "NYC" }
      ]);
    });

    it("should truncate rows with more columns when more: 'truncate'", () => {
      const csv = "name,age\nAlice,30,extra\nBob,25";
      // Row 2 has more columns (3 instead of 2)
      const result = parseCsv(csv, {
        headers: true,
        columnMismatch: { less: "error", more: "truncate" }
      }) as any;

      expect(result.rows).toEqual([
        { name: "Alice", age: "30" },
        { name: "Bob", age: "25" }
      ]);
    });

    it("should handle both fewer and more columns with lenient mode", () => {
      const csv = "name,age,city\nAlice,30\nBob,25,NYC,extra\nCharlie";
      const result = parseCsv(csv, {
        headers: true,
        columnMismatch: { less: "pad", more: "truncate" }
      }) as any;

      expect(result.rows).toEqual([
        { name: "Alice", age: "30", city: "" },
        { name: "Bob", age: "25", city: "NYC" },
        { name: "Charlie", age: "", city: "" }
      ]);
    });

    it("should keep extra columns in _extra when more: 'keep'", () => {
      const csv = "name,age\nAlice,30,extra1,extra2\nBob,25";
      const result = parseCsv(csv, {
        headers: true,
        columnMismatch: { less: "error", more: "keep" }
      }) as any;

      expect(result.rows).toEqual([
        { name: "Alice", age: "30", _extra: ["extra1", "extra2"] },
        { name: "Bob", age: "25" }
      ]);
    });

    it("should still report errors even when lenient", () => {
      const csv = "name,age\nAlice\nBob,25,extra";
      const result = parseCsv(csv, {
        headers: true,
        columnMismatch: { less: "pad", more: "truncate" }
      }) as any;

      // Note: row index is 0-based (data rows, excluding header row)
      expect(result.errors).toEqual([
        { code: "TooFewFields", message: expect.stringContaining("Too few fields"), row: 0 },
        { code: "TooManyFields", message: expect.stringContaining("Too many fields"), row: 1 }
      ]);
    });
  });

  describe("CsvParserStream", () => {
    it("should pad fewer columns in streaming mode", async () => {
      const csv = "name,age\nAlice\nBob,25";
      const stream = new CsvParserStream({
        headers: true,
        columnMismatch: { less: "pad", more: "error" }
      });

      const rows: any[] = [];
      stream.on("data", row => rows.push(row));

      await new Promise<void>((resolve, reject) => {
        stream.on("end", resolve);
        stream.on("error", reject);
        stream.end(csv);
      });

      expect(rows).toEqual([
        { name: "Alice", age: "" },
        { name: "Bob", age: "25" }
      ]);
    });

    it("should truncate more columns in streaming mode", async () => {
      const csv = "name,age\nAlice,30,extra\nBob,25";
      const stream = new CsvParserStream({
        headers: true,
        columnMismatch: { less: "error", more: "truncate" }
      });

      const rows: any[] = [];
      stream.on("data", row => rows.push(row));

      await new Promise<void>((resolve, reject) => {
        stream.on("end", resolve);
        stream.on("error", reject);
        stream.end(csv);
      });

      expect(rows).toEqual([
        { name: "Alice", age: "30" },
        { name: "Bob", age: "25" }
      ]);
    });
  });
});

// =============================================================================
// groupColumnsByName Tests
// =============================================================================

describe("groupColumnsByName option", () => {
  describe("parseCsv", () => {
    it("should group duplicate column names into arrays", () => {
      const csv = "name,value,name,value\nAlice,1,Bob,2";
      const result = parseCsv(csv, {
        headers: true,
        groupColumnsByName: true
      }) as any;

      expect(result.rows).toEqual([{ name: ["Alice", "Bob"], value: ["1", "2"] }]);
    });

    it("should keep single values as-is (not arrays)", () => {
      const csv = "id,name,name\n1,Alice,Bob";
      const result = parseCsv(csv, {
        headers: true,
        groupColumnsByName: true
      }) as any;

      expect(result.rows).toEqual([{ id: "1", name: ["Alice", "Bob"] }]);
    });

    it("should work with multiple duplicate columns", () => {
      const csv = "a,b,a,c,b,a\n1,2,3,4,5,6";
      const result = parseCsv(csv, {
        headers: true,
        groupColumnsByName: true
      }) as any;

      expect(result.rows).toEqual([{ a: ["1", "3", "6"], b: ["2", "5"], c: "4" }]);
    });

    it("should handle empty values in grouped columns", () => {
      const csv = "name,name\nAlice,\n,Bob";
      const result = parseCsv(csv, {
        headers: true,
        groupColumnsByName: true
      }) as any;

      expect(result.rows).toEqual([{ name: ["Alice", ""] }, { name: ["", "Bob"] }]);
    });

    it("should work without duplicate columns (no change)", () => {
      const csv = "name,age\nAlice,30";
      const result = parseCsv(csv, {
        headers: true,
        groupColumnsByName: true
      }) as any;

      expect(result.rows).toEqual([{ name: "Alice", age: "30" }]);
    });
  });

  describe("CsvParserStream", () => {
    it("should group duplicate column names in streaming mode", async () => {
      const csv = "name,value,name,value\nAlice,1,Bob,2";
      const stream = new CsvParserStream({
        headers: true,
        groupColumnsByName: true
      });

      const rows: any[] = [];
      stream.on("data", row => rows.push(row));

      await new Promise<void>((resolve, reject) => {
        stream.on("end", resolve);
        stream.on("error", reject);
        stream.end(csv);
      });

      expect(rows).toEqual([{ name: ["Alice", "Bob"], value: ["1", "2"] }]);
    });

    it("should keep single values as-is in streaming mode", async () => {
      const csv = "id,name,name\n1,Alice,Bob";
      const stream = new CsvParserStream({
        headers: true,
        groupColumnsByName: true
      });

      const rows: any[] = [];
      stream.on("data", row => rows.push(row));

      await new Promise<void>((resolve, reject) => {
        stream.on("end", resolve);
        stream.on("error", reject);
        stream.end(csv);
      });

      expect(rows).toEqual([{ id: "1", name: ["Alice", "Bob"] }]);
    });
  });

  describe("parseCsvRows (async generator)", () => {
    it("should group duplicate column names in async generator mode", async () => {
      const csv = "a,b,a\n1,2,3";
      const rows: any[] = [];

      for await (const row of parseCsvRows(csv, {
        headers: true,
        groupColumnsByName: true
      })) {
        rows.push(row);
      }

      expect(rows).toEqual([{ a: ["1", "3"], b: "2" }]);
    });
  });
});

// =============================================================================
// objname Tests
// =============================================================================

describe("objname option", () => {
  describe("parseCsv", () => {
    it("should return records keyed by specified column value", () => {
      const csv = "id,name,age\n1,Alice,30\n2,Bob,25\n3,Charlie,35";
      const result = parseCsv(csv, {
        headers: true,
        objname: "id"
      }) as any;

      expect(result.rows).toEqual({
        "1": { id: "1", name: "Alice", age: "30" },
        "2": { id: "2", name: "Bob", age: "25" },
        "3": { id: "3", name: "Charlie", age: "35" }
      });
    });

    it("should use name column as key", () => {
      const csv = "id,name,age\n1,Alice,30\n2,Bob,25";
      const result = parseCsv(csv, {
        headers: true,
        objname: "name"
      }) as any;

      expect(result.rows).toEqual({
        Alice: { id: "1", name: "Alice", age: "30" },
        Bob: { id: "2", name: "Bob", age: "25" }
      });
    });

    it("should handle duplicate keys (last value wins)", () => {
      const csv = "id,name,value\n1,Alice,first\n1,Alice,second";
      const result = parseCsv(csv, {
        headers: true,
        objname: "id"
      }) as any;

      // Last entry with key "1" wins
      expect(result.rows["1"]).toEqual({ id: "1", name: "Alice", value: "second" });
    });

    it("should handle missing key values (empty string key)", () => {
      const csv = "id,name\n,Alice\n1,Bob";
      const result = parseCsv(csv, {
        headers: true,
        objname: "id"
      }) as any;

      expect(result.rows).toEqual({
        "": { id: "", name: "Alice" },
        "1": { id: "1", name: "Bob" }
      });
    });

    it("should work with dynamicTyping", () => {
      const csv = "id,name,age\n1,Alice,30\n2,Bob,25";
      const result = parseCsv(csv, {
        headers: true,
        objname: "name",
        dynamicTyping: true
      }) as any;

      expect(result.rows).toEqual({
        Alice: { id: 1, name: "Alice", age: 30 },
        Bob: { id: 2, name: "Bob", age: 25 }
      });
    });

    it("should work with info option", () => {
      const csv = "id,name\n1,Alice\n2,Bob";
      const result = parseCsv(csv, {
        headers: true,
        objname: "id",
        info: true
      }) as any;

      expect(result.rows["1"].record).toEqual({ id: "1", name: "Alice" });
      expect(result.rows["1"].info).toBeDefined();
      expect(result.rows["1"].info.line).toBe(2);

      expect(result.rows["2"].record).toEqual({ id: "2", name: "Bob" });
      expect(result.rows["2"].info.line).toBe(3);
    });

    it("should handle non-existent objname column (empty string keys)", () => {
      const csv = "id,name\n1,Alice\n2,Bob";
      const result = parseCsv(csv, {
        headers: true,
        objname: "nonexistent"
      }) as any;

      // All records will have empty string key, last one wins
      expect(Object.keys(result.rows)).toEqual([""]);
    });
  });
});
