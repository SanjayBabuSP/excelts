/**
 * CSV Module Constants
 *
 * Shared constants used across the CSV module.
 * Extracted to avoid circular dependencies between parse-core and utils/parse.
 */

/**
 * Threshold for switching to array-based field building.
 * Avoids O(n²) string concat overhead for large fields.
 */
export const LARGE_FIELD_THRESHOLD = 1024;

/**
 * Pre-compiled regex for line splitting (matches CR, LF, or CRLF)
 */
export const DEFAULT_LINEBREAK_REGEX = /\r\n|\r|\n/;

/**
 * Shared TextEncoder instance for byte length calculations.
 * Avoids creating new instances in hot paths.
 */
export const sharedTextEncoder = new TextEncoder();
