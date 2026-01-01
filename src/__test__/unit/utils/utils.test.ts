import { describe, it, expect } from "vitest";
import { xmlEncode, isDateFmt, dateToExcel, excelToDate } from "../../../utils/utils";

describe("utils", () => {
  describe("xmlEncode", () => {
    it("encodes xml text", () => {
      expect(xmlEncode("<")).toBe("&lt;");
      expect(xmlEncode(">")).toBe("&gt;");
      expect(xmlEncode("&")).toBe("&amp;");
      expect(xmlEncode('"')).toBe("&quot;");
      expect(xmlEncode("'")).toBe("&apos;");

      expect(
        xmlEncode(
          "abc\x00\x01\x02\x03\x04\x05\x06\x07\x08\x0b\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f\x20abc\x7f"
        )
      ).toBe("abc abc");

      expect(xmlEncode('<a href="www.whatever.com">Talk to the H&</a>')).toBe(
        "&lt;a href=&quot;www.whatever.com&quot;&gt;Talk to the H&amp;&lt;/a&gt;"
      );

      expect(xmlEncode("new\x0aline")).toBe("new\x0aline");
    });
  });
  describe("isDateFmt", () => {
    ["yyyy-mm-dd"].forEach(fmt => {
      it(`'${fmt}' a date`, () => {
        expect(isDateFmt(fmt)).toBe(true);
      });
    });

    ["", "[Green]#,##0 ;[Red](#,##0)"].forEach(fmt => {
      it(`'${fmt}' is not a date`, () => {
        expect(isDateFmt(fmt)).toBe(false);
      });
    });
  });

  describe("dateToExcel", () => {
    it("should convert date to excel properly", () => {
      const myDate = new Date(Date.UTC(2017, 11, 15, 17, 0, 0, 0));

      const excelDate = dateToExcel(myDate, false);

      expect(excelDate).toBe(43084.70833333333);
    });
  });

  describe("excelToDate", () => {
    it("should round to the nearest millisecond when parsing excel date", () => {
      const myDate = new Date(Date.UTC(2017, 11, 15, 17, 0, 0, 0));
      const excelDate = dateToExcel(myDate, false);

      const dateConverted = excelToDate(excelDate, false);

      expect(dateConverted).toEqual(myDate);
    });
    it("should not lost millisecond precision when parsing excel date", () => {
      const myDate = new Date(Date.UTC(2017, 11, 15, 17, 0, 0, 0));
      const excelDate = dateToExcel(myDate, false);

      const dateConverted = excelToDate(excelDate, false);

      expect(dateConverted).toEqual(myDate);
    });
  });
});
