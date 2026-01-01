import { describe, it } from "vitest";
import { testDataPath } from "../../../modules/excel/utils/__test__/test-file-helper";
import { Workbook } from "../../../index";

describe("github issues", () => {
  describe("issue 539 - <contentType /> element", () => {
    it("Reading 1904.xlsx", () => {
      const wb = new Workbook();
      return wb.xlsx.readFile(testDataPath("1519293514-KRISHNAPATNAM_LINE_UP.xlsx"));
    });
  });
});
