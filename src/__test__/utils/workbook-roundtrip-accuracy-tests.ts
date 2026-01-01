/**
 * WorkbookWriter/WorkbookReader Accuracy Tests - Shared
 *
 * These tests validate correctness (not performance) by writing a small XLSX
 * workbook via the streaming WorkbookWriter, then reading it back via the
 * streaming WorkbookReader.
 *
 * Designed to run in both Node.js and Browser test environments.
 */

import { describe, it, expect, beforeAll } from "vitest";

interface WorksheetWriterHandle {
  addRow: (data: (string | number)[]) => { commit: () => void };
  commit: () => Promise<void> | void;
}

interface WorkbookWriterHandle {
  addWorksheet: (name: string) => WorksheetWriterHandle;
  commit: () => Promise<void>;
}

interface AccuracyTestContext {
  isBrowser: boolean;

  createWorkbookWriter: (
    options: { useSharedStrings: boolean; useStyles: boolean; trueStreaming: boolean },
    onData: (chunk: Uint8Array) => void
  ) => Promise<WorkbookWriterHandle>;

  createWorkbookReader: (
    data: Uint8Array,
    onRow: (sheetName: string, rowNumber: number, values: unknown[]) => void
  ) => Promise<void>;
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 0) {
    return new Uint8Array(0);
  }
  if (chunks.length === 1) {
    return chunks[0];
  }
  let total = 0;
  for (let i = 0; i < chunks.length; i++) {
    total += chunks[i].length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function normalizeRowValues(values: unknown[]): unknown[] {
  // row.values is 1-based: index 0 is usually empty.
  if (values.length > 0 && (values[0] === null || values[0] === undefined)) {
    return values.slice(1);
  }
  return values;
}

export function createWorkbookRoundtripAccuracyTests(getContext: () => AccuracyTestContext) {
  describe("WorkbookWriter/WorkbookReader Accuracy (Roundtrip)", () => {
    let ctx: AccuracyTestContext;

    beforeAll(() => {
      ctx = getContext();
    });

    async function writeThenRead(options: {
      useSharedStrings: boolean;
      useStyles: boolean;
      trueStreaming: boolean;
    }) {
      const chunks: Uint8Array[] = [];

      const workbook = await ctx.createWorkbookWriter(options, chunk => {
        if (chunk.length > 0) {
          chunks.push(chunk);
        }
      });

      // Sheet 1
      const ws1 = workbook.addWorksheet("Sheet1");
      ws1.addRow(["hello", 42, 3.5]).commit();
      ws1.addRow(["world", -7, 0]).commit();
      await ws1.commit();

      // Sheet 2
      const ws2 = workbook.addWorksheet("Second");
      ws2.addRow(["x", 1]).commit();
      ws2.addRow(["y", 2]).commit();
      await ws2.commit();

      await workbook.commit();

      const data = concatChunks(chunks);
      expect(data.length).toBeGreaterThan(0);

      const bySheetRow = new Map<string, Map<number, unknown[]>>();

      await ctx.createWorkbookReader(data, (sheetName, rowNumber, values) => {
        let rows = bySheetRow.get(sheetName);
        if (!rows) {
          rows = new Map();
          bySheetRow.set(sheetName, rows);
        }
        rows.set(rowNumber, normalizeRowValues(values));
      });

      return bySheetRow;
    }

    it("roundtrips basic values (sharedStrings: true)", async () => {
      const bySheetRow = await writeThenRead({
        useSharedStrings: true,
        useStyles: false,
        trueStreaming: true
      });

      const sheet1 = bySheetRow.get("Sheet1");
      const second = bySheetRow.get("Second");

      expect(sheet1).toBeTruthy();
      expect(second).toBeTruthy();

      expect(sheet1!.get(1)).toEqual(["hello", 42, 3.5]);
      expect(sheet1!.get(2)).toEqual(["world", -7, 0]);

      expect(second!.get(1)).toEqual(["x", 1]);
      expect(second!.get(2)).toEqual(["y", 2]);
    });

    it("roundtrips basic values (sharedStrings: false)", async () => {
      const bySheetRow = await writeThenRead({
        useSharedStrings: false,
        useStyles: false,
        trueStreaming: true
      });

      const sheet1 = bySheetRow.get("Sheet1");
      const second = bySheetRow.get("Second");

      expect(sheet1).toBeTruthy();
      expect(second).toBeTruthy();

      expect(sheet1!.get(1)).toEqual(["hello", 42, 3.5]);
      expect(sheet1!.get(2)).toEqual(["world", -7, 0]);

      expect(second!.get(1)).toEqual(["x", 1]);
      expect(second!.get(2)).toEqual(["y", 2]);
    });
  });
}
