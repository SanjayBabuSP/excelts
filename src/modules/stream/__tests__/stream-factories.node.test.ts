import { describe, it, expect } from "vitest";
import { createWritable, createPassThrough, stringToUint8Array } from "@stream";

describe("stream factories (Node)", () => {
  it("createWritable should receive written chunks", async () => {
    const chunks: string[] = [];

    const writable = createWritable<string>({
      objectMode: true,
      write(chunk, _encoding, callback) {
        chunks.push(chunk);
        callback();
      }
    });

    writable.write("hello");
    writable.write("world");
    writable.end();

    await new Promise<void>(resolve => writable.on("finish", resolve));
    expect(chunks).toEqual(["hello", "world"]);
  });

  it("createPassThrough should pass data through unchanged", async () => {
    const passThrough = createPassThrough({ objectMode: true });
    const results: string[] = [];

    passThrough.on("data", (chunk: string) => results.push(chunk));

    passThrough.write("a");
    passThrough.write("b");
    passThrough.end();

    await new Promise<void>(resolve => passThrough.on("finish", resolve));
    expect(results).toEqual(["a", "b"]);
  });

  it("createPassThrough should work in binary mode", async () => {
    const passThrough = createPassThrough();
    const results: Uint8Array[] = [];

    passThrough.on("data", (chunk: Uint8Array) => results.push(chunk));

    passThrough.write(stringToUint8Array("test"));
    passThrough.end();

    await new Promise<void>(resolve => passThrough.on("finish", resolve));
    expect(results.length).toBe(1);
    expect(results[0]).toBeInstanceOf(Uint8Array);
  });
});
