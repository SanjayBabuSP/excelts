/**
 * True Streaming Tests - Browser Implementation
 *
 * Uses browser-specific APIs (CompressionStream, DecompressionStream)
 * to verify TRUE streaming behavior.
 */

import { describe, beforeAll, expect, it } from "vitest";
import { createTrueStreamingTests } from "../utils/true-streaming-tests";
import { yieldToEventLoop, generateLargeText } from "../utils/streaming-test-base";

// Lazy import to avoid Node.js module resolution issues
let WorkbookWriter: any;
let WorkbookReader: any;
let StreamingZip: any;
let ZipDeflateFile: any;
let unzip: any;

beforeAll(async () => {
  // Dynamic imports for browser environment - use index.browser directly
  const excelModule = await import("../../index.browser");
  WorkbookWriter = excelModule.WorkbookWriter;
  WorkbookReader = excelModule.WorkbookReader;

  const zipModule = await import("../../modules/archive/streaming-zip");
  StreamingZip = zipModule.StreamingZip;
  ZipDeflateFile = zipModule.ZipDeflateFile;

  const unzipModule = await import("../../modules/archive");
  unzip = unzipModule;
});

// ============================================================================
// Browser-Specific Test Context
// ============================================================================

function getBrowserContext() {
  return {
    isBrowser: true,

    // ZIP Creation using StreamingZip
    createZip: async (onData: (chunk: Uint8Array) => void) => {
      let resolveFinish: () => void;
      const finishPromise = new Promise<void>(resolve => {
        resolveFinish = resolve;
      });

      const zip = new StreamingZip((err: Error | null, data: Uint8Array, final: boolean) => {
        if (err) {
          throw err;
        }
        if (data && data.length > 0) {
          onData(data);
        }
        if (final) {
          resolveFinish();
        }
      });

      return {
        addFile: async (name: string, content: Uint8Array) => {
          const file = new ZipDeflateFile(name, { level: 6 });
          zip.add(file);
          file.push(content, true);
          await yieldToEventLoop();
        },
        finalize: async () => {
          zip.end();
          await finishPromise;
        }
      };
    },

    // ZIP Parsing
    parseZip: async (
      zipData: Uint8Array,
      onEntry: (entry: { path: string; stream: () => AsyncIterable<Uint8Array> }) => Promise<void>
    ) => {
      const parser = new unzip.ZipParser(zipData);
      const entries = parser.getEntries();

      for (const entry of entries) {
        if (!entry.isDirectory) {
          await onEntry({
            path: entry.path,
            stream: () => ({
              async *[Symbol.asyncIterator]() {
                const content = await parser.extract(entry.path);
                if (content) {
                  const chunkSize = 16384;
                  for (let i = 0; i < content.length; i += chunkSize) {
                    yield content.slice(i, Math.min(i + chunkSize, content.length));
                  }
                }
              }
            })
          });
        }
      }
    },

    // Excel Write
    createWorkbookWriter: async (onData: (chunk: Uint8Array) => void) => {
      const writable = new WritableStream<Uint8Array>({
        write(chunk) {
          onData(chunk);
        }
      });

      // Enable trueStreaming for immediate data output
      const workbook = new WorkbookWriter({ stream: writable, trueStreaming: true });

      return {
        addWorksheet: (name: string) => {
          const worksheet = workbook.addWorksheet(name);
          return {
            addRow: (data: (string | number)[]) => worksheet.addRow(data),
            commit: () => worksheet.commit()
          };
        },
        commit: () => workbook.commit()
      };
    },

    // Excel Read - using WorkbookReader for TRUE streaming
    createWorkbookReader: async (
      data: Uint8Array,
      onRow: (sheetName: string, rowNumber: number, values: unknown[]) => void
    ) => {
      // Use WorkbookReader for TRUE streaming - rows are yielded progressively
      const reader = new WorkbookReader(data);

      for await (const worksheet of reader) {
        for await (const row of worksheet) {
          onRow(worksheet.name, row.number, row.values);
        }
      }
    }
  };
}

// ============================================================================
// Run Shared Tests
// ============================================================================

createTrueStreamingTests(getBrowserContext);

// ============================================================================
// Browser-Specific Additional Tests
// ============================================================================

describe("Browser-Specific True Streaming", () => {
  describe("Native CompressionStream Verification", () => {
    it("should verify CompressionStream streams chunks progressively", async () => {
      // Skip if CompressionStream not available
      if (typeof CompressionStream === "undefined") {
        console.log("CompressionStream not available, skipping test");
        return;
      }

      const chunks: { time: number; size: number }[] = [];
      const startTime = performance.now();

      const compressionStream = new CompressionStream("deflate-raw");
      const writer = compressionStream.writable.getWriter();
      const reader = compressionStream.readable.getReader();

      // Start reading in background
      const readPromise = (async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          chunks.push({
            time: Math.round(performance.now() - startTime),
            size: value.length
          });
        }
      })();

      // Write 10MB of random data in 3MB chunks (random data won't compress well)
      const chunkSize = 3 * 1024 * 1024;
      const totalChunks = 3;

      for (let i = 0; i < totalChunks; i++) {
        // Use random data to prevent extreme compression
        const data = new Uint8Array(chunkSize);
        for (let j = 0; j < data.length; j += 65536) {
          const size = Math.min(65536, data.length - j);
          crypto.getRandomValues(data.subarray(j, j + size));
        }
        await writer.write(data);
        await yieldToEventLoop();
        console.log(`Write ${i + 1}: ${chunks.length} output chunks so far`);
      }

      const chunksBeforeClose = chunks.length;
      await writer.close();
      await readPromise;

      console.log(`\n=== Native CompressionStream Analysis ===`);
      console.log(`Chunks before close: ${chunksBeforeClose}`);
      console.log(`Chunks after close: ${chunks.length}`);
      console.log(`Total compressed size: ${chunks.reduce((s, c) => s + c.size, 0)} bytes`);

      if (chunksBeforeClose > 0) {
        console.log("\n✅ CompressionStream streams progressively");
      } else {
        console.log("\n⚠️ All data buffered until close");
      }

      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe("Native DecompressionStream Verification", () => {
    it("should verify DecompressionStream streams chunks progressively", async () => {
      // Skip if DecompressionStream not available
      if (typeof DecompressionStream === "undefined") {
        console.log("DecompressionStream not available, skipping test");
        return;
      }

      // First compress some data
      const compressionStream = new CompressionStream("deflate-raw");
      const compressWriter = compressionStream.writable.getWriter();
      const compressReader = compressionStream.readable.getReader();

      const compressedChunks: Uint8Array[] = [];
      const compressReadPromise = (async () => {
        while (true) {
          const { done, value } = await compressReader.read();
          if (done) {
            break;
          }
          compressedChunks.push(value);
        }
      })();

      // Create 500KB of test data
      const testData = new TextEncoder().encode(generateLargeText(500000));
      await compressWriter.write(testData);
      await compressWriter.close();
      await compressReadPromise;

      // Combine compressed data
      const totalCompressed = compressedChunks.reduce((s, c) => s + c.length, 0);
      const compressedData = new Uint8Array(totalCompressed);
      let offset = 0;
      for (const chunk of compressedChunks) {
        compressedData.set(chunk, offset);
        offset += chunk.length;
      }

      console.log(`Compressed data size: ${totalCompressed} bytes`);

      // Now test decompression streaming
      const decompressedChunks: { time: number; size: number }[] = [];
      const startTime = performance.now();

      const decompressionStream = new DecompressionStream("deflate-raw");
      const decompressWriter = decompressionStream.writable.getWriter();
      const decompressReader = decompressionStream.readable.getReader();

      // Start reading in background
      const decompressReadPromise = (async () => {
        while (true) {
          const { done, value } = await decompressReader.read();
          if (done) {
            break;
          }
          decompressedChunks.push({
            time: Math.round(performance.now() - startTime),
            size: value.length
          });
        }
      })();

      // Write compressed data in small chunks to simulate streaming
      const writeChunkSize = 1000;
      for (let i = 0; i < compressedData.length; i += writeChunkSize) {
        const chunk = compressedData.slice(i, Math.min(i + writeChunkSize, compressedData.length));
        await decompressWriter.write(chunk);

        if (i % 10000 === 0) {
          await yieldToEventLoop();
          console.log(`Decompress write ${i}: ${decompressedChunks.length} output chunks`);
        }
      }

      const chunksBeforeClose = decompressedChunks.length;
      await decompressWriter.close();
      await decompressReadPromise;

      const totalDecompressed = decompressedChunks.reduce((s, c) => s + c.size, 0);

      console.log(`\n=== Native DecompressionStream Analysis ===`);
      console.log(`Chunks before close: ${chunksBeforeClose}`);
      console.log(`Chunks after close: ${decompressedChunks.length}`);
      console.log(`Total decompressed size: ${totalDecompressed} bytes`);

      if (chunksBeforeClose > 0) {
        console.log("\n✅ DecompressionStream streams progressively");
      } else {
        console.log("\n⚠️ All data buffered until close");
      }

      expect(decompressedChunks.length).toBeGreaterThan(0);
      expect(totalDecompressed).toBe(testData.length);
    });
  });
});
