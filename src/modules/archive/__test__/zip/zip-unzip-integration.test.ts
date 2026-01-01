import { describe, it, expect } from "vitest";
import {
  createZip,
  createZipSync,
  ZipBuilder,
  extractAll,
  extractFile,
  listFiles
} from "../../index";

// Helper to decode Uint8Array to string
const decode = (data: Uint8Array): string => new TextDecoder().decode(data);

/**
 * Integration tests to verify that ZIP files created by our native implementation
 * can be correctly read by the unzip module's new simple API
 */
describe("zip integration with unzip", () => {
  describe("createZip -> extractAll roundtrip", () => {
    it("should create ZIP that can be read by extractAll", async () => {
      const content = new TextEncoder().encode("Hello, World!");
      const zipData = await createZip([{ name: "hello.txt", data: content }]);

      const files = await extractAll(zipData);

      expect(files.size).toBe(1);
      expect(files.has("hello.txt")).toBe(true);
      expect(decode(files.get("hello.txt")!.data)).toBe("Hello, World!");
    });

    it("should handle multiple files roundtrip", async () => {
      const file1 = new TextEncoder().encode("Content of file 1");
      const file2 = new TextEncoder().encode("Content of file 2\nwith newline");
      const file3 = new TextEncoder().encode("Third file");

      const zipData = await createZip([
        { name: "file1.txt", data: file1 },
        { name: "dir/file2.txt", data: file2 },
        { name: "dir/subdir/file3.txt", data: file3 }
      ]);

      const files = await extractAll(zipData);

      expect(files.size).toBe(3);
      expect(decode(files.get("file1.txt")!.data)).toBe("Content of file 1");
      expect(decode(files.get("dir/file2.txt")!.data)).toBe("Content of file 2\nwith newline");
      expect(decode(files.get("dir/subdir/file3.txt")!.data)).toBe("Third file");
    });

    it("should handle large file roundtrip", async () => {
      // Create 100KB file with pattern
      const large = new Uint8Array(100 * 1024);
      for (let i = 0; i < large.length; i++) {
        large[i] = i % 256;
      }

      const zipData = await createZip([{ name: "large.bin", data: large }], { level: 1 });

      const files = await extractAll(zipData);
      const extracted = files.get("large.bin")!;

      expect(extracted.data.length).toBe(large.length);

      // Verify content
      for (let i = 0; i < large.length; i++) {
        expect(extracted.data[i]).toBe(large[i]);
      }
    });

    it("should handle empty file roundtrip", async () => {
      const empty = new Uint8Array(0);
      const zipData = await createZip([{ name: "empty.txt", data: empty }]);

      const files = await extractAll(zipData);

      expect(files.get("empty.txt")!.data.length).toBe(0);
    });

    it("should handle STORE compression (level 0) roundtrip", async () => {
      const content = new TextEncoder().encode("Uncompressed content");
      const zipData = await createZip([{ name: "stored.txt", data: content }], { level: 0 });

      const files = await extractAll(zipData);

      expect(decode(files.get("stored.txt")!.data)).toBe("Uncompressed content");
    });

    it("should handle unicode content roundtrip", async () => {
      const content = new TextEncoder().encode("你好世界 🌍 مرحبا العالم");
      const zipData = await createZip([{ name: "unicode.txt", data: content }]);

      const files = await extractAll(zipData);

      expect(decode(files.get("unicode.txt")!.data)).toBe("你好世界 🌍 مرحبا العالم");
    });

    it("should handle unicode filenames roundtrip", async () => {
      const content = new TextEncoder().encode("Content");
      const zipData = await createZip([{ name: "文件/中文名.txt", data: content }]);

      const files = await extractAll(zipData);

      expect(files.has("文件/中文名.txt")).toBe(true);
      expect(decode(files.get("文件/中文名.txt")!.data)).toBe("Content");
    });
  });

  describe("createZipSync -> extractAll roundtrip", () => {
    it("should create sync ZIP that can be read by extractAll", async () => {
      const content = new TextEncoder().encode("Sync created content");
      const zipData = createZipSync([{ name: "sync.txt", data: content }]);

      const files = await extractAll(zipData);

      expect(decode(files.get("sync.txt")!.data)).toBe("Sync created content");
    });
  });

  describe("ZipBuilder streaming -> extractAll roundtrip", () => {
    it("should create streamed ZIP that can be read by extractAll", async () => {
      const builder = new ZipBuilder({ level: 6 });

      const chunks: Uint8Array[] = [];

      const file1 = new TextEncoder().encode("Streaming file 1");
      const [h1, d1] = await builder.addFile({ name: "stream1.txt", data: file1 });
      chunks.push(h1, d1);

      const file2 = new TextEncoder().encode("Streaming file 2");
      const [h2, d2] = await builder.addFile({ name: "stream2.txt", data: file2 });
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

  describe("extractFile", () => {
    it("should extract single file from ZIP", async () => {
      const content = new TextEncoder().encode("Target file content");
      const zipData = await createZip([
        { name: "other.txt", data: new TextEncoder().encode("Other content") },
        { name: "target.txt", data: content },
        { name: "another.txt", data: new TextEncoder().encode("Another content") }
      ]);

      const extracted = await extractFile(zipData, "target.txt");

      expect(extracted).not.toBeNull();
      expect(decode(extracted!)).toBe("Target file content");
    });

    it("should return null for non-existent file", async () => {
      const zipData = await createZip([
        { name: "file.txt", data: new TextEncoder().encode("Content") }
      ]);

      const extracted = await extractFile(zipData, "nonexistent.txt");

      expect(extracted).toBeNull();
    });
  });

  describe("listFiles", () => {
    it("should list all files in ZIP", async () => {
      const content = new TextEncoder().encode("Content");
      const zipData = await createZip([
        { name: "a.txt", data: content },
        { name: "b.txt", data: content },
        { name: "folder/c.txt", data: content }
      ]);

      const paths = await listFiles(zipData);

      expect(paths).toHaveLength(3);
      expect(paths).toContain("a.txt");
      expect(paths).toContain("b.txt");
      expect(paths).toContain("folder/c.txt");
    });
  });

  describe("compression levels verification", () => {
    it("should produce valid ZIP at all compression levels", async () => {
      const content = new TextEncoder().encode("Test content for compression levels");

      for (let level = 0; level <= 9; level++) {
        const zipData = await createZip([{ name: "test.txt", data: content }], { level });

        const files = await extractAll(zipData);
        expect(decode(files.get("test.txt")!.data)).toBe("Test content for compression levels");
      }
    });
  });

  describe("binary data integrity", () => {
    it("should preserve binary data exactly", async () => {
      // All possible byte values
      const binary = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        binary[i] = i;
      }

      const zipData = await createZip([{ name: "binary.bin", data: binary }]);

      const files = await extractAll(zipData);
      const extracted = files.get("binary.bin")!.data;

      expect(extracted.length).toBe(256);
      for (let i = 0; i < 256; i++) {
        expect(extracted[i]).toBe(i);
      }
    });
  });

  describe("XML content (XLSX use case)", () => {
    it("should handle typical XLSX structure", async () => {
      const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`;

      const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheets><sheet name="Sheet1" sheetId="1"/></sheets>
</workbook>`;

      const sheet = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>Hello</t></is></c></row>
  </sheetData>
</worksheet>`;

      const zipData = await createZip([
        { name: "[Content_Types].xml", data: new TextEncoder().encode(contentTypes) },
        { name: "xl/workbook.xml", data: new TextEncoder().encode(workbook) },
        { name: "xl/worksheets/sheet1.xml", data: new TextEncoder().encode(sheet) }
      ]);

      const files = await extractAll(zipData);

      expect(files.size).toBe(3);
      expect(decode(files.get("[Content_Types].xml")!.data)).toContain("content-types");
      expect(decode(files.get("xl/workbook.xml")!.data)).toContain("Sheet1");
      expect(decode(files.get("xl/worksheets/sheet1.xml")!.data)).toContain("Hello");
    });
  });
});
