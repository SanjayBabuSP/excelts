import { describe, it } from "vitest";
import { testDataPath } from "../../../modules/excel/utils/__test__/test-file-helper";
import { Workbook } from "../../../index";

describe("github issues", () => {
  it("issue 771 - Issue with dataValidation without type and with formula1 or formula2", () => {
    const wb = new Workbook();
    return wb.xlsx.readFile(testDataPath("test-issue-771.xlsx"));
  });
});
