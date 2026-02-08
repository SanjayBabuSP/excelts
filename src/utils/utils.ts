/**
 * Node.js utility functions
 * Re-exports shared utilities and adds Node.js-specific implementations
 */

import fs from "fs";

// Re-export all shared utilities
export {
  delay,
  dateToExcel,
  excelToDate,
  parseOoxmlDate,
  xmlDecode,
  xmlEncode,
  validInt,
  isDateFmt,
  parseBoolean,
  range,
  toSortedArray,
  bufferToString,
  base64ToUint8Array,
  uint8ArrayToBase64,
  stringToUtf16Le
} from "@utils/utils.base";

// =============================================================================
// File system utilities (Node.js only)
// =============================================================================

export async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.promises.access(path, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
