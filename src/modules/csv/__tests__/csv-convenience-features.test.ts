import { describe, it, expect } from "vitest";
import { parseCsv, type CsvParseResult, type ChunkMeta } from "@csv/csv-core";
import { CsvParserStream } from "@csv/csv-stream";
import { Readable } from "node:stream";

/**
 * Helper to collect all rows from a parser stream
 * Avoids eslint require-yield warnings from using async function* without yield
 */
async function collectRows<T = unknown>(parser: CsvParserStream): Promise<T[]> {
  const rows: T[] = [];
  return new Promise((resolve, reject) => {
    parser.on("data", row => rows.push(row as T));
    parser.on("end", () => resolve(rows));
    parser.on("error", reject);
  });
}

/**
 * Helper to pipe CSV to parser and collect results
 */
async function parseStream<T = unknown>(csv: string, parser: CsvParserStream): Promise<T[]> {
  const readable = Readable.from(csv);
  readable.pipe(parser);
  return collectRows<T>(parser);
}

describe("CSV Convenience Features", () => {
  // ============================================================================
  // dynamicTyping Tests
  // ============================================================================
  describe("dynamicTyping", () => {
    describe("parseCsv with dynamicTyping", () => {
      it("should convert numbers when dynamicTyping is true", () => {
        const csv = "name,age,score\nAlice,25,98.5\nBob,30,87.2";
        const result = parseCsv(csv, {
          headers: true,
          dynamicTyping: true
        }) as CsvParseResult<Record<string, unknown>>;

        expect(result.rows[0]).toEqual({ name: "Alice", age: 25, score: 98.5 });
        expect(result.rows[1]).toEqual({ name: "Bob", age: 30, score: 87.2 });
        expect(typeof result.rows[0].age).toBe("number");
        expect(typeof result.rows[0].score).toBe("number");
        expect(typeof result.rows[0].name).toBe("string");
      });

      it("should convert booleans when dynamicTyping is true", () => {
        const csv = "name,active,verified\nAlice,true,false\nBob,TRUE,FALSE";
        const result = parseCsv(csv, {
          headers: true,
          dynamicTyping: true
        }) as CsvParseResult<Record<string, unknown>>;

        expect(result.rows[0]).toEqual({ name: "Alice", active: true, verified: false });
        expect(result.rows[1]).toEqual({ name: "Bob", active: true, verified: false });
        expect(typeof result.rows[0].active).toBe("boolean");
        expect(typeof result.rows[0].verified).toBe("boolean");
      });

      it("should convert null when dynamicTyping is true", () => {
        const csv = "name,value\nAlice,null\nBob,NULL";
        const result = parseCsv(csv, {
          headers: true,
          dynamicTyping: true
        }) as CsvParseResult<Record<string, unknown>>;

        expect(result.rows[0]).toEqual({ name: "Alice", value: null });
        expect(result.rows[1]).toEqual({ name: "Bob", value: null });
        expect(result.rows[0].value).toBeNull();
      });

      it("should handle empty strings as empty strings", () => {
        const csv = "name,value\nAlice,\nBob,test";
        const result = parseCsv(csv, {
          headers: true,
          dynamicTyping: true
        }) as CsvParseResult<Record<string, unknown>>;

        expect(result.rows[0]).toEqual({ name: "Alice", value: "" });
        expect(result.rows[1]).toEqual({ name: "Bob", value: "test" });
      });

      it("should not convert when dynamicTyping is false", () => {
        const csv = "name,age\nAlice,25";
        const result = parseCsv(csv, {
          headers: true,
          dynamicTyping: false
        }) as CsvParseResult<Record<string, unknown>>;

        expect(result.rows[0]).toEqual({ name: "Alice", age: "25" });
        expect(typeof result.rows[0].age).toBe("string");
      });

      it("should apply dynamicTyping per column by name", () => {
        const csv = "name,age,zip\nAlice,25,02134\nBob,30,10001";
        const result = parseCsv(csv, {
          headers: true,
          dynamicTyping: { age: true, zip: false }
        }) as CsvParseResult<Record<string, unknown>>;

        expect(result.rows[0]).toEqual({ name: "Alice", age: 25, zip: "02134" });
        expect(result.rows[1]).toEqual({ name: "Bob", age: 30, zip: "10001" });
        expect(typeof result.rows[0].age).toBe("number");
        expect(typeof result.rows[0].zip).toBe("string");
      });

      it("should handle negative numbers", () => {
        const csv = "name,balance\nAlice,-100.50\nBob,200";
        const result = parseCsv(csv, {
          headers: true,
          dynamicTyping: true
        }) as CsvParseResult<Record<string, unknown>>;

        expect(result.rows[0]).toEqual({ name: "Alice", balance: -100.5 });
        expect(result.rows[1]).toEqual({ name: "Bob", balance: 200 });
      });

      it("should handle scientific notation", () => {
        const csv = "name,value\nAlice,1.5e10\nBob,2E-5";
        const result = parseCsv(csv, {
          headers: true,
          dynamicTyping: true
        }) as CsvParseResult<Record<string, unknown>>;

        expect(result.rows[0]).toEqual({ name: "Alice", value: 1.5e10 });
        expect(result.rows[1]).toEqual({ name: "Bob", value: 2e-5 });
      });

      it("should preserve string values that look like numbers but have leading zeros", () => {
        const csv = "name,code\nAlice,00123\nBob,0045";
        const result = parseCsv(csv, {
          headers: true,
          dynamicTyping: true
        }) as CsvParseResult<Record<string, unknown>>;

        // Leading zeros are preserved as strings (important for zip codes, IDs etc.)
        expect(result.rows[0]).toEqual({ name: "Alice", code: "00123" });
        expect(result.rows[1]).toEqual({ name: "Bob", code: "0045" });
      });

      it("should work with array mode (no headers)", () => {
        const csv = "Alice,25,true\nBob,30,false";
        const result = parseCsv(csv, { headers: false, dynamicTyping: true });

        expect(result).toEqual([
          ["Alice", 25, true],
          ["Bob", 30, false]
        ]);
        expect(typeof result[0][1]).toBe("number");
        expect(typeof result[0][2]).toBe("boolean");
      });

      it("should apply custom converter function", () => {
        const csv = "name,date\nAlice,2024-01-15\nBob,2024-12-25";
        const result = parseCsv(csv, {
          headers: true,
          dynamicTyping: {
            date: (value: string) => new Date(value)
          }
        }) as CsvParseResult<Record<string, unknown>>;

        expect(result.rows[0].date).toBeInstanceOf(Date);
        expect((result.rows[0].date as Date).getFullYear()).toBe(2024);
        expect((result.rows[0].date as Date).getMonth()).toBe(0); // January
      });

      it("should handle mixed custom and boolean converters", () => {
        const csv = "name,age,active,date\nAlice,25,true,2024-01-15";
        const result = parseCsv(csv, {
          headers: true,
          dynamicTyping: {
            age: true,
            active: true,
            date: (value: string) => new Date(value)
          }
        }) as CsvParseResult<Record<string, unknown>>;

        expect(result.rows[0].age).toBe(25);
        expect(result.rows[0].active).toBe(true);
        expect(result.rows[0].date).toBeInstanceOf(Date);
      });
    });

    describe("CsvParserStream with dynamicTyping", () => {
      it("should convert types in streaming mode", async () => {
        const csv = "name,age,active\nAlice,25,true\nBob,30,false";
        const parser = new CsvParserStream({ headers: true, dynamicTyping: true });
        const rows = await parseStream<Record<string, unknown>>(csv, parser);

        expect(rows[0]).toEqual({ name: "Alice", age: 25, active: true });
        expect(rows[1]).toEqual({ name: "Bob", age: 30, active: false });
        expect(typeof rows[0].age).toBe("number");
        expect(typeof rows[0].active).toBe("boolean");
      });

      it("should apply per-column dynamicTyping in streaming mode", async () => {
        const csv = "name,age,zip\nAlice,25,02134";
        const parser = new CsvParserStream({
          headers: true,
          dynamicTyping: { age: true, zip: false }
        });
        const rows = await parseStream<Record<string, unknown>>(csv, parser);

        expect(rows[0]).toEqual({ name: "Alice", age: 25, zip: "02134" });
      });
    });
  });

  // ============================================================================
  // chunk callback Tests
  // ============================================================================
  describe("chunk callback", () => {
    describe("CsvParserStream with chunk callback", () => {
      it("should call chunk callback with rows in batches", async () => {
        const csv = [
          "name,value",
          "A,1",
          "B,2",
          "C,3",
          "D,4",
          "E,5",
          "F,6",
          "G,7",
          "H,8",
          "I,9",
          "J,10"
        ].join("\n");

        const chunks: { data: Record<string, string>[]; meta: ChunkMeta }[] = [];

        const parser = new CsvParserStream({
          headers: true,
          chunkSize: 3,
          chunk: (data, meta) => {
            chunks.push({ data: data as Record<string, string>[], meta: { ...meta } });
          }
        });

        // Collect all rows through the stream
        const throughRows = await parseStream(csv, parser);

        // chunk callback should have received all rows in batches
        expect(chunks.length).toBe(4); // 10 rows / 3 = 4 chunks (3, 3, 3, 1)
        expect(chunks[0].data.length).toBe(3);
        expect(chunks[0].meta.isFirstChunk).toBe(true);
        expect(chunks[0].meta.isLastChunk).toBe(false);
        expect(chunks[0].meta.cursor).toBe(0);

        expect(chunks[1].data.length).toBe(3);
        expect(chunks[1].meta.isFirstChunk).toBe(false);
        expect(chunks[1].meta.isLastChunk).toBe(false);
        expect(chunks[1].meta.cursor).toBe(3);

        expect(chunks[2].data.length).toBe(3);
        expect(chunks[2].meta.isFirstChunk).toBe(false);
        expect(chunks[2].meta.isLastChunk).toBe(false);
        expect(chunks[2].meta.cursor).toBe(6);

        expect(chunks[3].data.length).toBe(1);
        expect(chunks[3].meta.isFirstChunk).toBe(false);
        expect(chunks[3].meta.isLastChunk).toBe(true);
        expect(chunks[3].meta.cursor).toBe(9);

        // Stream should still receive rows
        expect(throughRows.length).toBe(10);
      });

      it("should support async chunk callback", async () => {
        const csv = "name,value\nA,1\nB,2\nC,3\nD,4\nE,5";

        const processedBatches: number[] = [];

        const parser = new CsvParserStream({
          headers: true,
          chunkSize: 2,
          chunk: async (_data, meta) => {
            // Simulate async processing
            await new Promise(resolve => setTimeout(resolve, 10));
            processedBatches.push(meta.cursor);
          }
        });

        await parseStream(csv, parser);

        expect(processedBatches).toEqual([0, 2, 4]);
      });

      it("should abort parsing when chunk callback returns false", async () => {
        const csv = ["name,value", ...Array.from({ length: 100 }, (_, i) => `Item${i},${i}`)].join(
          "\n"
        );

        let chunkCount = 0;
        const collectedRows: unknown[] = [];

        const parser = new CsvParserStream({
          headers: true,
          chunkSize: 10,
          chunk: (data, _meta) => {
            chunkCount++;
            collectedRows.push(...data);
            // Abort after 2 chunks (return false to abort)
            if (chunkCount >= 2) {
              return false;
            }
          }
        });

        await parseStream(csv, parser);

        // Should have stopped after 2 chunks (20 rows)
        expect(chunkCount).toBe(2);
        expect(collectedRows.length).toBe(20);
      });

      it("should provide rowCount in chunk meta", async () => {
        const csv = "name,value\nA,1\nB,2\nC,3\nD,4\nE,5";

        const rowCounts: number[] = [];

        const parser = new CsvParserStream({
          headers: true,
          chunkSize: 2,
          chunk: (data, meta) => {
            rowCounts.push(meta.rowCount);
          }
        });

        await parseStream(csv, parser);

        expect(rowCounts).toEqual([2, 2, 1]);
      });

      it("should work with dynamicTyping and chunk callback together", async () => {
        const csv = "name,count,active\nA,10,true\nB,20,false\nC,30,true";

        const chunks: { data: Record<string, unknown>[]; meta: ChunkMeta }[] = [];

        const parser = new CsvParserStream({
          headers: true,
          dynamicTyping: true,
          chunkSize: 2,
          chunk: (data, meta) => {
            chunks.push({ data: data as Record<string, unknown>[], meta: { ...meta } });
          }
        });

        await parseStream(csv, parser);

        expect(chunks.length).toBe(2);
        expect(chunks[0].data[0]).toEqual({ name: "A", count: 10, active: true });
        expect(typeof chunks[0].data[0].count).toBe("number");
        expect(typeof chunks[0].data[0].active).toBe("boolean");
      });
    });
  });

  // ============================================================================
  // beforeFirstChunk Tests
  // ============================================================================
  describe("beforeFirstChunk", () => {
    describe("parseCsv with beforeFirstChunk", () => {
      it("should preprocess input before parsing", () => {
        const csvWithMetadata = "# This is metadata\n# Skip this too\nname,value\nAlice,100";

        const result = parseCsv(csvWithMetadata, {
          headers: true,
          beforeFirstChunk: (chunk: string) => {
            // Remove lines starting with #
            return chunk
              .split("\n")
              .filter(line => !line.startsWith("#"))
              .join("\n");
          }
        }) as CsvParseResult<Record<string, unknown>>;

        expect(result.headers).toEqual(["name", "value"]);
        expect(result.rows[0]).toEqual({ name: "Alice", value: "100" });
      });

      it("should handle BOM removal", () => {
        // UTF-8 BOM: 0xEF, 0xBB, 0xBF
        const csvWithBOM = "\uFEFFname,value\nAlice,100";

        const result = parseCsv(csvWithBOM, {
          headers: true,
          beforeFirstChunk: (chunk: string) => {
            // Remove BOM if present
            return chunk.replace(/^\uFEFF/, "");
          }
        }) as CsvParseResult<Record<string, unknown>>;

        expect(result.headers).toEqual(["name", "value"]);
        expect(result.headers?.[0]).toBe("name"); // Not "\uFEFFname"
      });

      it("should work when returning void (no modification)", () => {
        const csv = "name,value\nAlice,100";
        let called = false;

        const result = parseCsv(csv, {
          headers: true,
          beforeFirstChunk: (_chunk: string) => {
            called = true;
            // Return nothing - should use original input
          }
        }) as CsvParseResult<Record<string, unknown>>;

        expect(called).toBe(true);
        expect(result.rows[0]).toEqual({ name: "Alice", value: "100" });
      });

      it("should support validation that throws errors", () => {
        const csv = "wrong,headers\nAlice,100";

        expect(() =>
          parseCsv(csv, {
            headers: true,
            beforeFirstChunk: (chunk: string) => {
              const firstLine = chunk.split("\n")[0];
              if (!firstLine.includes("name")) {
                throw new Error("Required header 'name' not found");
              }
              return chunk;
            }
          })
        ).toThrow("Required header 'name' not found");
      });

      it("should allow transforming delimiter", () => {
        // European-style CSV with semicolon delimiter
        const europeanCsv = "name;value\nAlice;100";

        const result = parseCsv(europeanCsv, {
          headers: true,
          beforeFirstChunk: (chunk: string) => {
            // Convert semicolons to commas
            return chunk.replace(/;/g, ",");
          }
        }) as CsvParseResult<Record<string, unknown>>;

        expect(result.headers).toEqual(["name", "value"]);
        expect(result.rows[0]).toEqual({ name: "Alice", value: "100" });
      });

      it("should work with auto-detect delimiter", () => {
        const csv = "name\tvalue\nAlice\t100";
        let originalChunk = "";

        const result = parseCsv(csv, {
          headers: true,
          delimiter: "", // auto-detect
          beforeFirstChunk: (chunk: string) => {
            originalChunk = chunk;
            return chunk;
          }
        }) as CsvParseResult<Record<string, unknown>>;

        expect(originalChunk).toBe(csv);
        expect(result.headers).toEqual(["name", "value"]);
        expect(result.rows[0]).toEqual({ name: "Alice", value: "100" });
      });
    });

    describe("CsvParserStream with beforeFirstChunk", () => {
      it("should preprocess first chunk in streaming mode", async () => {
        const csvWithMetadata = "# Skip this line\nname,value\nAlice,100\nBob,200";

        const parser = new CsvParserStream({
          headers: true,
          beforeFirstChunk: (chunk: string) => {
            // Remove first line if it's a comment
            const lines = chunk.split("\n");
            if (lines[0].startsWith("#")) {
              return lines.slice(1).join("\n");
            }
            return chunk;
          }
        });

        const rows = await parseStream<Record<string, string>>(csvWithMetadata, parser);

        expect(rows).toEqual([
          { name: "Alice", value: "100" },
          { name: "Bob", value: "200" }
        ]);
      });

      it("should only be called once even with multiple chunks", async () => {
        // Create a large CSV that will be processed in multiple chunks
        const lines = ["name,value"];
        for (let i = 0; i < 100; i++) {
          lines.push(`Item${i},${i}`);
        }
        const csv = lines.join("\n");

        let callCount = 0;

        const parser = new CsvParserStream({
          headers: true,
          beforeFirstChunk: (chunk: string) => {
            callCount++;
            return chunk;
          }
        });

        await parseStream(csv, parser);

        expect(callCount).toBe(1);
      });

      it("should work with dynamicTyping and beforeFirstChunk together", async () => {
        const csv = "# metadata\nname,count\nAlice,100\nBob,200";

        const parser = new CsvParserStream({
          headers: true,
          dynamicTyping: true,
          beforeFirstChunk: (chunk: string) => {
            return chunk
              .split("\n")
              .filter(line => !line.startsWith("#"))
              .join("\n");
          }
        });

        const rows = await parseStream<Record<string, unknown>>(csv, parser);

        expect(rows[0]).toEqual({ name: "Alice", count: 100 });
        expect(typeof rows[0].count).toBe("number");
      });
    });
  });

  // ============================================================================
  // Combined Features Tests
  // ============================================================================
  describe("combined features", () => {
    it("should work with all three features together", async () => {
      const csv =
        "# Comment to remove\nname,value,active\nAlice,100,true\nBob,200,false\nCharlie,300,true";

      const chunks: { data: Record<string, unknown>[]; meta: ChunkMeta }[] = [];

      const parser = new CsvParserStream({
        headers: true,
        dynamicTyping: true,
        chunkSize: 2,
        beforeFirstChunk: (chunk: string) => {
          return chunk
            .split("\n")
            .filter(line => !line.startsWith("#"))
            .join("\n");
        },
        chunk: (data, meta) => {
          chunks.push({ data: data as Record<string, unknown>[], meta: { ...meta } });
        }
      });

      const throughRows = await parseStream(csv, parser);

      // beforeFirstChunk removed the comment
      // dynamicTyping converted numbers and booleans
      // chunk callback received rows in batches of 2

      expect(chunks.length).toBe(2);
      expect(chunks[0].data[0]).toEqual({ name: "Alice", value: 100, active: true });
      expect(chunks[0].data[1]).toEqual({ name: "Bob", value: 200, active: false });
      expect(chunks[1].data[0]).toEqual({ name: "Charlie", value: 300, active: true });

      expect(typeof chunks[0].data[0].value).toBe("number");
      expect(typeof chunks[0].data[0].active).toBe("boolean");

      expect(throughRows.length).toBe(3);
    });

    it("should work with transform and dynamicTyping", () => {
      const csv = "name,value\nAlice,100\nBob,200";

      // Track that transform receives dynamically typed values
      const receivedValues: unknown[] = [];

      const result = parseCsv(csv, {
        headers: true,
        dynamicTyping: true,
        transform: row => {
          const r = row as Record<string, unknown>;
          receivedValues.push(r.value);
          // Transform still returns Row type (string-based), but dynamicTyping has already converted
          return { name: String(r.name).toUpperCase(), value: String(r.value) };
        }
      }) as CsvParseResult<Record<string, string>>;

      // dynamicTyping is applied before transform, so transform receives numbers
      expect(receivedValues).toEqual([100, 200]);
      // Transform output is what gets stored in result
      expect(result.rows[0]).toEqual({ name: "ALICE", value: "100" });
      expect(result.rows[1]).toEqual({ name: "BOB", value: "200" });
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================
  describe("edge cases", () => {
    it("should handle empty input with beforeFirstChunk", () => {
      const result = parseCsv("", {
        headers: false,
        beforeFirstChunk: (chunk: string) => chunk.toUpperCase()
      });

      // Empty input returns empty array
      expect(result).toEqual([]);
    });

    it("should handle single row with dynamicTyping", () => {
      const csv = "name,value\nAlice,100";
      const result = parseCsv(csv, { headers: true, dynamicTyping: true }) as CsvParseResult<
        Record<string, unknown>
      >;

      expect(result.rows).toEqual([{ name: "Alice", value: 100 }]);
    });

    it("should handle chunk size larger than row count", async () => {
      const csv = "name,value\nA,1\nB,2";
      const chunks: { data: unknown[]; meta: ChunkMeta }[] = [];

      const parser = new CsvParserStream({
        headers: true,
        chunkSize: 100,
        chunk: (data, meta) => {
          chunks.push({ data: [...data], meta: { ...meta } });
        }
      });

      await parseStream(csv, parser);

      expect(chunks.length).toBe(1);
      expect(chunks[0].data.length).toBe(2);
      expect(chunks[0].meta.isFirstChunk).toBe(true);
      expect(chunks[0].meta.isLastChunk).toBe(true);
    });

    it("should preserve Infinity and -Infinity with dynamicTyping", () => {
      const csv = "name,value\nA,Infinity\nB,-Infinity";
      const result = parseCsv(csv, { headers: true, dynamicTyping: true }) as CsvParseResult<
        Record<string, unknown>
      >;

      expect(result.rows[0].value).toBe(Infinity);
      expect(result.rows[1].value).toBe(-Infinity);
    });

    it("should handle NaN with dynamicTyping", () => {
      const csv = "name,value\nA,NaN";
      const result = parseCsv(csv, { headers: true, dynamicTyping: true }) as CsvParseResult<
        Record<string, unknown>
      >;

      expect(Number.isNaN(result.rows[0].value)).toBe(true);
    });

    it("should handle mixed case booleans with dynamicTyping", () => {
      const csv = "a,b,c,d\nTRUE,True,FALSE,False";
      const result = parseCsv(csv, { headers: true, dynamicTyping: true }) as CsvParseResult<
        Record<string, unknown>
      >;

      expect(result.rows[0]).toEqual({ a: true, b: true, c: false, d: false });
    });
  });
});
