import { describe, it, expect } from "vitest";
import { Workbook } from "../../../index";
import { makeTestDataPath, testFilePath } from "@test/utils";

const csvTestDataPath = makeTestDataPath(import.meta.url, "./data");

describe("Workbook", () => {
  describe("CSV", () => {
    it("differentiates between strings with leading numbers and dates when reading csv files", async () => {
      const wb = new Workbook();
      const worksheet = await wb.csv.readFile(csvTestDataPath("date-vs-leading-zeros.csv"));

      expect(worksheet.getCell("A1").value!.toString()).toBe(
        new Date("2019-11-04T00:00:00").toString()
      );
      expect(worksheet.getCell("A2").value!.toString()).toBe(
        new Date("2019-11-04T00:00:00").toString()
      );
      expect(worksheet.getCell("A3").value!.toString()).toBe(
        new Date("2019-11-04T10:17:55").toString()
      );
      expect(worksheet.getCell("A4").value).toBe("00210PRG1");
      expect(worksheet.getCell("A5").value).toBe("1234-5thisisnotadate");
    });

    it("supports encoding option on writeFile + readFile roundtrip", async () => {
      const TEST_CSV_FILE_NAME = testFilePath("csv-encoding-utf8-roundtrip", ".csv");
      const HEBREW_TEST_STRING = "משהו שכתוב בעברית";

      const wb = new Workbook();
      const ws = wb.addWorksheet("wheee");
      ws.getCell("A1").value = HEBREW_TEST_STRING;

      await wb.csv.writeFile(TEST_CSV_FILE_NAME, { encoding: "UTF-8" });

      const wb2 = new Workbook();
      const ws2 = await wb2.csv.readFile(TEST_CSV_FILE_NAME);
      expect(ws2.getCell("A1").value).toBe(HEBREW_TEST_STRING);
    }, 6000);
  });
});
