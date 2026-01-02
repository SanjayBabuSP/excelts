/**
 * Browser utility functions
 * Re-exports shared utilities and adds browser-specific implementations
 */

// Re-export all shared utilities
export {
  delay,
  nop,
  inherits,
  dateToExcel,
  excelToDate,
  toIsoDateString,
  parsePath,
  getRelsPath,
  xmlDecode,
  xmlEncode,
  validInt,
  isDateFmt,
  parseBoolean,
  range,
  toSortedArray,
  objectFromProps,
  bufferToString,
  base64ToUint8Array,
  uint8ArrayToBase64,
  stringToUtf16Le
} from "@utils/utils.base";

// =============================================================================
// File system utilities (Browser stub - always returns false)
// =============================================================================

export function fileExists(_path: string): Promise<boolean> {
  return Promise.resolve(false);
}
