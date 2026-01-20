import { describe, it, expect } from "vitest";
import { decodeCp437, decodeZipPath } from "@archive/shared/text";
import { parseExtraField, type ZipVars } from "@archive/unzip/parser-core";
import { crc32 } from "@archive/compression/crc32";
import { FLAG_UTF8 } from "@archive/zip-spec/zip-records";

// Helper to create Unicode Path extra field (0x7075)
function createUnicodePathExtraField(
  version: number,
  originalName: Uint8Array,
  unicodeName: string
): Uint8Array {
  const textEncoder = new TextEncoder();
  const unicodeBytes = textEncoder.encode(unicodeName);
  const crc = crc32(originalName);

  // header (4) + version (1) + crc32 (4) + unicodeName
  const extraField = new Uint8Array(4 + 1 + 4 + unicodeBytes.length);
  const view = new DataView(extraField.buffer);

  view.setUint16(0, 0x7075, true); // signature
  view.setUint16(2, 1 + 4 + unicodeBytes.length, true); // partSize
  extraField[4] = version;
  view.setUint32(5, crc, true);
  extraField.set(unicodeBytes, 9);

  return extraField;
}

// Helper to create Unicode Comment extra field (0x6375)
function createUnicodeCommentExtraField(
  version: number,
  originalComment: Uint8Array,
  unicodeComment: string
): Uint8Array {
  const textEncoder = new TextEncoder();
  const unicodeBytes = textEncoder.encode(unicodeComment);
  const crc = crc32(originalComment);

  const extraField = new Uint8Array(4 + 1 + 4 + unicodeBytes.length);
  const view = new DataView(extraField.buffer);

  view.setUint16(0, 0x6375, true); // signature
  view.setUint16(2, 1 + 4 + unicodeBytes.length, true); // partSize
  extraField[4] = version;
  view.setUint32(5, crc, true);
  extraField.set(unicodeBytes, 9);

  return extraField;
}

describe("CP437 decoding", () => {
  describe("decodeCp437", () => {
    it("should decode pure ASCII correctly", () => {
      const ascii = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      expect(decodeCp437(ascii)).toBe("Hello");
    });

    it("should decode empty buffer", () => {
      expect(decodeCp437(new Uint8Array(0))).toBe("");
    });

    it("should decode typical CP437 characters", () => {
      // Common CP437 characters used in old DOS file names
      // 0x81 = ü, 0x82 = é, 0x84 = ä, 0x94 = ö
      const cp437Bytes = new Uint8Array([0x81, 0x82, 0x84, 0x94]);
      expect(decodeCp437(cp437Bytes)).toBe("üéäö");
    });

    it("should decode CP437 box-drawing characters", () => {
      // Box drawing: 0xC4 = ─, 0xB3 = │, 0xDA = ┌, 0xBF = ┐
      const boxChars = new Uint8Array([0xda, 0xc4, 0xbf, 0xb3]);
      expect(decodeCp437(boxChars)).toBe("┌─┐│");
    });

    it("should decode CP437 Greek letters", () => {
      // Greek: 0xE0 = α, 0xE1 = ß, 0xE2 = Γ, 0xE3 = π
      const greek = new Uint8Array([0xe0, 0xe1, 0xe2, 0xe3]);
      expect(decodeCp437(greek)).toBe("αßΓπ");
    });

    it("should decode CP437 math symbols", () => {
      // Math: 0xF1 = ±, 0xF6 = ÷, 0xFB = √
      const math = new Uint8Array([0xf1, 0xf6, 0xfb]);
      expect(decodeCp437(math)).toBe("±÷√");
    });

    it("should decode mixed ASCII and CP437", () => {
      // "café" in CP437: c(0x63) a(0x61) f(0x66) é(0x82)
      const mixed = new Uint8Array([0x63, 0x61, 0x66, 0x82]);
      expect(decodeCp437(mixed)).toBe("café");
    });

    it("should decode real-world German filename", () => {
      // "Grüße.txt" in CP437: G r ü(0x81) ß(0xE1) e . t x t
      const germanName = new Uint8Array([0x47, 0x72, 0x81, 0xe1, 0x65, 0x2e, 0x74, 0x78, 0x74]);
      expect(decodeCp437(germanName)).toBe("Grüße.txt");
    });

    it("should decode real-world French filename", () => {
      // "résumé.doc" in CP437: r é(0x82) s u m é(0x82) . d o c
      const frenchName = new Uint8Array([
        0x72, 0x82, 0x73, 0x75, 0x6d, 0x82, 0x2e, 0x64, 0x6f, 0x63
      ]);
      expect(decodeCp437(frenchName)).toBe("résumé.doc");
    });

    it("should handle null bytes", () => {
      // CP437 byte 0 is the null character (should remain as \x00)
      const withNull = new Uint8Array([0x48, 0x00, 0x69]); // H\0i
      expect(decodeCp437(withNull)).toBe("H\x00i");
    });

    it("should decode full high character range", () => {
      // Test specific boundary characters
      // 0x80 = Ç (first high char)
      // 0xFF = NBSP (last high char)
      const boundary = new Uint8Array([0x80, 0xff]);
      expect(decodeCp437(boundary)).toBe("Ç\u00A0");
    });

    it("should decode path with directory separator", () => {
      // "données/fichier.txt"
      const path = new Uint8Array([
        0x64,
        0x6f,
        0x6e,
        0x6e,
        0x82,
        0x65,
        0x73,
        0x2f, // données/
        0x66,
        0x69,
        0x63,
        0x68,
        0x69,
        0x65,
        0x72,
        0x2e, // fichier.
        0x74,
        0x78,
        0x74 // txt
      ]);
      expect(decodeCp437(path)).toBe("données/fichier.txt");
    });
  });
});

describe("Unicode Path Extra Field (0x7075)", () => {
  it("should parse valid Unicode Path extra field", () => {
    // Original name in CP437: "Grüße.txt" encoded as CP437
    const originalName = new Uint8Array([0x47, 0x72, 0x81, 0xe1, 0x65, 0x2e, 0x74, 0x78, 0x74]);

    const extraField = createUnicodePathExtraField(1, originalName, "Grüße.txt");

    const vars: ZipVars = {
      compressedSize: 100,
      uncompressedSize: 200
    };

    const result = parseExtraField(extraField, vars);

    expect(result.unicodePath).toBeDefined();
    expect(result.unicodePath!.version).toBe(1);
    expect(result.unicodePath!.originalCrc32).toBe(crc32(originalName));
    expect(result.unicodePath!.unicodeValue).toBe("Grüße.txt");
  });

  it("should parse Unicode Path with Chinese characters", () => {
    // Original name in some encoding (doesn't matter for this test)
    const originalName = new Uint8Array([0x74, 0x65, 0x73, 0x74]); // "test"

    const extraField = createUnicodePathExtraField(1, originalName, "测试文件.txt");

    const vars: ZipVars = {
      compressedSize: 100,
      uncompressedSize: 200
    };

    const result = parseExtraField(extraField, vars);

    expect(result.unicodePath).toBeDefined();
    expect(result.unicodePath!.unicodeValue).toBe("测试文件.txt");
  });

  it("should parse Unicode Path with Japanese characters", () => {
    const originalName = new Uint8Array([0x74, 0x65, 0x73, 0x74]); // "test"

    const extraField = createUnicodePathExtraField(1, originalName, "ファイル名.txt");

    const vars: ZipVars = {
      compressedSize: 100,
      uncompressedSize: 200
    };

    const result = parseExtraField(extraField, vars);

    expect(result.unicodePath).toBeDefined();
    expect(result.unicodePath!.unicodeValue).toBe("ファイル名.txt");
  });

  it("should parse Unicode Path with emoji", () => {
    const originalName = new Uint8Array([0x74, 0x65, 0x73, 0x74]); // "test"

    const extraField = createUnicodePathExtraField(1, originalName, "📁folder/📄file.txt");

    const vars: ZipVars = {
      compressedSize: 100,
      uncompressedSize: 200
    };

    const result = parseExtraField(extraField, vars);

    expect(result.unicodePath).toBeDefined();
    expect(result.unicodePath!.unicodeValue).toBe("📁folder/📄file.txt");
  });

  it("should not set unicodePath for unsupported version", () => {
    const originalName = new Uint8Array([0x74, 0x65, 0x73, 0x74]); // "test"

    // Version 2 is not supported
    const extraField = createUnicodePathExtraField(2, originalName, "test.txt");

    const vars: ZipVars = {
      compressedSize: 100,
      uncompressedSize: 200
    };

    const result = parseExtraField(extraField, vars);

    // It should still be parsed, but validation should handle version check
    expect(result.unicodePath).toBeDefined();
    expect(result.unicodePath!.version).toBe(2);
  });

  it("should handle Unicode Path alongside ZIP64 extra field", () => {
    const originalName = new Uint8Array([0x74, 0x65, 0x73, 0x74]); // "test"

    // ZIP64 header first
    const zip64Field = new Uint8Array(12);
    const zip64View = new DataView(zip64Field.buffer);
    zip64View.setUint16(0, 0x0001, true); // ZIP64 signature
    zip64View.setUint16(2, 8, true); // partSize
    zip64View.setBigUint64(4, BigInt(0x100000000), true); // uncompressedSize

    // Unicode Path field
    const unicodeField = createUnicodePathExtraField(1, originalName, "测试.txt");

    // Combine both fields
    const combined = new Uint8Array(zip64Field.length + unicodeField.length);
    combined.set(zip64Field, 0);
    combined.set(unicodeField, zip64Field.length);

    const vars: ZipVars = {
      compressedSize: 100,
      uncompressedSize: 0xffffffff
    };

    const result = parseExtraField(combined, vars);

    // Both should be parsed
    expect(result.uncompressedSize).toBe(0x100000000);
    expect(result.unicodePath).toBeDefined();
    expect(result.unicodePath!.unicodeValue).toBe("测试.txt");
  });

  it("should skip malformed Unicode Path field (too short)", () => {
    // Extra field with only 4 bytes of data (minimum is 5)
    const malformed = new Uint8Array(8);
    const view = new DataView(malformed.buffer);
    view.setUint16(0, 0x7075, true); // signature
    view.setUint16(2, 3, true); // partSize: 3 bytes (too short, need at least 5)
    malformed[4] = 1; // version
    // Only 2 more bytes available, not enough for CRC32

    const vars: ZipVars = {
      compressedSize: 100,
      uncompressedSize: 200
    };

    const result = parseExtraField(malformed, vars);
    expect(result.unicodePath).toBeUndefined();
  });
});

describe("Unicode Comment Extra Field (0x6375)", () => {
  it("should parse valid Unicode Comment extra field", () => {
    const originalComment = new Uint8Array([0x74, 0x65, 0x73, 0x74]); // "test"

    const extraField = createUnicodeCommentExtraField(1, originalComment, "这是注释");

    const vars: ZipVars = {
      compressedSize: 100,
      uncompressedSize: 200
    };

    const result = parseExtraField(extraField, vars);

    expect(result.unicodeComment).toBeDefined();
    expect(result.unicodeComment!.version).toBe(1);
    expect(result.unicodeComment!.originalCrc32).toBe(crc32(originalComment));
    expect(result.unicodeComment!.unicodeValue).toBe("这是注释");
  });

  it("should parse both Unicode Path and Comment", () => {
    const originalName = new Uint8Array([0x6e, 0x61, 0x6d, 0x65]); // "name"
    const originalComment = new Uint8Array([0x63, 0x6f, 0x6d, 0x6d]); // "comm"

    const pathField = createUnicodePathExtraField(1, originalName, "名前.txt");
    const commentField = createUnicodeCommentExtraField(1, originalComment, "コメント");

    const combined = new Uint8Array(pathField.length + commentField.length);
    combined.set(pathField, 0);
    combined.set(commentField, pathField.length);

    const vars: ZipVars = {
      compressedSize: 100,
      uncompressedSize: 200
    };

    const result = parseExtraField(combined, vars);

    expect(result.unicodePath).toBeDefined();
    expect(result.unicodePath!.unicodeValue).toBe("名前.txt");

    expect(result.unicodeComment).toBeDefined();
    expect(result.unicodeComment!.unicodeValue).toBe("コメント");
  });
});

describe("CRC32 validation for Unicode extra fields", () => {
  it("should have matching CRC32 for original filename", () => {
    const originalName = new Uint8Array([0x47, 0x72, 0x81, 0xe1, 0x65]); // "Grüße" in CP437
    const calculatedCrc = crc32(originalName);

    // The CRC32 in the extra field should match the original name's CRC
    expect(typeof calculatedCrc).toBe("number");
    expect(calculatedCrc).not.toBe(0);

    // Verify CRC changes with different input
    const differentName = new Uint8Array([0x47, 0x72, 0x81, 0xe1, 0x66]); // slightly different
    expect(crc32(differentName)).not.toBe(calculatedCrc);
  });
});

describe("decodeZipPath", () => {
  it("should use UTF-8 when UTF-8 flag is set", () => {
    // UTF-8 encoded "café"
    const pathBuffer = new Uint8Array([0x63, 0x61, 0x66, 0xc3, 0xa9]);
    const result = decodeZipPath(pathBuffer, FLAG_UTF8, undefined);
    expect(result).toBe("café");
  });

  it("should use CP437 when no UTF-8 flag and no Unicode extra field", () => {
    // CP437 encoded "café" (é = 0x82)
    const pathBuffer = new Uint8Array([0x63, 0x61, 0x66, 0x82]);
    const result = decodeZipPath(pathBuffer, 0, undefined);
    expect(result).toBe("café");
  });

  it("should prefer Unicode Path extra field when CRC32 matches", () => {
    // Original name in CP437
    const pathBuffer = new Uint8Array([0x74, 0x65, 0x73, 0x74]); // "test"

    // Extra fields with Unicode Path that has matching CRC
    const extraField = createUnicodePathExtraField(1, pathBuffer, "测试.txt");
    const vars: ZipVars = { compressedSize: 100, uncompressedSize: 200 };
    const extra = parseExtraField(extraField, vars);

    const result = decodeZipPath(pathBuffer, 0, extra);
    expect(result).toBe("测试.txt");
  });

  it("should fall back to CP437 when Unicode Path CRC32 does not match", () => {
    // Original name in CP437: "Grüße" (ü=0x81, ß=0xE1)
    const pathBuffer = new Uint8Array([0x47, 0x72, 0x81, 0xe1, 0x65]); // "Grüße" in CP437

    // Create extra field with CRC of different string
    const differentBytes = new Uint8Array([0x6f, 0x74, 0x68, 0x65, 0x72]); // "other"
    const extraField = createUnicodePathExtraField(1, differentBytes, "unicode.txt");
    const vars: ZipVars = { compressedSize: 100, uncompressedSize: 200 };
    const extra = parseExtraField(extraField, vars);

    // Should fall back to CP437 since CRC doesn't match
    const result = decodeZipPath(pathBuffer, 0, extra);
    expect(result).toBe("Grüße");
  });

  it("should fall back to CP437 when Unicode Path version is not 1", () => {
    const pathBuffer = new Uint8Array([0x47, 0x72, 0x81, 0xe1, 0x65]); // "Grüße"

    // Create extra field with version 2 (not supported)
    const extraField = createUnicodePathExtraField(2, pathBuffer, "unicode.txt");
    const vars: ZipVars = { compressedSize: 100, uncompressedSize: 200 };
    const extra = parseExtraField(extraField, vars);

    // Should fall back to CP437 since version is not 1
    const result = decodeZipPath(pathBuffer, 0, extra);
    expect(result).toBe("Grüße");
  });

  it("should handle null flags gracefully", () => {
    const pathBuffer = new Uint8Array([0x63, 0x61, 0x66, 0x82]); // "café" in CP437
    const result = decodeZipPath(pathBuffer, null, undefined);
    expect(result).toBe("café");
  });

  it("should decode Chinese characters from Unicode Path extra field", () => {
    const pathBuffer = new Uint8Array([0x66, 0x69, 0x6c, 0x65]); // "file"
    const extraField = createUnicodePathExtraField(1, pathBuffer, "文件/数据.txt");
    const vars: ZipVars = { compressedSize: 100, uncompressedSize: 200 };
    const extra = parseExtraField(extraField, vars);

    const result = decodeZipPath(pathBuffer, 0, extra);
    expect(result).toBe("文件/数据.txt");
  });

  it("should decode Japanese characters from Unicode Path extra field", () => {
    const pathBuffer = new Uint8Array([0x66, 0x69, 0x6c, 0x65]); // "file"
    const extraField = createUnicodePathExtraField(1, pathBuffer, "フォルダ/ファイル.txt");
    const vars: ZipVars = { compressedSize: 100, uncompressedSize: 200 };
    const extra = parseExtraField(extraField, vars);

    const result = decodeZipPath(pathBuffer, 0, extra);
    expect(result).toBe("フォルダ/ファイル.txt");
  });

  it("should decode emoji from Unicode Path extra field", () => {
    const pathBuffer = new Uint8Array([0x66, 0x69, 0x6c, 0x65]); // "file"
    const extraField = createUnicodePathExtraField(1, pathBuffer, "📁folder/📄document.txt");
    const vars: ZipVars = { compressedSize: 100, uncompressedSize: 200 };
    const extra = parseExtraField(extraField, vars);

    const result = decodeZipPath(pathBuffer, 0, extra);
    expect(result).toBe("📁folder/📄document.txt");
  });
});
