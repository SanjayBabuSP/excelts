import { describe, it } from "vitest";
import { testDataPath } from "../../../modules/excel/utils/__test__/test-file-helper";
import { Workbook } from "../../../index";

describe("github issues", () => {
  it("issue 988 - table without autofilter model", () => {
    const wb = new Workbook();
    return wb.xlsx.readFile(testDataPath("test-issue-988.xlsx"));
  }, 6000);
});
