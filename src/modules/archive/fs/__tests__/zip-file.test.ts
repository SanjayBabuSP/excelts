/**
 * Tests for Node.js file system convenience layer.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import {
  ZipFile,
  traverseDirectory,
  glob,
  globToRegex,
  matchGlob,
  matchGlobAny,
  ensureDir,
  ensureDirSync,
  fileExists,
  readFileBytes,
  readFileBytesSync,
  writeFileBytes,
  writeFileBytesSync,
  setFileTime
} from "@archive/fs";

import { ZipParser } from "@archive/unzip/zip-parser";

describe("fs-utils", () => {
  describe("globToRegex", () => {
    it("should match simple wildcards", () => {
      const regex = globToRegex("*.txt");
      expect(regex.test("foo.txt")).toBe(true);
      expect(regex.test("bar.txt")).toBe(true);
      expect(regex.test("foo.js")).toBe(false);
      expect(regex.test("dir/foo.txt")).toBe(false);
    });

    it("should match ** for any path", () => {
      const regex = globToRegex("**/*.txt");
      expect(regex.test("foo.txt")).toBe(true);
      expect(regex.test("dir/foo.txt")).toBe(true);
      expect(regex.test("dir/sub/foo.txt")).toBe(true);
      expect(regex.test("foo.js")).toBe(false);
    });

    it("should match ? for single character", () => {
      const regex = globToRegex("file?.txt");
      expect(regex.test("file1.txt")).toBe(true);
      expect(regex.test("fileA.txt")).toBe(true);
      expect(regex.test("file.txt")).toBe(false);
      expect(regex.test("file12.txt")).toBe(false);
    });

    it("should match character classes [abc]", () => {
      const regex = globToRegex("file[123].txt");
      expect(regex.test("file1.txt")).toBe(true);
      expect(regex.test("file2.txt")).toBe(true);
      expect(regex.test("file3.txt")).toBe(true);
      expect(regex.test("file4.txt")).toBe(false);
    });

    it("should match brace expansion {a,b,c}", () => {
      const regex = globToRegex("file.{js,ts,json}");
      expect(regex.test("file.js")).toBe(true);
      expect(regex.test("file.ts")).toBe(true);
      expect(regex.test("file.json")).toBe(true);
      expect(regex.test("file.txt")).toBe(false);
    });

    it("should escape special regex characters", () => {
      const regex = globToRegex("file(1).txt");
      expect(regex.test("file(1).txt")).toBe(true);
      expect(regex.test("file1.txt")).toBe(false);
    });
  });

  describe("matchGlob", () => {
    it("should match simple patterns", () => {
      expect(matchGlob("foo.txt", "*.txt")).toBe(true);
      expect(matchGlob("foo.js", "*.txt")).toBe(false);
    });

    it("should match recursive patterns", () => {
      expect(matchGlob("src/index.ts", "**/*.ts")).toBe(true);
      expect(matchGlob("src/utils/helpers.ts", "**/*.ts")).toBe(true);
      expect(matchGlob("index.ts", "**/*.ts")).toBe(true);
    });
  });

  describe("matchGlobAny", () => {
    it("should match any of multiple patterns", () => {
      expect(matchGlobAny("foo.ts", ["*.js", "*.ts"])).toBe(true);
      expect(matchGlobAny("foo.js", ["*.js", "*.ts"])).toBe(true);
      expect(matchGlobAny("foo.txt", ["*.js", "*.ts"])).toBe(false);
    });
  });
});

describe("ZipFile", () => {
  let tempDir: string;
  let testDir: string;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "zipfile-test-"));
    testDir = path.join(tempDir, "test-files");
    await fsp.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fsp.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("addFile and writeToFile", () => {
    it("should create a ZIP with a single file", async () => {
      // Create test file
      const testFilePath = path.join(testDir, "hello.txt");
      await fsp.writeFile(testFilePath, "Hello, World!");

      // Create ZIP
      const zip = new ZipFile();
      zip.addFile(testFilePath);
      const outputPath = path.join(tempDir, "output.zip");
      await zip.writeToFile(outputPath);

      // Verify ZIP contents
      const zipData = await fsp.readFile(outputPath);
      const parser = new ZipParser(new Uint8Array(zipData));
      const entries = parser.getEntries();

      expect(entries).toHaveLength(1);
      expect(entries[0].path).toBe("hello.txt");

      const content = parser.extractSync("hello.txt");
      expect(new TextDecoder().decode(content!)).toBe("Hello, World!");
    });

    it("should respect custom name option", async () => {
      const testFilePath = path.join(testDir, "original.txt");
      await fsp.writeFile(testFilePath, "Content");

      const zip = new ZipFile();
      zip.addFile(testFilePath, { name: "renamed.txt" });
      const buffer = await zip.toBuffer();

      const parser = new ZipParser(buffer);
      expect(parser.hasEntry("renamed.txt")).toBe(true);
      expect(parser.hasEntry("original.txt")).toBe(false);
    });

    it("should respect prefix option", async () => {
      const testFilePath = path.join(testDir, "file.txt");
      await fsp.writeFile(testFilePath, "Content");

      const zip = new ZipFile();
      zip.addFile(testFilePath, { prefix: "subdir" });
      const buffer = await zip.toBuffer();

      const parser = new ZipParser(buffer);
      expect(parser.hasEntry("subdir/file.txt")).toBe(true);
    });

    it("should preserve file permissions when enabled", async () => {
      const testFilePath = path.join(testDir, "perm.txt");
      await fsp.writeFile(testFilePath, "perm");
      await fsp.chmod(testFilePath, 0o640);
      const st = await fsp.stat(testFilePath);

      const zip = new ZipFile({ writePermissions: true, preservePermissions: true });
      zip.addFile(testFilePath);
      const buffer = await zip.toBuffer();

      const parser = new ZipParser(buffer);
      const entry = parser.getEntries().find(e => e.path === "perm.txt");
      expect(entry).toBeDefined();
      expect((entry!.externalAttributes >>> 16) & 0xffff).toBe(st.mode & 0xffff);
    });
  });

  describe("addBuffer and addText", () => {
    it("should add buffer data", async () => {
      const zip = new ZipFile();
      zip.addBuffer(new Uint8Array([1, 2, 3, 4]), "data.bin");
      const buffer = await zip.toBuffer();

      const parser = new ZipParser(buffer);
      const content = parser.extractSync("data.bin");
      expect(content).toEqual(new Uint8Array([1, 2, 3, 4]));
    });

    it("should add text content", async () => {
      const zip = new ZipFile();
      zip.addText("Hello, 世界!", "hello.txt");
      const buffer = await zip.toBuffer();

      const parser = new ZipParser(buffer);
      const content = parser.extractSync("hello.txt");
      expect(new TextDecoder().decode(content!)).toBe("Hello, 世界!");
    });

    it("should normalize paths when ZipFile path option is provided", async () => {
      const zip = new ZipFile({ path: { mode: "posix", prependSlash: true } });
      zip.addText("x", "\\foo\\bar\\..\\baz.txt");
      const buffer = await zip.toBuffer();

      const parser = new ZipParser(buffer);
      expect(parser.hasEntry("/foo/baz.txt")).toBe(true);
      expect(new TextDecoder().decode(parser.extractSync("/foo/baz.txt")!)).toBe("x");
    });

    it("should reject unsafe paths in safe mode", () => {
      const zip = new ZipFile({ path: { mode: "safe" } });
      expect(() => zip.addText("x", "../evil.txt")).toThrow(/Unsafe ZIP path/);
    });
  });

  describe("addDirectory", () => {
    it("should add entire directory recursively", async () => {
      // Create test directory structure
      await fsp.mkdir(path.join(testDir, "src"));
      await fsp.mkdir(path.join(testDir, "src", "utils"));
      await fsp.writeFile(path.join(testDir, "src", "index.ts"), "export {}");
      await fsp.writeFile(path.join(testDir, "src", "utils", "helpers.ts"), "export {}");

      const zip = new ZipFile();
      zip.addDirectory(path.join(testDir, "src"));
      const buffer = await zip.toBuffer();

      const parser = new ZipParser(buffer);
      const entries = parser.getEntries().map(e => e.path);

      expect(entries).toContain("src/index.ts");
      expect(entries).toContain("src/utils/helpers.ts");
    });

    it("should respect prefix option", async () => {
      await fsp.mkdir(path.join(testDir, "lib"));
      await fsp.writeFile(path.join(testDir, "lib", "file.js"), "// code");

      const zip = new ZipFile();
      zip.addDirectory(path.join(testDir, "lib"), { prefix: "vendor" });
      const buffer = await zip.toBuffer();

      const parser = new ZipParser(buffer);
      expect(parser.hasEntry("vendor/file.js")).toBe(true);
    });

    it("should respect includeRoot option", async () => {
      await fsp.mkdir(path.join(testDir, "mydir"));
      await fsp.writeFile(path.join(testDir, "mydir", "file.txt"), "content");

      // With includeRoot = false
      const zip1 = new ZipFile();
      zip1.addDirectory(path.join(testDir, "mydir"), { includeRoot: false, prefix: "" });
      const buffer1 = await zip1.toBuffer();
      const parser1 = new ZipParser(buffer1);
      expect(parser1.hasEntry("file.txt")).toBe(true);

      // With includeRoot = true (default)
      const zip2 = new ZipFile();
      zip2.addDirectory(path.join(testDir, "mydir"), { includeRoot: true });
      const buffer2 = await zip2.toBuffer();
      const parser2 = new ZipParser(buffer2);
      expect(parser2.hasEntry("mydir/file.txt")).toBe(true);
    });

    it("should respect filter option", async () => {
      await fsp.mkdir(path.join(testDir, "filtered"));
      await fsp.writeFile(path.join(testDir, "filtered", "keep.txt"), "keep");
      await fsp.writeFile(path.join(testDir, "filtered", "skip.log"), "skip");

      const zip = new ZipFile();
      zip.addDirectory(path.join(testDir, "filtered"), {
        prefix: "",
        includeRoot: false,
        filter: p => !p.endsWith(".log")
      });
      const buffer = await zip.toBuffer();

      const parser = new ZipParser(buffer);
      expect(parser.hasEntry("keep.txt")).toBe(true);
      expect(parser.hasEntry("skip.log")).toBe(false);
    });

    it("should write directory entry mode when writePermissions is enabled", async () => {
      await fsp.mkdir(path.join(testDir, "src", "utils"), { recursive: true });
      await fsp.writeFile(path.join(testDir, "src", "utils", "helpers.ts"), "export {}\n");

      const zip = new ZipFile({ writePermissions: true, preservePermissions: false });
      zip.addDirectory(path.join(testDir, "src"));
      const buffer = await zip.toBuffer();

      const parser = new ZipParser(buffer);
      const dirEntry = parser.getEntries().find(e => e.path === "src/utils/");
      expect(dirEntry).toBeDefined();
      expect((dirEntry!.externalAttributes >>> 16) & 0xffff).toBe(0o040755);
    });
  });

  describe("addGlob", () => {
    it("should add files matching glob pattern", async () => {
      await fsp.writeFile(path.join(testDir, "a.ts"), "");
      await fsp.writeFile(path.join(testDir, "b.ts"), "");
      await fsp.writeFile(path.join(testDir, "c.js"), "");

      const zip = new ZipFile();
      zip.addGlob("*.ts", { cwd: testDir });
      const buffer = await zip.toBuffer();

      const parser = new ZipParser(buffer);
      const entries = parser.getEntries().map(e => e.path);
      expect(entries).toContain("a.ts");
      expect(entries).toContain("b.ts");
      expect(entries).not.toContain("c.js");
    });

    it("should support recursive glob patterns", async () => {
      await fsp.mkdir(path.join(testDir, "sub"));
      await fsp.writeFile(path.join(testDir, "root.ts"), "");
      await fsp.writeFile(path.join(testDir, "sub", "nested.ts"), "");

      const zip = new ZipFile();
      zip.addGlob("**/*.ts", { cwd: testDir });
      const buffer = await zip.toBuffer();

      const parser = new ZipParser(buffer);
      const entries = parser.getEntries().map(e => e.path);
      expect(entries).toContain("root.ts");
      expect(entries).toContain("sub/nested.ts");
    });

    it("should respect ignore option", async () => {
      await fsp.writeFile(path.join(testDir, "include.ts"), "");
      await fsp.writeFile(path.join(testDir, "exclude.ts"), "");

      const zip = new ZipFile();
      zip.addGlob("*.ts", { cwd: testDir, ignore: "exclude.ts" });
      const buffer = await zip.toBuffer();

      const parser = new ZipParser(buffer);
      expect(parser.hasEntry("include.ts")).toBe(true);
      expect(parser.hasEntry("exclude.ts")).toBe(false);
    });
  });

  describe("adm-zip compatible methods", () => {
    it("addLocalFile should work", async () => {
      await fsp.writeFile(path.join(testDir, "local.txt"), "local content");

      const zip = new ZipFile();
      zip.addLocalFile(path.join(testDir, "local.txt"), "custom/path.txt");
      const buffer = await zip.toBuffer();

      const parser = new ZipParser(buffer);
      expect(parser.hasEntry("custom/path.txt")).toBe(true);
    });

    it("addLocalFolder should work", async () => {
      await fsp.mkdir(path.join(testDir, "folder"));
      await fsp.writeFile(path.join(testDir, "folder", "file.txt"), "content");

      const zip = new ZipFile();
      zip.addLocalFolder(path.join(testDir, "folder"), "dest");
      const buffer = await zip.toBuffer();

      const parser = new ZipParser(buffer);
      expect(parser.hasEntry("dest/file.txt")).toBe(true);
    });

    it("writeZip should write to file synchronously", async () => {
      await fsp.writeFile(path.join(testDir, "data.txt"), "data");

      const zip = new ZipFile();
      zip.addFile(path.join(testDir, "data.txt"));
      const outputPath = path.join(tempDir, "sync-output.zip");
      zip.writeZip(outputPath);

      expect(fs.existsSync(outputPath)).toBe(true);
    });
  });

  describe("fromFile and extraction", () => {
    it("should open and read ZIP file", async () => {
      // Create test ZIP
      const srcZip = new ZipFile();
      srcZip.addText("Hello!", "hello.txt");
      srcZip.addText("World!", "world.txt");
      const zipPath = path.join(tempDir, "test.zip");
      await srcZip.writeToFile(zipPath);

      // Open and read
      const zip = await ZipFile.fromFile(zipPath);
      const entries = zip.getEntries();

      expect(entries).toHaveLength(2);
      expect(zip.hasEntry("hello.txt")).toBe(true);
      expect(zip.hasEntry("world.txt")).toBe(true);

      const content = await zip.readAsText("hello.txt");
      expect(content).toBe("Hello!");
    });

    it("should extract all entries to directory", async () => {
      // Create test ZIP
      const srcZip = new ZipFile();
      srcZip.addText("File 1", "file1.txt");
      srcZip.addText("File 2", "subdir/file2.txt");
      const zipPath = path.join(tempDir, "extract-test.zip");
      await srcZip.writeToFile(zipPath);

      // Extract
      const extractDir = path.join(tempDir, "extracted");
      const zip = await ZipFile.fromFile(zipPath);
      await zip.extractTo(extractDir);

      // Verify
      expect(fs.existsSync(path.join(extractDir, "file1.txt"))).toBe(true);
      expect(fs.existsSync(path.join(extractDir, "subdir", "file2.txt"))).toBe(true);

      const content1 = await fsp.readFile(path.join(extractDir, "file1.txt"), "utf-8");
      expect(content1).toBe("File 1");

      const content2 = await fsp.readFile(path.join(extractDir, "subdir", "file2.txt"), "utf-8");
      expect(content2).toBe("File 2");
    });

    it("should respect overwrite strategy", async () => {
      // Create test ZIP
      const srcZip = new ZipFile();
      srcZip.addText("New content", "file.txt");
      const zipPath = path.join(tempDir, "overwrite-test.zip");
      await srcZip.writeToFile(zipPath);

      // Create existing file
      const extractDir = path.join(tempDir, "overwrite-extracted");
      await fsp.mkdir(extractDir, { recursive: true });
      await fsp.writeFile(path.join(extractDir, "file.txt"), "Old content");

      // Test 'skip' strategy
      const zip = await ZipFile.fromFile(zipPath);
      await zip.extractTo(extractDir, { overwrite: "skip" });
      const content = await fsp.readFile(path.join(extractDir, "file.txt"), "utf-8");
      expect(content).toBe("Old content");

      // Test 'overwrite' strategy
      await zip.extractTo(extractDir, { overwrite: "overwrite" });
      const newContent = await fsp.readFile(path.join(extractDir, "file.txt"), "utf-8");
      expect(newContent).toBe("New content");
    });

    it("should filter entries during extraction", async () => {
      // Create test ZIP
      const srcZip = new ZipFile();
      srcZip.addText("Keep", "keep.txt");
      srcZip.addText("Skip", "skip.log");
      const zipPath = path.join(tempDir, "filter-extract.zip");
      await srcZip.writeToFile(zipPath);

      // Extract with filter
      const extractDir = path.join(tempDir, "filter-extracted");
      const zip = await ZipFile.fromFile(zipPath);
      await zip.extractTo(extractDir, {
        filter: p => !p.endsWith(".log")
      });

      expect(fs.existsSync(path.join(extractDir, "keep.txt"))).toBe(true);
      expect(fs.existsSync(path.join(extractDir, "skip.log"))).toBe(false);
    });

    it("extractAllTo should work (adm-zip compatible)", async () => {
      const srcZip = new ZipFile();
      srcZip.addText("Content", "file.txt");
      const zipPath = path.join(tempDir, "extractall.zip");
      await srcZip.writeToFile(zipPath);

      const extractDir = path.join(tempDir, "extractall-out");
      const zip = ZipFile.fromFileSync(zipPath);
      zip.extractAllTo(extractDir, true);

      expect(fs.existsSync(path.join(extractDir, "file.txt"))).toBe(true);
    });
  });

  describe("synchronous operations", () => {
    it("toBufferSync should create ZIP", () => {
      const zip = new ZipFile();
      zip.addText("Sync content", "sync.txt");
      const buffer = zip.toBufferSync();

      const parser = new ZipParser(buffer);
      expect(parser.hasEntry("sync.txt")).toBe(true);
    });

    it("writeToFileSync should write ZIP", () => {
      const zip = new ZipFile();
      zip.addText("Data", "data.txt");
      const outputPath = path.join(tempDir, "sync-write.zip");
      zip.writeToFileSync(outputPath);

      expect(fs.existsSync(outputPath)).toBe(true);
    });

    it("fromFileSync should open ZIP", async () => {
      // Create test ZIP
      const srcZip = new ZipFile();
      srcZip.addText("Sync read", "read.txt");
      const zipPath = path.join(tempDir, "sync-read.zip");
      await srcZip.writeToFile(zipPath);

      // Open synchronously
      const zip = ZipFile.fromFileSync(zipPath);
      const content = zip.readAsTextSync("read.txt");
      expect(content).toBe("Sync read");
    });
  });

  describe("encryption support", () => {
    it("should create encrypted ZIP", async () => {
      const zip = new ZipFile({
        password: "secret123",
        encryptionMethod: "zipcrypto"
      });
      zip.addText("Secret data", "secret.txt");
      const buffer = await zip.toBuffer();

      const parser = new ZipParser(buffer, { password: "secret123" });
      expect(parser.hasEncryptedEntries()).toBe(true);

      const content = parser.extractSync("secret.txt", "secret123");
      expect(new TextDecoder().decode(content!)).toBe("Secret data");
    });

    it("should extract encrypted ZIP with password", async () => {
      // Create encrypted ZIP
      const srcZip = new ZipFile({
        password: "pass123",
        encryptionMethod: "zipcrypto"
      });
      srcZip.addText("Protected", "protected.txt");
      const zipPath = path.join(tempDir, "encrypted.zip");
      await srcZip.writeToFile(zipPath);

      // Extract with password
      const zip = await ZipFile.fromFile(zipPath, { password: "pass123" });
      const content = await zip.readAsText("protected.txt");
      expect(content).toBe("Protected");
    });
  });

  describe("fromBuffer", () => {
    it("should create ZipFile from buffer", async () => {
      const srcZip = new ZipFile();
      srcZip.addText("Buffer content", "buffer.txt");
      const buffer = await srcZip.toBuffer();

      const zip = ZipFile.fromBuffer(buffer);
      const content = await zip.readAsText("buffer.txt");
      expect(content).toBe("Buffer content");
    });
  });

  describe("entry information", () => {
    it("should provide entry count", async () => {
      const srcZip = new ZipFile();
      srcZip.addText("1", "a.txt");
      srcZip.addText("2", "b.txt");
      srcZip.addText("3", "c.txt");
      const buffer = await srcZip.toBuffer();

      const zip = ZipFile.fromBuffer(buffer);
      expect(zip.entryCount).toBe(3);
    });

    it("should provide entry names", async () => {
      const srcZip = new ZipFile();
      srcZip.addText("1", "first.txt");
      srcZip.addText("2", "second.txt");
      const buffer = await srcZip.toBuffer();

      const zip = ZipFile.fromBuffer(buffer);
      const names = zip.getEntryNames();
      expect(names).toContain("first.txt");
      expect(names).toContain("second.txt");
    });

    it("should get specific entry info", async () => {
      const srcZip = new ZipFile();
      srcZip.addText("Content with some bytes", "info.txt");
      const buffer = await srcZip.toBuffer();

      const zip = ZipFile.fromBuffer(buffer);
      const entry = zip.getEntry("info.txt");

      expect(entry).not.toBeNull();
      expect(entry!.path).toBe("info.txt");
      expect(entry!.size).toBe(23);
      expect(entry!.isDirectory).toBe(false);
    });
  });

  describe("path traversal protection", () => {
    it("should reject path traversal in entry names", async () => {
      // This test creates a malicious ZIP manually
      const srcZip = new ZipFile();
      srcZip.addText("Malicious", "../../../etc/passwd");
      const buffer = await srcZip.toBuffer();

      const zip = ZipFile.fromBuffer(buffer);
      const extractDir = path.join(tempDir, "safe-extract");

      await expect(zip.extractTo(extractDir)).rejects.toThrow(/path traversal/i);
    });
  });

  describe("chaining", () => {
    it("should support method chaining", async () => {
      await fsp.writeFile(path.join(testDir, "chain1.txt"), "1");
      await fsp.writeFile(path.join(testDir, "chain2.txt"), "2");

      const buffer = await new ZipFile()
        .addFile(path.join(testDir, "chain1.txt"))
        .addFile(path.join(testDir, "chain2.txt"))
        .addText("3", "chain3.txt")
        .addBuffer(new Uint8Array([4]), "chain4.bin")
        .toBuffer();

      const parser = new ZipParser(buffer);
      expect(parser.getEntries()).toHaveLength(4);
    });
  });

  describe("deleteEntry/updateEntry (modify archive)", () => {
    it("should delete an entry from existing archive", async () => {
      // Create initial archive
      const srcZip = new ZipFile();
      srcZip.addText("File 1", "file1.txt");
      srcZip.addText("File 2", "file2.txt");
      srcZip.addText("File 3", "file3.txt");
      const zipPath = path.join(tempDir, "modify.zip");
      await srcZip.writeToFile(zipPath);

      // Open and delete
      const zip = await ZipFile.fromFile(zipPath);
      expect(zip.entryCount).toBe(3);

      const deleted = zip.deleteEntry("file2.txt");
      expect(deleted).toBe(true);

      // Rebuild and verify
      const newBuffer = await zip.toBuffer();
      const parser = new ZipParser(newBuffer);
      const entries = parser.getEntries().map(e => e.path);

      expect(entries).toHaveLength(2);
      expect(entries).toContain("file1.txt");
      expect(entries).not.toContain("file2.txt");
      expect(entries).toContain("file3.txt");
    });

    it("should return false when deleting non-existent entry", async () => {
      const srcZip = new ZipFile();
      srcZip.addText("Content", "exists.txt");
      const buffer = await srcZip.toBuffer();

      const zip = ZipFile.fromBuffer(buffer);
      const deleted = zip.deleteEntry("not-exists.txt");
      expect(deleted).toBe(false);
    });

    it("should update an entry in existing archive", async () => {
      // Create initial archive
      const srcZip = new ZipFile();
      srcZip.addText("Original content", "config.json");
      const zipPath = path.join(tempDir, "update.zip");
      await srcZip.writeToFile(zipPath);

      // Open and update
      const zip = await ZipFile.fromFile(zipPath);
      const updated = zip.updateEntry("config.json", "Updated content");
      expect(updated).toBe(true);

      // Rebuild and verify
      const newBuffer = await zip.toBuffer();
      const parser = new ZipParser(newBuffer);

      const content = parser.extractSync("config.json");
      expect(new TextDecoder().decode(content!)).toBe("Updated content");
    });

    it("updateFile should work with Uint8Array (adm-zip compatible)", async () => {
      const srcZip = new ZipFile();
      srcZip.addBuffer(new Uint8Array([1, 2, 3]), "data.bin");
      const buffer = await srcZip.toBuffer();

      const zip = ZipFile.fromBuffer(buffer);
      zip.updateFile("data.bin", new Uint8Array([4, 5, 6, 7]));

      const newBuffer = await zip.toBuffer();
      const parser = new ZipParser(newBuffer);
      const content = parser.extractSync("data.bin");
      expect(content).toEqual(new Uint8Array([4, 5, 6, 7]));
    });

    it("deleteFile should work with entry object (adm-zip compatible)", async () => {
      const srcZip = new ZipFile();
      srcZip.addText("Content", "target.txt");
      const buffer = await srcZip.toBuffer();

      const zip = ZipFile.fromBuffer(buffer);
      const entry = zip.getEntry("target.txt");
      expect(entry).not.toBeNull();

      zip.deleteFile(entry!);

      const newBuffer = await zip.toBuffer();
      const parser = new ZipParser(newBuffer);
      expect(parser.hasEntry("target.txt")).toBe(false);
    });
  });

  describe("appendStream", () => {
    it("should add data from async iterable", async () => {
      // Create an async generator
      async function* generateData(): AsyncIterable<Uint8Array> {
        yield new Uint8Array([1, 2, 3]);
        yield new Uint8Array([4, 5, 6]);
        yield new Uint8Array([7, 8, 9]);
      }

      const zip = new ZipFile();
      zip.appendStream(generateData(), "stream-data.bin");
      const buffer = await zip.toBuffer();

      const parser = new ZipParser(buffer);
      const content = parser.extractSync("stream-data.bin");
      expect(content).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    });

    it("should reject stream entries in toBufferSync", async () => {
      async function* generateData(): AsyncIterable<Uint8Array> {
        yield new Uint8Array([1, 2, 3]);
      }

      const zip = new ZipFile();
      zip.appendStream(generateData(), "stream.bin");

      expect(() => zip.toBufferSync()).toThrow(/stream entries cannot be processed synchronously/i);
    });
  });

  describe("symlink support", () => {
    it("should create symlink entry with correct attributes", async () => {
      const zip = new ZipFile();
      zip.symlink("lib/current", "lib/v2.0.0");
      const buffer = await zip.toBuffer();

      const parser = new ZipParser(buffer);
      expect(parser.hasEntry("lib/current")).toBe(true);

      // Verify the symlink target is stored as content
      const content = parser.extractSync("lib/current");
      expect(new TextDecoder().decode(content!)).toBe("lib/v2.0.0");
    });
  });

  describe("ZIP comments", () => {
    it("getZipComment should return archive comment", async () => {
      const srcZip = new ZipFile({ comment: "Archive comment" });
      srcZip.addText("Content", "file.txt");
      const buffer = await srcZip.toBuffer();

      const zip = ZipFile.fromBuffer(buffer);
      expect(zip.getZipComment()).toBe("Archive comment");
    });

    it("addZipComment should set archive comment", async () => {
      const zip = new ZipFile();
      zip.addZipComment("My archive comment").addText("Content", "file.txt");
      const buffer = await zip.toBuffer();

      const parser = new ZipParser(buffer);
      expect(parser.getZipComment()).toBe("My archive comment");
    });

    it("getZipEntryComment should return entry comment", async () => {
      const srcZip = new ZipFile();
      srcZip.addText("Content", "file.txt", { comment: "Entry comment" });
      const buffer = await srcZip.toBuffer();

      const zip = ZipFile.fromBuffer(buffer);
      expect(zip.getZipEntryComment("file.txt")).toBe("Entry comment");
    });

    it("getZipEntryComment should return null for non-existent entry", async () => {
      const srcZip = new ZipFile();
      srcZip.addText("Content", "file.txt");
      const buffer = await srcZip.toBuffer();

      const zip = ZipFile.fromBuffer(buffer);
      expect(zip.getZipEntryComment("non-existent.txt")).toBeNull();
    });
  });

  describe("hasPendingChanges", () => {
    it("should return true when there are pending entries", () => {
      const zip = new ZipFile();
      expect(zip.hasPendingChanges()).toBe(false);

      zip.addText("Content", "file.txt");
      expect(zip.hasPendingChanges()).toBe(true);
    });

    it("should return true when there are deleted entries", async () => {
      const srcZip = new ZipFile();
      srcZip.addText("Content", "file.txt");
      const buffer = await srcZip.toBuffer();

      const zip = ZipFile.fromBuffer(buffer);
      expect(zip.hasPendingChanges()).toBe(false);

      zip.deleteEntry("file.txt");
      expect(zip.hasPendingChanges()).toBe(true);
    });

    it("should return true when there are updated entries", async () => {
      const srcZip = new ZipFile();
      srcZip.addText("Original", "file.txt");
      const buffer = await srcZip.toBuffer();

      const zip = ZipFile.fromBuffer(buffer);
      expect(zip.hasPendingChanges()).toBe(false);

      zip.updateEntry("file.txt", "Updated");
      expect(zip.hasPendingChanges()).toBe(true);
    });
  });

  describe("pointer() method", () => {
    it("should return 0 for new empty archive", () => {
      const zip = new ZipFile();
      expect(zip.pointer()).toBe(0);
    });

    it("should return archive size after building", async () => {
      const zip = new ZipFile();
      zip.addText("Hello, World!", "hello.txt");
      const buffer = await zip.toBuffer();

      expect(zip.pointer()).toBe(buffer.length);
      expect(zip.pointer()).toBeGreaterThan(0);
    });

    it("should return existing archive size when loaded", async () => {
      const srcZip = new ZipFile();
      srcZip.addText("Content", "file.txt");
      const buffer = await srcZip.toBuffer();

      const zip = ZipFile.fromBuffer(buffer);
      // After loading, pointer should return the loaded data size
      expect(zip.pointer()).toBe(buffer.length);
    });
  });

  describe("abort() method", () => {
    it("should set aborted state", () => {
      const zip = new ZipFile();
      expect(zip.aborted).toBe(false);

      zip.abort();
      // After abort without active operation, aborted should still be false
      // since there's no active abort controller
      expect(zip.aborted).toBe(false);
    });

    it("should return this for chaining", () => {
      const zip = new ZipFile();
      expect(zip.abort()).toBe(zip);
    });

    it("should abort ongoing toBuffer operation", async () => {
      const zip = new ZipFile();

      // Add some files
      await fsp.writeFile(path.join(testDir, "file1.txt"), "content1");
      await fsp.writeFile(path.join(testDir, "file2.txt"), "content2");
      zip.addFile(path.join(testDir, "file1.txt"));
      zip.addFile(path.join(testDir, "file2.txt"));

      // Start building and immediately abort
      const promise = zip.toBuffer();
      zip.abort();

      // Should either complete (if fast) or throw abort error
      try {
        await promise;
        // If it completes, that's ok too (operation was fast)
      } catch (e) {
        expect((e as Error).message).toMatch(/abort/i);
      }
    });
  });

  describe("edge cases", () => {
    describe("error handling", () => {
      it("getEntries should throw when archive not loaded", () => {
        const zip = new ZipFile();
        expect(() => zip.getEntries()).toThrow(/archive not loaded/i);
      });

      it("readEntry should throw when archive not loaded", async () => {
        const zip = new ZipFile();
        await expect(zip.readEntry("file.txt")).rejects.toThrow(/archive not loaded/i);
      });

      it("readEntrySync should throw when archive not loaded", () => {
        const zip = new ZipFile();
        expect(() => zip.readEntrySync("file.txt")).toThrow(/archive not loaded/i);
      });

      it("extractTo should throw when archive not loaded", async () => {
        const zip = new ZipFile();
        await expect(zip.extractTo(tempDir)).rejects.toThrow(/archive not loaded/i);
      });

      it("extractToSync should throw when archive not loaded", () => {
        const zip = new ZipFile();
        expect(() => zip.extractToSync(tempDir)).toThrow(/archive not loaded/i);
      });
    });

    describe("delete from pending entries", () => {
      it("should delete pending file entry", () => {
        const zip = new ZipFile();
        zip.addText("Content", "file.txt");

        expect(zip.deleteEntry("file.txt")).toBe(true);
        expect(zip.hasPendingChanges()).toBe(false);
      });

      it("should delete pending buffer entry", () => {
        const zip = new ZipFile();
        zip.addBuffer(new Uint8Array([1, 2, 3]), "data.bin");

        expect(zip.deleteEntry("data.bin")).toBe(true);
        expect(zip.hasPendingChanges()).toBe(false);
      });
    });

    describe("update pending entries", () => {
      it("should update pending buffer entry", async () => {
        const zip = new ZipFile();
        zip.addBuffer(new Uint8Array([1, 2, 3]), "data.bin");

        expect(zip.updateEntry("data.bin", new Uint8Array([4, 5, 6]))).toBe(true);

        const buffer = await zip.toBuffer();
        const parser = new ZipParser(buffer);
        const content = parser.extractSync("data.bin");
        expect(content).toEqual(new Uint8Array([4, 5, 6]));
      });

      it("should return false when updating non-existent entry", () => {
        const zip = new ZipFile();
        expect(zip.updateEntry("non-existent.txt", "content")).toBe(false);
      });
    });

    describe("hasEntry without parser", () => {
      it("should return false when no archive loaded", () => {
        const zip = new ZipFile();
        expect(zip.hasEntry("file.txt")).toBe(false);
      });
    });

    describe("getEntry returns null for non-existent", () => {
      it("should return null for non-existent entry", async () => {
        const srcZip = new ZipFile();
        srcZip.addText("Content", "exists.txt");
        const buffer = await srcZip.toBuffer();

        const zip = ZipFile.fromBuffer(buffer);
        expect(zip.getEntry("non-existent.txt")).toBeNull();
      });
    });

    describe("readEntry returns null for non-existent", () => {
      it("should return null for non-existent entry", async () => {
        const srcZip = new ZipFile();
        srcZip.addText("Content", "exists.txt");
        const buffer = await srcZip.toBuffer();

        const zip = ZipFile.fromBuffer(buffer);
        const result = await zip.readEntry("non-existent.txt");
        expect(result).toBeNull();
      });
    });

    describe("readAsText returns null for non-existent", () => {
      it("should return null for non-existent entry", async () => {
        const srcZip = new ZipFile();
        srcZip.addText("Content", "exists.txt");
        const buffer = await srcZip.toBuffer();

        const zip = ZipFile.fromBuffer(buffer);
        const result = await zip.readAsText("non-existent.txt");
        expect(result).toBeNull();
      });

      it("readAsTextSync should return null for non-existent entry", async () => {
        const srcZip = new ZipFile();
        srcZip.addText("Content", "exists.txt");
        const buffer = await srcZip.toBuffer();

        const zip = ZipFile.fromBuffer(buffer);
        const result = zip.readAsTextSync("non-existent.txt");
        expect(result).toBeNull();
      });
    });

    describe("getZipComment without parser", () => {
      it("should return options comment when no archive loaded", () => {
        const zip = new ZipFile({ comment: "Test comment" });
        expect(zip.getZipComment()).toBe("Test comment");
      });

      it("should return empty string when no comment set", () => {
        const zip = new ZipFile();
        expect(zip.getZipComment()).toBe("");
      });
    });

    describe("hasEncryptedEntries without parser", () => {
      it("should return false when no archive loaded", () => {
        const zip = new ZipFile();
        expect(zip.hasEncryptedEntries()).toBe(false);
      });
    });

    describe("sourcePath getter", () => {
      it("should return null for new archive", () => {
        const zip = new ZipFile();
        expect(zip.sourcePath).toBeNull();
      });

      it("should return path for loaded archive", async () => {
        const srcZip = new ZipFile();
        srcZip.addText("Content", "file.txt");
        const zipPath = path.join(tempDir, "source.zip");
        await srcZip.writeToFile(zipPath);

        const zip = await ZipFile.fromFile(zipPath);
        expect(zip.sourcePath).toBe(path.resolve(zipPath));
      });
    });

    describe("extractEntryTo returns false for non-existent", () => {
      it("should return false when entry not found", async () => {
        const srcZip = new ZipFile();
        srcZip.addText("Content", "exists.txt");
        const buffer = await srcZip.toBuffer();

        const zip = ZipFile.fromBuffer(buffer);
        const result = await zip.extractEntryTo(
          "non-existent.txt",
          path.join(tempDir, "output.txt")
        );
        expect(result).toBe(false);
      });

      it("extractEntryToSync should return false when entry not found", async () => {
        const srcZip = new ZipFile();
        srcZip.addText("Content", "exists.txt");
        const buffer = await srcZip.toBuffer();

        const zip = ZipFile.fromBuffer(buffer);
        const result = zip.extractEntryToSync("non-existent.txt", path.join(tempDir, "output.txt"));
        expect(result).toBe(false);
      });
    });

    describe("extraction with AbortSignal", () => {
      it("should abort extraction when signal is aborted", async () => {
        const srcZip = new ZipFile();
        srcZip.addText("Content 1", "file1.txt");
        srcZip.addText("Content 2", "file2.txt");
        const buffer = await srcZip.toBuffer();

        const zip = ZipFile.fromBuffer(buffer);
        const controller = new AbortController();

        // Abort immediately
        controller.abort();

        await expect(
          zip.extractTo(path.join(tempDir, "aborted"), { signal: controller.signal })
        ).rejects.toThrow(/abort/i);
      });
    });

    describe("writeZip without target", () => {
      it("should throw when no target specified and no source path", () => {
        const zip = new ZipFile();
        zip.addText("Content", "file.txt");

        expect(() => zip.writeZip()).toThrow(/no target file/i);
      });

      it("should write to source path when available", async () => {
        const srcZip = new ZipFile();
        srcZip.addText("Original", "file.txt");
        const zipPath = path.join(tempDir, "writeback.zip");
        await srcZip.writeToFile(zipPath);

        const zip = await ZipFile.fromFile(zipPath);
        zip.updateEntry("file.txt", "Updated");
        zip.writeZip(); // Should write to source path

        // Verify update
        const reloaded = await ZipFile.fromFile(zipPath);
        const content = await reloaded.readAsText("file.txt");
        expect(content).toBe("Updated");
      });
    });

    describe("symlink with custom mode", () => {
      it("should create symlink with custom mode", async () => {
        const zip = new ZipFile();
        zip.symlink("link", "target", 0o120755);
        const buffer = await zip.toBuffer();

        const parser = new ZipParser(buffer);
        expect(parser.hasEntry("link")).toBe(true);
      });
    });

    describe("toBufferSync with existing modifications", () => {
      it("should rebuild archive with deleted entries synchronously", async () => {
        const srcZip = new ZipFile();
        srcZip.addText("File 1", "file1.txt");
        srcZip.addText("File 2", "file2.txt");
        const buffer = await srcZip.toBuffer();

        const zip = ZipFile.fromBuffer(buffer);
        zip.deleteEntry("file1.txt");

        const newBuffer = zip.toBufferSync();
        const parser = new ZipParser(newBuffer);
        expect(parser.hasEntry("file1.txt")).toBe(false);
        expect(parser.hasEntry("file2.txt")).toBe(true);
      });

      it("should rebuild archive with updated entries synchronously", async () => {
        const srcZip = new ZipFile();
        srcZip.addText("Original", "file.txt");
        const buffer = await srcZip.toBuffer();

        const zip = ZipFile.fromBuffer(buffer);
        zip.updateEntry("file.txt", "Updated content");

        const newBuffer = zip.toBufferSync();
        const parser = new ZipParser(newBuffer);
        const content = parser.extractSync("file.txt");
        expect(new TextDecoder().decode(content!)).toBe("Updated content");
      });
    });

    describe("appendStream with ReadableStream", () => {
      it("should handle ReadableStream input", async () => {
        // Create a ReadableStream
        const chunks = [new Uint8Array([1, 2]), new Uint8Array([3, 4])];
        let index = 0;
        const stream = new ReadableStream<Uint8Array>({
          pull(controller) {
            if (index < chunks.length) {
              controller.enqueue(chunks[index]!);
              index++;
            } else {
              controller.close();
            }
          }
        });

        const zip = new ZipFile();
        zip.appendStream(stream, "readable-stream.bin");
        const buffer = await zip.toBuffer();

        const parser = new ZipParser(buffer);
        const content = parser.extractSync("readable-stream.bin");
        expect(content).toEqual(new Uint8Array([1, 2, 3, 4]));
      });
    });

    describe("entryCount", () => {
      it("should return pending entry count for new archive", () => {
        const zip = new ZipFile();
        expect(zip.entryCount).toBe(0);

        zip.addText("1", "a.txt");
        zip.addText("2", "b.txt");
        expect(zip.entryCount).toBe(2);
      });

      it("should return parser entry count for loaded archive", async () => {
        const srcZip = new ZipFile();
        srcZip.addText("1", "a.txt");
        srcZip.addText("2", "b.txt");
        srcZip.addText("3", "c.txt");
        const buffer = await srcZip.toBuffer();

        const zip = ZipFile.fromBuffer(buffer);
        expect(zip.entryCount).toBe(3);
      });
    });

    describe("setPassword", () => {
      it("should update password for future operations", async () => {
        const srcZip = new ZipFile({
          password: "initial",
          encryptionMethod: "zipcrypto"
        });
        srcZip.addText("Secret", "secret.txt");
        const buffer = await srcZip.toBuffer();

        const zip = ZipFile.fromBuffer(buffer);
        // Without correct password, extraction should fail or return wrong data
        zip.setPassword("initial");
        const content = await zip.readAsText("secret.txt");
        expect(content).toBe("Secret");
      });
    });

    describe("extractEntryTo edge cases", () => {
      it("should extract directory entry when present", async () => {
        // First create a zip with explicit directory entry using addDirectory
        await fsp.mkdir(path.join(testDir, "mydir"));
        await fsp.writeFile(path.join(testDir, "mydir/inner.txt"), "content");

        const srcZip = new ZipFile();
        srcZip.addDirectory(path.join(testDir, "mydir"), { prefix: "mydir" });
        const buffer = await srcZip.toBuffer();

        const zip = ZipFile.fromBuffer(buffer);
        const extractDir = path.join(tempDir, "entry-dir");

        // Verify directory entry exists and can be extracted
        const entry = zip.getEntry("mydir/");
        if (entry && entry.isDirectory) {
          const result = await zip.extractEntryTo("mydir/", path.join(extractDir, "mydir"));
          expect(result).toBe(true);
          expect(fs.existsSync(path.join(extractDir, "mydir"))).toBe(true);
        } else {
          // If no explicit directory entry, test extracts file correctly
          expect(zip.hasEntry("mydir/inner.txt")).toBe(true);
        }
      });

      it("should preserve timestamps when extracting single entry", async () => {
        const srcZip = new ZipFile();
        const modTime = new Date(2020, 0, 15, 10, 30, 0);
        srcZip.addText("Content", "timestamped.txt", { modTime });
        const buffer = await srcZip.toBuffer();

        const zip = ZipFile.fromBuffer(buffer);
        const targetPath = path.join(tempDir, "timestamped-extracted.txt");
        await zip.extractEntryTo("timestamped.txt", targetPath, { preserveTimestamps: true });

        const stats = await fsp.stat(targetPath);
        const entry = zip.getEntry("timestamped.txt")!;
        // Verify file time matches the entry's lastModified (which accounts for ZIP storage)
        expect(Math.abs(stats.mtime.getTime() - entry.lastModified.getTime())).toBeLessThan(2000);
      });

      it("extractEntryToSync should preserve timestamps", async () => {
        const srcZip = new ZipFile();
        const modTime = new Date(2020, 0, 15, 10, 30, 0);
        srcZip.addText("Content", "timestamped.txt", { modTime });
        const buffer = await srcZip.toBuffer();

        const zip = ZipFile.fromBuffer(buffer);
        const targetPath = path.join(tempDir, "timestamped-sync.txt");
        zip.extractEntryToSync("timestamped.txt", targetPath, { preserveTimestamps: true });

        const stats = fs.statSync(targetPath);
        const entry = zip.getEntry("timestamped.txt")!;
        // Verify file time matches the entry's lastModified (which accounts for ZIP storage)
        expect(Math.abs(stats.mtime.getTime() - entry.lastModified.getTime())).toBeLessThan(2000);
      });

      it("should respect overwrite strategy for single entry extraction", async () => {
        const srcZip = new ZipFile();
        srcZip.addText("New content", "file.txt");
        const buffer = await srcZip.toBuffer();

        const zip = ZipFile.fromBuffer(buffer);
        const targetPath = path.join(tempDir, "overwrite-entry.txt");

        // Create existing file
        await fsp.writeFile(targetPath, "Old content");

        // Skip should keep old content
        await zip.extractEntryTo("file.txt", targetPath, { overwrite: "skip" });
        expect(await fsp.readFile(targetPath, "utf8")).toBe("Old content");

        // Overwrite should replace
        await zip.extractEntryTo("file.txt", targetPath, { overwrite: "overwrite" });
        expect(await fsp.readFile(targetPath, "utf8")).toBe("New content");
      });

      it("extractEntryToSync should throw when archive not loaded", () => {
        const zip = new ZipFile();
        expect(() => zip.extractEntryToSync("file.txt", path.join(tempDir, "out.txt"))).toThrow(
          /archive not loaded/i
        );
      });

      it("extractEntryTo should throw when archive not loaded", async () => {
        const zip = new ZipFile();
        await expect(zip.extractEntryTo("file.txt", path.join(tempDir, "out.txt"))).rejects.toThrow(
          /archive not loaded/i
        );
      });
    });

    describe("archiver-compatible glob method", () => {
      it("glob should work as alias for addGlob", async () => {
        await fsp.writeFile(path.join(testDir, "glob1.ts"), "");
        await fsp.writeFile(path.join(testDir, "glob2.ts"), "");

        const zip = new ZipFile();
        zip.glob("*.ts", { cwd: testDir, prefix: "src" });
        const buffer = await zip.toBuffer();

        const parser = new ZipParser(buffer);
        const entries = parser.getEntries().map(e => e.path);
        expect(entries).toContain("src/glob1.ts");
        expect(entries).toContain("src/glob2.ts");
      });
    });

    describe("addLocalFolderPromise with regex filter", () => {
      it("should filter using RegExp", async () => {
        await fsp.mkdir(path.join(testDir, "regex-test"));
        await fsp.writeFile(path.join(testDir, "regex-test", "keep.ts"), "");
        await fsp.writeFile(path.join(testDir, "regex-test", "skip.spec.ts"), "");

        const zip = new ZipFile();
        zip.addLocalFolderPromise(path.join(testDir, "regex-test"), {
          zipPath: "filtered",
          filter: /^(?!.*\.spec\.ts$).*$/
        });
        const buffer = await zip.toBuffer();

        const parser = new ZipParser(buffer);
        expect(parser.hasEntry("filtered/keep.ts")).toBe(true);
        expect(parser.hasEntry("filtered/skip.spec.ts")).toBe(false);
      });
    });
  });
});

describe("file system utilities", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "fsutils-test-"));
  });

  afterEach(async () => {
    try {
      await fsp.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe("traverseDirectory", () => {
    it("should yield all files and directories", async () => {
      await fsp.mkdir(path.join(tempDir, "sub"));
      await fsp.writeFile(path.join(tempDir, "root.txt"), "");
      await fsp.writeFile(path.join(tempDir, "sub", "nested.txt"), "");

      const entries: string[] = [];
      for await (const entry of traverseDirectory(tempDir)) {
        entries.push(entry.relativePath);
      }

      expect(entries).toContain("root.txt");
      expect(entries).toContain("sub");
      expect(entries).toContain("sub/nested.txt");
    });

    it("should respect recursive option", async () => {
      await fsp.mkdir(path.join(tempDir, "sub"));
      await fsp.writeFile(path.join(tempDir, "root.txt"), "");
      await fsp.writeFile(path.join(tempDir, "sub", "nested.txt"), "");

      const entries: string[] = [];
      for await (const entry of traverseDirectory(tempDir, { recursive: false })) {
        entries.push(entry.relativePath);
      }

      expect(entries).toContain("root.txt");
      expect(entries).toContain("sub");
      expect(entries).not.toContain("sub/nested.txt");
    });
  });

  describe("glob", () => {
    it("should find files matching pattern", async () => {
      await fsp.writeFile(path.join(tempDir, "a.ts"), "");
      await fsp.writeFile(path.join(tempDir, "b.ts"), "");
      await fsp.writeFile(path.join(tempDir, "c.js"), "");

      const files: string[] = [];
      for await (const entry of glob("*.ts", { cwd: tempDir })) {
        files.push(entry.relativePath);
      }

      expect(files).toHaveLength(2);
      expect(files).toContain("a.ts");
      expect(files).toContain("b.ts");
    });
  });

  describe("ensureDir", () => {
    it("should create nested directories", async () => {
      const deepPath = path.join(tempDir, "a", "b", "c", "d");
      await ensureDir(deepPath);
      expect(fs.existsSync(deepPath)).toBe(true);
    });

    it("ensureDirSync should work", () => {
      const deepPath = path.join(tempDir, "x", "y", "z");
      ensureDirSync(deepPath);
      expect(fs.existsSync(deepPath)).toBe(true);
    });
  });

  describe("fileExists", () => {
    it("should return true for existing file", async () => {
      const filePath = path.join(tempDir, "exists.txt");
      await fsp.writeFile(filePath, "");
      expect(await fileExists(filePath)).toBe(true);
    });

    it("should return false for non-existing file", async () => {
      expect(await fileExists(path.join(tempDir, "nonexistent.txt"))).toBe(false);
    });
  });

  describe("readFileBytes / writeFileBytes", () => {
    it("should read and write binary data", async () => {
      const filePath = path.join(tempDir, "binary.bin");
      const data = new Uint8Array([0, 1, 2, 255, 254, 253]);

      await writeFileBytes(filePath, data);
      const read = await readFileBytes(filePath);

      expect(read).toEqual(data);
    });

    it("sync versions should work", () => {
      const filePath = path.join(tempDir, "sync-binary.bin");
      const data = new Uint8Array([10, 20, 30]);

      writeFileBytesSync(filePath, data);
      const read = readFileBytesSync(filePath);

      expect(read).toEqual(data);
    });
  });

  describe("setFileTime", () => {
    it("should set file modification time", async () => {
      const filePath = path.join(tempDir, "timed.txt");
      await fsp.writeFile(filePath, "");

      const targetTime = new Date("2020-06-15T12:00:00Z");
      await setFileTime(filePath, targetTime);

      const stats = await fsp.stat(filePath);
      expect(stats.mtime.getTime()).toBe(targetTime.getTime());
    });
  });
});
