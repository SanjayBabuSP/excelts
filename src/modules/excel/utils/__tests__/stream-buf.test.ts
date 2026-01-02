import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { StreamBuf } from "@excel/utils/stream-buf";
import { StringBuf } from "@excel/utils/string-buf";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to convert Uint8Array to string
function uint8ToString(data: Uint8Array | null): string {
  if (!data) {
    return "";
  }
  return new TextDecoder().decode(data);
}

describe("StreamBuf", () => {
  // StreamBuf is designed as a general-purpose writable-readable stream
  // However its use in ExcelTS is primarily as a memory buffer between
  // the streaming writers and the archive, hence the tests here will
  // focus just on that.
  it("writes strings as UTF8", () => {
    const stream = new StreamBuf();
    stream.write("Hello, World!");
    const chunk = stream.read();

    // Cross-platform: returns Uint8Array (not Buffer)
    expect(chunk).toBeInstanceOf(Uint8Array);
    expect(uint8ToString(chunk)).toBe("Hello, World!");
  });

  // Note: Using async/await here because our ES6 module fix requires it
  // Original test worked synchronously due to CommonJS instanceof check succeeding
  it("writes StringBuf chunks", async () => {
    const stream = new StreamBuf();
    const strBuf = new StringBuf({ size: 64 });
    strBuf.addText("Hello, World!");
    await stream.write(strBuf);
    const chunk = stream.read();

    expect(chunk).toBeInstanceOf(Uint8Array);
    expect(uint8ToString(chunk)).toBe("Hello, World!");
  });

  it("signals end", () =>
    new Promise<void>(resolve => {
      const stream = new StreamBuf();
      stream.on("finish", () => {
        resolve(undefined);
      });
      stream.write("Hello, World!");
      stream.end();
    }));

  it("handles buffers", () =>
    new Promise<void>((resolve, reject) => {
      const s = fs.createReadStream(path.join(__dirname, "data/image1.png"));
      const sb = new StreamBuf();
      sb.on("finish", () => {
        const buf = sb.toBuffer();
        expect(buf!.length).toBe(1672);
        resolve(undefined);
      });
      sb.on("error", reject);
      // Cast to any because StreamBuf is compatible but types differ slightly
      s.pipe(sb as any);
    }));

  it("handle unsupported type of chunk", async () => {
    const stream = new StreamBuf();
    try {
      await stream.write({} as any);
      expect.fail("should fail for given argument");
    } catch (e: any) {
      expect(e.message).toBe(
        "Chunk must be one of type String, Uint8Array, ArrayBuffer or StringBuf."
      );
    }
  });

  // Test for cross-realm Buffer compatibility (e.g., Web Workers)
  // Buffer.isBuffer() works across different realms where instanceof fails
  it("handles Buffer data using Buffer.isBuffer() for cross-realm compatibility", async () => {
    const stream = new StreamBuf();
    const bufferData = Buffer.from("Cross-realm test data");

    // This should work even if the Buffer comes from a different realm
    await stream.write(bufferData);
    const chunk = stream.read();

    expect(chunk).toBeInstanceOf(Uint8Array);
    expect(uint8ToString(chunk)).toBe("Cross-realm test data");
  });

  // Test direct Uint8Array support (important for browser environments)
  it("handles Uint8Array directly without conversion", async () => {
    const stream = new StreamBuf();
    const uint8Data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"

    // Uint8Array should be accepted directly (cross-realm safe via ArrayBuffer.isView)
    await stream.write(uint8Data);
    const chunk = stream.read();

    expect(chunk).toBeInstanceOf(Uint8Array);
    expect(uint8ToString(chunk)).toBe("Hello");
  });

  it("handles Uint8Array converted to Buffer", async () => {
    const stream = new StreamBuf();
    const uint8Data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const bufferData = Buffer.from(uint8Data);

    await stream.write(bufferData);
    const chunk = stream.read();

    expect(chunk).toBeInstanceOf(Uint8Array);
    expect(uint8ToString(chunk)).toBe("Hello");
  });

  // Test ArrayBuffer support (important for browser environments)
  it("handles ArrayBuffer directly", async () => {
    const stream = new StreamBuf();
    const arrayBuffer = new ArrayBuffer(5);
    const view = new Uint8Array(arrayBuffer);
    view.set([72, 101, 108, 108, 111]); // "Hello"

    await stream.write(arrayBuffer);
    const chunk = stream.read();

    expect(chunk).toBeInstanceOf(Uint8Array);
    expect(uint8ToString(chunk)).toBe("Hello");
  });

  // Test other typed arrays (Int8Array, Uint16Array, etc.)
  it("handles other typed arrays via ArrayBuffer.isView", async () => {
    const stream = new StreamBuf();
    // Create Int8Array with ASCII values for "Hi"
    const int8Data = new Int8Array([72, 105]); // "Hi"

    await stream.write(int8Data);
    const chunk = stream.read();

    expect(chunk).toBeInstanceOf(Uint8Array);
    expect(uint8ToString(chunk)).toBe("Hi");
  });

  // Cross-platform toBuffer() test
  it("toBuffer returns Uint8Array", () => {
    const stream = new StreamBuf();
    stream.write("Test data");
    const buf = stream.toBuffer();

    expect(buf).toBeInstanceOf(Uint8Array);
    expect(uint8ToString(buf)).toBe("Test data");
  });

  it("toBuffer returns null for empty stream", () => {
    const stream = new StreamBuf();
    const buf = stream.toBuffer();

    expect(buf).toBeNull();
  });

  it("supports cork and uncork", async () => {
    const stream = new StreamBuf();
    stream.cork();
    await stream.write("Hello ");
    await stream.write("World!");
    stream.uncork();

    const buf = stream.toBuffer();
    expect(uint8ToString(buf)).toBe("Hello World!");
  });

  it("supports pause and resume", () => {
    const stream = new StreamBuf();

    expect(stream.isPaused()).toBe(false);
    stream.pause();
    expect(stream.isPaused()).toBe(true);
    stream.resume();
    expect(stream.isPaused()).toBe(false);
  });

  it("preserves write order across partial reads", async () => {
    const stream = new StreamBuf();

    await stream.write("Hello");
    await stream.write("World");

    const first = stream.read(5);
    expect(uint8ToString(first)).toBe("Hello");

    const rest = stream.read();
    expect(uint8ToString(rest)).toBe("World");
  });
});
