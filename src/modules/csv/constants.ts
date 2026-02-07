/**
 * CSV Module Constants
 *
 * Shared constants used across the CSV module.
 * Extracted to avoid circular dependencies between parse-core and utils/parse.
 */

/**
 * Pre-compiled regex for line splitting (matches CR, LF, or CRLF)
 */
export const DEFAULT_LINEBREAK_REGEX = /\r\n|\r|\n/;

/**
 * Shared TextEncoder instance for byte length calculations.
 * Avoids creating new instances in hot paths.
 */
const sharedTextEncoder = new TextEncoder();

/**
 * Reusable buffer for encodeInto() to avoid allocations.
 * Size 4 is enough for any single UTF-8 character (max 4 bytes).
 */
const singleCharBuffer = new Uint8Array(4);

/**
 * Reusable buffer for encodeInto() on multi-character non-ASCII strings.
 * Grows as needed; avoids per-call Uint8Array allocation from encode().
 */
let encodeBuffer = new Uint8Array(4096);

/**
 * Get UTF-8 byte length of a string efficiently.
 * Uses fast path for ASCII-only strings and encodeInto for mixed content.
 *
 * @param text - String to measure
 * @returns UTF-8 byte length
 */
export function getUtf8ByteLength(text: string): number {
  const len = text.length;
  if (len === 0) {
    return 0;
  }

  // Fast path for single character
  if (len === 1) {
    const code = text.charCodeAt(0);
    if (code < 128) {
      return 1;
    } // ASCII
    // Use encodeInto with reusable buffer to avoid allocation
    return sharedTextEncoder.encodeInto(text, singleCharBuffer).written!;
  }

  // For longer strings, check if all ASCII first (very common for CSV)
  let isAllAscii = true;
  for (let i = 0; i < len; i++) {
    if (text.charCodeAt(i) >= 128) {
      isAllAscii = false;
      break;
    }
  }

  if (isAllAscii) {
    return len; // ASCII: 1 byte per char
  }

  // Mixed content: must encode to get accurate byte count
  // Use encodeInto with a reusable buffer to avoid per-call allocation
  if (len * 3 > encodeBuffer.length) {
    encodeBuffer = new Uint8Array(len * 3);
  }
  return sharedTextEncoder.encodeInto(text, encodeBuffer).written!;
}
