import { describe, it, expect } from "vitest";
import { createZip, ZipBuilder, extractAll, extractFile } from "@archive";

// Helper to decode Uint8Array to string
const decode = (data: Uint8Array): string => new TextDecoder().decode(data);

describe("zip/unzip integration", () => {
  it("createZip output should be readable via extractFile", async () => {
    const zipData = await createZip([
      { name: "other.txt", data: new TextEncoder().encode("Other content") },
      { name: "target.txt", data: new TextEncoder().encode("Target file content") }
    ]);

    const extracted = await extractFile(zipData, "target.txt");
    expect(extracted).not.toBeNull();
    expect(decode(extracted!)).toBe("Target file content");
  });

  it("ZipBuilder streaming output should be readable via extractAll", async () => {
    const builder = new ZipBuilder({ level: 6 });
    const chunks: Uint8Array[] = [];

    const [h1, d1] = await builder.addFile({
      name: "stream1.txt",
      data: new TextEncoder().encode("Streaming file 1")
    });
    chunks.push(h1, d1);

    const [h2, d2] = await builder.addFile({
      name: "stream2.txt",
      data: new TextEncoder().encode("Streaming file 2")
    });
    chunks.push(h2, d2);

    chunks.push(...builder.finalize());

    const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
    const zipData = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      zipData.set(chunk, offset);
      offset += chunk.length;
    }

    const files = await extractAll(zipData);
    expect(files.size).toBe(2);
    expect(decode(files.get("stream1.txt")!.data)).toBe("Streaming file 1");
    expect(decode(files.get("stream2.txt")!.data)).toBe("Streaming file 2");
  });
});
