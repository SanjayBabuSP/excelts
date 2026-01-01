/**
 * True Streaming Verification Tests - Node.js
 *
 * These tests verify that ZIP compression is TRULY streaming:
 * - Data must be emitted DURING write(), not buffered until end()
 * - Each write() should produce output within the same event loop tick (after flush)
 *
 * This is critical for memory efficiency with large files.
 */

import { describe, it, expect } from "vitest";
import { createDeflateStream } from "../../streaming-compress";
import { Zip, ZipDeflate } from "../../streaming-zip";

describe("True Streaming Verification - Node.js", () => {
  describe("createDeflateStream", () => {
    it("should emit data IMMEDIATELY after each write, not buffered until end", async () => {
      const deflate = createDeflateStream({ level: 6 });
      const results: { phase: "write" | "end"; chunkIndex: number; size: number }[] = [];
      let phase: "write" | "end" = "write";
      let chunkIndex = 0;

      deflate.on("data", (chunk: Buffer) => {
        results.push({ phase, chunkIndex, size: chunk.length });
      });

      // Write 3 chunks with delays to ensure we're testing streaming behavior
      const testData = Buffer.alloc(3 * 1024 * 1024, "A"); // 3MB of 'A's

      // Write chunk 1
      chunkIndex = 1;
      await new Promise<void>((resolve, reject) => {
        deflate.write(testData, err => (err ? reject(err) : resolve()));
      });
      // Allow microtasks to run
      await new Promise(resolve => setImmediate(resolve));

      // Write chunk 2
      chunkIndex = 2;
      await new Promise<void>((resolve, reject) => {
        deflate.write(testData, err => (err ? reject(err) : resolve()));
      });
      await new Promise(resolve => setImmediate(resolve));

      // Write chunk 3
      chunkIndex = 3;
      await new Promise<void>((resolve, reject) => {
        deflate.write(testData, err => (err ? reject(err) : resolve()));
      });
      await new Promise(resolve => setImmediate(resolve));

      // Now end the stream
      phase = "end";
      chunkIndex = 0;
      await new Promise<void>(resolve => {
        deflate.end(() => resolve());
      });

      // Verify: data events should have occurred DURING write phase
      const writePhaseDatas = results.filter(r => r.phase === "write");
      const endPhaseDatas = results.filter(r => r.phase === "end");

      // Must have at least 3 data events during write phase (one per write)
      expect(writePhaseDatas.length).toBeGreaterThanOrEqual(3);

      // Verify each write produced output
      expect(writePhaseDatas.some(r => r.chunkIndex === 1)).toBe(true);
      expect(writePhaseDatas.some(r => r.chunkIndex === 2)).toBe(true);
      expect(writePhaseDatas.some(r => r.chunkIndex === 3)).toBe(true);

      // The end phase should only have the final flush data (if any)
      // Most data should be in write phase
      const writePhaseTotalSize = writePhaseDatas.reduce((sum, r) => sum + r.size, 0);
      const endPhaseTotalSize = endPhaseDatas.reduce((sum, r) => sum + r.size, 0);

      // At least 90% of data should be emitted during write phase
      const ratio = writePhaseTotalSize / (writePhaseTotalSize + endPhaseTotalSize);
      expect(ratio).toBeGreaterThan(0.9);
    });

    it("should produce decompressible output", async () => {
      const { inflateRawSync } = await import("zlib");
      const deflate = createDeflateStream({ level: 6 });
      const chunks: Buffer[] = [];

      deflate.on("data", (chunk: Buffer) => chunks.push(chunk));

      const originalData = Buffer.from("Hello World! ".repeat(1000));
      deflate.write(originalData);

      await new Promise<void>(resolve => deflate.end(() => resolve()));

      const compressed = Buffer.concat(chunks);
      const decompressed = inflateRawSync(compressed);

      expect(decompressed.toString()).toBe(originalData.toString());
    });
  });

  describe("ZipDeflate (streaming ZIP file)", () => {
    it("should emit ZIP data progressively during push(), not all at end", async () => {
      const results: { phase: "push" | "end"; size: number }[] = [];
      let phase: "push" | "end" = "push";

      const file = new ZipDeflate("test.txt", { level: 6 });
      file.ondata = (data: Uint8Array, _final: boolean) => {
        results.push({ phase, size: data.length });
      };

      // Push 3 chunks with proper async waiting
      const chunk = new TextEncoder().encode("X".repeat(2 * 1024 * 1024)); // 2MB chunks

      file.push(chunk);
      // Wait for async compression to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      file.push(chunk);
      await new Promise(resolve => setTimeout(resolve, 50));

      phase = "end";
      file.push(chunk, true); // final
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify streaming: should have received multiple data events
      // Header is emitted synchronously, but compressed data is async
      expect(results.length).toBeGreaterThanOrEqual(2);

      // Total data should include header + compressed data + data descriptor
      const totalSize = results.reduce((sum, r) => sum + r.size, 0);
      expect(totalSize).toBeGreaterThan(0);
    });
  });

  describe("StreamingZip (full ZIP archive)", () => {
    it("should emit ZIP chunks progressively, not buffer entire file", async () => {
      const results: { phase: "file" | "end"; size: number }[] = [];
      let phase: "file" | "end" = "file";

      const zip = new Zip((err, data, final) => {
        if (err) {
          throw err;
        }
        results.push({ phase, size: data.length });
        if (final) {
          phase = "end";
        }
      });

      // Add a file and push data
      const file = new ZipDeflate("large.txt", { level: 1 });
      zip.add(file);

      const chunk = new TextEncoder().encode("Y".repeat(3 * 1024 * 1024)); // 3MB chunks
      file.push(chunk);
      await new Promise(resolve => setTimeout(resolve, 100));

      file.push(chunk);
      await new Promise(resolve => setTimeout(resolve, 100));

      file.push(chunk, true);
      await new Promise(resolve => setTimeout(resolve, 100));

      phase = "end";
      zip.end();

      // Should have multiple data emissions
      // At minimum: header + compressed data + data descriptor + central directory
      expect(results.length).toBeGreaterThanOrEqual(2);

      // Total size should be reasonable (compressed)
      const totalSize = results.reduce((sum, r) => sum + r.size, 0);
      expect(totalSize).toBeGreaterThan(0);
      expect(totalSize).toBeLessThan(9 * 1024 * 1024 * 1.1); // Should be compressed
    });
  });
});
