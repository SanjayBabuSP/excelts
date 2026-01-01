import { describe, it, expect } from "vitest";
import { testDataPath } from "../../../modules/excel/utils/__test__/test-file-helper";
import { Workbook } from "../../../index";

describe("github issues", () => {
  it("pull request 1220 - The worksheet should not be undefined", async () => {
    const wb = new Workbook();
    await wb.xlsx.readFile(testDataPath("test-pr-1220.xlsx"));
    const ws = wb.getWorksheet(1);
    expect(ws).to.not.equal(undefined);
  });
});
