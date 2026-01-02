import { describe, it, expect } from "vitest";
import { bufferStream } from "@archive/parse.base";
import { Readable } from "@stream";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

describe("buffer-stream", () => {
  describe("bufferStream", () => {
    it("should concatenate all chunks into a single buffer", async () => {
      const input = Readable.from([
        encoder.encode("hello"),
        encoder.encode(" "),
        encoder.encode("world")
      ]);

      const result = await bufferStream(input);

      expect(decoder.decode(result)).toBe("hello world");
    });

    it("should handle empty stream", async () => {
      const input = Readable.from([]);

      const result = await bufferStream(input);

      expect(result.length).toBe(0);
    });

    it("should handle single chunk", async () => {
      const input = Readable.from([encoder.encode("single chunk")]);

      const result = await bufferStream(input);

      expect(decoder.decode(result)).toBe("single chunk");
    });

    it("should handle binary data", async () => {
      const binary = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
      const input = Readable.from([binary]);

      const result = await bufferStream(input);

      // Compare the actual bytes
      expect(result.length).toBe(binary.length);
      expect([...result]).toEqual([...binary]);
    });

    it("should reject on stream error", async () => {
      const input = new Readable({
        read() {
          this.destroy(new Error("Stream error"));
        }
      });

      await expect(bufferStream(input)).rejects.toThrow("Stream error");
    });
  });
});
