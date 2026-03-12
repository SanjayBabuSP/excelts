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

  it("roundtrips strings containing literal _xHHHH_ patterns via shared strings", async () => {
    const filename = getUniqueTestFilePath(import.meta.url);

    const workbook = new WorkbookWriter({
      filename,
      useSharedStrings: true
    });

    const worksheet = workbook.addWorksheet("Sheet1");
    // This string contains a literal OOXML-like pattern that must survive roundtrip
    worksheet.addRow(["_x000D_"]).commit();
    worksheet.addRow(["Normal text"]).commit();
    worksheet.addRow(["_x005F_test"]).commit();

    worksheet.commit();
    await workbook.commit();

    const readBack = new Workbook();
    await readBack.xlsx.readFile(filename);

    const ws = readBack.getWorksheet("Sheet1");
    expect(ws).toBeTruthy();
    expect(ws!.getCell("A1").value).toBe("_x000D_");
    expect(ws!.getCell("A2").value).toBe("Normal text");
    expect(ws!.getCell("A3").value).toBe("_x005F_test");
  });
});
