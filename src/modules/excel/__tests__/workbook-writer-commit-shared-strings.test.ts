import fs from "node:fs";

import { describe, expect, it } from "vitest";

import { Workbook, WorkbookWriter } from "../../../index";
import { getUniqueTestFilePath } from "@test/utils";

describe("WorkbookWriter", () => {
  it("commits a simple WorkbookWriter with shared strings", async () => {
    const filename = getUniqueTestFilePath(import.meta.url);

    const workbook = new WorkbookWriter({
      filename,
      useSharedStrings: true
    });

    const worksheet = workbook.addWorksheet("myWorksheet");
    worksheet.addRow(["Hello"]).commit();

    worksheet.commit();
    await workbook.commit();

    expect(fs.existsSync(filename)).toBe(true);

    const readBack = new Workbook();
    await readBack.xlsx.readFile(filename);

    const ws2 = readBack.getWorksheet("myWorksheet");
    expect(ws2).toBeTruthy();
    expect(ws2!.getCell("A1").value).toBe("Hello");
  });
});
