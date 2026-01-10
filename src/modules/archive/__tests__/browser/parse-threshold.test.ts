import { describe, it, expect } from "vitest";
import { createParse, createZipSync, type StreamZipEntry } from "@archive/index.browser";
import { DEFAULT_COMPRESS_THRESHOLD_BYTES } from "@archive/compress.base";
import { Readable } from "@stream";

describe("parse threshold optimization (browser)", () => {
  it("should have default threshold of 5MB", () => {
    expect(DEFAULT_COMPRESS_THRESHOLD_BYTES).toBe(8 * 1024 * 1024);
  });

  describe("small file sync decompression", () => {
    it("should correctly parse small compressed files (using sync path)", async () => {
      // Create a small zip with compressed content
      const smallContent = "Hello, World! This is a test file.";
      const smallContentBytes = new TextEncoder().encode(smallContent);

      const zipBuffer = createZipSync([{ name: "small.txt", data: smallContentBytes }], {
        level: 6
      });

      const parse = createParse({ forceStream: true });

      // Create a readable stream from the buffer
      const readable = new Readable();
      readable.push(zipBuffer);
      readable.push(null);
      readable.pipe(parse);

      let extractedContent = "";

      for await (const entry of parse) {
        const zipEntry = entry as StreamZipEntry;
        if (zipEntry.path === "small.txt") {
          const buffer = await zipEntry.buffer();
          extractedContent = new TextDecoder().decode(buffer);
        } else {
          zipEntry.autodrain();
        }
      }

      expect(extractedContent).toBe(smallContent);
    });

    it("should correctly parse uncompressed (STORE) files", async () => {
      // Create a zip with STORE (no compression)
      const content = "Uncompressed content for STORE mode test.";
      const contentBytes = new TextEncoder().encode(content);

      const zipBuffer = createZipSync([{ name: "store.txt", data: contentBytes }], { level: 0 }); // level 0 = STORE

      const parse = createParse({ forceStream: true });

      const readable = new Readable();
      readable.push(zipBuffer);
      readable.push(null);
      readable.pipe(parse);

      let extractedContent = "";

      for await (const entry of parse) {
        const zipEntry = entry as StreamZipEntry;
        if (zipEntry.path === "store.txt") {
          const buffer = await zipEntry.buffer();
          extractedContent = new TextDecoder().decode(buffer);
        } else {
          zipEntry.autodrain();
        }
      }

      expect(extractedContent).toBe(content);
    });

    it("should handle multiple small files in same archive", async () => {
      const files = [
        { name: "file1.txt", content: "Content of file 1" },
        { name: "file2.txt", content: "Content of file 2" },
        { name: "file3.txt", content: "Content of file 3" }
      ];

      const zipBuffer = createZipSync(
        files.map(f => ({ name: f.name, data: new TextEncoder().encode(f.content) })),
        { level: 6 }
      );

      const parse = createParse({ forceStream: true });

      const readable = new Readable();
      readable.push(zipBuffer);
      readable.push(null);
      readable.pipe(parse);

      const extracted: Record<string, string> = {};

      for await (const entry of parse) {
        const zipEntry = entry as StreamZipEntry;
        const buffer = await zipEntry.buffer();
        extracted[zipEntry.path] = new TextDecoder().decode(buffer);
      }

      for (const file of files) {
        expect(extracted[file.name]).toBe(file.content);
      }
    });

    it("should respect custom thresholdBytes option", async () => {
      // Create a file that's larger than our custom threshold
      const content = "x".repeat(1000); // 1KB
      const contentBytes = new TextEncoder().encode(content);

      const zipBuffer = createZipSync([{ name: "test.txt", data: contentBytes }], { level: 6 });

      // Set threshold to 500 bytes - file should use streaming path
      const parse = createParse({
        forceStream: true,
        thresholdBytes: 500
      });

      const readable = new Readable();
      readable.push(zipBuffer);
      readable.push(null);
      readable.pipe(parse);

      let extractedContent = "";

      for await (const entry of parse) {
        const zipEntry = entry as StreamZipEntry;
        if (zipEntry.path === "test.txt") {
          const buffer = await zipEntry.buffer();
          extractedContent = new TextDecoder().decode(buffer);
        } else {
          zipEntry.autodrain();
        }
      }

      // Content should still be extracted correctly regardless of path used
      expect(extractedContent).toBe(content);
    });

    it("should handle binary data correctly", async () => {
      // Create binary data (random bytes)
      const binaryData = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        binaryData[i] = i;
      }

      const zipBuffer = createZipSync([{ name: "binary.bin", data: binaryData }], { level: 6 });

      const parse = createParse({ forceStream: true });

      const readable = new Readable();
      readable.push(zipBuffer);
      readable.push(null);
      readable.pipe(parse);

      let extractedData: Uint8Array | null = null;

      for await (const entry of parse) {
        const zipEntry = entry as StreamZipEntry;
        if (zipEntry.path === "binary.bin") {
          extractedData = await zipEntry.buffer();
        } else {
          zipEntry.autodrain();
        }
      }

      expect(extractedData).not.toBeNull();
      expect(extractedData!.length).toBe(256);
      for (let i = 0; i < 256; i++) {
        expect(extractedData![i]).toBe(i);
      }
    });
  });

  describe("threshold boundary conditions", () => {
    it("should handle empty files", async () => {
      const zipBuffer = createZipSync([{ name: "empty.txt", data: new Uint8Array(0) }], {
        level: 6
      });

      const parse = createParse({ forceStream: true });

      const readable = new Readable();
      readable.push(zipBuffer);
      readable.push(null);
      readable.pipe(parse);

      let extractedData: Uint8Array | null = null;

      for await (const entry of parse) {
        const zipEntry = entry as StreamZipEntry;
        if (zipEntry.path === "empty.txt") {
          extractedData = await zipEntry.buffer();
        } else {
          zipEntry.autodrain();
        }
      }

      expect(extractedData).not.toBeNull();
      expect(extractedData!.length).toBe(0);
    });

    it("should handle files at threshold boundary", async () => {
      // Test with a file exactly at threshold boundary
      const thresholdBytes = 1024; // 1KB for testing
      const content = "x".repeat(thresholdBytes);
      const contentBytes = new TextEncoder().encode(content);

      const zipBuffer = createZipSync([{ name: "boundary.txt", data: contentBytes }], { level: 6 });

      const parse = createParse({
        forceStream: true,
        thresholdBytes
      });

      const readable = new Readable();
      readable.push(zipBuffer);
      readable.push(null);
      readable.pipe(parse);

      let extractedContent = "";

      for await (const entry of parse) {
        const zipEntry = entry as StreamZipEntry;
        if (zipEntry.path === "boundary.txt") {
          const buffer = await zipEntry.buffer();
          extractedContent = new TextDecoder().decode(buffer);
        } else {
          zipEntry.autodrain();
        }
      }

      expect(extractedContent).toBe(content);
    });
  });
});
