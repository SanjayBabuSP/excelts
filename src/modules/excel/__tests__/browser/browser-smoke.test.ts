import { describe, it, expect } from "vitest";

declare const ExcelTS: {
  Workbook: any;
};

describe("ExcelTS Browser Tests", () => {
  it("should read and write xlsx via binary buffer", async () => {
    const { Workbook } = ExcelTS;
    const wb = new Workbook();
    const ws = wb.addWorksheet("blort");

    ws.getCell("A1").value = "Hello, World!";
    ws.getCell("A2").value = 7;

    const buffer = await wb.xlsx.writeBuffer();

    const wb2 = new Workbook();
    await wb2.xlsx.load(buffer);

    const ws2 = wb2.getWorksheet("blort");
    expect(ws2).toBeTruthy();
    expect(ws2!.getCell("A1").value).toEqual("Hello, World!");
    expect(ws2!.getCell("A2").value).toEqual(7);
  });

  it("should read and write xlsx via base64 buffer", async () => {
    const { Workbook } = ExcelTS;
    const options = {
      base64: true
    };
    const wb = new Workbook();
    const ws = wb.addWorksheet("blort");

    ws.getCell("A1").value = "Hello, World!";
    ws.getCell("A2").value = 7;

    const buffer = await wb.xlsx.writeBuffer(options);

    // Convert Uint8Array to base64 string
    const base64String = btoa(String.fromCharCode(...buffer));

    const wb2 = new Workbook();
    await wb2.xlsx.load(base64String, options);

    const ws2 = wb2.getWorksheet("blort");
    expect(ws2).toBeTruthy();
    expect(ws2!.getCell("A1").value).toEqual("Hello, World!");
    expect(ws2!.getCell("A2").value).toEqual(7);
  });

  // CSV support is now available in browser using native RFC 4180 implementation
  it("should write csv via buffer (browser)", async () => {
    const { Workbook } = ExcelTS;
    const wb = new Workbook();
    const ws = wb.addWorksheet("blort");

    ws.getCell("A1").value = "Hello, World!";
    ws.getCell("B1").value = "What time is it?";
    ws.getCell("A2").value = 7;
    ws.getCell("B2").value = "12pm";

    const buffer = await wb.csv.writeBuffer();

    // In browser, buffer is Uint8Array; use TextDecoder to convert to string
    const content = new TextDecoder().decode(buffer);
    // Uses \n as row delimiter, includeEndRowDelimiter defaults to false
    expect(content).toEqual('"Hello, World!",What time is it?\n7,12pm');
  });

  // Test crypto polyfill - worksheet protection uses crypto.randomBytes and crypto.createHash
  it("should support worksheet protection with password (crypto polyfill)", async () => {
    const { Workbook } = ExcelTS;
    const wb = new Workbook();
    const ws = wb.addWorksheet("protected");

    ws.getCell("A1").value = "Protected Data";

    // This uses crypto.randomBytes() and crypto.createHash() internally
    // Use low spinCount for faster test execution (default is 100000 which is slow)
    await ws.protect("password123", { sheet: true, spinCount: 1000 });

    expect(ws.sheetProtection).toBeTruthy();
    expect(ws.sheetProtection.sheet).toBe(true);
    expect(ws.sheetProtection.algorithmName).toBe("SHA-512");
    expect(ws.sheetProtection.saltValue).toBeTruthy();
    expect(ws.sheetProtection.hashValue).toBeTruthy();
    expect(ws.sheetProtection.spinCount).toBe(1000);

    // Verify we can write and read back the protected workbook
    const buffer = await wb.xlsx.writeBuffer();
    const wb2 = new Workbook();
    await wb2.xlsx.load(buffer);

    const ws2 = wb2.getWorksheet("protected");
    expect(ws2).toBeTruthy();
    expect(ws2!.sheetProtection).toBeTruthy();
    expect(ws2!.sheetProtection.sheet).toBe(true);
  });

  // =========================================================================
  // CSV Browser Tests
  // =========================================================================

  describe("CSV Operations", () => {
    it("should load CSV from string", async () => {
      const { Workbook } = ExcelTS;
      const wb = new Workbook();
      const csvContent = "Name,Age,City\nAlice,30,New York\nBob,25,Los Angeles";

      const ws = wb.csv.load(csvContent);

      expect(ws.getCell("A1").value).toBe("Name");
      expect(ws.getCell("B1").value).toBe("Age");
      expect(ws.getCell("C1").value).toBe("City");
      expect(ws.getCell("A2").value).toBe("Alice");
      // CSV numbers are auto-converted to numbers by the worksheet
      expect(ws.getCell("B2").value).toBe(30);
      expect(ws.getCell("C2").value).toBe("New York");
      expect(ws.getCell("A3").value).toBe("Bob");
    });

    it("should load CSV from ArrayBuffer", async () => {
      const { Workbook } = ExcelTS;
      const wb = new Workbook();
      const csvContent = "Col1,Col2\nA,B\nC,D";
      const buffer = new TextEncoder().encode(csvContent);

      const ws = wb.csv.load(buffer);

      expect(ws.getCell("A1").value).toBe("Col1");
      expect(ws.getCell("B2").value).toBe("B");
    });

    it("should handle quoted fields with commas", async () => {
      const { Workbook } = ExcelTS;
      const wb = new Workbook();
      const csvContent = 'Name,Address\n"Smith, John","123 Main St, Apt 4"';

      const ws = wb.csv.load(csvContent);

      expect(ws.getCell("A2").value).toBe("Smith, John");
      expect(ws.getCell("B2").value).toBe("123 Main St, Apt 4");
    });

    it("should handle quoted fields with newlines", async () => {
      const { Workbook } = ExcelTS;
      const wb = new Workbook();
      const csvContent = 'Description\n"Line 1\nLine 2\nLine 3"';

      const ws = wb.csv.load(csvContent);

      expect(ws.getCell("A2").value).toBe("Line 1\nLine 2\nLine 3");
    });

    it("should handle escaped quotes", async () => {
      const { Workbook } = ExcelTS;
      const wb = new Workbook();
      const csvContent = 'Quote\n"He said ""Hello"""';

      const ws = wb.csv.load(csvContent);

      expect(ws.getCell("A2").value).toBe('He said "Hello"');
    });

    it("should write CSV with proper quoting", async () => {
      const { Workbook } = ExcelTS;
      const wb = new Workbook();
      const ws = wb.addWorksheet("test");

      ws.getCell("A1").value = "Name";
      ws.getCell("B1").value = "Quote";
      ws.getCell("A2").value = "Smith, John";
      ws.getCell("B2").value = 'He said "Hi"';

      const content = wb.csv.writeString();

      expect(content).toContain('"Smith, John"');
      expect(content).toContain('"He said ""Hi"""');
    });

    it("should write CSV to buffer", async () => {
      const { Workbook } = ExcelTS;
      const wb = new Workbook();
      const ws = wb.addWorksheet("test");

      ws.getCell("A1").value = "Test";
      ws.getCell("B1").value = "Data";

      const buffer = await wb.csv.writeBuffer();

      expect(buffer).toBeInstanceOf(Uint8Array);
      const content = new TextDecoder().decode(buffer);
      expect(content).toBe("Test,Data");
    });

    it("should support tab delimiters", async () => {
      const { Workbook } = ExcelTS;
      const wb = new Workbook();
      const ws = wb.addWorksheet("tab");

      ws.getCell("A1").value = "Col1";
      ws.getCell("B1").value = "Col2";
      ws.getCell("A2").value = "A";
      ws.getCell("B2").value = "B";

      // Write with tab delimiter - use formatterOptions
      const output = wb.csv.writeString({
        sheetName: ws.name,
        formatterOptions: { delimiter: "\t" }
      });
      expect(output).toBe("Col1\tCol2\nA\tB");
    });

    it("should round-trip CSV data", async () => {
      const { Workbook } = ExcelTS;
      const wb = new Workbook();
      const originalCsv = 'Name,Value\nTest,123\n"Quoted, Value",456';

      const ws = wb.csv.load(originalCsv);
      const outputCsv = wb.csv.writeString({ sheetName: ws.name });

      // Load the output back and verify
      const wb2 = new Workbook();
      const ws2 = wb2.csv.load(outputCsv);

      expect(ws2.getCell("A1").value).toBe("Name");
      expect(ws2.getCell("B1").value).toBe("Value");
      expect(ws2.getCell("A2").value).toBe("Test");
      // Numbers are auto-converted
      expect(ws2.getCell("B2").value).toBe(123);
      expect(ws2.getCell("A3").value).toBe("Quoted, Value");
      expect(ws2.getCell("B3").value).toBe(456);
    });
  });

  // =========================================================================
  // XLSX/ZIP Browser Tests
  // =========================================================================

  describe("XLSX/ZIP Operations", () => {
    it("should handle multiple worksheets", async () => {
      const { Workbook } = ExcelTS;
      const wb = new Workbook();

      const ws1 = wb.addWorksheet("Sheet1");
      ws1.getCell("A1").value = "Sheet 1 Data";

      const ws2 = wb.addWorksheet("Sheet2");
      ws2.getCell("A1").value = "Sheet 2 Data";

      const ws3 = wb.addWorksheet("Sheet3");
      ws3.getCell("A1").value = "Sheet 3 Data";

      const buffer = await wb.xlsx.writeBuffer();
      const wb2 = new Workbook();
      await wb2.xlsx.load(buffer);

      expect(wb2.worksheets.length).toBe(3);
      expect(wb2.getWorksheet("Sheet1")!.getCell("A1").value).toBe("Sheet 1 Data");
      expect(wb2.getWorksheet("Sheet2")!.getCell("A1").value).toBe("Sheet 2 Data");
      expect(wb2.getWorksheet("Sheet3")!.getCell("A1").value).toBe("Sheet 3 Data");
    });

    it("should preserve cell styles", async () => {
      const { Workbook } = ExcelTS;
      const wb = new Workbook();
      const ws = wb.addWorksheet("styled");

      ws.getCell("A1").value = "Bold";
      ws.getCell("A1").font = { bold: true };

      ws.getCell("B1").value = "Red";
      ws.getCell("B1").font = { color: { argb: "FFFF0000" } };

      ws.getCell("C1").value = "Big";
      ws.getCell("C1").font = { size: 20 };

      const buffer = await wb.xlsx.writeBuffer();
      const wb2 = new Workbook();
      await wb2.xlsx.load(buffer);

      const ws2 = wb2.getWorksheet("styled")!;
      expect(ws2.getCell("A1").font?.bold).toBe(true);
      expect(ws2.getCell("B1").font?.color?.argb).toBe("FFFF0000");
      expect(ws2.getCell("C1").font?.size).toBe(20);
    });

    it("should preserve cell number formats", async () => {
      const { Workbook } = ExcelTS;
      const wb = new Workbook();
      const ws = wb.addWorksheet("formats");

      ws.getCell("A1").value = 1234.5678;
      ws.getCell("A1").numFmt = "#,##0.00";

      ws.getCell("B1").value = 0.75;
      ws.getCell("B1").numFmt = "0%";

      ws.getCell("C1").value = new Date(2024, 11, 25);
      ws.getCell("C1").numFmt = "yyyy-mm-dd";

      const buffer = await wb.xlsx.writeBuffer();
      const wb2 = new Workbook();
      await wb2.xlsx.load(buffer);

      const ws2 = wb2.getWorksheet("formats")!;
      expect(ws2.getCell("A1").numFmt).toBe("#,##0.00");
      expect(ws2.getCell("B1").numFmt).toBe("0%");
      expect(ws2.getCell("C1").numFmt).toBe("yyyy-mm-dd");
    });

    it("should preserve merged cells", async () => {
      const { Workbook } = ExcelTS;
      const wb = new Workbook();
      const ws = wb.addWorksheet("merged");

      ws.getCell("A1").value = "Merged Header";
      ws.mergeCells("A1:D1");

      ws.getCell("A2").value = "Another Merge";
      ws.mergeCells("A2:B3");

      const buffer = await wb.xlsx.writeBuffer();
      const wb2 = new Workbook();
      await wb2.xlsx.load(buffer);

      const ws2 = wb2.getWorksheet("merged")!;
      // Check that merge info is preserved
      expect(ws2.getCell("A1").value).toBe("Merged Header");
      expect(ws2.getCell("A2").value).toBe("Another Merge");
      // B1, C1, D1 should be merge slaves
      expect(ws2.getCell("B1").isMerged).toBe(true);
      expect(ws2.getCell("C1").isMerged).toBe(true);
    });

    it("should preserve formulas", async () => {
      const { Workbook } = ExcelTS;
      const wb = new Workbook();
      const ws = wb.addWorksheet("formulas");

      ws.getCell("A1").value = 10;
      ws.getCell("A2").value = 20;
      ws.getCell("A3").value = { formula: "SUM(A1:A2)", result: 30 };
      ws.getCell("B1").value = { formula: "A1*2", result: 20 };

      const buffer = await wb.xlsx.writeBuffer();
      const wb2 = new Workbook();
      await wb2.xlsx.load(buffer);

      const ws2 = wb2.getWorksheet("formulas")!;
      expect(ws2.getCell("A3").formula).toBe("SUM(A1:A2)");
      expect(ws2.getCell("A3").result).toBe(30);
      expect(ws2.getCell("B1").formula).toBe("A1*2");
    });

    it("should handle large data sets", async () => {
      const { Workbook } = ExcelTS;
      const wb = new Workbook();
      const ws = wb.addWorksheet("large");

      // Create 1000 rows x 10 columns
      const rows = 1000;
      const cols = 10;
      for (let r = 1; r <= rows; r++) {
        for (let c = 1; c <= cols; c++) {
          ws.getCell(r, c).value = `R${r}C${c}`;
        }
      }

      const buffer = await wb.xlsx.writeBuffer();
      const wb2 = new Workbook();
      await wb2.xlsx.load(buffer);

      const ws2 = wb2.getWorksheet("large")!;
      expect(ws2.getCell(1, 1).value).toBe("R1C1");
      expect(ws2.getCell(500, 5).value).toBe("R500C5");
      expect(ws2.getCell(1000, 10).value).toBe("R1000C10");
    });

    it("should preserve hyperlinks", async () => {
      const { Workbook } = ExcelTS;
      const wb = new Workbook();
      const ws = wb.addWorksheet("links");

      ws.getCell("A1").value = {
        text: "Google",
        hyperlink: "https://www.google.com"
      };
      ws.getCell("A2").value = {
        text: "Email",
        hyperlink: "mailto:test@example.com"
      };

      const buffer = await wb.xlsx.writeBuffer();
      const wb2 = new Workbook();
      await wb2.xlsx.load(buffer);

      const ws2 = wb2.getWorksheet("links")!;
      expect(ws2.getCell("A1").text).toBe("Google");
      expect(ws2.getCell("A1").hyperlink).toBe("https://www.google.com");
      expect(ws2.getCell("A2").hyperlink).toBe("mailto:test@example.com");
    });

    it("should preserve column widths and row heights", async () => {
      const { Workbook } = ExcelTS;
      const wb = new Workbook();
      const ws = wb.addWorksheet("dimensions");

      ws.getColumn("A").width = 25;
      ws.getColumn("B").width = 50;
      ws.getRow(1).height = 30;
      ws.getRow(2).height = 40;

      ws.getCell("A1").value = "Wide column";
      ws.getCell("B1").value = "Wider column";

      const buffer = await wb.xlsx.writeBuffer();
      const wb2 = new Workbook();
      await wb2.xlsx.load(buffer);

      const ws2 = wb2.getWorksheet("dimensions")!;
      expect(ws2.getColumn("A").width).toBe(25);
      expect(ws2.getColumn("B").width).toBe(50);
      expect(ws2.getRow(1).height).toBe(30);
      expect(ws2.getRow(2).height).toBe(40);
    });

    it("should preserve data validation", async () => {
      const { Workbook } = ExcelTS;
      const wb = new Workbook();
      const ws = wb.addWorksheet("validation");

      ws.getCell("A1").value = "Yes";
      ws.getCell("A1").dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ['"Yes,No,Maybe"']
      };

      const buffer = await wb.xlsx.writeBuffer();
      const wb2 = new Workbook();
      await wb2.xlsx.load(buffer);

      const ws2 = wb2.getWorksheet("validation")!;
      expect(ws2.getCell("A1").dataValidation).toBeTruthy();
      expect(ws2.getCell("A1").dataValidation?.type).toBe("list");
    });

    it("should handle workbook with defined names", async () => {
      const { Workbook } = ExcelTS;
      const wb = new Workbook();
      const ws = wb.addWorksheet("names");

      ws.getCell("A1").value = 100;
      ws.getCell("A1").name = "MyValue";

      ws.getCell("B1").value = { formula: "MyValue * 2", result: 200 };

      const buffer = await wb.xlsx.writeBuffer();
      const wb2 = new Workbook();
      await wb2.xlsx.load(buffer);

      // Check that the value and formula are preserved
      const ws2 = wb2.getWorksheet("names")!;
      expect(ws2.getCell("A1").value).toBe(100);
      expect(ws2.getCell("B1").formula).toBe("MyValue * 2");
      expect(ws2.getCell("B1").result).toBe(200);
    });
  });

  // =========================================================================
  // DEFLATE Fallback Tests (simulating old browsers without CompressionStream)
  // =========================================================================
  describe("DEFLATE Fallback (simulating old browsers)", () => {
    it("should work when CompressionStream is disabled", async () => {
      // Save original APIs
      const originalCompressionStream = globalThis.CompressionStream;
      const originalDecompressionStream = globalThis.DecompressionStream;

      // Disable native compression APIs to simulate old browsers
      globalThis.CompressionStream = undefined as any;
      globalThis.DecompressionStream = undefined as any;

      try {
        const { Workbook } = ExcelTS;
        const wb = new Workbook();
        const ws = wb.addWorksheet("fallback-test");

        // Add various data types
        ws.getCell("A1").value = "Hello, World!";
        ws.getCell("A2").value = 12345;
        ws.getCell("A3").value = new Date("2024-01-01");
        ws.getCell("A4").value = { formula: "A2*2", result: 24690 };

        // Write using JS fallback compression
        const buffer = await wb.xlsx.writeBuffer();
        expect(buffer).toBeTruthy();
        expect(buffer.byteLength).toBeGreaterThan(0);

        // Read using JS fallback decompression
        const wb2 = new Workbook();
        await wb2.xlsx.load(buffer);

        const ws2 = wb2.getWorksheet("fallback-test");
        expect(ws2).toBeTruthy();
        expect(ws2!.getCell("A1").value).toBe("Hello, World!");
        expect(ws2!.getCell("A2").value).toBe(12345);
        expect(ws2!.getCell("A4").formula).toBe("A2*2");
      } finally {
        // Restore original APIs
        globalThis.CompressionStream = originalCompressionStream;
        globalThis.DecompressionStream = originalDecompressionStream;
      }
    });

    it("should handle large workbook with fallback compression", async () => {
      const originalCompressionStream = globalThis.CompressionStream;
      const originalDecompressionStream = globalThis.DecompressionStream;

      globalThis.CompressionStream = undefined as any;
      globalThis.DecompressionStream = undefined as any;

      try {
        const { Workbook } = ExcelTS;
        const wb = new Workbook();
        const ws = wb.addWorksheet("large-data");

        // Create a larger dataset (500 rows)
        for (let i = 1; i <= 500; i++) {
          ws.getCell(`A${i}`).value = `Row ${i}`;
          ws.getCell(`B${i}`).value = i * 100;
          ws.getCell(`C${i}`).value = `Data ${i} with some repeated text`.repeat(3);
        }

        const buffer = await wb.xlsx.writeBuffer();
        expect(buffer.byteLength).toBeGreaterThan(0);

        const wb2 = new Workbook();
        await wb2.xlsx.load(buffer);

        const ws2 = wb2.getWorksheet("large-data")!;
        expect(ws2.getCell("A1").value).toBe("Row 1");
        expect(ws2.getCell("B500").value).toBe(50000);
        expect(ws2.getCell("A500").value).toBe("Row 500");
      } finally {
        globalThis.CompressionStream = originalCompressionStream;
        globalThis.DecompressionStream = originalDecompressionStream;
      }
    });

    it("should handle styles and formatting with fallback", async () => {
      const originalCompressionStream = globalThis.CompressionStream;
      const originalDecompressionStream = globalThis.DecompressionStream;

      globalThis.CompressionStream = undefined as any;
      globalThis.DecompressionStream = undefined as any;

      try {
        const { Workbook } = ExcelTS;
        const wb = new Workbook();
        const ws = wb.addWorksheet("styled");

        ws.getCell("A1").value = "Bold Text";
        ws.getCell("A1").font = { bold: true, size: 14 };
        ws.getCell("A1").fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFF0000" }
        };

        ws.getCell("B1").value = 1234.56;
        ws.getCell("B1").numFmt = "$#,##0.00";

        const buffer = await wb.xlsx.writeBuffer();

        const wb2 = new Workbook();
        await wb2.xlsx.load(buffer);

        const ws2 = wb2.getWorksheet("styled")!;
        expect(ws2.getCell("A1").font?.bold).toBe(true);
        expect(ws2.getCell("B1").numFmt).toBe("$#,##0.00");
      } finally {
        globalThis.CompressionStream = originalCompressionStream;
        globalThis.DecompressionStream = originalDecompressionStream;
      }
    });

    it("should read file created with native compression using fallback decompression", async () => {
      const { Workbook } = ExcelTS;

      // First, create a file with native compression (if available)
      const wb = new Workbook();
      const ws = wb.addWorksheet("native-created");
      ws.getCell("A1").value = "Created with native compression";
      ws.getCell("A2").value = 42;

      const buffer = await wb.xlsx.writeBuffer();

      // Now disable native APIs and try to read
      const originalCompressionStream = globalThis.CompressionStream;
      const originalDecompressionStream = globalThis.DecompressionStream;

      globalThis.CompressionStream = undefined as any;
      globalThis.DecompressionStream = undefined as any;

      try {
        const wb2 = new Workbook();
        await wb2.xlsx.load(buffer);

        const ws2 = wb2.getWorksheet("native-created")!;
        expect(ws2.getCell("A1").value).toBe("Created with native compression");
        expect(ws2.getCell("A2").value).toBe(42);
      } finally {
        globalThis.CompressionStream = originalCompressionStream;
        globalThis.DecompressionStream = originalDecompressionStream;
      }
    });

    it("should create file with fallback that native compression can read", async () => {
      const { Workbook } = ExcelTS;

      // Disable native APIs
      const originalCompressionStream = globalThis.CompressionStream;
      const originalDecompressionStream = globalThis.DecompressionStream;

      globalThis.CompressionStream = undefined as any;
      globalThis.DecompressionStream = undefined as any;

      let buffer: ArrayBuffer;
      try {
        const wb = new Workbook();
        const ws = wb.addWorksheet("fallback-created");
        ws.getCell("A1").value = "Created with JS fallback";
        ws.getCell("A2").value = 123;

        buffer = await wb.xlsx.writeBuffer();
      } finally {
        // Restore native APIs
        globalThis.CompressionStream = originalCompressionStream;
        globalThis.DecompressionStream = originalDecompressionStream;
      }

      // Now read with native compression restored
      const wb2 = new Workbook();
      await wb2.xlsx.load(buffer);

      const ws2 = wb2.getWorksheet("fallback-created")!;
      expect(ws2.getCell("A1").value).toBe("Created with JS fallback");
      expect(ws2.getCell("A2").value).toBe(123);
    });

    // Regression test: loading files with drawings via loadFromFiles path
    // Previously, _processDrawingEntry would fail because it tried to collect
    // data from an already-consumed text stream instead of using the provided rawData
    it("should load files with embedded images via buffer (loadFromFiles path)", async () => {
      const { Workbook } = ExcelTS;

      // Create a workbook with an embedded image
      const wb = new Workbook();
      const ws = wb.addWorksheet("with-image");
      ws.getCell("A1").value = "Image Test";

      // Add a simple 1x1 PNG image (smallest valid PNG)
      // This is a 1x1 red pixel PNG
      const pngData = new Uint8Array([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a, // PNG signature
        0x00,
        0x00,
        0x00,
        0x0d,
        0x49,
        0x48,
        0x44,
        0x52, // IHDR chunk length + type
        0x00,
        0x00,
        0x00,
        0x01,
        0x00,
        0x00,
        0x00,
        0x01, // 1x1 dimensions
        0x08,
        0x02,
        0x00,
        0x00,
        0x00,
        0x90,
        0x77,
        0x53, // bit depth, color type, etc
        0xde,
        0x00,
        0x00,
        0x00,
        0x0c,
        0x49,
        0x44,
        0x41, // IDAT chunk
        0x54,
        0x08,
        0xd7,
        0x63,
        0xf8,
        0xcf,
        0xc0,
        0x00, // compressed data
        0x00,
        0x00,
        0x03,
        0x00,
        0x01,
        0x00,
        0x05,
        0xfe, //
        0xd4,
        0xef,
        0x00,
        0x00,
        0x00,
        0x00,
        0x49,
        0x45, // IEND chunk
        0x4e,
        0x44,
        0xae,
        0x42,
        0x60,
        0x82
      ]);

      const imageId = wb.addImage({
        buffer: pngData,
        extension: "png"
      });
      ws.addImage(imageId, "B2:D6");

      // Write to buffer
      const buffer = await wb.xlsx.writeBuffer();

      // Load via xlsx.load() which uses loadFromFiles internally
      const wb2 = new Workbook();
      await wb2.xlsx.load(buffer);

      // Verify data
      const ws2 = wb2.getWorksheet("with-image");
      expect(ws2).toBeTruthy();
      expect(ws2!.getCell("A1").value).toBe("Image Test");

      // Verify image was loaded
      const images = ws2!.getImages();
      expect(images.length).toBe(1);
      expect(images[0].range.tl.col).toBe(1); // B column = 1
      expect(images[0].range.tl.row).toBe(1); // Row 2 = 1 (0-indexed)
    });
  });
});
