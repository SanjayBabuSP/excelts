import { describe, it, expect } from "vitest";
import { createReadStream } from "fs";
import { join } from "path";
import { PassThrough } from "../../../stream";
import { Parse, createParse, type ZipEntry } from "../../parse";

// Path to test xlsx file (xlsx files are zip archives)
const testFilePath = join(__dirname, "../../../../__test__/integration/data/formulas.xlsx");

describe("parse", () => {
  describe("Parse class", () => {
    it("should parse a zip file and emit entries", async () => {
      const entries: string[] = [];
      const parse = createParse({ forceStream: true });

      const stream = createReadStream(testFilePath);
      stream.pipe(parse);

      for await (const entry of parse) {
        entries.push((entry as ZipEntry).path);
        (entry as ZipEntry).autodrain();
      }

      expect(entries.length).toBeGreaterThan(0);
      expect(entries).toContain("[Content_Types].xml");
      expect(entries.some(e => e.includes("xl/workbook.xml"))).toBe(true);
    });

    it("should parse file content correctly", async () => {
      const parse = createParse({ forceStream: true });
      const stream = createReadStream(testFilePath);
      stream.pipe(parse);

      let contentTypesContent = "";

      for await (const entry of parse) {
        const zipEntry = entry as ZipEntry;
        if (zipEntry.path === "[Content_Types].xml") {
          const buffer = await zipEntry.buffer();
          contentTypesContent = new TextDecoder().decode(buffer);
        } else {
          zipEntry.autodrain();
        }
      }

      expect(contentTypesContent).toContain("<?xml");
      expect(contentTypesContent).toContain("ContentType");
    });

    it("should handle forceStream option - emits data event instead of entry", async () => {
      const parse = createParse({ forceStream: true });
      const stream = createReadStream(testFilePath);

      let dataEventEmitted = false;
      let entryEventEmitted = false;

      parse.on("data", (entry: ZipEntry) => {
        expect(entry).toBeInstanceOf(PassThrough);
        dataEventEmitted = true;
        entry.autodrain();
      });

      parse.on("entry", () => {
        entryEventEmitted = true;
      });

      stream.pipe(parse);

      await parse.promise();

      expect(dataEventEmitted).toBe(true);
      expect(entryEventEmitted).toBe(false);
    });

    it("should provide entry type (File or Directory)", async () => {
      const parse = createParse({ forceStream: true });
      const stream = createReadStream(testFilePath);
      stream.pipe(parse);

      let hasFile = false;

      for await (const entry of parse) {
        const zipEntry = entry as ZipEntry;
        if (zipEntry.type === "File") {
          hasFile = true;
        }
        zipEntry.autodrain();
      }

      expect(hasFile).toBe(true);
    });

    it("should provide entry vars with compression info", async () => {
      const parse = createParse({ forceStream: true });
      const stream = createReadStream(testFilePath);
      stream.pipe(parse);

      for await (const entry of parse) {
        const zipEntry = entry as ZipEntry;
        expect(zipEntry.vars).toBeDefined();
        expect(typeof zipEntry.vars.compressionMethod).toBe("number");
        expect(typeof zipEntry.vars.compressedSize).toBe("number");
        expect(typeof zipEntry.vars.uncompressedSize).toBe("number");
        zipEntry.autodrain();
        break; // Just check first entry
      }
    });

    it("should set entry size after reading", async () => {
      const parse = createParse({ forceStream: true });
      const stream = createReadStream(testFilePath);
      stream.pipe(parse);

      for await (const entry of parse) {
        const zipEntry = entry as ZipEntry;
        if (zipEntry.type === "File" && zipEntry.vars.uncompressedSize > 0) {
          const buffer = await zipEntry.buffer();
          expect(buffer.length).toBe(zipEntry.vars.uncompressedSize);
          break;
        } else {
          zipEntry.autodrain();
        }
      }
    });

    it("should verify that immediate autodrain does not unzip", async () => {
      const parse = new Parse();
      const stream = createReadStream(testFilePath);

      parse.on("entry", (entry: ZipEntry) => {
        entry.autodrain().on("finish", () => {
          expect(entry.__autodraining).toBe(true);
        });
      });

      stream.pipe(parse);
      await parse.promise();
    });

    it("should verify that autodrain promise works", async () => {
      const parse = new Parse();
      const stream = createReadStream(testFilePath);

      parse.on("entry", (entry: ZipEntry) => {
        entry
          .autodrain()
          .promise()
          .then(() => {
            expect(entry.__autodraining).toBe(true);
          });
      });

      stream.pipe(parse);
      await parse.promise();
    });

    it("should handle autodrain().promise()", async () => {
      const parse = createParse({ forceStream: true });
      const stream = createReadStream(testFilePath);
      stream.pipe(parse);

      for await (const entry of parse) {
        const zipEntry = entry as ZipEntry;
        await zipEntry.autodrain().promise();
        break;
      }
    });

    it("should provide promise() method for completion", async () => {
      const parse = new Parse();
      const stream = createReadStream(testFilePath);

      parse.on("entry", (entry: ZipEntry) => {
        entry.autodrain();
      });

      stream.pipe(parse);

      // parse.promise() should resolve after all entries processed
      await parse.promise();
    });

    it("promise should resolve when entries have been processed", async () => {
      const parse = new Parse();
      const stream = createReadStream(testFilePath);
      let entryRead = false;

      parse.on("entry", (entry: ZipEntry) => {
        if (entry.path === "[Content_Types].xml") {
          entry.buffer().then(() => {
            entryRead = true;
          });
        } else {
          entry.autodrain();
        }
      });

      stream.pipe(parse);

      await parse.promise();
      expect(entryRead).toBe(true);
    });

    it("promise should be rejected if there is an error in the stream", async () => {
      const parse = new Parse();
      const stream = createReadStream(testFilePath);

      parse.on("entry", function (this: Parse) {
        this.emit("error", new Error("this is an error"));
      });

      stream.pipe(parse);

      await expect(parse.promise()).rejects.toThrow("this is an error");
    });

    it("should work with entry event instead of async iterator", async () => {
      const parse = new Parse();
      const entries: string[] = [];

      parse.on("entry", (entry: ZipEntry) => {
        entries.push(entry.path);
        entry.autodrain();
      });

      const stream = createReadStream(testFilePath);
      stream.pipe(parse);

      await parse.promise();

      expect(entries.length).toBeGreaterThan(0);
    });

    it("should emit error for non-archive file (invalid signature)", async () => {
      const parse = new Parse();
      // Use package.json as a non-archive file
      const nonArchive = join(__dirname, "../../../../../package.json");
      const stream = createReadStream(nonArchive);

      stream.pipe(parse);

      await expect(parse.promise()).rejects.toThrow(/invalid signature: 0x/);
    });

    it("should parse archive with low highWaterMark (chunk boundary test)", async () => {
      const parse = createParse({ forceStream: true });
      // Use artificially low highWaterMark to test chunk boundary handling
      const stream = createReadStream(testFilePath, { highWaterMark: 3 });
      stream.pipe(parse);

      for await (const entry of parse) {
        (entry as ZipEntry).autodrain();
      }

      // If we get here without error, the test passed
      expect(true).toBe(true);
    });

    it("should provide entry props with flags", async () => {
      const parse = createParse({ forceStream: true });
      const stream = createReadStream(testFilePath);
      stream.pipe(parse);

      for await (const entry of parse) {
        const zipEntry = entry as ZipEntry;
        expect(zipEntry.props).toBeDefined();
        expect(zipEntry.props.path).toBe(zipEntry.path);
        expect(zipEntry.props.pathBuffer).toBeInstanceOf(Uint8Array);
        expect(typeof zipEntry.props.flags.isUnicode).toBe("boolean");
        zipEntry.autodrain();
        break;
      }
    });

    it("should provide lastModifiedDateTime in entry vars", async () => {
      const parse = createParse({ forceStream: true });
      const stream = createReadStream(testFilePath);
      stream.pipe(parse);

      for await (const entry of parse) {
        const zipEntry = entry as ZipEntry;
        expect(zipEntry.vars.lastModifiedDateTime).toBeInstanceOf(Date);
        zipEntry.autodrain();
        break;
      }
    });
  });

  describe("createParse factory", () => {
    it("should create a Parse instance", () => {
      const parse = createParse();
      expect(parse).toBeInstanceOf(Parse);
    });

    it("should pass options to Parse", () => {
      const parse = createParse({ verbose: false, forceStream: true });
      expect(parse).toBeInstanceOf(Parse);
    });
  });
});
