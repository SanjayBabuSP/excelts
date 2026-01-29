/**
 * CSV Detection Utilities
 *
 * Functions for detecting CSV characteristics like delimiter and line endings.
 */

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Escape special regex characters
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Common CSV delimiters to try during auto-detection
 * Order matters - comma is most common, then semicolon (European), tab, pipe
 */
const AUTO_DETECT_DELIMITERS = [",", ";", "\t", "|"] as const;

/**
 * Default delimiter when auto-detection fails
 */
const DEFAULT_DELIMITER = ",";

/**
 * Characters that trigger formula escaping (CSV injection prevention).
 * Per OWASP recommendations, these characters at the start of a field
 * could be interpreted as formulas by spreadsheet applications.
 *
 * @see https://owasp.org/www-community/attacks/CSV_Injection
 */
const FORMULA_ESCAPE_CHARS = new Set([
  "=", // Equals - formula prefix
  "+", // Plus - formula prefix
  "-", // Minus - formula prefix
  "@", // At - formula prefix
  "\t", // Tab (0x09)
  "\r", // Carriage return (0x0D)
  "\n", // Line feed (0x0A)
  "\uFF1D", // ＝ (full-width equals)
  "\uFF0B", // ＋ (full-width plus)
  "\uFF0D", // － (full-width minus)
  "\uFF20" // ＠ (full-width at)
]);

// =============================================================================
// BOM and Formula Detection
// =============================================================================

/**
 * Strip UTF-8 BOM (Byte Order Mark) from start of string if present.
 * Excel exports UTF-8 CSV files with BOM (\ufeff).
 *
 * @param input - String to process
 * @returns String without BOM
 */
export function stripBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

/**
 * Check if a string starts with a formula escape character.
 * Used for CSV injection prevention.
 */
export function startsWithFormulaChar(str: string): boolean {
  return str.length > 0 && FORMULA_ESCAPE_CHARS.has(str[0]);
}

// =============================================================================
// Line Break Detection
// =============================================================================

/**
 * Detect the line terminator used in a string.
 * Uses fast detection without quote handling since the result is only
 * informational for meta - the parser handles all line ending types.
 *
 * @param input - String to analyze
 * @returns Detected line terminator or '\n' as default
 *
 * @example
 * detectLinebreak('a,b\r\nc,d') // '\r\n'
 * detectLinebreak('a,b\nc,d') // '\n'
 * detectLinebreak('a,b\rc,d') // '\r'
 * detectLinebreak('a,b,c') // '\n' (default)
 */
export function detectLinebreak(input: string): string {
  // Fast path: find first newline character
  const crIndex = input.indexOf("\r");
  const lfIndex = input.indexOf("\n");

  // No newline found
  if (crIndex === -1 && lfIndex === -1) {
    return "\n";
  }

  // Only LF found
  if (crIndex === -1) {
    return "\n";
  }

  // Only CR found, or CR comes before LF (could be CRLF or standalone CR)
  if (lfIndex === -1 || crIndex < lfIndex) {
    // Check if CRLF
    return input[crIndex + 1] === "\n" ? "\r\n" : "\r";
  }

  // LF comes before CR
  return "\n";
}

// =============================================================================
// Delimiter Detection
// =============================================================================

/**
 * Auto-detect the delimiter used in a CSV string
 *
 * Algorithm:
 * 1. Sample the first few lines (up to 10) for analysis
 * 2. For each candidate delimiter:
 *    - Count occurrences per line (respecting quotes)
 *    - Check consistency: all lines should have the same count
 *    - Higher count = more fields = better delimiter candidate
 * 3. Choose the delimiter with highest consistent field count
 *
 * @param input - CSV string to analyze
 * @param quote - Quote character (default: '"')
 * @param delimitersToGuess - Custom list of delimiters to try (default: [",", ";", "\t", "|"])
 * @returns Detected delimiter or first delimiter in list
 *
 * @example
 * detectDelimiter('a,b,c\n1,2,3') // ','
 * detectDelimiter('a;b;c\n1;2;3') // ';'
 * detectDelimiter('a\tb\tc\n1\t2\t3') // '\t'
 * detectDelimiter('a:b:c\n1:2:3', '"', [':']) // ':'
 */
export function detectDelimiter(
  input: string,
  quote: string = '"',
  delimitersToGuess?: string[],
  comment?: string,
  skipEmptyLines?: boolean | "greedy"
): string {
  const delimiters = delimitersToGuess ?? AUTO_DETECT_DELIMITERS;
  const defaultDelimiter = delimiters[0] ?? DEFAULT_DELIMITER;

  // Get sample lines (first 10 meaningful lines)
  const lines = getSampleLines(input, 10, quote, comment, skipEmptyLines);

  if (lines.length === 0) {
    return defaultDelimiter;
  }

  let bestDelimiter = defaultDelimiter;
  let bestDelta: number | undefined;
  let bestAvgFieldCount: number | undefined;

  for (const delimiter of delimiters) {
    const { avgFieldCount, delta } = scoreDelimiter(lines, delimiter, quote);

    // Require at least ~2 fields on average, similar to PapaParse
    if (avgFieldCount <= 1.99) {
      continue;
    }

    if (
      bestDelta === undefined ||
      delta < bestDelta ||
      (delta === bestDelta &&
        (bestAvgFieldCount === undefined || avgFieldCount > bestAvgFieldCount))
    ) {
      bestDelta = delta;
      bestAvgFieldCount = avgFieldCount;
      bestDelimiter = delimiter;
    }
  }

  return bestDelimiter;
}

/**
 * Get sample lines from input, skipping empty lines
 */
function getSampleLines(
  input: string,
  maxLines: number,
  quote: string,
  comment?: string,
  skipEmptyLines?: boolean | "greedy"
): string[] {
  const lines: string[] = [];
  let start = 0;
  let inQuotes = false;
  const len = input.length;

  for (let i = 0; i < len && lines.length < maxLines; i++) {
    const char = input[i];

    if (quote && char === quote) {
      // Toggle quote state, but handle escaped quotes ("" inside quoted field)
      if (inQuotes && input[i + 1] === quote) {
        i++; // Skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && (char === "\n" || char === "\r")) {
      const line = input.slice(start, i);

      // Skip comment lines
      if (comment && line.startsWith(comment)) {
        // skip
      } else {
        // For delimiter detection, whitespace-only lines are never useful.
        const trimmed = line.trim();
        const shouldDrop = line.length === 0 || (skipEmptyLines && trimmed === "");
        if (!shouldDrop && trimmed !== "") {
          lines.push(line);
        }
      }

      // Skip \r\n
      if (char === "\r" && input[i + 1] === "\n") {
        i++;
      }
      start = i + 1;
    }
  }

  // Add last line if exists
  if (start < len && lines.length < maxLines) {
    const line = input.slice(start);
    if (!comment || !line.startsWith(comment)) {
      const trimmed = line.trim();
      const shouldDrop = line.length === 0 || (skipEmptyLines && trimmed === "");
      if (!shouldDrop && trimmed !== "") {
        lines.push(line);
      }
    }
  }

  return lines;
}

/**
 * Score a delimiter candidate based on consistency and field count
 *
 * Returns 0 if:
 * - Delimiter not found in any line
 * - Field counts are inconsistent across lines
 *
 * Higher score = more fields per row with consistent counts
 */
function scoreDelimiter(
  lines: string[],
  delimiter: string,
  quote: string
): { avgFieldCount: number; delta: number } {
  if (lines.length === 0) {
    return { avgFieldCount: 0, delta: Number.POSITIVE_INFINITY };
  }

  let delta = 0;
  let avgFieldCount = 0;
  let prevFieldCount: number | undefined;

  for (const line of lines) {
    const fieldCount = countDelimiters(line, delimiter, quote) + 1;
    avgFieldCount += fieldCount;

    if (prevFieldCount === undefined) {
      prevFieldCount = fieldCount;
      continue;
    }

    // Like PapaParse, allow variability but prefer consistent counts
    delta += Math.abs(fieldCount - prevFieldCount);
    prevFieldCount = fieldCount;
  }

  avgFieldCount /= lines.length;

  return { avgFieldCount, delta };
}

/**
 * Count delimiters in a line, respecting quoted fields
 */
function countDelimiters(line: string, delimiter: string, quote: string): number {
  let count = 0;
  let inQuotes = false;
  const len = line.length;
  const delimLen = delimiter.length;

  for (let i = 0; i < len; i++) {
    if (quote && line[i] === quote) {
      // Toggle quote state, but handle escaped quotes ("" inside quoted field)
      if (inQuotes && line[i + 1] === quote) {
        i++; // Skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes) {
      // Check for delimiter match (supports multi-char delimiters)
      if (delimLen === 1) {
        if (line[i] === delimiter) {
          count++;
        }
      } else if (line.slice(i, i + delimLen) === delimiter) {
        count++;
        i += delimLen - 1;
      }
    }
  }

  return count;
}
