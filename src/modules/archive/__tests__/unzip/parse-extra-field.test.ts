import { describe, it, expect } from "vitest";
import { parseExtraField, type ZipVars } from "@archive/parse.base";

describe("parse-extra-field", () => {
  describe("parseExtraField", () => {
    it("should return empty object for empty extra field", () => {
      const vars: ZipVars = {
        compressedSize: 100,
        uncompressedSize: 200
      };
      const result = parseExtraField(Buffer.alloc(0), vars);
      expect(result).toEqual({});
    });

    it("should parse ZIP64 extra field with uncompressed size", () => {
      // ZIP64 header: signature 0x0001, partSize 8
      const extraField = Buffer.alloc(12);
      extraField.writeUInt16LE(0x0001, 0); // signature
      extraField.writeUInt16LE(8, 2); // partSize
      extraField.writeBigUInt64LE(BigInt(0x100000000), 4); // uncompressedSize > 4GB

      const vars: ZipVars = {
        compressedSize: 100,
        uncompressedSize: 0xffffffff // marker for ZIP64
      };

      const result = parseExtraField(extraField, vars);
      expect(result.uncompressedSize).toBe(0x100000000);
      expect(vars.uncompressedSize).toBe(0x100000000);
    });

    it("should parse ZIP64 extra field with compressed size", () => {
      const extraField = Buffer.alloc(12);
      extraField.writeUInt16LE(0x0001, 0);
      extraField.writeUInt16LE(8, 2);
      extraField.writeBigUInt64LE(BigInt(0x200000000), 4);

      const vars: ZipVars = {
        compressedSize: 0xffffffff, // marker for ZIP64
        uncompressedSize: 100
      };

      const result = parseExtraField(extraField, vars);
      expect(result.compressedSize).toBe(0x200000000);
      expect(vars.compressedSize).toBe(0x200000000);
    });

    it("should parse ZIP64 extra field with both sizes", () => {
      const extraField = Buffer.alloc(20);
      extraField.writeUInt16LE(0x0001, 0);
      extraField.writeUInt16LE(16, 2);
      extraField.writeBigUInt64LE(BigInt(0x100000000), 4); // uncompressed
      extraField.writeBigUInt64LE(BigInt(0x200000000), 12); // compressed

      const vars: ZipVars = {
        compressedSize: 0xffffffff,
        uncompressedSize: 0xffffffff
      };

      const result = parseExtraField(extraField, vars);
      expect(result.uncompressedSize).toBe(0x100000000);
      expect(result.compressedSize).toBe(0x200000000);
    });

    it("should skip non-ZIP64 extra field headers", () => {
      // First header: non-ZIP64 (signature 0x0007, partSize 4)
      // Second header: ZIP64 (signature 0x0001, partSize 8)
      const extraField = Buffer.alloc(20);
      // Non-ZIP64 header
      extraField.writeUInt16LE(0x0007, 0);
      extraField.writeUInt16LE(4, 2);
      extraField.writeUInt32LE(0x12345678, 4);
      // ZIP64 header
      extraField.writeUInt16LE(0x0001, 8);
      extraField.writeUInt16LE(8, 10);
      extraField.writeBigUInt64LE(BigInt(0x300000000), 12);

      const vars: ZipVars = {
        compressedSize: 100,
        uncompressedSize: 0xffffffff
      };

      const result = parseExtraField(extraField, vars);
      expect(result.uncompressedSize).toBe(0x300000000);
    });

    it("should handle offset to local file header", () => {
      const extraField = Buffer.alloc(28);
      extraField.writeUInt16LE(0x0001, 0);
      extraField.writeUInt16LE(24, 2);
      extraField.writeBigUInt64LE(BigInt(0x100000000), 4); // uncompressed
      extraField.writeBigUInt64LE(BigInt(0x200000000), 12); // compressed
      extraField.writeBigUInt64LE(BigInt(0x300000000), 20); // offset

      const vars: ZipVars = {
        compressedSize: 0xffffffff,
        uncompressedSize: 0xffffffff,
        offsetToLocalFileHeader: 0xffffffff
      };

      const result = parseExtraField(extraField, vars);
      expect(result.offsetToLocalFileHeader).toBe(0x300000000);
      expect(vars.offsetToLocalFileHeader).toBe(0x300000000);
    });

    it("should parse extended timestamp (0x5455) mtime", () => {
      // Extended Timestamp header: signature 0x5455, partSize 5, flags=mtime present, mtime=123456789
      const extraField = Buffer.alloc(9);
      extraField.writeUInt16LE(0x5455, 0);
      extraField.writeUInt16LE(5, 2);
      extraField.writeUInt8(0x01, 4);
      extraField.writeUInt32LE(123456789, 5);

      const vars: ZipVars = {
        compressedSize: 100,
        uncompressedSize: 200
      };

      const result = parseExtraField(extraField, vars);
      expect(result.mtimeUnixSeconds).toBe(123456789);
      // Sizes unchanged
      expect(vars.compressedSize).toBe(100);
      expect(vars.uncompressedSize).toBe(200);
    });
  });
});
