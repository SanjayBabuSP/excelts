import { describe, it, expect } from "vitest";
import fs from "fs";
import { testDataPath } from "../../../modules/excel/utils/__test__/test-file-helper";
import { WorkbookReader } from "../../../index";

describe("streaming reader: hyperlinks cache", () => {
  it("should resolve worksheet hyperlink rIds to targets", async () => {
    const worksheets: any[] = [];

    const workbookReader = new WorkbookReader(
      fs.createReadStream(testDataPath("test-issue-877.xlsx")),
      {
        worksheets: "emit",
        sharedStrings: "cache",
        styles: "ignore",
        hyperlinks: "cache",
        entries: "ignore"
      }
    );

    await new Promise<void>((resolve, reject) => {
      workbookReader.on("worksheet", worksheet => {
        worksheets.push(worksheet);
      });
      workbookReader.on("end", resolve);
      workbookReader.on("error", reject);
      workbookReader.read();
    });

    const targets: string[] = [];
    for (const worksheet of worksheets) {
      const sheetNo = worksheet.sheetNo ?? worksheet.id;
      const hyperlinks = worksheet.hyperlinks as undefined | Record<string, { rId: string }>;
      if (!hyperlinks) {
        continue;
      }

      for (const ref in hyperlinks) {
        const rId = hyperlinks[ref].rId;
        const target = (workbookReader as any).getHyperlinkTarget?.(sheetNo, rId) as
          | string
          | undefined;
        if (target) {
          targets.push(target);
        }
      }
    }

    expect(targets.length).toBeGreaterThan(0);
    expect(targets[0]).toBeTypeOf("string");
  });
});
