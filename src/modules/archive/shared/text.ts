/**
 * Archive-specific text utilities.
 *
 * This module provides text encoding/decoding for ZIP archives:
 * - CP437 (IBM Code Page 437) for legacy DOS-era ZIP files
 * - Unified ZIP string decoding with extra field support
 *
 * For common UTF-8 utilities, import from @stream/shared.
 *
 * @module
 */

import { crc32 } from "@archive/compression/crc32";
import { uint8ArrayToString as decodeUtf8 } from "@stream/shared";
import type { ZipExtraFields } from "@archive/zip-spec/zip-extra-fields";

// =============================================================================
// CP437 Decoding
// =============================================================================

/**
 * CP437 to Unicode mapping table for high bytes (0x80-0xFF).
 *
 * CP437 is the original IBM PC character set used in DOS-era ZIP files.
 * Characters 0x00-0x7F are identical to ASCII; 0x80-0xFF map to various
 * symbols, box-drawing characters, and accented letters.
 *
 * Source: https://en.wikipedia.org/wiki/Code_page_437
 */
// prettier-ignore
const CP437_HIGH_CHARS: string =
  "\u00C7\u00FC\u00E9\u00E2\u00E4\u00E0\u00E5\u00E7" + // 80-87: Ç ü é â ä à å ç
  "\u00EA\u00EB\u00E8\u00EF\u00EE\u00EC\u00C4\u00C5" + // 88-8F: ê ë è ï î ì Ä Å
  "\u00C9\u00E6\u00C6\u00F4\u00F6\u00F2\u00FB\u00F9" + // 90-97: É æ Æ ô ö ò û ù
  "\u00FF\u00D6\u00DC\u00A2\u00A3\u00A5\u20A7\u0192" + // 98-9F: ÿ Ö Ü ¢ £ ¥ ₧ ƒ
  "\u00E1\u00ED\u00F3\u00FA\u00F1\u00D1\u00AA\u00BA" + // A0-A7: á í ó ú ñ Ñ ª º
  "\u00BF\u2310\u00AC\u00BD\u00BC\u00A1\u00AB\u00BB" + // A8-AF: ¿ ⌐ ¬ ½ ¼ ¡ « »
  "\u2591\u2592\u2593\u2502\u2524\u2561\u2562\u2556" + // B0-B7: ░ ▒ ▓ │ ┤ ╡ ╢ ╖
  "\u2555\u2563\u2551\u2557\u255D\u255C\u255B\u2510" + // B8-BF: ╕ ╣ ║ ╗ ╝ ╜ ╛ ┐
  "\u2514\u2534\u252C\u251C\u2500\u253C\u255E\u255F" + // C0-C7: └ ┴ ┬ ├ ─ ┼ ╞ ╟
  "\u255A\u2554\u2569\u2566\u2560\u2550\u256C\u2567" + // C8-CF: ╚ ╔ ╩ ╦ ╠ ═ ╬ ╧
  "\u2568\u2564\u2565\u2559\u2558\u2552\u2553\u256B" + // D0-D7: ╨ ╤ ╥ ╙ ╘ ╒ ╓ ╫
  "\u256A\u2518\u250C\u2588\u2584\u258C\u2590\u2580" + // D8-DF: ╪ ┘ ┌ █ ▄ ▌ ▐ ▀
  "\u03B1\u00DF\u0393\u03C0\u03A3\u03C3\u00B5\u03C4" + // E0-E7: α ß Γ π Σ σ µ τ
  "\u03A6\u0398\u03A9\u03B4\u221E\u03C6\u03B5\u2229" + // E8-EF: Φ Θ Ω δ ∞ φ ε ∩
  "\u2261\u00B1\u2265\u2264\u2320\u2321\u00F7\u2248" + // F0-F7: ≡ ± ≥ ≤ ⌠ ⌡ ÷ ≈
  "\u00B0\u2219\u00B7\u221A\u207F\u00B2\u25A0\u00A0"; // F8-FF: ° ∙ · √ ⁿ ² ■

/**
 * Decode a Uint8Array as CP437 (IBM Code Page 437).
 *
 * This is the correct encoding for ZIP file names/comments when the UTF-8
 * flag (bit 11) is not set, per PKWARE APPNOTE.
 *
 * @param bytes - The bytes to decode
 * @returns The decoded string
 */
export function decodeCp437(bytes: Uint8Array): string {
  // Fast path: check if all bytes are ASCII (0x00-0x7F)
  let hasHighByte = false;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i]! >= 0x80) {
      hasHighByte = true;
      break;
    }
  }

  if (!hasHighByte) {
    // All ASCII - use fast String.fromCharCode with chunking
    return decodeAsciiChunked(bytes);
  }

  // Has high bytes - decode character by character
  const chars: string[] = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i]!;
    if (byte < 0x80) {
      chars[i] = String.fromCharCode(byte);
    } else {
      chars[i] = CP437_HIGH_CHARS[byte - 0x80]!;
    }
  }
  return chars.join("");
}

/**
 * Decode ASCII bytes using chunked String.fromCharCode for performance.
 */
function decodeAsciiChunked(bytes: Uint8Array): string {
  let out = "";
  const chunkSize = 0x8000; // 32KB chunks to avoid call stack overflow
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    out += String.fromCharCode(...chunk);
  }
  return out;
}

// =============================================================================
// Unified ZIP String Decoding
// =============================================================================

/** Bit 11 of ZIP general purpose flags indicates UTF-8 encoding. */
const FLAG_UTF8 = 0x0800;

/**
 * Decode a ZIP entry string (file name or comment) with proper encoding.
 *
 * Order of preference:
 * 1. If UTF-8 flag (bit 11) is set, decode as UTF-8
 * 2. If Unicode Extra Field is present and CRC32 matches original bytes, use it
 * 3. Otherwise, decode as CP437 (IBM Code Page 437)
 *
 * @param bytes - Raw bytes from the ZIP entry
 * @param flags - General purpose bit flags (or null)
 * @param unicodeInfo - Parsed Unicode Extra Field info (unicodePath or unicodeComment)
 * @returns Decoded string
 */
export function decodeZipString(
  bytes: Uint8Array,
  flags: number | null,
  unicodeInfo?: { version: number; originalCrc32: number; unicodeValue: string }
): string {
  if (bytes.length === 0) {
    return "";
  }

  // Check UTF-8 flag first
  if ((flags ?? 0) & FLAG_UTF8) {
    return decodeUtf8(bytes);
  }

  // Check Unicode Extra Field (0x7075 or 0x6375)
  if (unicodeInfo && unicodeInfo.version === 1 && unicodeInfo.originalCrc32 === crc32(bytes)) {
    return unicodeInfo.unicodeValue;
  }

  // Fall back to CP437
  return decodeCp437(bytes);
}

/**
 * Decode a ZIP entry path with full extra field support.
 *
 * Convenience wrapper around `decodeZipString` for file paths.
 *
 * @param pathBytes - Raw path bytes from the ZIP entry
 * @param flags - General purpose bit flags (or null)
 * @param extraFields - Parsed extra fields (may contain unicodePath)
 * @returns Decoded path string
 */
export function decodeZipPath(
  pathBytes: Uint8Array,
  flags: number | null,
  extraFields?: ZipExtraFields
): string {
  return decodeZipString(pathBytes, flags, extraFields?.unicodePath);
}

/**
 * Decode a ZIP entry comment with full extra field support.
 *
 * Convenience wrapper around `decodeZipString` for comments.
 *
 * @param commentBytes - Raw comment bytes from the ZIP entry
 * @param flags - General purpose bit flags (or null)
 * @param extraFields - Parsed extra fields (may contain unicodeComment)
 * @returns Decoded comment string
 */
export function decodeZipComment(
  commentBytes: Uint8Array,
  flags: number | null,
  extraFields?: ZipExtraFields
): string {
  return decodeZipString(commentBytes, flags, extraFields?.unicodeComment);
}

// =============================================================================
// Other Utilities
// =============================================================================

/**
 * Convert a Uint8Array to an ArrayBuffer suitable for Web Crypto API.
 * This handles views that may be backed by SharedArrayBuffer or ArrayBuffer with non-zero offset.
 */
export function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  // Only return directly if it's exactly an ArrayBuffer (not SharedArrayBuffer or other)
  // with no offset and covering the full buffer.
  if (
    data.byteOffset === 0 &&
    data.byteLength === data.buffer.byteLength &&
    data.buffer.constructor === ArrayBuffer
  ) {
    return data.buffer;
  }
  // Otherwise, create a copy to get a clean ArrayBuffer
  return data.slice().buffer as ArrayBuffer;
}
