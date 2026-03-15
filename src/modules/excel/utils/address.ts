/**
 * Cell address encoding/decoding utilities (0-indexed)
 *
 * These functions use 0-indexed coordinates (column A = 0, row 1 = 0),
 * matching the convention used by SheetJS and most spreadsheet APIs.
 *
 * @module
 */

import { colCache } from "@excel/utils/col-cache";

// =============================================================================
// Types
// =============================================================================

/**
 * Cell address object (0-indexed)
 */
export interface CellAddress {
  /** 0-indexed column number */
  c: number;
  /** 0-indexed row number */
  r: number;
}

/**
 * Range object with start and end addresses (0-indexed)
 */
export interface SheetRange {
  /** Start cell (top-left) */
  s: CellAddress;
  /** End cell (bottom-right) */
  e: CellAddress;
}

/** Origin can be cell address string, cell object, row number, or -1 to append */
export type Origin = string | CellAddress | number;

// =============================================================================
// Column Encoding/Decoding
// =============================================================================

/**
 * Decode column string to 0-indexed number
 * @example decodeCol("A") // => 0
 * @example decodeCol("Z") // => 25
 * @example decodeCol("AA") // => 26
 */
export function decodeCol(colstr: string): number {
  return colCache.l2n(colstr.toUpperCase()) - 1;
}

/**
 * Encode 0-indexed column number to string
 * @example encodeCol(0) // => "A"
 * @example encodeCol(25) // => "Z"
 * @example encodeCol(26) // => "AA"
 */
export function encodeCol(col: number): string {
  return colCache.n2l(col + 1);
}

// =============================================================================
// Row Encoding/Decoding
// =============================================================================

/**
 * Decode row string to 0-indexed number
 * @example decodeRow("1") // => 0
 * @example decodeRow("10") // => 9
 */
export function decodeRow(rowstr: string): number {
  return parseInt(rowstr, 10) - 1;
}

/**
 * Encode 0-indexed row number to string
 * @example encodeRow(0) // => "1"
 * @example encodeRow(9) // => "10"
 */
export function encodeRow(row: number): string {
  return String(row + 1);
}

// =============================================================================
// Cell Address Encoding/Decoding
// =============================================================================

/**
 * Decode cell address string to CellAddress object (0-indexed)
 * @example decodeCell("A1") // => { c: 0, r: 0 }
 * @example decodeCell("B2") // => { c: 1, r: 1 }
 */
export function decodeCell(cstr: string): CellAddress {
  const addr = colCache.decodeAddress(cstr.toUpperCase());
  return { c: addr.col - 1, r: addr.row - 1 };
}

/**
 * Encode CellAddress object (0-indexed) to cell address string
 * @example encodeCell({ c: 0, r: 0 }) // => "A1"
 * @example encodeCell({ c: 1, r: 1 }) // => "B2"
 */
export function encodeCell(cell: CellAddress): string {
  return colCache.encodeAddress(cell.r + 1, cell.c + 1);
}

// =============================================================================
// Range Encoding/Decoding
// =============================================================================

/**
 * Decode range string to SheetRange object (0-indexed)
 * @example decodeRange("A1:B2") // => { s: { c: 0, r: 0 }, e: { c: 1, r: 1 } }
 */
export function decodeRange(range: string): SheetRange {
  const idx = range.indexOf(":");
  if (idx === -1) {
    const cell = decodeCell(range);
    return { s: cell, e: { ...cell } };
  }
  return {
    s: decodeCell(range.slice(0, idx)),
    e: decodeCell(range.slice(idx + 1))
  };
}

/**
 * Encode SheetRange object (0-indexed) to range string
 */
export function encodeRange(range: SheetRange): string;
export function encodeRange(start: CellAddress, end: CellAddress): string;
export function encodeRange(startOrRange: CellAddress | SheetRange, end?: CellAddress): string {
  if (end === undefined) {
    const range = startOrRange as SheetRange;
    return encodeRange(range.s, range.e);
  }
  const start = startOrRange as CellAddress;
  const startStr = encodeCell(start);
  const endStr = encodeCell(end);
  return startStr === endStr ? startStr : `${startStr}:${endStr}`;
}
