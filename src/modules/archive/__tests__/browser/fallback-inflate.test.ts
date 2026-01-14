/**
 * Test that Parse.browser.ts (with FallbackInflateRaw) can parse
 * ZIP files created by StreamingZip
 */
import { describe, it, expect } from "vitest";
import { StreamingZip, ZipDeflateFile } from "@archive/zip/stream";
import { Parse } from "@archive/unzip/stream.browser";
import { concatChunks } from "@archive/__tests__/zip/zip-test-utils";

// Type helper for browser Parse which has different methods than Node version
type BrowserParse = Parse & {
  on(event: string, listener: (...args: any[]) => void): void;
  write(chunk: Uint8Array): void;
  end(): void;
};

async function createZipBytesWithStreamingZip(
  entries: Array<{ name: string; content: Uint8Array; level?: number }>
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];

  let resolveFinish: (() => void) | null = null;
  const finishPromise = new Promise<void>(resolve => {
    resolveFinish = resolve;
  });

  const zip = new StreamingZip((err: Error | null, data: Uint8Array, final: boolean) => {
    if (err) {
      throw err;
    }
    if (data && data.length > 0) {
      chunks.push(data);
    }
    if (final) {
      resolveFinish?.();
    }
  });

  for (const entry of entries) {
    const file = new ZipDeflateFile(entry.name, { level: entry.level ?? 6 });
    zip.add(file);
    file.push(entry.content, true);
    await file.complete();
  }

  zip.end();
  await finishPromise;
  return concatChunks(chunks);
}

describe("FallbackInflateRaw", () => {
  it("should fall back to non-streaming DEFLATE when CompressionStream is unavailable", async () => {
    const originalCompressionStream = globalThis.CompressionStream;
    const originalDecompressionStream = globalThis.DecompressionStream;

    // Simulate an older browser without CompressionStream/DecompressionStream.
    globalThis.CompressionStream = undefined;
    globalThis.DecompressionStream = undefined;

    try {
      const encoder = new TextEncoder();
      const payload = encoder.encode("stream-me");

      // In old browsers without CompressionStream, StreamingZip should still work.
      // It will fall back to buffered (non-streaming) DEFLATE, so output may not be
      // emitted until end(), but the resulting ZIP must be valid.
      const fullZip = await createZipBytesWithStreamingZip([
        { name: "test.txt", content: payload, level: 6 }
      ]);

      // Parse the ZIP to ensure it's valid and content matches.
      const parser = new Parse() as BrowserParse;
      const entries: Array<{ name: string; content: string }> = [];

      const entryPromise = new Promise<void>((resolve, reject) => {
        parser.on("entry", async (entry: any) => {
          if (entry.type === "File") {
            const readChunks: Uint8Array[] = [];
            entry.on("data", (chunk: Uint8Array) => {
              readChunks.push(chunk);
            });
            entry.on("end", () => {
              const combined = concatChunks(readChunks);
              entries.push({
                name: entry.path,
                content: new TextDecoder().decode(combined)
              });
              resolve();
            });
            entry.on("error", (err: Error) => reject(err));
          } else {
            entry.autodrain();
          }
        });
        parser.on("error", (err: Error) => reject(err));
      });

      parser.write(fullZip);
      parser.end();
      await entryPromise;

      expect(entries.length).toBe(1);
      expect(entries[0].name).toBe("test.txt");
      expect(entries[0].content).toBe("stream-me");
    } finally {
      globalThis.CompressionStream = originalCompressionStream;
      globalThis.DecompressionStream = originalDecompressionStream;
    }
  }, 30000);

  it("should parse ZIP created by StreamingZip", async () => {
    const fullZip = await createZipBytesWithStreamingZip([
      { name: "test.txt", content: new TextEncoder().encode("Hello, World!"), level: 6 }
    ]);

    console.log("ZIP size:", fullZip.length);

    // Parse the ZIP using Parse.browser.ts
    const parser = new Parse() as BrowserParse;
    const entries: Array<{ name: string; content: string }> = [];

    // Set up entry promise - wait for entry to be fully processed
    const entryPromise = new Promise<void>((resolve, reject) => {
      parser.on("entry", async (entry: any) => {
        console.log("Got entry:", entry.path, "type:", entry.type);

        if (entry.type === "File") {
          // Read manually from the entry stream
          const readChunks: Uint8Array[] = [];

          entry.on("data", (chunk: Uint8Array) => {
            console.log("Got chunk:", chunk.length, "bytes");
            readChunks.push(chunk);
          });

          entry.on("end", () => {
            console.log("Entry stream ended, total chunks:", readChunks.length);
            const combined = concatChunks(readChunks);
            const content = new TextDecoder().decode(combined);
            entries.push({
              name: entry.path,
              content: content
            });
            resolve();
          });

          entry.on("error", (err: Error) => {
            console.error("Entry stream error:", err);
            reject(err);
          });
        } else {
          entry.autodrain();
        }
      });

      parser.on("error", (err: Error) => {
        console.error("Parser error:", err);
        reject(err);
      });
    });

    // Feed the data to the parser
    parser.write(fullZip);
    parser.end();

    // Wait for entry to be fully processed
    await entryPromise;

    console.log("Entry processed, entries:", entries.length);

    // Verify results
    expect(entries.length).toBe(1);
    expect(entries[0].name).toBe("test.txt");
    expect(entries[0].content).toBe("Hello, World!");
  }, 30000);

  it("should parse ZIP with multiple files", async () => {
    const encoder = new TextEncoder();

    const fullZip = await createZipBytesWithStreamingZip([
      { name: "file1.txt", content: encoder.encode("File 1 content"), level: 6 },
      { name: "file2.txt", content: encoder.encode("File 2 content"), level: 6 },
      { name: "dir/file3.txt", content: encoder.encode("File 3 content"), level: 6 }
    ]);

    console.log("Multi-file ZIP size:", fullZip.length);

    // Parse the ZIP
    const parser = new Parse() as BrowserParse;
    const entries: Array<{ name: string; content: string }> = [];

    // Wait for all 3 entries
    const allEntriesPromise = new Promise<void>((resolve, reject) => {
      parser.on("entry", async (entry: any) => {
        console.log("Got entry:", entry.path);

        if (entry.type === "File") {
          const readChunks: Uint8Array[] = [];

          entry.on("data", (chunk: Uint8Array) => {
            readChunks.push(chunk);
          });

          entry.on("end", () => {
            const combined = concatChunks(readChunks);
            entries.push({
              name: entry.path,
              content: new TextDecoder().decode(combined)
            });
            if (entries.length === 3) {
              resolve();
            }
          });

          entry.on("error", reject);
        } else {
          entry.autodrain();
        }
      });

      parser.on("error", reject);
    });

    // Feed the data to the parser
    parser.write(fullZip);
    parser.end();

    await allEntriesPromise;

    // Verify results
    expect(entries.length).toBe(3);
    expect(entries.find(e => e.name === "file1.txt")?.content).toBe("File 1 content");
    expect(entries.find(e => e.name === "file2.txt")?.content).toBe("File 2 content");
    expect(entries.find(e => e.name === "dir/file3.txt")?.content).toBe("File 3 content");
  }, 30000);
});
