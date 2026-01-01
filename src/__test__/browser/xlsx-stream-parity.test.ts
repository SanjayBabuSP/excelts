/**
 * XLSX stream vs non-stream parity tests - Browser
 */

import { beforeAll } from "vitest";
import { createXlsxStreamParityTests } from "../utils/xlsx-stream-parity-tests";

let Workbook: any;
let PassThrough: any;

beforeAll(async () => {
  const excelModule = await import("../../index.browser");
  Workbook = excelModule.Workbook;

  const streamModule = await import("../../modules/stream");
  PassThrough = streamModule.PassThrough;
});

createXlsxStreamParityTests(() => ({ Workbook, PassThrough }));
