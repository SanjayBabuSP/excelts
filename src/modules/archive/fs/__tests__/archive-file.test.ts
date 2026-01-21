/**
 * Tests for the unified ArchiveFile class.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ArchiveFile } from "../archive-file";

describe("ArchiveFile", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "archive-file-test-"));
  });

  afterEach(async () => {
    await fs.promises.rm(testDir, { recursive: true, force: true });
  });

  describe("ZIP format (default)", () => {
    it("should create empty archive with format zip by default", () => {
      const archive = new ArchiveFile();
      expect(archive.format).toBe("zip");
    });

    it("should add buffer and build archive", async () => {
      const archive = new ArchiveFile();
      archive.addBuffer(new TextEncoder().encode("Hello, World!"), "hello.txt");

      const buffer = await archive.toBuffer();
      expect(buffer).toBeInstanceOf(Uint8Array);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it("should add text and build archive", async () => {
      const archive = new ArchiveFile();
      archive.addText("Hello, World!", "hello.txt");

      const buffer = await archive.toBuffer();
      expect(buffer).toBeInstanceOf(Uint8Array);
    });

    it("should support method chaining", () => {
      const archive = new ArchiveFile();
      const result = archive.addText("content1", "file1.txt").addText("content2", "file2.txt");

      expect(result).toBe(archive);
    });

    it("should read entries from buffer", () => {
      const archive = new ArchiveFile();
      archive.addText("Hello", "hello.txt");
      archive.addText("World", "world.txt");

      const buffer = archive.toBufferSync();
      const reader = ArchiveFile.fromBuffer(buffer);

      const entries = reader.getEntriesSync();
      expect(entries.length).toBe(2);
      expect(entries.map(e => e.path).sort()).toEqual(["hello.txt", "world.txt"]);
    });

    it("should write and read from file", async () => {
      const archive = new ArchiveFile();
      archive.addText("Test content", "test.txt");

      const zipPath = path.join(testDir, "test.zip");
      await archive.writeToFile(zipPath);

      expect(fs.existsSync(zipPath)).toBe(true);

      const reader = await ArchiveFile.fromFile(zipPath);
      const entries = await reader.getEntries();
      expect(entries.length).toBe(1);
      expect(entries[0].path).toBe("test.txt");
    });
  });

  describe("TAR format", () => {
    it("should create TAR archive with format option", () => {
      const archive = new ArchiveFile({ format: "tar" });
      expect(archive.format).toBe("tar");
    });

    it("should add buffer and build TAR archive", async () => {
      const archive = new ArchiveFile({ format: "tar" });
      archive.addBuffer(new TextEncoder().encode("Hello, World!"), "hello.txt");

      const buffer = await archive.toBuffer();
      expect(buffer).toBeInstanceOf(Uint8Array);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it("should add text and build TAR archive", async () => {
      const archive = new ArchiveFile({ format: "tar" });
      archive.addText("Hello, World!", "hello.txt");

      const buffer = await archive.toBuffer();
      expect(buffer).toBeInstanceOf(Uint8Array);
    });

    it("should create gzipped TAR archive", async () => {
      const archive = new ArchiveFile({ format: "tar", gzip: true });
      archive.addText("Hello, World!", "hello.txt");

      const buffer = await archive.toBuffer();
      expect(buffer).toBeInstanceOf(Uint8Array);

      // Check for gzip magic bytes
      expect(buffer[0]).toBe(0x1f);
      expect(buffer[1]).toBe(0x8b);
    });

    it("should write TAR to file", async () => {
      const archive = new ArchiveFile({ format: "tar" });
      archive.addText("Test content", "test.txt");

      const tarPath = path.join(testDir, "test.tar");
      await archive.writeToFile(tarPath);

      expect(fs.existsSync(tarPath)).toBe(true);
    });

    it("should write gzipped TAR to file", async () => {
      const archive = new ArchiveFile({ format: "tar", gzip: true });
      archive.addText("Test content", "test.txt");

      const tarPath = path.join(testDir, "test.tar.gz");
      await archive.writeToFile(tarPath);

      expect(fs.existsSync(tarPath)).toBe(true);

      // Verify gzip header
      const data = await fs.promises.readFile(tarPath);
      expect(data[0]).toBe(0x1f);
      expect(data[1]).toBe(0x8b);
    });

    it("should read TAR from file", async () => {
      // Create a TAR file
      const archive = new ArchiveFile({ format: "tar" });
      archive.addText("Test content", "test.txt");
      const tarPath = path.join(testDir, "test.tar");
      await archive.writeToFile(tarPath);

      // Read it back
      const reader = await ArchiveFile.fromFile(tarPath, { format: "tar" });
      const entries = await reader.getEntries();

      expect(entries.length).toBe(1);
      expect(entries[0].path).toBe("test.txt");
    });

    it("should read gzipped TAR from file", async () => {
      // Create a gzipped TAR file
      const archive = new ArchiveFile({ format: "tar", gzip: true });
      archive.addText("Test content", "test.txt");
      const tarPath = path.join(testDir, "test.tar.gz");
      await archive.writeToFile(tarPath);

      // Read it back (auto-detect gzip from extension)
      const reader = await ArchiveFile.fromFile(tarPath, { format: "tar" });
      const entries = await reader.getEntries();

      expect(entries.length).toBe(1);
      expect(entries[0].path).toBe("test.txt");
    });

    it("should support synchronous build", () => {
      const archive = new ArchiveFile({ format: "tar" });
      archive.addText("Hello", "hello.txt");

      const buffer = archive.toBufferSync();
      expect(buffer).toBeInstanceOf(Uint8Array);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe("addFile", () => {
    it("should add file from disk (ZIP)", async () => {
      // Create a test file
      const testFile = path.join(testDir, "source.txt");
      await fs.promises.writeFile(testFile, "File content");

      const archive = new ArchiveFile();
      archive.addFile(testFile);

      const buffer = await archive.toBuffer();
      const reader = ArchiveFile.fromBuffer(buffer);
      const entries = reader.getEntriesSync();

      expect(entries.length).toBe(1);
      expect(entries[0].path).toBe("source.txt");
    });

    it("should add file from disk (TAR)", async () => {
      // Create a test file
      const testFile = path.join(testDir, "source.txt");
      await fs.promises.writeFile(testFile, "File content");

      const archive = new ArchiveFile({ format: "tar" });
      archive.addFile(testFile);

      const buffer = await archive.toBuffer();
      const reader = ArchiveFile.fromBuffer(buffer, { format: "tar" });
      const entries = await reader.getEntries();

      expect(entries.length).toBe(1);
      expect(entries[0].path).toBe("source.txt");
    });
  });

  describe("addDirectory", () => {
    it("should add directory recursively (ZIP)", async () => {
      // Create test directory structure
      const srcDir = path.join(testDir, "src");
      await fs.promises.mkdir(srcDir, { recursive: true });
      await fs.promises.writeFile(path.join(srcDir, "file1.txt"), "content1");
      await fs.promises.writeFile(path.join(srcDir, "file2.txt"), "content2");

      const archive = new ArchiveFile();
      archive.addDirectory(srcDir);

      const buffer = await archive.toBuffer();
      const reader = ArchiveFile.fromBuffer(buffer);
      const entries = reader.getEntriesSync();

      expect(entries.length).toBe(2);
    });

    it("should add directory recursively (TAR)", async () => {
      // Create test directory structure
      const srcDir = path.join(testDir, "src");
      await fs.promises.mkdir(srcDir, { recursive: true });
      await fs.promises.writeFile(path.join(srcDir, "file1.txt"), "content1");
      await fs.promises.writeFile(path.join(srcDir, "file2.txt"), "content2");

      const archive = new ArchiveFile({ format: "tar" });
      archive.addDirectory(srcDir);

      const buffer = await archive.toBuffer();
      const reader = ArchiveFile.fromBuffer(buffer, { format: "tar" });
      const entries = await reader.getEntries();

      expect(entries.length).toBe(2);
    });
  });

  describe("addGlob", () => {
    it("should add files matching glob pattern (ZIP)", async () => {
      // Create test files
      await fs.promises.writeFile(path.join(testDir, "file1.txt"), "content1");
      await fs.promises.writeFile(path.join(testDir, "file2.txt"), "content2");
      await fs.promises.writeFile(path.join(testDir, "file3.md"), "content3");

      const archive = new ArchiveFile();
      archive.addGlob("*.txt", { cwd: testDir });

      const buffer = await archive.toBuffer();
      const reader = ArchiveFile.fromBuffer(buffer);
      const entries = reader.getEntriesSync();

      expect(entries.length).toBe(2);
      expect(entries.every(e => e.path.endsWith(".txt"))).toBe(true);
    });

    it("should add files matching glob pattern (TAR)", async () => {
      // Create test files
      await fs.promises.writeFile(path.join(testDir, "file1.txt"), "content1");
      await fs.promises.writeFile(path.join(testDir, "file2.txt"), "content2");
      await fs.promises.writeFile(path.join(testDir, "file3.md"), "content3");

      const archive = new ArchiveFile({ format: "tar" });
      archive.addGlob("*.txt", { cwd: testDir });

      const buffer = await archive.toBuffer();
      const reader = ArchiveFile.fromBuffer(buffer, { format: "tar" });
      const entries = await reader.getEntries();

      expect(entries.length).toBe(2);
      expect(entries.every(e => e.path.endsWith(".txt"))).toBe(true);
    });
  });

  describe("extraction", () => {
    it("should extract ZIP to directory", async () => {
      const archive = new ArchiveFile();
      archive.addText("content1", "file1.txt");
      archive.addText("content2", "subdir/file2.txt");

      const zipPath = path.join(testDir, "test.zip");
      await archive.writeToFile(zipPath);

      const reader = await ArchiveFile.fromFile(zipPath);
      const extractDir = path.join(testDir, "extracted");
      await reader.extractTo(extractDir);

      expect(fs.existsSync(path.join(extractDir, "file1.txt"))).toBe(true);
      expect(fs.existsSync(path.join(extractDir, "subdir/file2.txt"))).toBe(true);

      const content1 = await fs.promises.readFile(path.join(extractDir, "file1.txt"), "utf-8");
      expect(content1).toBe("content1");
    });

    it("should extract TAR to directory", async () => {
      const archive = new ArchiveFile({ format: "tar" });
      archive.addText("content1", "file1.txt");
      archive.addText("content2", "subdir/file2.txt");

      const tarPath = path.join(testDir, "test.tar");
      await archive.writeToFile(tarPath);

      const reader = await ArchiveFile.fromFile(tarPath, { format: "tar" });
      const extractDir = path.join(testDir, "extracted");
      await reader.extractTo(extractDir);

      expect(fs.existsSync(path.join(extractDir, "file1.txt"))).toBe(true);
      expect(fs.existsSync(path.join(extractDir, "subdir/file2.txt"))).toBe(true);

      const content1 = await fs.promises.readFile(path.join(extractDir, "file1.txt"), "utf-8");
      expect(content1).toBe("content1");
    });
  });

  describe("ZIP-specific methods", () => {
    it("should throw for TAR when using has()", () => {
      const archive = new ArchiveFile({ format: "tar" });
      expect(() => (archive as any).has("test.txt")).toThrow(
        "has() is only available for ZIP archives"
      );
    });

    it("should throw for TAR when using delete()", () => {
      const archive = new ArchiveFile({ format: "tar" });
      expect(() => (archive as any).delete("test.txt")).toThrow(
        "delete() is only available for ZIP archives"
      );
    });

    it("should throw for TAR when using set()", () => {
      const archive = new ArchiveFile({ format: "tar" });
      expect(() => (archive as any).set("test.txt", "content")).toThrow(
        "set() is only available for ZIP archives"
      );
    });

    it("should throw for TAR when using rename()", () => {
      const archive = new ArchiveFile({ format: "tar" });
      expect(() => (archive as any).rename("old.txt", "new.txt")).toThrow(
        "rename() is only available for ZIP archives"
      );
    });

    it("should throw for TAR when using setPassword()", () => {
      const archive = new ArchiveFile({ format: "tar" });
      expect(() => (archive as any).setPassword("secret")).toThrow(
        "setPassword() is only available for ZIP archives"
      );
    });
  });

  describe("entryCount", () => {
    it("should return pending entry count for new ZIP archive", () => {
      const archive = new ArchiveFile();
      archive.addText("content1", "file1.txt");
      archive.addText("content2", "file2.txt");

      expect(archive.entryCount).toBe(2);
    });

    it("should return pending entry count for new TAR archive", () => {
      const archive = new ArchiveFile({ format: "tar" });
      archive.addText("content1", "file1.txt");
      archive.addText("content2", "file2.txt");

      expect(archive.entryCount).toBe(2);
    });
  });
});
