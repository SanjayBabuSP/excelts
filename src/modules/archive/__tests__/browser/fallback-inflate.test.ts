/**
 * Test that Parse.browser.ts (with FallbackInflateRaw) can parse
 * ZIP files created by StreamingZip
 */
import { describe, it, expect } from "vitest";
import { StreamingZip, ZipDeflateFile } from "@archive/zip/stream";
import { Parse } from "@archive/unzip/stream.browser";

// Type helper for browser Parse which has different methods than Node version
type BrowserParse = Parse & {
  on(event: string, listener: (...args: any[]) => void): void;
  write(chunk: Uint8Array): void;
  end(): void;
};

describe("FallbackInflateRaw", () => {
  it("should fall back to non-streaming DEFLATE when CompressionStream is unavailable", async () => {
    const originalCompressionStream = globalThis.CompressionStream;
    const originalDecompressionStream = globalThis.DecompressionStream;

    // Simulate an older browser without CompressionStream/DecompressionStream.
    globalThis.CompressionStream = undefined;
    globalThis.DecompressionStream = undefined;

    try {
      const chunks: Uint8Array[] = [];

      let resolveFinish: () => void;
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
          resolveFinish();
        }
      });

      const encoder = new TextEncoder();
      const payload = encoder.encode("stream-me");

      const file = new ZipDeflateFile("test.txt", { level: 6 });
      zip.add(file);

      // In old browsers without CompressionStream, StreamingZip should still work.
      // It will fall back to buffered (non-streaming) DEFLATE, so output may not be
      // emitted until end(), but the resulting ZIP must be valid.
      file.push(payload, true);
      await file.complete();

      zip.end();
      await finishPromise;

      // Concatenate ZIP chunks
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const fullZip = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        fullZip.set(chunk, offset);
        offset += chunk.length;
      }

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
              const len = readChunks.reduce((acc, c) => acc + c.length, 0);
              const combined = new Uint8Array(len);
              let pos = 0;
              for (const c of readChunks) {
                combined.set(c, pos);
                pos += c.length;
              }
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
    // Create a ZIP file with StreamingZip/ZipDeflateFile
    const chunks: Uint8Array[] = [];

    let resolveFinish: () => void;
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
        resolveFinish();
      }
    });

    const file = new ZipDeflateFile("test.txt", { level: 6 });
    zip.add(file);
    file.push(new TextEncoder().encode("Hello, World!"), true);
    await file.complete();

    zip.end();
    await finishPromise;

    // Concatenate all chunks
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const fullZip = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      fullZip.set(chunk, offset);
      offset += chunk.length;
    }

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
            const totalLen = readChunks.reduce((acc, c) => acc + c.length, 0);
            const combined = new Uint8Array(totalLen);
            let pos = 0;
            for (const c of readChunks) {
              combined.set(c, pos);
              pos += c.length;
            }
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
    // Create a ZIP file with multiple files
    const chunks: Uint8Array[] = [];

    let resolveFinish: () => void;
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
        resolveFinish();
      }
    });

    const encoder = new TextEncoder();

    const file1 = new ZipDeflateFile("file1.txt", { level: 6 });
    zip.add(file1);
    file1.push(encoder.encode("File 1 content"), true);
    await file1.complete();

    const file2 = new ZipDeflateFile("file2.txt", { level: 6 });
    zip.add(file2);
    file2.push(encoder.encode("File 2 content"), true);
    await file2.complete();

    const file3 = new ZipDeflateFile("dir/file3.txt", { level: 6 });
    zip.add(file3);
    file3.push(encoder.encode("File 3 content"), true);
    await file3.complete();

    zip.end();
    await finishPromise;

    // Concatenate all chunks
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const fullZip = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      fullZip.set(chunk, offset);
      offset += chunk.length;
    }

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
            const totalLen = readChunks.reduce((acc, c) => acc + c.length, 0);
            const combined = new Uint8Array(totalLen);
            let pos = 0;
            for (const c of readChunks) {
              combined.set(c, pos);
              pos += c.length;
            }
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
