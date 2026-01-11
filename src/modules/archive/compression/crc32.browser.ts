/**
 * CRC32 calculation utility for ZIP files (Browser version)
 *
 * Uses lookup table optimization - no Node.js dependencies
 *
 * The polynomial used is the standard CRC-32 IEEE 802.3:
 * x^32 + x^26 + x^23 + x^22 + x^16 + x^12 + x^11 + x^10 + x^8 + x^7 + x^5 + x^4 + x^2 + x + 1
 * Represented as 0xEDB88320 in reversed (LSB-first) form
 */

export { crc32JS as crc32, crc32UpdateJS as crc32Update, crc32Finalize } from "@archive/compression/crc32.base";

/**
 * Ensure CRC32 is ready (no-op in browser, for API compatibility)
 */
export async function ensureCrc32(): Promise<void> {
  // No-op in browser
}

/**
 * Calculate CRC32 incrementally (useful for streaming)
 * Call with initial crc of 0xffffffff, then finalize with crc32Finalize
 *
 * @param crc - Current CRC value (start with 0xffffffff)
 * @param data - Input data chunk
 * @returns Updated CRC value (not finalized)
 *
 * @example
 * ```ts
 * let crc = 0xffffffff;
 * crc = crc32Update(crc, chunk1);
 * crc = crc32Update(crc, chunk2);
 * const checksum = crc32Finalize(crc);
 * ```
 */
