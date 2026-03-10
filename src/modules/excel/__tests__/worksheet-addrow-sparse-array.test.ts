import fs from "node:fs";

import { describe, expect, it } from "vitest";

import { Workbook } from "../../../index";
import { getUniqueTestFilePath } from "@test/utils";

describe("worksheet.addRow", () => {
  it("supports sparse array rows (including beyond declared columns)", async () => {
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet("ExampleWS");

    worksheet.columns = [
      { header: "Id", key: "id", width: 10 },
      { header: "Name", key: "name", width: 32 },
      { header: "D.O.B.", key: "dob", width: 10 }
    ];

    const sparse = [] as any[];
    sparse[1] = 4;
    sparse[5] = "Kyle";
    sparse[9] = new Date("2020-01-02T00:00:00.000Z");

    worksheet.addRow(sparse);

    worksheet.addRows([
      [5, "Bob", new Date("2020-01-03T00:00:00.000Z")],
      { id: 6, name: "Barbara", dob: new Date("2020-01-04T00:00:00.000Z") }
    ]);

    // worksheet.columns creates a header row at row 1
    expect(worksheet.getCell(2, 1).value).toBe(4);
    expect(worksheet.getCell(2, 5).value).toBe("Kyle");
    expect(worksheet.getCell(3, 1).value).toBe(5);
    expect(worksheet.getCell(4, 1).value).toBe(6);

    const filename = getUniqueTestFilePath(import.meta.url);
    await workbook.xlsx.writeFile(filename);
    expect(fs.existsSync(filename)).toBe(true);

    const readBack = new Workbook();
    await readBack.xlsx.readFile(filename);

    const ws2 = readBack.getWorksheet("ExampleWS")!;
    expect(ws2).toBeTruthy();

    expect(ws2.getCell(2, 1).value).toBe(4);
    expect(ws2.getCell(2, 5).value).toBe("Kyle");

    const v = ws2.getCell(2, 9).value;
    expect(v).not.toBeNull();
    expect(v instanceof Date || typeof v === "number").toBe(true);

    expect(ws2.getCell(3, 1).value).toBe(5);
    expect(ws2.getCell(3, 2).value).toBe("Bob");

    expect(ws2.getCell(4, 1).value).toBe(6);
    expect(ws2.getCell(4, 2).value).toBe("Barbara");
  });
});
