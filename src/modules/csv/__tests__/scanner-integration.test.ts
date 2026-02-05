/**
 * Scanner Integration Tests
 *
 * Tests that parseWithScanner correctly parses various CSV formats.
 */

import { describe, it, expect } from "vitest";
import {
  parseWithScanner,
  createParseConfig,
  createParseState,
  type RowProcessResult
} from "../parse/index";
import type { CsvParseOptions, CsvParseError } from "../types";

// =============================================================================
// Test Helpers
// =============================================================================

function parseWithScanner_(
  input: string,
  options: CsvParseOptions = {}
): { results: RowProcessResult[]; errors: CsvParseError[] } {
  const { config, processedInput } = createParseConfig({ input, options });
  const state = createParseState(config);
  const errors: CsvParseError[] = [];
  const results = [...parseWithScanner(processedInput!, config, state, errors)];

  return { results, errors };
}

function expectRow(input: string, options: CsvParseOptions, expectedRows: string[][]): void {
  const { results } = parseWithScanner_(input, options);
  const actualRows = results.filter(r => !r.skipped && r.row).map(r => r.row);
  expect(actualRows).toEqual(expectedRows);
}

// =============================================================================
// Basic Parsing
// =============================================================================

describe("parseWithScanner - Basic Parsing", () => {
  it("should parse simple rows", () => {
    expectRow("a,b,c\n", {}, [["a", "b", "c"]]);
    expectRow("a,b,c\n1,2,3\n", {}, [
      ["a", "b", "c"],
      ["1", "2", "3"]
    ]);
    expectRow("hello,world\n", {}, [["hello", "world"]]);
  });

  it("should handle empty fields", () => {
    expectRow(",b,\n", {}, [["", "b", ""]]);
    expectRow(",,\n", {}, [["", "", ""]]);
    expectRow("a,,c\n", {}, [["a", "", "c"]]);
  });

  it("should handle row without trailing newline", () => {
    expectRow("a,b,c", {}, [["a", "b", "c"]]);
    expectRow("hello", {}, [["hello"]]);
  });

  it("should handle empty input", () => {
    expectRow("", {}, []);
  });

  it("should handle single field", () => {
    expectRow("hello\n", {}, [["hello"]]);
    expectRow("hello", {}, [["hello"]]);
  });
});

// =============================================================================
// Quoted Fields
// =============================================================================

describe("parseWithScanner - Quoted Fields", () => {
  it("should parse quoted fields", () => {
    expectRow('"hello",world\n', {}, [["hello", "world"]]);
    expectRow('"a,b",c\n', {}, [["a,b", "c"]]);
    expectRow('"line1\nline2",b\n', {}, [["line1\nline2", "b"]]);
  });

  it("should handle escaped quotes", () => {
    expectRow('"say ""hello""",b\n', {}, [['say "hello"', "b"]]);
    expectRow('""""\n', {}, [['"']]);
    expectRow('"a""""b"\n', {}, [['a""b']]);
  });

  it("should handle empty quoted fields", () => {
    expectRow('"",b\n', {}, [["", "b"]]);
    expectRow('"",""\n', {}, [["", ""]]);
  });

  it("should handle CRLF inside quotes (normalized to LF)", () => {
    expectRow('"line1\r\nline2",b\n', {}, [["line1\nline2", "b"]]);
  });
});

// =============================================================================
// Newline Handling
// =============================================================================

describe("parseWithScanner - Newlines", () => {
  it("should handle LF line endings", () => {
    expectRow("a,b\nc,d\n", {}, [
      ["a", "b"],
      ["c", "d"]
    ]);
  });

  it("should handle CRLF line endings", () => {
    expectRow("a,b\r\nc,d\r\n", {}, [
      ["a", "b"],
      ["c", "d"]
    ]);
  });

  it("should handle CR line endings", () => {
    expectRow("a,b\rc,d\r", {}, [
      ["a", "b"],
      ["c", "d"]
    ]);
  });

  it("should handle mixed line endings", () => {
    expectRow("a,b\nc,d\r\ne,f\r", {}, [
      ["a", "b"],
      ["c", "d"],
      ["e", "f"]
    ]);
  });
});

// =============================================================================
// Options
// =============================================================================

describe("parseWithScanner - Options", () => {
  it("should handle trim option", () => {
    expectRow("  a  ,  b  \n", { trim: true }, [["a", "b"]]);
    expectRow("  a  ,  b  \n", { ltrim: true }, [["a  ", "b  "]]);
    expectRow("  a  ,  b  \n", { rtrim: true }, [["  a", "  b"]]);
  });

  it("should handle skipEmptyLines", () => {
    expectRow("a,b\n\nc,d\n", { skipEmptyLines: true }, [
      ["a", "b"],
      ["c", "d"]
    ]);
  });

  it("should handle comment lines", () => {
    expectRow("a,b\n#comment\nc,d\n", { comment: "#" }, [
      ["a", "b"],
      ["c", "d"]
    ]);
  });

  it("should handle skipLines", () => {
    expectRow("skip1\nskip2\na,b\n", { skipLines: 2 }, [["a", "b"]]);
  });

  it("should handle maxRows", () => {
    expectRow("a,b\nc,d\ne,f\n", { maxRows: 2 }, [
      ["a", "b"],
      ["c", "d"]
    ]);
  });

  it("should handle toLine", () => {
    expectRow("a,b\nc,d\ne,f\n", { toLine: 2 }, [
      ["a", "b"],
      ["c", "d"]
    ]);
  });

  it("should handle info option", () => {
    const { results } = parseWithScanner_("a,b\nc,d\n", { info: true });
    expect(results[0].info).toBeDefined();
    expect(results[0].info?.line).toBe(1);
  });

  it("should handle raw option", () => {
    const { results } = parseWithScanner_("a,b\nc,d\n", { info: true, raw: true });
    expect(results[0].info?.raw).toBe("a,b");
    expect(results[1].info?.raw).toBe("c,d");
  });

  it("should handle relaxQuotes", () => {
    expectRow('a"b,c\n', { relaxQuotes: true }, [['a"b', "c"]]);
  });

  it("should handle skipRecordsWithEmptyValues", () => {
    expectRow("a,b\n,,\nc,d\n", { skipRecordsWithEmptyValues: true }, [
      ["a", "b"],
      ["c", "d"]
    ]);
  });
});

// =============================================================================
// Multi-character Delimiter
// =============================================================================

describe("parseWithScanner - Multi-char Delimiters", () => {
  it("should handle || delimiter", () => {
    expectRow("a||b||c\n", { delimiter: "||" }, [["a", "b", "c"]]);
  });

  it("should handle tab-tab delimiter", () => {
    expectRow("a\t\tb\t\tc\n", { delimiter: "\t\t" }, [["a", "b", "c"]]);
  });

  it("should handle quoted field with multi-char delimiter inside", () => {
    expectRow('"a||b"||c\n', { delimiter: "||" }, [["a||b", "c"]]);
  });
});

// =============================================================================
// Column Mismatch Handling
// =============================================================================

describe("parseWithScanner - Column Mismatch", () => {
  it("should handle too many fields with truncate", () => {
    // parseWithScanner returns arrays, not objects
    // With headers: true, header row is skipped, so results[0] is the data row
    const { results } = parseWithScanner_("a,b\n1,2,3\n", {
      headers: true,
      columnMismatch: { less: "error", more: "truncate" }
    });
    // Header row is skipped (skipped: true), data row is truncated
    const dataRows = results.filter(r => !r.skipped && r.row);
    expect(dataRows[0].row).toEqual(["1", "2"]); // truncated from ["1","2","3"]
  });

  it("should handle too few fields with pad", () => {
    // parseWithScanner returns arrays, not objects
    // With headers: true, header row is skipped, so results[0] is the data row
    const { results } = parseWithScanner_("a,b,c\n1,2\n", {
      headers: true,
      columnMismatch: { less: "pad", more: "error" }
    });
    // Header row is skipped (skipped: true), data row is padded
    const dataRows = results.filter(r => !r.skipped && r.row);
    expect(dataRows[0].row).toEqual(["1", "2", ""]); // padded from ["1","2"]
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe("parseWithScanner - Edge Cases", () => {
  it("should handle large number of columns", () => {
    const cols = Array.from({ length: 100 }, (_, i) => `col${i}`);
    const { results } = parseWithScanner_(cols.join(",") + "\n", {});
    expect(results[0].row).toHaveLength(100);
  });

  it("should handle long field values", () => {
    const longValue = "x".repeat(10000);
    expectRow(`${longValue},b\n`, {}, [[longValue, "b"]]);
  });

  it("should handle many consecutive empty fields", () => {
    expectRow(",,,,,,,,,,\n", {}, [["", "", "", "", "", "", "", "", "", "", ""]]);
  });

  it("should handle field with only quotes", () => {
    expectRow('""""\n', {}, [['"']]);
  });

  it("should handle consecutive rows", () => {
    const rows = Array.from({ length: 100 }, (_, i) => `a${i},b${i},c${i}`);
    const { results } = parseWithScanner_(rows.join("\n") + "\n", {});
    expect(results).toHaveLength(100);
  });
});
