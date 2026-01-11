import { describe, it, expect } from "vitest";
import { inflateRaw, deflateRawStore, deflateRawCompressed } from "@archive/compression/deflate-fallback";
import { deflateRawSync, inflateRawSync } from "zlib";

describe("DEFLATE Fallback", () => {
  describe("inflateRaw (decompression)", () => {
    it("should decompress data compressed with Node.js zlib", () => {
      const original = Buffer.from("Hello, World! This is a test string for compression.");
      const compressed = deflateRawSync(original);

      const result = inflateRaw(new Uint8Array(compressed));

      expect(Buffer.from(result).toString()).toBe(original.toString());
    });

    it("should decompress empty data", () => {
      const original = Buffer.from("");
      const compressed = deflateRawSync(original);

      const result = inflateRaw(new Uint8Array(compressed));

      expect(result.length).toBe(0);
    });

    it("should decompress single byte", () => {
      const original = Buffer.from("A");
      const compressed = deflateRawSync(original);

      const result = inflateRaw(new Uint8Array(compressed));

      expect(Buffer.from(result).toString()).toBe("A");
    });

    it("should decompress repeated data (tests LZ77)", () => {
      const original = Buffer.from("ABCABCABCABCABCABCABCABCABCABC");
      const compressed = deflateRawSync(original);

      const result = inflateRaw(new Uint8Array(compressed));

      expect(Buffer.from(result).toString()).toBe(original.toString());
    });

    it("should decompress large data", () => {
      const original = Buffer.from("x".repeat(10000) + "y".repeat(10000));
      const compressed = deflateRawSync(original);

      const result = inflateRaw(new Uint8Array(compressed));

      expect(Buffer.from(result).toString()).toBe(original.toString());
    });

    it("should decompress binary data", () => {
      const original = Buffer.alloc(256);
      for (let i = 0; i < 256; i++) {
        original[i] = i;
      }
      const compressed = deflateRawSync(original);

      const result = inflateRaw(new Uint8Array(compressed));

      expect(Buffer.from(result)).toEqual(original);
    });

    it("should decompress random binary data", () => {
      const original = Buffer.alloc(1000);
      for (let i = 0; i < 1000; i++) {
        original[i] = Math.floor(Math.random() * 256);
      }
      const compressed = deflateRawSync(original);

      const result = inflateRaw(new Uint8Array(compressed));

      expect(Buffer.from(result)).toEqual(original);
    });

    // Edge cases for decompression
    it("should handle data with long back-references (distance up to 32768)", () => {
      // Create data that will have long distance references
      const pattern = "ABCDEFGHIJKLMNOP";
      const original = Buffer.from(pattern.repeat(2500)); // 40000 bytes
      const compressed = deflateRawSync(original);

      const result = inflateRaw(new Uint8Array(compressed));

      expect(Buffer.from(result).toString()).toBe(original.toString());
    });

    it("should handle maximum length references (258 bytes)", () => {
      // Create data that will trigger maximum length matches
      const original = Buffer.from("X".repeat(300) + "Y".repeat(300) + "X".repeat(300));
      const compressed = deflateRawSync(original);

      const result = inflateRaw(new Uint8Array(compressed));

      expect(Buffer.from(result).toString()).toBe(original.toString());
    });

    it("should decompress data with dynamic Huffman codes", () => {
      // Large varied data typically uses dynamic Huffman
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      let data = "";
      for (let i = 0; i < 5000; i++) {
        data += chars[i % chars.length];
      }
      const original = Buffer.from(data);
      const compressed = deflateRawSync(original);

      const result = inflateRaw(new Uint8Array(compressed));

      expect(Buffer.from(result).toString()).toBe(original.toString());
    });

    it("should handle data compressed with different compression levels", () => {
      const original = Buffer.from("Test data ".repeat(100));

      // Test with level 1 (fastest)
      const compressed1 = deflateRawSync(original, { level: 1 });
      expect(Buffer.from(inflateRaw(new Uint8Array(compressed1)))).toEqual(original);

      // Test with level 9 (best)
      const compressed9 = deflateRawSync(original, { level: 9 });
      expect(Buffer.from(inflateRaw(new Uint8Array(compressed9)))).toEqual(original);
    });

    it("should handle data with all zero bytes", () => {
      const original = Buffer.alloc(10000, 0);
      const compressed = deflateRawSync(original);

      const result = inflateRaw(new Uint8Array(compressed));

      expect(Buffer.from(result)).toEqual(original);
    });

    it("should handle data with all 0xFF bytes", () => {
      const original = Buffer.alloc(10000, 0xff);
      const compressed = deflateRawSync(original);

      const result = inflateRaw(new Uint8Array(compressed));

      expect(Buffer.from(result)).toEqual(original);
    });

    it("should handle alternating byte patterns", () => {
      const original = Buffer.alloc(10000);
      for (let i = 0; i < original.length; i++) {
        original[i] = i % 2 === 0 ? 0xaa : 0x55;
      }
      const compressed = deflateRawSync(original);

      const result = inflateRaw(new Uint8Array(compressed));

      expect(Buffer.from(result)).toEqual(original);
    });

    it("should handle UTF-8 encoded text with multibyte characters", () => {
      const original = Buffer.from("你好世界！Hello 世界 🌍🎉 émojis et accénts");
      const compressed = deflateRawSync(original);

      const result = inflateRaw(new Uint8Array(compressed));

      expect(Buffer.from(result).toString("utf8")).toBe(original.toString("utf8"));
    });

    it("should handle exactly 65535 bytes (max stored block size)", () => {
      const original = Buffer.alloc(65535, 0x42);
      const compressed = deflateRawSync(original);

      const result = inflateRaw(new Uint8Array(compressed));

      expect(Buffer.from(result)).toEqual(original);
    });

    it("should handle data just over 65535 bytes", () => {
      const original = Buffer.alloc(65536, 0x42);
      const compressed = deflateRawSync(original);

      const result = inflateRaw(new Uint8Array(compressed));

      expect(Buffer.from(result)).toEqual(original);
    });
  });

  describe("deflateRawStore (STORE mode compression)", () => {
    it("should create valid DEFLATE STORE data", () => {
      const original = new Uint8Array([1, 2, 3, 4, 5]);
      const compressed = deflateRawStore(original);

      // Decompress with Node.js zlib
      const result = inflateRawSync(Buffer.from(compressed));

      expect(Buffer.from(result)).toEqual(Buffer.from(original));
    });

    it("should handle empty data", () => {
      const original = new Uint8Array([]);
      const compressed = deflateRawStore(original);

      const result = inflateRawSync(Buffer.from(compressed));

      expect(result.length).toBe(0);
    });

    it("should handle large data (multiple blocks)", () => {
      // Create data larger than 65535 bytes (max block size)
      const original = new Uint8Array(70000);
      for (let i = 0; i < original.length; i++) {
        original[i] = i % 256;
      }
      const compressed = deflateRawStore(original);

      const result = inflateRawSync(Buffer.from(compressed));

      expect(Buffer.from(result)).toEqual(Buffer.from(original));
    });

    it("should be decompressable by our inflateRaw", () => {
      const original = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const compressed = deflateRawStore(original);

      const result = inflateRaw(compressed);

      expect(result).toEqual(original);
    });

    // Edge cases for STORE mode
    it("should handle exactly 65535 bytes (single max block)", () => {
      const original = new Uint8Array(65535);
      for (let i = 0; i < original.length; i++) {
        original[i] = i % 256;
      }
      const compressed = deflateRawStore(original);

      const result = inflateRawSync(Buffer.from(compressed));

      expect(Buffer.from(result)).toEqual(Buffer.from(original));
    });

    it("should handle 65536 bytes (requires 2 blocks)", () => {
      const original = new Uint8Array(65536);
      for (let i = 0; i < original.length; i++) {
        original[i] = i % 256;
      }
      const compressed = deflateRawStore(original);

      const result = inflateRawSync(Buffer.from(compressed));

      expect(Buffer.from(result)).toEqual(Buffer.from(original));
    });

    it("should handle 200000 bytes (multiple blocks)", () => {
      const original = new Uint8Array(200000);
      for (let i = 0; i < original.length; i++) {
        original[i] = i % 256;
      }
      const compressed = deflateRawStore(original);

      const result = inflateRawSync(Buffer.from(compressed));

      expect(Buffer.from(result)).toEqual(Buffer.from(original));
    });

    it("should handle single byte", () => {
      const original = new Uint8Array([0x42]);
      const compressed = deflateRawStore(original);

      const result = inflateRawSync(Buffer.from(compressed));

      expect(Buffer.from(result)).toEqual(Buffer.from(original));
    });
  });

  describe("deflateRawCompressed (LZ77 + fixed Huffman)", () => {
    it("should create valid DEFLATE compressed data", () => {
      const original = new TextEncoder().encode("Hello, World! This is a test.");
      const compressed = deflateRawCompressed(original);

      // Decompress with Node.js zlib
      const result = inflateRawSync(Buffer.from(compressed));

      expect(Buffer.from(result)).toEqual(Buffer.from(original));
    });

    it("should handle empty data", () => {
      const original = new Uint8Array([]);
      const compressed = deflateRawCompressed(original);

      const result = inflateRawSync(Buffer.from(compressed));

      expect(result.length).toBe(0);
    });

    it("should compress repeated data efficiently", () => {
      // Use data larger than 100 bytes to trigger actual compression (not STORE mode)
      const original = new TextEncoder().encode("ABCABCABCABCABCABCABCABCABCABC".repeat(5));
      const compressed = deflateRawCompressed(original);

      // Verify decompression works
      const result = inflateRawSync(Buffer.from(compressed));
      expect(Buffer.from(result)).toEqual(Buffer.from(original));

      // Verify compression actually happened (compressed should be smaller)
      expect(compressed.length).toBeLessThan(original.length);
    });

    it("should handle all byte values", () => {
      const original = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        original[i] = i;
      }
      const compressed = deflateRawCompressed(original);

      const result = inflateRawSync(Buffer.from(compressed));

      expect(Buffer.from(result)).toEqual(Buffer.from(original));
    });

    it("should be decompressable by our inflateRaw", () => {
      const original = new TextEncoder().encode("Testing round-trip compression");
      const compressed = deflateRawCompressed(original);

      const result = inflateRaw(compressed);

      expect(new TextDecoder().decode(result)).toBe("Testing round-trip compression");
    });

    it("should handle large data", () => {
      const original = new TextEncoder().encode("Hello World! ".repeat(1000));
      const compressed = deflateRawCompressed(original);

      const result = inflateRawSync(Buffer.from(compressed));

      expect(Buffer.from(result)).toEqual(Buffer.from(original));
    });

    // Edge cases for LZ77 compression
    it("should handle data with varying match lengths", () => {
      // Create data with different repetition patterns
      let data = "";
      for (let len = 3; len <= 20; len++) {
        const pattern = "X".repeat(len);
        data += pattern + "Y" + pattern + "Z";
      }
      const original = new TextEncoder().encode(data.repeat(10));
      const compressed = deflateRawCompressed(original);

      const result = inflateRawSync(Buffer.from(compressed));

      expect(Buffer.from(result)).toEqual(Buffer.from(original));
    });

    it("should handle data with varying distances", () => {
      // Create data that will have various distance values
      let data = "";
      for (let i = 0; i < 100; i++) {
        data += "A".repeat(10) + "B".repeat((i % 50) + 1) + "A".repeat(10);
      }
      const original = new TextEncoder().encode(data);
      const compressed = deflateRawCompressed(original);

      const result = inflateRawSync(Buffer.from(compressed));

      expect(Buffer.from(result)).toEqual(Buffer.from(original));
    });

    it("should handle data with no repeating patterns (worst case)", () => {
      // Random-ish data with no patterns
      const original = new Uint8Array(500);
      for (let i = 0; i < original.length; i++) {
        original[i] = (i * 31 + 17) % 256;
      }
      const compressed = deflateRawCompressed(original);

      const result = inflateRawSync(Buffer.from(compressed));

      expect(Buffer.from(result)).toEqual(Buffer.from(original));
    });

    it("should handle data exactly at STORE mode threshold (99 bytes)", () => {
      const original = new TextEncoder().encode("X".repeat(99));
      const compressed = deflateRawCompressed(original);

      const result = inflateRawSync(Buffer.from(compressed));

      expect(Buffer.from(result)).toEqual(Buffer.from(original));
    });

    it("should handle data just above STORE mode threshold (100 bytes)", () => {
      const original = new TextEncoder().encode("X".repeat(100));
      const compressed = deflateRawCompressed(original);

      const result = inflateRawSync(Buffer.from(compressed));

      expect(Buffer.from(result)).toEqual(Buffer.from(original));
    });

    it("should handle long runs of single character", () => {
      const original = new TextEncoder().encode("A".repeat(50000));
      const compressed = deflateRawCompressed(original);

      const result = inflateRawSync(Buffer.from(compressed));

      expect(Buffer.from(result)).toEqual(Buffer.from(original));

      // Should achieve good compression
      expect(compressed.length).toBeLessThan(original.length / 10);
    });
  });

  describe("round-trip (compress then decompress)", () => {
    it("should round-trip with STORE mode", () => {
      const original = new TextEncoder().encode("Test data for round-trip");
      const compressed = deflateRawStore(original);
      const result = inflateRaw(compressed);

      expect(result).toEqual(original);
    });

    it("should round-trip with LZ77 compression", () => {
      const original = new TextEncoder().encode("Repeated text repeated text repeated text");
      const compressed = deflateRawCompressed(original);
      const result = inflateRaw(compressed);

      expect(result).toEqual(original);
    });

    it("should round-trip binary data", () => {
      const original = new Uint8Array(500);
      for (let i = 0; i < original.length; i++) {
        original[i] = (i * 7 + 13) % 256;
      }

      const compressedStore = deflateRawStore(original);
      const resultStore = inflateRaw(compressedStore);
      expect(resultStore).toEqual(original);

      const compressedLZ = deflateRawCompressed(original);
      const resultLZ = inflateRaw(compressedLZ);
      expect(resultLZ).toEqual(original);
    });

    // Additional round-trip edge cases
    it("should round-trip large binary data", () => {
      const original = new Uint8Array(100000);
      for (let i = 0; i < original.length; i++) {
        original[i] = (i * 13 + 7) % 256;
      }

      const compressed = deflateRawCompressed(original);
      const result = inflateRaw(compressed);

      expect(result).toEqual(original);
    });

    it("should round-trip data with all byte values repeated", () => {
      const original = new Uint8Array(256 * 10);
      for (let i = 0; i < original.length; i++) {
        original[i] = i % 256;
      }

      const compressed = deflateRawCompressed(original);
      const result = inflateRaw(compressed);

      expect(result).toEqual(original);
    });

    it("should round-trip UTF-8 text", () => {
      const text = "Hello 世界! Привет мир! 🌍🎉 Ñoño señor";
      const original = new TextEncoder().encode(text.repeat(100));

      const compressed = deflateRawCompressed(original);
      const result = inflateRaw(compressed);

      expect(new TextDecoder().decode(result)).toBe(text.repeat(100));
    });
  });

  describe("interoperability with Node.js zlib", () => {
    it("should decompress zlib output correctly for various data sizes", () => {
      const sizes = [1, 10, 100, 1000, 10000, 50000];

      for (const size of sizes) {
        const original = Buffer.alloc(size);
        for (let i = 0; i < size; i++) {
          original[i] = (i * 17 + 23) % 256;
        }

        const compressed = deflateRawSync(original);
        const result = inflateRaw(new Uint8Array(compressed));

        expect(Buffer.from(result)).toEqual(original);
      }
    });

    it("should produce output that zlib can decompress for various data sizes", () => {
      const sizes = [1, 10, 100, 1000, 10000, 50000];

      for (const size of sizes) {
        const original = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
          original[i] = (i * 17 + 23) % 256;
        }

        // Test STORE mode
        const compressedStore = deflateRawStore(original);
        const resultStore = inflateRawSync(Buffer.from(compressedStore));
        expect(Buffer.from(resultStore)).toEqual(Buffer.from(original));

        // Test LZ77 mode (for sizes >= 100)
        const compressedLZ = deflateRawCompressed(original);
        const resultLZ = inflateRawSync(Buffer.from(compressedLZ));
        expect(Buffer.from(resultLZ)).toEqual(Buffer.from(original));
      }
    });

    it("should handle zlib compressed XML-like data (Excel use case)", () => {
      const xmlData = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="s"><v>1</v></c>
    </row>
    <row r="2">
      <c r="A2"><v>100</v></c>
      <c r="B2"><v>200</v></c>
    </row>
  </sheetData>
</worksheet>`.repeat(50);

      const original = Buffer.from(xmlData);
      const compressed = deflateRawSync(original);

      const result = inflateRaw(new Uint8Array(compressed));

      expect(Buffer.from(result).toString()).toBe(xmlData);
    });

    it("should compress XML-like data that zlib can decompress", () => {
      const xmlData = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheets>
    <sheet name="Sheet1" sheetId="1" r:id="rId1"/>
    <sheet name="Sheet2" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`.repeat(20);

      const original = new TextEncoder().encode(xmlData);
      const compressed = deflateRawCompressed(original);

      const result = inflateRawSync(Buffer.from(compressed));

      expect(Buffer.from(result).toString()).toBe(xmlData);
    });
  });

  describe("error handling", () => {
    it("should throw on invalid block type", () => {
      // Create invalid DEFLATE data with block type 3 (reserved)
      const invalidData = new Uint8Array([0x07]); // BFINAL=1, BTYPE=11

      expect(() => inflateRaw(invalidData)).toThrow("Invalid DEFLATE block type");
    });

    it("should throw on truncated data", () => {
      const original = Buffer.from("Hello, World!");
      const compressed = deflateRawSync(original);

      // Truncate the compressed data
      const truncated = new Uint8Array(compressed.slice(0, compressed.length - 5));

      expect(() => inflateRaw(truncated)).toThrow();
    });

    it("should throw on corrupted stored block length", () => {
      // Create a stored block with mismatched LEN/NLEN
      const invalidData = new Uint8Array([
        0x01, // BFINAL=1, BTYPE=00 (stored)
        0x05,
        0x00, // LEN = 5
        0x00,
        0x00 // NLEN should be 0xFFFA, but we use 0x0000
      ]);

      expect(() => inflateRaw(invalidData)).toThrow("Invalid stored block length");
    });
  });
});
