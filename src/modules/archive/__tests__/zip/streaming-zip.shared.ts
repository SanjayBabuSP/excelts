/**
 * ZIP Streaming Module Shared Tests
 *
 * Unit tests that run identically in both Node.js and Browser environments.
 * These tests verify that streaming ZIP creation works correctly regardless of platform.
 *
 * Import this test suite from your platform-specific test file and call
 * runStreamingZipTests() with your platform's imports.
 */

import { describe, it, expect } from "vitest";

/**
 * Streaming ZIP module interface - must be provided by platform-specific test
 */
export interface StreamingZipModuleImports {
  // Streaming ZIP classes
  Zip: new (callback: (err: Error | null, data: Uint8Array, final: boolean) => void) => {
    add(file: any): void;
    end(): void;
  };
  ZipDeflate: new (
    name: string,
    options?: { level?: number }
  ) => {
    name: string;
    level: number;
    ondata: ((data: Uint8Array, final: boolean) => void) | undefined;
    push(data: Uint8Array, final?: boolean, callback?: (err?: Error | null) => void): Promise<void>;
    isComplete(): boolean;
  };

  // Deflate stream factory
  createDeflateStream: (options?: { level?: number }) => {
    write(chunk: Uint8Array): boolean;
    end(): void;
    on(event: string, handler: (...args: any[]) => void): void;
  };

  // ZIP parser for verification
  ZipParser: new (data: Uint8Array) => {
    getEntries(): Array<{
      path: string;
      uncompressedSize: number;
      compressedSize: number;
      compressionMethod: number;
    }>;
    extractAll(): Promise<Map<string, Uint8Array>>;
  };
}

/**
 * Run all shared streaming ZIP tests with the provided module imports
 */
export function runStreamingZipTests(imports: StreamingZipModuleImports): void {
  const { Zip, ZipDeflate, createDeflateStream, ZipParser } = imports;

  describe("createDeflateStream", () => {
    it("should create a deflate stream", () => {
      const stream = createDeflateStream({ level: 6 });
      expect(stream).toBeDefined();
      expect(typeof stream.write).toBe("function");
      expect(typeof stream.end).toBe("function");
      expect(typeof stream.on).toBe("function");
    });

    it("should compress data via streaming", async () => {
      const stream = createDeflateStream({ level: 6 });
      const chunks: Uint8Array[] = [];

      await new Promise<void>((resolve, reject) => {
        stream.on("data", (chunk: Uint8Array) => {
          chunks.push(chunk);
        });

        stream.on("end", () => {
          resolve();
        });

        stream.on("error", (err: Error) => {
          reject(err);
        });

        // Write test data
        const testData = new TextEncoder().encode("Hello, World!");
        stream.write(testData);
        stream.end();
      });

      // Should have compressed output
      expect(chunks.length).toBeGreaterThan(0);
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      expect(totalLength).toBeGreaterThan(0);
    });
  });

  describe("ZipDeflate", () => {
    it("should create a zip file entry", () => {
      const file = new ZipDeflate("test.txt", { level: 6 });
      expect(file.name).toBe("test.txt");
      expect(file.level).toBe(6);
    });

    it("should emit header and data descriptor", async () => {
      const file = new ZipDeflate("test.txt", { level: 1 });
      const chunks: Uint8Array[] = [];

      await new Promise<void>(resolve => {
        file.ondata = (data: Uint8Array, final: boolean) => {
          chunks.push(data);
          if (final) {
            resolve();
          }
        };

        file.push(new TextEncoder().encode("Hello"), true);
      });

      // Should have: header, compressed data, data descriptor
      expect(chunks.length).toBeGreaterThanOrEqual(2);

      // First chunk should be local file header (signature 0x04034b50)
      const firstChunk = chunks[0];
      const sig = new DataView(firstChunk.buffer, firstChunk.byteOffset).getUint32(0, true);
      expect(sig).toBe(0x04034b50);

      // Last chunk should be data descriptor (signature 0x08074b50)
      const lastChunk = chunks[chunks.length - 1];
      const descSig = new DataView(lastChunk.buffer, lastChunk.byteOffset).getUint32(0, true);
      expect(descSig).toBe(0x08074b50);
    });
  });

  describe("StreamingZip (Zip)", () => {
    it("should create a valid ZIP with single file", async () => {
      const chunks: Uint8Array[] = [];

      const zip = new Zip((err, data, _final) => {
        if (err) {
          throw err;
        }
        chunks.push(data);
      });

      const file = new ZipDeflate("hello.txt", { level: 1 });
      zip.add(file);

      await new Promise<void>(resolve => {
        const originalOndata = file.ondata;
        // Wait for file to complete
        const checkComplete = () => {
          if (file.isComplete()) {
            zip.end();
            // Give time for central directory
            setTimeout(resolve, 50);
          }
        };

        file.ondata = (data, final) => {
          originalOndata?.(data, final);
          if (final) {
            checkComplete();
          }
        };

        file.push(new TextEncoder().encode("Hello, World!"), true);
      });

      // Concatenate all chunks
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const zipData = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        zipData.set(chunk, offset);
        offset += chunk.length;
      }

      // Parse and verify the ZIP
      const parser = new ZipParser(zipData);
      const entries = parser.getEntries();
      expect(entries.length).toBe(1);
      expect(entries[0].path).toBe("hello.txt");

      // Extract and verify content
      const extracted = await parser.extractAll();
      const content = new TextDecoder().decode(extracted.get("hello.txt")!);
      expect(content).toBe("Hello, World!");
    });

    it("should create a valid ZIP with multiple files", async () => {
      const chunks: Uint8Array[] = [];

      const zip = new Zip((err, data, _final) => {
        if (err) {
          throw err;
        }
        chunks.push(data);
      });

      const file1 = new ZipDeflate("file1.txt", { level: 1 });
      const file2 = new ZipDeflate("folder/file2.txt", { level: 1 });
      const file3 = new ZipDeflate("file3.txt", { level: 0 }); // STORE mode

      zip.add(file1);
      zip.add(file2);
      zip.add(file3);

      // Push data to all files
      file1.push(new TextEncoder().encode("Content 1"), true);
      file2.push(new TextEncoder().encode("Content 2"), true);
      file3.push(new TextEncoder().encode("Content 3"), true);

      // Wait for completion
      await new Promise<void>(resolve => {
        zip.end();
        setTimeout(resolve, 200);
      });

      // Concatenate chunks
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const zipData = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        zipData.set(chunk, offset);
        offset += chunk.length;
      }

      // Parse and verify
      const parser = new ZipParser(zipData);
      const entries = parser.getEntries();
      expect(entries.length).toBe(3);

      const paths = entries.map(e => e.path).sort();
      expect(paths).toEqual(["file1.txt", "file3.txt", "folder/file2.txt"]);

      // Extract and verify content
      const extracted = await parser.extractAll();
      expect(new TextDecoder().decode(extracted.get("file1.txt")!)).toBe("Content 1");
      expect(new TextDecoder().decode(extracted.get("folder/file2.txt")!)).toBe("Content 2");
      expect(new TextDecoder().decode(extracted.get("file3.txt")!)).toBe("Content 3");
    });

    it("should handle large data streaming", async () => {
      const chunks: Uint8Array[] = [];

      const zip = new Zip((err, data, _final) => {
        if (err) {
          throw err;
        }
        chunks.push(data);
      });

      const file = new ZipDeflate("large.bin", { level: 1 });
      zip.add(file);

      // Create 10MB of data
      const largeData = new Uint8Array(10 * 1024 * 1024);
      for (let i = 0; i < largeData.length; i++) {
        largeData[i] = i % 256;
      }

      // Push in chunks (simulating streaming)
      const chunkSize = 512 * 1024; // 512KB chunks
      for (let i = 0; i < largeData.length; i += chunkSize) {
        const end = Math.min(i + chunkSize, largeData.length);
        const isLast = end >= largeData.length;
        file.push(largeData.slice(i, end), isLast);
      }

      // Wait for completion
      await new Promise<void>(resolve => {
        zip.end();
        setTimeout(resolve, 500);
      });

      // Concatenate chunks
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const zipData = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        zipData.set(chunk, offset);
        offset += chunk.length;
      }

      // Parse and verify
      const parser = new ZipParser(zipData);
      const entries = parser.getEntries();
      expect(entries.length).toBe(1);
      expect(entries[0].uncompressedSize).toBe(10 * 1024 * 1024);

      // Extract and verify
      const extracted = await parser.extractAll();
      const extractedData = extracted.get("large.bin")!;
      expect(extractedData.length).toBe(largeData.length);

      // Verify content
      for (let i = 0; i < largeData.length; i++) {
        if (extractedData[i] !== largeData[i]) {
          throw new Error(`Mismatch at byte ${i}`);
        }
      }
    });
  });

  describe("True Streaming Verification", () => {
    it("should emit data chunks progressively (true streaming)", async () => {
      const stream = createDeflateStream({ level: 1 });
      const dataEvents: number[] = [];
      let endCalled = false;

      stream.on("data", (chunk: Uint8Array) => {
        dataEvents.push(chunk.length);
      });

      stream.on("end", () => {
        endCalled = true;
      });

      // Write multiple chunks
      for (let i = 0; i < 5; i++) {
        stream.write(
          new TextEncoder().encode(`Chunk ${i} with some padding data to make it bigger\n`)
        );
      }
      stream.end();

      // Wait for all events
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(endCalled).toBe(true);
      expect(dataEvents.length).toBeGreaterThan(0);
    });
  });
}
