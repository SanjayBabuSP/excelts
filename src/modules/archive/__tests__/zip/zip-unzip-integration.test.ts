import { describe, it, expect } from "vitest";
import { zip, unzip } from "@archive";

// Helper to decode Uint8Array to string
const decode = (data: Uint8Array): string => new TextDecoder().decode(data);

describe("zip/unzip integration", () => {
  it("zip().bytes() output should be readable via unzip().get()", async () => {
    const zipData = await zip()
      .add("other.txt", new TextEncoder().encode("Other content"))
      .add("target.txt", new TextEncoder().encode("Target file content"))
      .bytes();

    const reader = unzip(zipData);
    const entry = await reader.get("target.txt");
    expect(entry).not.toBeNull();
    const extracted = await entry!.bytes();
    expect(decode(extracted)).toBe("Target file content");
  });

  it("zip().stream() output should be readable via unzip().entries()", async () => {
    const stream = zip()
      .add("stream1.txt", new TextEncoder().encode("Streaming file 1"))
      .add("stream2.txt", new TextEncoder().encode("Streaming file 2"))
      .stream();

    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
    const zipData = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      zipData.set(chunk, offset);
      offset += chunk.length;
    }

    const files = new Map<string, Uint8Array>();
    for await (const entry of unzip(zipData).entries()) {
      if (entry.isDirectory) {
        entry.discard();
        continue;
      }
      files.set(entry.path, await entry.bytes());
    }

    expect(files.size).toBe(2);
    expect(decode(files.get("stream1.txt")!)).toBe("Streaming file 1");
    expect(decode(files.get("stream2.txt")!)).toBe("Streaming file 2");
  });
});
