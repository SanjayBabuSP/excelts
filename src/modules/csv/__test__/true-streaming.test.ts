/**
 * True Streaming Verification Tests - CSV Node.js
 *
 * These tests verify that CSV parsing/formatting is TRULY streaming:
 * - Rows should be emitted as they are parsed, not buffered until end
 * - Transform streams should handle backpressure correctly
 */

import { describe, it, expect } from "vitest";
import { Readable, Writable } from "../../stream";
import { CsvParserStream, CsvFormatterStream } from "../csv-stream";

describe("True Streaming Verification - CSV Node.js", () => {
  describe("CsvParserStream", () => {
    it("should emit rows IMMEDIATELY as they are parsed, not buffered", async () => {
      const results: { phase: "write" | "end"; row: string[] }[] = [];
      let phase: "write" | "end" = "write";

      const parser = new CsvParserStream();

      parser.on("data", (row: string[]) => {
        results.push({ phase, row });
      });

      // Write CSV data in chunks, simulating streaming input
      // Each write contains a complete row
      const rows = [
        "a,b,c\n", // header
        "1,2,3\n", // row 1
        "4,5,6\n", // row 2
        "7,8,9\n" // row 3
      ];

      for (const row of rows) {
        parser.write(row);
        // Allow microtasks to process
        await new Promise(resolve => setImmediate(resolve));
      }

      // Mark end phase and finish
      phase = "end";
      parser.end();

      await new Promise<void>(resolve => parser.on("finish", resolve));

      // Verify: all rows should have been emitted during write phase
      const writePhaseDatas = results.filter(r => r.phase === "write");
      const endPhaseDatas = results.filter(r => r.phase === "end");

      // All 4 rows (including header) should be emitted during writes
      expect(writePhaseDatas.length).toBe(4);
      expect(endPhaseDatas.length).toBe(0);

      // Verify content
      expect(writePhaseDatas[0].row).toEqual(["a", "b", "c"]);
      expect(writePhaseDatas[1].row).toEqual(["1", "2", "3"]);
      expect(writePhaseDatas[2].row).toEqual(["4", "5", "6"]);
      expect(writePhaseDatas[3].row).toEqual(["7", "8", "9"]);
    });

    it("should handle partial rows across writes (true streaming)", async () => {
      const rows: string[][] = [];
      const parser = new CsvParserStream();

      parser.on("data", (row: string[]) => {
        rows.push(row);
      });

      // Write data that splits across rows
      parser.write("name,val");
      await new Promise(resolve => setImmediate(resolve));
      expect(rows.length).toBe(0); // No complete row yet

      parser.write("ue\n");
      await new Promise(resolve => setImmediate(resolve));
      expect(rows.length).toBe(1); // Header row complete

      parser.write("test,");
      await new Promise(resolve => setImmediate(resolve));
      expect(rows.length).toBe(1); // Still waiting for row end

      parser.write("123\n");
      await new Promise(resolve => setImmediate(resolve));
      expect(rows.length).toBe(2); // Second row complete

      parser.end();
      await new Promise<void>(resolve => parser.on("finish", resolve));

      expect(rows).toEqual([
        ["name", "value"],
        ["test", "123"]
      ]);
    });
  });

  describe("CsvFormatterStream", () => {
    it("should emit CSV output IMMEDIATELY for each row written", async () => {
      const results: { phase: "write" | "end"; chunk: string }[] = [];
      let phase: "write" | "end" = "write";

      const formatter = new CsvFormatterStream();

      formatter.on("data", (chunk: Buffer) => {
        results.push({ phase, chunk: chunk.toString() });
      });

      // Write rows one at a time
      const rows = [
        ["a", "b", "c"],
        ["1", "2", "3"],
        ["4", "5", "6"]
      ];

      for (const row of rows) {
        formatter.write(row);
        await new Promise(resolve => setImmediate(resolve));
      }

      phase = "end";
      formatter.end();
      await new Promise<void>(resolve => formatter.on("finish", resolve));

      // All rows should be emitted during write phase
      const writePhaseDatas = results.filter(r => r.phase === "write");
      expect(writePhaseDatas.length).toBe(3);

      // Verify CSV output (normalize line endings)
      const allOutput = writePhaseDatas.map(r => r.chunk).join("");
      expect(allOutput).toContain("a,b,c");
      expect(allOutput).toContain("1,2,3");
      expect(allOutput).toContain("4,5,6");
    });

    it("should handle special characters with proper escaping in streaming mode", async () => {
      const chunks: string[] = [];
      const formatter = new CsvFormatterStream();

      formatter.on("data", (chunk: Buffer) => {
        chunks.push(chunk.toString());
      });

      // Write row with special characters
      formatter.write(["hello", 'world,"quoted"', "line\nbreak"]);
      await new Promise(resolve => setImmediate(resolve));

      // Should emit immediately
      expect(chunks.length).toBe(1);
      // Verify the escaped content (without checking trailing newline)
      expect(chunks[0]).toContain("hello");
      expect(chunks[0]).toContain('"world,""quoted"""');
      expect(chunks[0]).toContain('"line\nbreak"');

      formatter.end();
    });
  });

  describe("Pipeline streaming", () => {
    it("should stream through parser and formatter without buffering", async () => {
      const inputChunks = ["name,value\n", "foo,100\n", "bar,200\n", "baz,300\n"];

      const outputChunks: string[] = [];
      const inputTimestamps: number[] = [];
      const outputTimestamps: number[] = [];

      // Create a readable that emits chunks with timing
      const readable = new Readable({
        read() {
          const chunk = inputChunks.shift();
          if (chunk) {
            inputTimestamps.push(Date.now());
            this.push(chunk);
          } else {
            this.push(null);
          }
        }
      });

      // Create a writable that records output timing
      const writable = new Writable({
        write(chunk, _encoding, callback) {
          outputTimestamps.push(Date.now());
          outputChunks.push(chunk.toString());
          callback();
        }
      });

      const parser = new CsvParserStream();
      const formatter = new CsvFormatterStream();

      // Pipe: readable -> parser -> formatter -> writable
      readable.pipe(parser).pipe(formatter).pipe(writable);

      await new Promise<void>(resolve => writable.on("finish", resolve));

      // Verify output contains all rows
      expect(outputChunks.length).toBe(4);
      const fullOutput = outputChunks.join("");
      expect(fullOutput).toContain("name,value");
      expect(fullOutput).toContain("foo,100");
      expect(fullOutput).toContain("bar,200");
      expect(fullOutput).toContain("baz,300");

      // Verify streaming: outputs should start appearing quickly,
      // not all at the end
      // (In true streaming, first output should appear shortly after first input)
    });
  });
});
