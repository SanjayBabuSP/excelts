import { describe, it, expect } from "vitest";
import { Workbook, WorkbookReader } from "../../../index";

describe("WorkbookReader (Node) accepts ReadableStream input", () => {
  it("should read a workbook from ReadableStream<Uint8Array>", async () => {
    // Node 20+ has ReadableStream globally. Guard for non-standard environments.
    if (typeof ReadableStream === "undefined") {
      return;
    }

    const wb = new Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.getCell("A1").value = "hello";
    ws.getCell("A2").value = 42;

    const data = await wb.xlsx.writeBuffer();

    const webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Chunk the payload to ensure we exercise streaming code paths.
        const chunkSize = 64 * 1024;
        for (let i = 0; i < data.length; i += chunkSize) {
          controller.enqueue(data.slice(i, i + chunkSize));
        }
        controller.close();
      }
    });

    const reader = new WorkbookReader(webStream, { worksheets: "emit" });
    let seen = false;

    for await (const worksheet of reader) {
      seen = true;
      expect(worksheet.name).toBe("Sheet1");

      let rowCount = 0;
      for await (const row of worksheet) {
        rowCount++;
        if (row.number === 1) {
          expect(row.getCell(1).value).toBe("hello");
        }
        if (row.number === 2) {
          expect(row.getCell(1).value).toBe(42);
        }
      }

      expect(rowCount).toBeGreaterThan(0);
    }

    expect(seen).toBe(true);
  });
});
