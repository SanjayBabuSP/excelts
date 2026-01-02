import { describe, it, expect } from "vitest";
import { dateToExcel, excelToDate } from "@utils/utils";

describe("excel date serial", () => {
  it("converts Date -> serial", () => {
    const myDate = new Date(Date.UTC(2017, 11, 15, 17, 0, 0, 0));
    const excelDate = dateToExcel(myDate, false);
    expect(excelDate).toBe(43084.70833333333);
  });

  it("roundtrips serial -> Date (millisecond precision)", () => {
    const myDate = new Date(Date.UTC(2017, 11, 15, 17, 0, 0, 0));
    const excelDate = dateToExcel(myDate, false);
    const dateConverted = excelToDate(excelDate, false);
    expect(dateConverted).toEqual(myDate);
  });
});
