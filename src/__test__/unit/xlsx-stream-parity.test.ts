/**
 * XLSX stream vs non-stream parity tests - Node.js
 */

import { beforeAll } from "vitest";
import { createXlsxStreamParityTests } from "../../modules/excel/utils/__test__/xlsx-stream-parity-tests";

let Workbook: any;
let PassThrough: any;

beforeAll(async () => {
  const excelModule = await import("../../index");
  Workbook = excelModule.Workbook;

  const streamModule = await import("../../modules/stream");
  PassThrough = streamModule.PassThrough;
});

createXlsxStreamParityTests(() => ({ Workbook, PassThrough }));
