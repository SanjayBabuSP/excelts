import { describe, it, expect } from "vitest";
import { Writable } from "@stream";
import { Workbook, WorkbookWriter } from "../../../index";

// =============================================================================
// Helpers
// =============================================================================

/** Create a WorkbookWriter that writes to an in-memory buffer. */
function createMemoryWriter(options?: Record<string, unknown>): {
  wb: InstanceType<typeof WorkbookWriter>;
  getBuffer: () => Promise<Uint8Array>;
} {
  const chunks: Uint8Array[] = [];
  const stream = new Writable({
    write(chunk: Uint8Array, _encoding: string, callback: () => void) {
      chunks.push(chunk);
      callback();
    }
  });

  const wb = new WorkbookWriter({ stream, ...options });
  const getBuffer = async () => {
    await wb.commit();
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const buf = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      buf.set(chunk, offset);
      offset += chunk.length;
    }
    return buf;
  };

  return { wb, getBuffer };
}

/** Write via WorkbookWriter, then read back with Workbook for verification. */
async function writeAndReadBack(
  builder: (wb: InstanceType<typeof WorkbookWriter>) => void | Promise<void>,
  options?: Record<string, unknown>
): Promise<Workbook> {
  const { wb, getBuffer } = createMemoryWriter(options);
  await builder(wb);
  const buffer = await getBuffer();

  const readBack = new Workbook();
  await readBack.xlsx.load(buffer);
  return readBack;
}

// =============================================================================
// Tests
// =============================================================================

describe("WorkbookWriter", () => {
  // ===========================================================================
  // Worksheet Access
  // ===========================================================================

  describe("worksheet access", () => {
    it("returns undefined for non-existent sheet by name", () => {
      const { wb } = createMemoryWriter();
      wb.addWorksheet("first");
      expect(wb.getWorksheet("w00t")).toBeUndefined();
    });

    it("returns worksheet by numeric id", () => {
      const { wb } = createMemoryWriter();
      const ws1 = wb.addWorksheet("first");
      const ws2 = wb.addWorksheet("second");

      expect(wb.getWorksheet(ws1.id)).toBe(ws1);
      expect(wb.getWorksheet(ws2.id)).toBe(ws2);
    });

    it("returns undefined when called with no arguments (unlike Workbook)", () => {
      // WorkbookWriter.getWorksheet() requires a name or id argument.
      // Unlike Workbook, it does not return the first sheet when called with no args.
      const { wb } = createMemoryWriter();
      wb.addWorksheet("first");

      expect(wb.getWorksheet()).toBeUndefined();
    });

    it("returns undefined for non-existent numeric id", () => {
      const { wb } = createMemoryWriter();
      wb.addWorksheet("first");
      expect(wb.getWorksheet(999)).toBeUndefined();
    });
  });

  // ===========================================================================
  // Sheet Naming
  // ===========================================================================

  describe("sheet naming", () => {
    it("creates sheets with explicit names", () => {
      const { wb } = createMemoryWriter();
      const ws = wb.addWorksheet("Hello, World!");
      expect(ws.name).toBe("Hello, World!");
    });

    it("creates sheets with auto-generated names", () => {
      const { wb } = createMemoryWriter();
      const ws = wb.addWorksheet();
      expect(ws.name).toMatch(/sheet\d+/i);
    });
  });

  // ===========================================================================
  // Images
  // ===========================================================================

  describe("images", () => {
    it("addImage() and getImage() round-trip with buffer", () => {
      const { wb } = createMemoryWriter();
      const imageBuffer = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header stub

      const id = wb.addImage({
        buffer: imageBuffer,
        extension: "png"
      });

      expect(typeof id).toBe("number");
      const img = wb.getImage(id);
      expect(img).toBeDefined();
      expect(img!.buffer).toEqual(imageBuffer);
      expect(img!.extension).toBe("png");
    });

    it("addImage() and getImage() round-trip with base64", () => {
      const { wb } = createMemoryWriter();
      const id = wb.addImage({
        base64: "iVBORw0KGgo=",
        extension: "png"
      });

      expect(typeof id).toBe("number");
      const img = wb.getImage(id);
      expect(img).toBeDefined();
      expect(img!.extension).toBe("png");
    });

    it("getImage() returns undefined for invalid id", () => {
      const { wb } = createMemoryWriter();
      expect(wb.getImage(999)).toBeUndefined();
    });
  });

  // ===========================================================================
  // Metadata
  // ===========================================================================

  describe("metadata", () => {
    it("preserves creator and dates through serialization", async () => {
      const created = new Date(2024, 0, 1);
      const modified = new Date(2024, 5, 15);

      const wb2 = await writeAndReadBack(
        wb => {
          const ws = wb.addWorksheet("Sheet1");
          ws.getCell("A1").value = "test";
        },
        { creator: "TestAuthor", created, modified }
      );

      expect(wb2.creator).toBe("TestAuthor");
      expect(wb2.created).toBeInstanceOf(Date);
      expect(wb2.modified).toBeInstanceOf(Date);
    });
  });

  // ===========================================================================
  // Defined Names
  // ===========================================================================

  describe("defined names", () => {
    it("definedNames getter is accessible", () => {
      const { wb } = createMemoryWriter();
      expect(wb.definedNames).toBeDefined();
    });
  });

  // ===========================================================================
  // Views
  // ===========================================================================

  describe("views", () => {
    it("accepts and preserves workbook views", () => {
      const { wb } = createMemoryWriter();
      wb.views = [
        {
          x: 0,
          y: 0,
          width: 10000,
          height: 20000,
          firstSheet: 0,
          activeTab: 0,
          visibility: "visible"
        }
      ];
      expect(wb.views.length).toBe(1);
      expect(wb.views[0].activeTab).toBe(0);
    });
  });

  // ===========================================================================
  // Shared Strings
  // ===========================================================================

  describe("shared strings", () => {
    it("commits with shared strings enabled", async () => {
      // Migrated from workbook-writer-commit-shared-strings.test.ts
      const wb2 = await writeAndReadBack(
        wb => {
          const ws = wb.addWorksheet("myWorksheet");
          ws.addRow(["Hello"]).commit();
          ws.commit();
        },
        { useSharedStrings: true }
      );

      const ws2 = wb2.getWorksheet("myWorksheet");
      expect(ws2).toBeTruthy();
      expect(ws2!.getCell("A1").value).toBe("Hello");
    });

    it("roundtrips strings containing literal _xHHHH_ patterns via shared strings", async () => {
      // Migrated from workbook-writer-commit-shared-strings.test.ts
      const wb2 = await writeAndReadBack(
        wb => {
          const ws = wb.addWorksheet("Sheet1");
          ws.addRow(["_x000D_"]).commit();
          ws.addRow(["Normal text"]).commit();
          ws.addRow(["_x005F_test"]).commit();
          ws.commit();
        },
        { useSharedStrings: true }
      );

      const ws = wb2.getWorksheet("Sheet1");
      expect(ws).toBeTruthy();
      expect(ws!.getCell("A1").value).toBe("_x000D_");
      expect(ws!.getCell("A2").value).toBe("Normal text");
      expect(ws!.getCell("A3").value).toBe("_x005F_test");
    });
  });

  // ===========================================================================
  // Commit Behavior
  // ===========================================================================

  describe("commit behavior", () => {
    it("produces a valid XLSX with no worksheets", async () => {
      const wb2 = await writeAndReadBack(() => {
        // Intentionally empty — no worksheets added
      });

      expect(wb2.worksheets.length).toBe(0);
    });

    it("produces a valid XLSX with multiple worksheets", async () => {
      const wb2 = await writeAndReadBack(wb => {
        const ws1 = wb.addWorksheet("One");
        ws1.getCell("A1").value = 1;
        ws1.commit();

        const ws2 = wb.addWorksheet("Two");
        ws2.getCell("A1").value = 2;
        ws2.commit();
      });

      expect(wb2.worksheets.length).toBe(2);
      expect(wb2.getWorksheet("One")!.getCell("A1").value).toBe(1);
      expect(wb2.getWorksheet("Two")!.getCell("A1").value).toBe(2);
    });
  });

  // ===========================================================================
  // Browser-Specific: addMedia Filename Error
  // ===========================================================================

  describe("browser addMedia restrictions", () => {
    it("addImage with filename is handled by platform-specific implementation", () => {
      // In the browser WorkbookWriter, addImage with filename throws.
      // In Node.js, it reads the file. We just verify it doesn't crash
      // when given a buffer instead.
      const { wb } = createMemoryWriter();
      const id = wb.addImage({
        buffer: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        extension: "png"
      });
      expect(typeof id).toBe("number");
    });
  });
});
