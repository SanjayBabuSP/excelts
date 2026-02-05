/**
 * CSV Field Scanning Functions
 *
 * High-performance field scanning using indexOf-based batch operations.
 * This replaces character-by-character parsing with bulk string operations.
 *
 * Key optimizations:
 * 1. Use indexOf to find delimiter/quote/newline positions in bulk
 * 2. Use slice to extract field values (avoids char-by-char concatenation)
 * 3. Minimize function call overhead by inlining hot paths
 */

import type { ScannerConfig, FieldScanResult, RowScanResult } from "./types";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Find the next newline position and determine its type.
 *
 * @returns [position, length] where length is 1 for \n/\r, 2 for \r\n, or [-1, 0] if not found
 */
function findNewline(input: string, start: number): [number, number] {
  const len = input.length;
  let pos = start;

  while (pos < len) {
    const char = input[pos];
    if (char === "\n") {
      return [pos, 1];
    }
    if (char === "\r") {
      // Check for CRLF
      if (pos + 1 < len) {
        return input[pos + 1] === "\n" ? [pos, 2] : [pos, 1];
      }
      // CR at end of buffer - might be CRLF, need more data
      return [pos, -1]; // -1 signals "maybe CRLF"
    }
    pos++;
  }

  return [-1, 0];
}

/**
 * Check if position is at a delimiter (supports multi-character delimiters).
 */
function isAtDelimiter(input: string, pos: number, delimiter: string): boolean {
  if (delimiter.length === 1) {
    return input[pos] === delimiter;
  }
  return input.slice(pos, pos + delimiter.length) === delimiter;
}

/**
 * Find the next delimiter position (supports multi-character delimiters).
 */
function findDelimiter(input: string, start: number, delimiter: string): number {
  if (delimiter.length === 1) {
    return input.indexOf(delimiter, start);
  }
  return input.indexOf(delimiter, start);
}

// =============================================================================
// Quoted Field Scanning
// =============================================================================

/**
 * Scan a quoted field starting at the opening quote.
 *
 * Handles:
 * - Escaped quotes (RFC 4180: "" -> ")
 * - Backslash escapes when escape !== quote
 * - CRLF normalization inside quoted fields (CRLF -> LF)
 * - relaxQuotes mode (allow unescaped quotes mid-field)
 *
 * @param input - Input string
 * @param start - Position of opening quote
 * @param config - Scanner configuration
 * @param isEof - Whether this is the end of input
 * @returns Field scan result
 */
export function scanQuotedField(
  input: string,
  start: number,
  config: ScannerConfig,
  isEof: boolean
): FieldScanResult {
  const { quote, escape, delimiter, relaxQuotes } = config;
  const len = input.length;

  // Skip opening quote
  let pos = start + 1;
  let value = "";
  let segmentStart = pos;

  while (pos < len) {
    const char = input[pos];

    // Check for escape sequence
    if (escape && char === escape) {
      // Look ahead for escaped quote
      if (pos + 1 < len && input[pos + 1] === quote) {
        // Escaped quote: add segment up to escape, then add the quote char
        value += input.slice(segmentStart, pos) + quote;
        pos += 2; // Skip escape + quote
        segmentStart = pos;
        continue;
      }

      // If escape === quote, this might be the closing quote
      if (escape === quote) {
        // Check what follows
        if (pos + 1 >= len) {
          // At buffer boundary - need more data
          if (!isEof) {
            return {
              value: value + input.slice(segmentStart, pos),
              quoted: true,
              endPos: pos,
              needMore: true,
              resumePos: start // Resume from the opening quote
            };
          }
          // At EOF with quote at end - treat as closing quote
          value += input.slice(segmentStart, pos);
          return {
            value,
            quoted: true,
            endPos: pos + 1, // After closing quote
            needMore: false
          };
        }

        const nextChar = input[pos + 1];

        // Check if this is a closing quote (followed by delimiter, newline, or EOF)
        if (
          nextChar === delimiter[0] ||
          nextChar === "\n" ||
          nextChar === "\r" ||
          (delimiter.length > 1 && isAtDelimiter(input, pos + 1, delimiter))
        ) {
          // Closing quote - add segment and return
          value += input.slice(segmentStart, pos);
          return {
            value,
            quoted: true,
            endPos: pos + 1, // Position after the closing quote
            needMore: false
          };
        }

        // relaxQuotes: treat mid-field quote as literal
        if (relaxQuotes) {
          pos++;
          continue;
        }

        // Strict mode: this is a closing quote, anything after is an error
        // but we'll let the caller handle malformed data
        value += input.slice(segmentStart, pos);
        return {
          value,
          quoted: true,
          endPos: pos + 1,
          needMore: false
        };
      }
    }

    // Check for closing quote (when escape !== quote)
    if (char === quote && escape !== quote) {
      // Look ahead
      if (pos + 1 >= len) {
        if (!isEof) {
          return {
            value: value + input.slice(segmentStart, pos),
            quoted: true,
            endPos: pos,
            needMore: true,
            resumePos: start
          };
        }
        // EOF: closing quote
        value += input.slice(segmentStart, pos);
        return {
          value,
          quoted: true,
          endPos: pos + 1,
          needMore: false
        };
      }

      const nextChar = input[pos + 1];
      if (
        nextChar === delimiter[0] ||
        nextChar === "\n" ||
        nextChar === "\r" ||
        (delimiter.length > 1 && isAtDelimiter(input, pos + 1, delimiter))
      ) {
        value += input.slice(segmentStart, pos);
        return {
          value,
          quoted: true,
          endPos: pos + 1,
          needMore: false
        };
      }

      // relaxQuotes: continue
      if (relaxQuotes) {
        pos++;
        continue;
      }

      // Closing quote with trailing garbage
      value += input.slice(segmentStart, pos);
      return {
        value,
        quoted: true,
        endPos: pos + 1,
        needMore: false
      };
    }

    // Handle CRLF inside quoted field (normalize to LF)
    if (char === "\r") {
      if (pos + 1 < len) {
        if (input[pos + 1] === "\n") {
          // CRLF -> LF
          value += input.slice(segmentStart, pos) + "\n";
          pos += 2;
          segmentStart = pos;
          continue;
        }
        // Standalone CR -> LF
        value += input.slice(segmentStart, pos) + "\n";
        pos++;
        segmentStart = pos;
        continue;
      }
      // CR at buffer end - need more data to determine CRLF
      if (!isEof) {
        return {
          value: value + input.slice(segmentStart, pos),
          quoted: true,
          endPos: pos,
          needMore: true,
          resumePos: start
        };
      }
      // EOF: treat as LF
      value += input.slice(segmentStart, pos) + "\n";
      pos++;
      segmentStart = pos;
      continue;
    }

    pos++;
  }

  // Reached end of input while inside quoted field
  if (!isEof) {
    return {
      value: value + input.slice(segmentStart, pos),
      quoted: true,
      endPos: pos,
      needMore: true,
      resumePos: start
    };
  }

  // EOF with unterminated quote - return what we have
  value += input.slice(segmentStart, pos);
  return {
    value,
    quoted: true,
    endPos: pos,
    needMore: false,
    unterminated: true // Mark as unterminated quote
  };
}

// =============================================================================
// Unquoted Field Scanning
// =============================================================================

/**
 * Scan an unquoted field using indexOf for batch searching.
 *
 * This is the performance-critical path for most CSV files.
 * Uses indexOf to find the next delimiter or newline in O(n) time
 * with optimized native string search.
 *
 * @param input - Input string
 * @param start - Starting position
 * @param config - Scanner configuration
 * @param isEof - Whether this is the end of input
 * @returns Field scan result
 */
export function scanUnquotedField(
  input: string,
  start: number,
  config: ScannerConfig,
  isEof: boolean
): FieldScanResult {
  const { delimiter } = config;
  const len = input.length;

  // Find next delimiter
  const delimPos = findDelimiter(input, start, delimiter);

  // Find next newline
  const [newlinePos, newlineLen] = findNewline(input, start);

  // Determine which comes first
  let endPos: number;
  let atNewline = false;

  if (delimPos === -1 && newlinePos === -1) {
    // Neither found - field extends to end of input
    if (!isEof) {
      return {
        value: input.slice(start),
        quoted: false,
        endPos: len,
        needMore: true,
        resumePos: start
      };
    }
    // EOF: field is rest of input
    return {
      value: input.slice(start),
      quoted: false,
      endPos: len,
      needMore: false
    };
  }

  if (delimPos === -1) {
    // Only newline found
    endPos = newlinePos;
    atNewline = true;
  } else if (newlinePos === -1) {
    // Only delimiter found
    endPos = delimPos;
  } else if (delimPos < newlinePos) {
    // Delimiter comes first
    endPos = delimPos;
  } else {
    // Newline comes first
    endPos = newlinePos;
    atNewline = true;
  }

  // Check for ambiguous CR at buffer boundary
  if (atNewline && newlineLen === -1 && !isEof) {
    // CR at end of buffer, might be CRLF
    return {
      value: input.slice(start, endPos),
      quoted: false,
      endPos,
      needMore: true,
      resumePos: start
    };
  }

  const value = input.slice(start, endPos);

  return {
    value,
    quoted: false,
    endPos,
    needMore: false
  };
}

// =============================================================================
// Row Scanning
// =============================================================================

/**
 * Scan a complete row from the input string.
 *
 * @param input - Input string
 * @param start - Starting position
 * @param config - Scanner configuration
 * @param isEof - Whether this is the end of input
 * @returns Row scan result
 */
export function scanRow(
  input: string,
  start: number,
  config: ScannerConfig,
  isEof: boolean
): RowScanResult {
  const { delimiter, quote, quoteEnabled } = config;
  const delimLen = delimiter.length;
  const len = input.length;

  const fields: string[] = [];
  const quoted: boolean[] = [];
  let pos = start;
  let hasUnterminatedQuote = false;

  while (pos < len) {
    const char = input[pos];

    // Check for quoted field
    if (quoteEnabled && char === quote) {
      const result = scanQuotedField(input, pos, config, isEof);

      if (result.needMore) {
        return {
          fields,
          quoted,
          endPos: pos,
          complete: false,
          needMore: true,
          resumePos: result.resumePos ?? start
        };
      }

      // Track unterminated quote
      if (result.unterminated) {
        hasUnterminatedQuote = true;
      }

      fields.push(result.value);
      quoted.push(true);
      pos = result.endPos;

      // After closing quote, expect delimiter or newline
      if (pos < len) {
        if (isAtDelimiter(input, pos, delimiter)) {
          pos += delimLen;
          // Check if delimiter is at end of input - need to add trailing empty field
          if (pos >= len && isEof) {
            fields.push("");
            quoted.push(false);
          }
          continue;
        }

        // Check for newline
        const nextChar = input[pos];
        if (nextChar === "\n") {
          return {
            fields,
            quoted,
            endPos: pos + 1,
            complete: true,
            needMore: false,
            newline: "\n"
          };
        }
        if (nextChar === "\r") {
          if (pos + 1 < len) {
            if (input[pos + 1] === "\n") {
              return {
                fields,
                quoted,
                endPos: pos + 2,
                complete: true,
                needMore: false,
                newline: "\r\n"
              };
            }
            return {
              fields,
              quoted,
              endPos: pos + 1,
              complete: true,
              needMore: false,
              newline: "\r"
            };
          }
          // CR at buffer end
          if (!isEof) {
            return {
              fields,
              quoted,
              endPos: pos,
              complete: false,
              needMore: true,
              resumePos: start
            };
          }
          return {
            fields,
            quoted,
            endPos: pos + 1,
            complete: true,
            needMore: false,
            newline: "\r"
          };
        }

        // Unexpected character after closing quote - skip it (lenient parsing)
        // This handles cases like: "value"garbage,next
        // We could also throw an error here for strict mode
        pos++;
        // Find next delimiter or newline
        while (pos < len) {
          if (isAtDelimiter(input, pos, delimiter)) {
            pos += delimLen;
            break;
          }
          if (input[pos] === "\n" || input[pos] === "\r") {
            break;
          }
          pos++;
        }
        continue;
      }

      // End of input after closing quote
      continue;
    }

    // Unquoted field
    const result = scanUnquotedField(input, pos, config, isEof);

    if (result.needMore) {
      // Save partial progress
      fields.push(result.value);
      quoted.push(false);
      return {
        fields,
        quoted,
        endPos: result.endPos,
        complete: false,
        needMore: true,
        resumePos: result.resumePos ?? start
      };
    }

    fields.push(result.value);
    quoted.push(false);
    pos = result.endPos;

    // Check what ended the field
    if (pos < len) {
      if (isAtDelimiter(input, pos, delimiter)) {
        pos += delimLen;
        // Check if delimiter is at end of input - need to add trailing empty field
        if (pos >= len && isEof) {
          fields.push("");
          quoted.push(false);
        }
        continue;
      }

      // Must be a newline
      const char = input[pos];
      if (char === "\n") {
        return {
          fields,
          quoted,
          endPos: pos + 1,
          complete: true,
          needMore: false,
          newline: "\n"
        };
      }
      if (char === "\r") {
        if (pos + 1 < len && input[pos + 1] === "\n") {
          return {
            fields,
            quoted,
            endPos: pos + 2,
            complete: true,
            needMore: false,
            newline: "\r\n"
          };
        }
        // Standalone CR or at buffer end handled in scanUnquotedField
        return {
          fields,
          quoted,
          endPos: pos + 1,
          complete: true,
          needMore: false,
          newline: "\r"
        };
      }
    }
  }

  // Reached end of input
  if (isEof) {
    // At EOF, if we have any fields, it's a complete row
    if (fields.length > 0 || pos > start) {
      return {
        fields,
        quoted,
        endPos: pos,
        complete: true,
        needMore: false,
        unterminatedQuote: hasUnterminatedQuote || undefined
      };
    }
  }

  // Not at EOF and no newline found
  return {
    fields,
    quoted,
    endPos: pos,
    complete: false,
    needMore: !isEof,
    resumePos: start,
    unterminatedQuote: hasUnterminatedQuote || undefined
  };
}
