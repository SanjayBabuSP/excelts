/**
 * CSV Detection Utilities
 *
 * Auto-detection of CSV characteristics:
 * - Delimiter detection (comma, tab, semicolon, pipe, etc.)
 * - Line ending detection (LF, CRLF, CR)
 * - Quote character normalization
 *
 * This module is part of the csv/utils subsystem:
 * - detect.ts: Auto-detection of CSV format
 * - row.ts: Row format conversions (RowHashArray, headers)
 * - parse.ts: Shared parsing helpers (header processing, column validation)
 * - dynamic-typing.ts: Type coercion (string -> number/boolean/date)
 * - number.ts: Number parsing utilities
 * - formatted-value.ts: FormattedValue wrapper for format control
 * - generate.ts: Test data generation
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

/**
 * Normalize quote option to { enabled, char } form.
 * Centralizes the quote/false/null handling logic.
 */
export function normalizeQuoteOption(option: string | false | null | undefined): {
  enabled: boolean;
  char: string;
} {
  if (option === false || option === null) {
    return { enabled: false, char: "" };
  }
  return { enabled: true, char: option ?? '"' };
}

/**
 * Normalize escape option to { enabled, char } form.
 * Consistent with normalizeQuoteOption API design.
 *
 * @param escapeOption - User's escape option (string, false, null, or undefined)
 * @param quoteChar - The quote character (used as default when escape is undefined)
 * @returns { enabled: boolean, char: string }
 *   - enabled=false, char="" when explicitly disabled (false/null)
 *   - enabled=true, char=quoteChar when undefined (default behavior)
 *   - enabled=true, char=escapeOption when string provided
 */
export function normalizeEscapeOption(
  escapeOption: string | false | null | undefined,
  quoteChar: string
): { enabled: boolean; char: string } {
  if (escapeOption === false || escapeOption === null) {
    return { enabled: false, char: "" };
  }
  return { enabled: true, char: escapeOption ?? quoteChar };
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
 * Uses quote-aware detection to avoid detecting newlines inside quoted fields.
 *
 * @param input - String to analyze
 * @param quote - Quote character (default: '"')
 * @returns Detected line terminator or '\n' as default
 *
 * @example
 * detectLinebreak('a,b\r\nc,d') // '\r\n'
 * detectLinebreak('a,b\nc,d') // '\n'
 * detectLinebreak('a,b\rc,d') // '\r'
 * detectLinebreak('a,b,c') // '\n' (default)
 * detectLinebreak('"a\nb",c\r\nd') // '\r\n' (ignores newline in quotes)
 */
export function detectLinebreak(input: string, quote = '"'): string {
  let inQuote = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    // Handle quote toggle (including escaped quotes "")
    if (char === quote) {
      // Check for escaped quote (two consecutive quotes)
      if (inQuote && input[i + 1] === quote) {
        i++; // Skip the escaped quote
        continue;
      }
      inQuote = !inQuote;
      continue;
    }

    // Skip characters inside quotes
    if (inQuote) {
      continue;
    }

    // Detect line ending outside of quotes
    if (char === "\r") {
      return input[i + 1] === "\n" ? "\r\n" : "\r";
    }
    if (char === "\n") {
      return "\n";
    }
  }

  // No line ending found outside quotes, default to \n
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
 * Tie-breaking rules (in priority order):
 * 1. Lowest delta (variance) wins - more consistent field counts across lines
 * 2. On delta tie, highest avgFieldCount wins - more fields per row
 * 3. On complete tie, array order wins - first delimiter in delimitersToGuess
 *    (default order: comma, semicolon, tab, pipe)
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

    // Require at least ~2 fields on average
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

    // Allow variability but prefer consistent counts
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
