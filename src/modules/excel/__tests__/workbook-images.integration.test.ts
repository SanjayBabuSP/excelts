import { describe, it, expect } from "vitest";
import fs from "fs";
import { promisify } from "util";
import { Workbook } from "../../../index";

import { makeTestDataPath, testFilePath } from "@test/utils";

const excelTestDataPath = makeTestDataPath(import.meta.url, "./data");

const IMAGE_FILENAME = excelTestDataPath("image.png");

const TEST_XLSX_FILE_NAME = testFilePath("workbook-images.test");
const fsReadFileAsync = promisify(fs.readFile);

// =============================================================================
// Tests

describe("Workbook", () => {
  describe("Images", () => {
    it("stores background image", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("blort");
      let wb2;
      let ws2;
      const imageId = wb.addImage({
        filename: IMAGE_FILENAME,
        extension: "jpeg"
      });

      ws.getCell("A1").value = "Hello, World!";
      ws.addBackgroundImage(imageId);

      return wb.xlsx
        .writeFile(TEST_XLSX_FILE_NAME)
        .then(() => {
          wb2 = new Workbook();
          return wb2.xlsx.readFile(TEST_XLSX_FILE_NAME);
        })
        .then(() => {
          ws2 = wb2.getWorksheet("blort");
          expect(ws2).toBeDefined();

          return fsReadFileAsync(IMAGE_FILENAME);
        })
        .then(imageData => {
          const backgroundId2 = ws2.getBackgroundImageId();
          const image = wb2.getImage(backgroundId2);

          expect(Buffer.compare(imageData, image.buffer)).toBe(0);
        });
    });

    it("stores embedded image and hyperlink", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("blort");
      let wb2;
      let ws2;

      const imageId = wb.addImage({
        filename: IMAGE_FILENAME,
        extension: "jpeg"
      });

      ws.getCell("A1").value = "Hello, World!";
      ws.getCell("A2").value = {
        hyperlink: "http://www.somewhere.com",
        text: "www.somewhere.com"
      };
      ws.addImage(imageId, "C3:E6");

      return wb.xlsx
        .writeFile(TEST_XLSX_FILE_NAME)
        .then(() => {
          wb2 = new Workbook();
          return wb2.xlsx.readFile(TEST_XLSX_FILE_NAME);
        })
        .then(() => {
          ws2 = wb2.getWorksheet("blort");
          expect(ws2).toBeDefined();

          expect(ws.getCell("A1").value).toBe("Hello, World!");
          expect(ws.getCell("A2").value).toEqual({
            hyperlink: "http://www.somewhere.com",
            text: "www.somewhere.com"
          });

          return fsReadFileAsync(IMAGE_FILENAME);
        })
        .then(imageData => {
          const images = ws2.getImages();
          expect(images.length).toBe(1);

          const imageDesc = images[0];
          expect(imageDesc.range.tl.col).toBe(2);
          expect(imageDesc.range.tl.row).toBe(2);
          expect(imageDesc.range.br.col).toBe(5);
          expect(imageDesc.range.br.row).toBe(6);

          const image = wb2.getImage(imageDesc.imageId);
          expect(Buffer.compare(imageData, image.buffer)).toBe(0);
        });
    });

    it("stores embedded image with oneCell", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("blort");
      let wb2;
      let ws2;

      const imageId = wb.addImage({
        filename: IMAGE_FILENAME,
        extension: "jpeg"
      });

      ws.addImage(imageId, {
        tl: { col: 0.1125, row: 0.4 },
        br: { col: 2.101046875, row: 3.4 },
        editAs: "oneCell"
      });

      return wb.xlsx
        .writeFile(TEST_XLSX_FILE_NAME)
        .then(() => {
          wb2 = new Workbook();
          return wb2.xlsx.readFile(TEST_XLSX_FILE_NAME);
        })
        .then(() => {
          ws2 = wb2.getWorksheet("blort");
          expect(ws2).toBeDefined();

          return fsReadFileAsync(IMAGE_FILENAME);
        })
        .then(imageData => {
          const images = ws2.getImages();
          expect(images.length).toBe(1);

          const imageDesc = images[0];
          expect(imageDesc.range.editAs).toBe("oneCell");

          const image = wb2.getImage(imageDesc.imageId);
          expect(Buffer.compare(imageData, image.buffer)).toBe(0);
        });
    });

    it("stores embedded image with one-cell-anchor", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("blort");
      let wb2;
      let ws2;

      const imageId = wb.addImage({
        filename: IMAGE_FILENAME,
        extension: "jpeg"
      });

      ws.addImage(imageId, {
        tl: { col: 0.1125, row: 0.4 },
        ext: { width: 100, height: 100 },
        editAs: "oneCell"
      });

      return wb.xlsx
        .writeFile(TEST_XLSX_FILE_NAME)
        .then(() => {
          wb2 = new Workbook();
          return wb2.xlsx.readFile(TEST_XLSX_FILE_NAME);
        })
        .then(() => {
          ws2 = wb2.getWorksheet("blort");
          expect(ws2).toBeDefined();

          return fsReadFileAsync(IMAGE_FILENAME);
        })
        .then(imageData => {
          const images = ws2.getImages();
          expect(images.length).toBe(1);

          const imageDesc = images[0];
          expect(imageDesc.range.editAs).toBe("oneCell");
          expect(imageDesc.range.ext.width).toBe(100);
          expect(imageDesc.range.ext.height).toBe(100);

          const image = wb2.getImage(imageDesc.imageId);
          expect(Buffer.compare(imageData, image.buffer)).toBe(0);
        });
    });

    it("stores embedded image with hyperlinks", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("blort");
      let wb2;
      let ws2;

      const imageId = wb.addImage({
        filename: IMAGE_FILENAME,
        extension: "jpeg"
      });

      ws.addImage(imageId, {
        tl: { col: 0.1125, row: 0.4 },
        ext: { width: 100, height: 100 },
        editAs: "absolute",
        hyperlinks: {
          hyperlink: "http://www.somewhere.com",
          tooltip: "www.somewhere.com"
        }
      });

      return wb.xlsx
        .writeFile(TEST_XLSX_FILE_NAME)
        .then(() => {
          wb2 = new Workbook();
          return wb2.xlsx.readFile(TEST_XLSX_FILE_NAME);
        })
        .then(() => {
          ws2 = wb2.getWorksheet("blort");
          expect(ws2).toBeDefined();

          return fsReadFileAsync(IMAGE_FILENAME);
        })
        .then(imageData => {
          const images = ws2.getImages();
          expect(images.length).toBe(1);

          const imageDesc = images[0];
          expect(imageDesc.range.editAs).toBe("absolute");
          expect(imageDesc.range.ext.width).toBe(100);
          expect(imageDesc.range.ext.height).toBe(100);

          expect(imageDesc.range.hyperlinks).toEqual({
            hyperlink: "http://www.somewhere.com",
            tooltip: "www.somewhere.com"
          });

          const image = wb2.getImage(imageDesc.imageId);
          expect(Buffer.compare(imageData, image.buffer)).toBe(0);
        });
    });

    it("image extensions should not be case sensitive", () => {
      const wb = new Workbook();
      const ws = wb.addWorksheet("blort");
      let wb2;
      let ws2;

      const imageId1 = wb.addImage({
        filename: IMAGE_FILENAME,
        extension: "png"
      });

      const imageId2 = wb.addImage({
        filename: IMAGE_FILENAME,
        extension: "jpeg"
      });

      ws.addImage(imageId1, {
        tl: { col: 0.1125, row: 0.4 },
        ext: { width: 100, height: 100 }
      });

      ws.addImage(imageId2, {
        tl: { col: 0.1125, row: 0.4 },
        br: { col: 2.101046875, row: 3.4 },
        editAs: "oneCell"
      });

      return wb.xlsx
        .writeFile(TEST_XLSX_FILE_NAME)
        .then(() => {
          wb2 = new Workbook();
          return wb2.xlsx.readFile(TEST_XLSX_FILE_NAME);
        })
        .then(() => {
          ws2 = wb2.getWorksheet("blort");
          expect(ws2).toBeDefined();

          return fsReadFileAsync(IMAGE_FILENAME);
        })
        .then(imageData => {
          const images = ws2.getImages();
          expect(images.length).toBe(2);

          const imageDesc1 = images[0];
          expect(imageDesc1.range.ext.width).toBe(100);
          expect(imageDesc1.range.ext.height).toBe(100);
          const image1 = wb2.getImage(imageDesc1.imageId);

          const imageDesc2 = images[1];
          expect(imageDesc2.range.editAs).toBe("oneCell");

          const image2 = wb2.getImage(imageDesc1.imageId);

          expect(Buffer.compare(imageData, image1.buffer)).toBe(0);
          expect(Buffer.compare(imageData, image2.buffer)).toBe(0);
        });
    });

    describe("image range updates on row/column splice", () => {
      it("updates image range after insertRow", () => {
        const wb = new Workbook();
        const ws = wb.addWorksheet("Sheet1");
        const imgId = wb.addImage({
          filename: IMAGE_FILENAME,
          extension: "png"
        });
        ws.addImage(imgId, "B2:D4");

        // Insert a row before the image
        ws.insertRow(1, []);

        const images = ws.getImages();
        expect(images.length).toBe(1);
        const img = images[0];
        // Image should shift down by 1 row (B2:D4 -> B3:D5)
        // nativeRow is 0-based: row 2 -> nativeRow 1, after insert -> nativeRow 2
        expect(img.range!.tl.nativeRow).toBe(2);
        expect(img.range!.tl.nativeCol).toBe(1);
        expect(img.range!.br!.nativeRow).toBe(5);
        expect(img.range!.br!.nativeCol).toBe(4);
      });

      it("does not update image range when inserting row after the image", () => {
        const wb = new Workbook();
        const ws = wb.addWorksheet("Sheet1");
        const imgId = wb.addImage({
          filename: IMAGE_FILENAME,
          extension: "png"
        });
        ws.addImage(imgId, "A1:B2");

        // Insert a row after the image
        ws.insertRow(5, []);

        const images = ws.getImages();
        const img = images[0];
        // Image should not move (A1:B2 stays the same)
        // nativeRow for A1 with string range uses offset -1: row=1 -> nativeRow=0
        expect(img.range!.tl.nativeRow).toBe(0);
        expect(img.range!.tl.nativeCol).toBe(0);
        expect(img.range!.br!.nativeRow).toBe(2);
        expect(img.range!.br!.nativeCol).toBe(2);
      });

      it("updates image range after spliceRows with remove", () => {
        const wb = new Workbook();
        const ws = wb.addWorksheet("Sheet1");
        const imgId = wb.addImage({
          filename: IMAGE_FILENAME,
          extension: "png"
        });
        ws.addImage(imgId, "A3:B4");

        // Remove 1 row at row 1
        ws.spliceRows(1, 1);

        const images = ws.getImages();
        const img = images[0];
        // Image should shift up by 1 row (A3:B4 -> A2:B3)
        // nativeRow: row 3 -> nativeRow 2, after remove -> nativeRow 1
        expect(img.range!.tl.nativeRow).toBe(1);
        expect(img.range!.br!.nativeRow).toBe(3);
      });

      it("updates image range after spliceColumns with insert", () => {
        const wb = new Workbook();
        const ws = wb.addWorksheet("Sheet1");
        const imgId = wb.addImage({
          filename: IMAGE_FILENAME,
          extension: "png"
        });
        ws.addImage(imgId, "B1:C2");

        // Insert a column before column B
        ws.spliceColumns(1, 0, []);

        const images = ws.getImages();
        const img = images[0];
        // Image should shift right by 1 column (B1:C2 -> C1:D2)
        // tl: col=2 with offset -1 -> nativeCol=1, after insert -> nativeCol=2
        // br: col=3 with offset 0 -> nativeCol=3, after insert -> nativeCol=4
        expect(img.range!.tl.nativeCol).toBe(2);
        expect(img.range!.br!.nativeCol).toBe(4);
      });

      it("handles multiple images correctly during row splice", () => {
        const wb = new Workbook();
        const ws = wb.addWorksheet("Sheet1");
        const imgId1 = wb.addImage({
          filename: IMAGE_FILENAME,
          extension: "png"
        });
        const imgId2 = wb.addImage({
          filename: IMAGE_FILENAME,
          extension: "png"
        });
        ws.addImage(imgId1, "A1:A1");
        ws.addImage(imgId2, "A3:B4");

        // Insert 2 rows at row 2
        ws.spliceRows(2, 0, [], []);

        const images = ws.getImages();
        // First image at A1 should not move (nativeRow 0 < start-1 = 1)
        expect(images[0].range!.tl.nativeRow).toBe(0);
        // Second image at A3 should shift down by 2 (nativeRow 2 >= start-1 = 1)
        expect(images[1].range!.tl.nativeRow).toBe(4);
        expect(images[1].range!.br!.nativeRow).toBe(6);
      });

      it("does not update background images during splice", () => {
        const wb = new Workbook();
        const ws = wb.addWorksheet("Sheet1");
        const imgId = wb.addImage({
          filename: IMAGE_FILENAME,
          extension: "png"
        });
        ws.addBackgroundImage(imgId);

        // Should not throw
        ws.insertRow(1, []);

        // Background image should still exist
        expect(ws.getBackgroundImageId()).toBeDefined();
      });
    });
  });
});
