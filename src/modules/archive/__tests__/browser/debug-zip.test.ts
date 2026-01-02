/**
 * Debug test to verify StreamingZip produces correct ZIP files
 */
import { describe, it, expect } from "vitest";
import { StreamingZip, ZipDeflateFile } from "@archive/streaming-zip";

describe("Debug ZIP output", () => {
  it("should produce ZIP with data descriptor", async () => {
    const chunks: Uint8Array[] = [];

    let resolveFinish: (() => void) | undefined;
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

    // Add a file and await completion
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

    console.log("ZIP total size:", fullZip.length, "bytes");
    console.log(
      "ZIP hex:",
      Array.from(fullZip.slice(0, 100))
        .map(b => b.toString(16).padStart(2, "0"))
        .join(" ")
    );

    // ZIP should be larger than just the local header (30 bytes + filename)
    expect(fullZip.length).toBeGreaterThan(50);

    // Check for local file header signature
    const localHeaderSig =
      (fullZip[0] | (fullZip[1] << 8) | (fullZip[2] << 16) | (fullZip[3] << 24)) >>> 0;
    expect(localHeaderSig).toBe(0x04034b50); // PK\x03\x04

    // Look for data descriptor signature (0x08074b50)
    let foundDataDescriptor = false;
    for (let i = 0; i < fullZip.length - 4; i++) {
      const sig =
        (fullZip[i] | (fullZip[i + 1] << 8) | (fullZip[i + 2] << 16) | (fullZip[i + 3] << 24)) >>>
        0;
      if (sig === 0x08074b50) {
        foundDataDescriptor = true;
        console.log("Found data descriptor at offset:", i);
        break;
      }
    }
    expect(foundDataDescriptor).toBe(true);

    // Look for central directory header (0x02014b50)
    let foundCentralDir = false;
    for (let i = 0; i < fullZip.length - 4; i++) {
      const sig =
        (fullZip[i] | (fullZip[i + 1] << 8) | (fullZip[i + 2] << 16) | (fullZip[i + 3] << 24)) >>>
        0;
      if (sig === 0x02014b50) {
        foundCentralDir = true;
        console.log("Found central directory at offset:", i);
        break;
      }
    }
    expect(foundCentralDir).toBe(true);

    // Look for end of central directory (0x06054b50)
    let foundEOCD = false;
    for (let i = 0; i < fullZip.length - 4; i++) {
      const sig =
        (fullZip[i] | (fullZip[i + 1] << 8) | (fullZip[i + 2] << 16) | (fullZip[i + 3] << 24)) >>>
        0;
      if (sig === 0x06054b50) {
        foundEOCD = true;
        console.log("Found end of central directory at offset:", i);
        break;
      }
    }
    expect(foundEOCD).toBe(true);
  });
});
