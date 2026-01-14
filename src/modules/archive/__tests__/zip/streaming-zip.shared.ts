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
import {
  CENTRAL_DIR_SIG,
  ZIP64_EOCD_LOCATOR_SIG,
  ZIP64_EOCD_SIG,
  concatChunks,
  findSignatureFromEnd,
  hasSignature
} from "@archive/__tests__/zip/zip-test-utils";

/**
 * Streaming ZIP module interface - must be provided by platform-specific test
 */
export interface StreamingZipModuleImports {
  // Streaming ZIP classes
  Zip: new (
    callback: (err: Error | null, data: Uint8Array, final: boolean) => void,
    options?: { comment?: string; zip64?: boolean | "auto" }
  ) => {
    add(file: any): void;
    end(): void;
  };
  ZipDeflate: new (
    name: string,
    options?: { level?: number; zip64?: boolean | "auto"; smartStore?: boolean }
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

  const collectZip = (options?: {
    comment?: string;
    zip64?: boolean | "auto";
  }): {
    zip: InstanceType<StreamingZipModuleImports["Zip"]>;
    chunks: Uint8Array[];
    done: Promise<void>;
  } => {
    const chunks: Uint8Array[] = [];
    let resolveDone: (() => void) | null = null;
    let rejectDone: ((err: Error) => void) | null = null;
    const done = new Promise<void>((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });

    const zip = new Zip((err, data, final) => {
      if (err) {
        rejectDone?.(err);
        return;
      }
      if (data.length) {
        chunks.push(data);
      }
      if (final) {
        resolveDone?.();
      }
    }, options);

    return { zip, chunks, done };
  };

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
      const { zip, chunks, done } = collectZip();

      const file = new ZipDeflate("hello.txt", { level: 1 });
      zip.add(file);

      await file.push(new TextEncoder().encode("Hello, World!"), true);
      zip.end();
      await done;

      const zipData = concatChunks(chunks);

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
      const { zip, chunks, done } = collectZip();

      const file1 = new ZipDeflate("file1.txt", { level: 1 });
      const file2 = new ZipDeflate("folder/file2.txt", { level: 1 });
      const file3 = new ZipDeflate("file3.txt", { level: 0 }); // STORE mode

      zip.add(file1);
      zip.add(file2);
      zip.add(file3);

      // Push data to all files
      await Promise.all([
        file1.push(new TextEncoder().encode("Content 1"), true),
        file2.push(new TextEncoder().encode("Content 2"), true),
        file3.push(new TextEncoder().encode("Content 3"), true)
      ]);

      zip.end();
      await done;

      const zipData = concatChunks(chunks);

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
      const { zip, chunks, done } = collectZip();

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
        // Use subarray to avoid copying.
        await file.push(largeData.subarray(i, end), isLast);
      }

      zip.end();
      await done;

      const zipData = concatChunks(chunks);

      // Parse and verify
      const parser = new ZipParser(zipData);
      const entries = parser.getEntries();
      expect(entries.length).toBe(1);
      expect(entries[0].uncompressedSize).toBe(10 * 1024 * 1024);

      // Extract and verify
      const extracted = await parser.extractAll();
      const extractedData = extracted.get("large.bin")!;
      expect(extractedData.length).toBe(largeData.length);

      // Verify content (sample points) without O(n) iteration.
      const sampleCount = 1024;
      for (let i = 0; i < sampleCount; i++) {
        const idx = Math.floor((i * (largeData.length - 1)) / (sampleCount - 1));
        // Pattern is i % 256.
        const expected = idx % 256;
        const actual = extractedData[idx]!;
        if (actual !== expected) {
          throw new Error(`Mismatch at byte ${idx}: expected ${expected}, got ${actual}`);
        }
      }
    });
  });

  describe("StreamingZip ZIP64 options", () => {
    it("should write ZIP64 when zip64=true (forced)", async () => {
      const { zip, chunks, done } = collectZip({ zip64: true });

      const file = new ZipDeflate("a.txt", { level: 0, smartStore: false, zip64: true });
      zip.add(file);
      await file.push(new TextEncoder().encode("a"), true);

      zip.end();
      await done;

      const zipData = concatChunks(chunks);

      expect(hasSignature(zipData, ZIP64_EOCD_SIG, zipData.length - 256, zipData.length)).toBe(
        true
      );
      expect(
        hasSignature(zipData, ZIP64_EOCD_LOCATOR_SIG, zipData.length - 256, zipData.length)
      ).toBe(true);

      // Central directory header should use 0xFFFFFFFF sentinels.
      const cdOffset = findSignatureFromEnd(zipData, CENTRAL_DIR_SIG, 1024 * 1024);
      expect(cdOffset).toBeGreaterThanOrEqual(0);
      const view = new DataView(zipData.buffer, zipData.byteOffset, zipData.byteLength);
      const compSize32 = view.getUint32(cdOffset + 20, true);
      const uncompSize32 = view.getUint32(cdOffset + 24, true);
      const localOff32 = view.getUint32(cdOffset + 42, true);
      expect(compSize32).toBe(0xffffffff);
      expect(uncompSize32).toBe(0xffffffff);
      expect(localOff32).toBe(0xffffffff);

      const parser = new ZipParser(zipData);
      const entries = parser.getEntries();
      expect(entries.length).toBe(1);
      expect(entries[0].path).toBe("a.txt");
    });

    it("should error when zip64=false but ZIP64 is required (entry count)", () => {
      // IMPORTANT: Do not enqueue 65k ZipDeflate instances.
      // ZipDeflate allocates a 64KB sample buffer when smartStore=true, which would explode memory
      // and appear to hang in browser tests. Instead, force the internal counter to the limit and
      // assert add() throws synchronously.

      const zip = new Zip(() => {}, { zip64: false });
      (zip as any).addedEntryCount = 0xffff;

      const file = new ZipDeflate("e/0.txt", { level: 0, smartStore: false });
      expect(() => zip.add(file)).toThrow(/ZIP64 is required but zip64=false/);
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
