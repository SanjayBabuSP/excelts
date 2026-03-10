/**
 * Base utility functions shared between Node.js and Browser
 * All functions use standard Web APIs that work in both environments
 * (Node.js 16+ supports atob/btoa/TextEncoder/TextDecoder globally)
 */

import { isNode } from "@utils/env";

// =============================================================================
// Base64 utilities (with native Buffer optimization for Node.js)
// =============================================================================

/**
 * Convert base64 string to Uint8Array
 * Uses native Buffer in Node.js for better performance
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  // Node.js: use native Buffer (fast, C++ implementation)
  if (isNode()) {
    return Buffer.from(base64, "base64");
  }
  // Browser: use atob
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// =============================================================================
// Basic utilities
// =============================================================================

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// Date utilities
// =============================================================================

export function dateToExcel(d: Date, date1904?: boolean): number {
  return 25569 + d.getTime() / (24 * 3600 * 1000) - (date1904 ? 1462 : 0);
}

export function excelToDate(v: number, date1904?: boolean): Date {
  const millisecondSinceEpoch = Math.round((v - 25569 + (date1904 ? 1462 : 0)) * 24 * 3600 * 1000);
  return new Date(millisecondSinceEpoch);
}

/**
 * Parse an OOXML date string into a Date object.
 * OOXML dates like "2024-01-15T00:00:00" lack a timezone suffix,
 * which some JS engines parse as local time. Appending "Z" forces UTC.
 */
export function parseOoxmlDate(raw: string): Date {
  return new Date(raw.endsWith("Z") ? raw : raw + "Z");
}

// =============================================================================
// XML utilities
// =============================================================================

const xmlDecodingMap: Record<string, string> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'"
};

export function xmlDecode(text: string): string {
  if (text.indexOf("&") === -1) {
    return text;
  }
  return text.replace(/&(#\d+|#x[0-9A-Fa-f]+|\w+);/g, (match: string, entity: string) => {
    if (entity[0] === "#") {
      // Numeric character reference
      const code = entity[1] === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1));
      if (Number.isNaN(code)) {
        return match;
      }
      return String.fromCodePoint(code);
    }
    return xmlDecodingMap[entity] || match;
  });
}
// oxlint-disable-next-line no-control-regex -- Control characters are intentionally matched for XML encoding
const xmlEncodeRegex = /[<>&'"\x7F\x00-\x08\x0B-\x0C\x0E-\x1F]/;

/**
 * Encode special characters for XML output
 * Handles XML entities (< > & " ') and removes invalid control characters
 */
export function xmlEncode(text: string): string {
  const regexResult = xmlEncodeRegex.exec(text);
  if (!regexResult) {
    return text;
  }

  const parts: string[] = [];
  let lastIndex = 0;
  for (let i = regexResult.index; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    let escape: string;
    switch (charCode) {
      case 34: // "
        escape = "&quot;";
        break;
      case 38: // &
        escape = "&amp;";
        break;
      case 39: // '
        escape = "&apos;";
        break;
      case 60: // <
        escape = "&lt;";
        break;
      case 62: // >
        escape = "&gt;";
        break;
      case 127:
        escape = "";
        break;
      default: {
        if (charCode <= 31 && (charCode <= 8 || (charCode >= 11 && charCode !== 13))) {
          // Remove invalid control characters
          escape = "";
          break;
        }
        continue;
      }
    }

    if (lastIndex !== i) {
      parts.push(text.substring(lastIndex, i));
    }
    lastIndex = i + 1;
    if (escape) {
      parts.push(escape);
    }
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.join("");
}
// =============================================================================
// Parsing utilities
// =============================================================================

export function validInt(value: string | number): number {
  const i = typeof value === "number" ? value : parseInt(value, 10);
  return Number.isNaN(i) ? 0 : i;
}

/**
 * Split an Excel numFmt string by semicolons, respecting quoted strings and brackets.
 *
 * Excel numFmt can have up to 4 sections: `positive ; negative ; zero ; text`.
 * Semicolons inside `"..."` (literal text) or `[...]` (locale/color tags) must NOT
 * be treated as section separators.
 */
export function splitFormatSections(fmt: string): string[] {
  const sections: string[] = [];
  let current = "";
  let inQuote = false;
  let inBracket = false;

  for (let i = 0; i < fmt.length; i++) {
    const char = fmt[i];

    if (char === '"' && !inBracket) {
      inQuote = !inQuote;
      current += char;
    } else if (char === "[" && !inQuote) {
      inBracket = true;
      current += char;
    } else if (char === "]" && !inQuote) {
      inBracket = false;
      current += char;
    } else if (char === ";" && !inQuote && !inBracket) {
      sections.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  sections.push(current);
  return sections;
}

/** Reusable regex — no capture groups, so safe for `test()`. */
const DATE_FMT_RE = /[ymdhMsb]/;

/** Strips bracket expressions `[...]` and quoted literals `"..."` from a format string. */
const STRIP_BRACKETS_QUOTES_RE = /\[[^\]]*\]|"[^"]*"/g;

export function isDateFmt(fmt: string | null | undefined): boolean {
  if (!fmt) {
    return false;
  }
  // Only the first section (used for positive numbers / dates) determines
  // whether the format represents a date.  The "@" text placeholder may
  // legitimately appear in later sections as a text fallback (e.g. "mm/dd/yyyy;@").
  const firstSection = splitFormatSections(fmt)[0];

  // Strip bracket expressions [...] (locale/color tags) and quoted literals "..."
  // before any further checks so that characters inside them are ignored.
  const clean = firstSection.replace(STRIP_BRACKETS_QUOTES_RE, "");

  // "@" in the cleaned section means it's a text format, not a date format.
  if (clean.indexOf("@") > -1) {
    return false;
  }
  return DATE_FMT_RE.test(clean);
}

export function parseBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

// =============================================================================
// Collection utilities
// =============================================================================

export function* range(start: number, stop: number, step: number = 1): Generator<number> {
  const compareOrder = step > 0 ? (a: number, b: number) => a < b : (a: number, b: number) => a > b;
  for (let value = start; compareOrder(value, stop); value += step) {
    yield value;
  }
}

export function toSortedArray<T>(values: Iterable<T>): T[] {
  const result = Array.from(values);
  if (result.length <= 1) {
    return result;
  }
  // All numbers → numeric sort
  if (result.every(item => Number.isFinite(item))) {
    return result.sort((a, b) => (a as number) - (b as number));
  }
  // All Dates → chronological sort
  if (result.every(item => item instanceof Date)) {
    return result.sort((a, b) => (a as Date).getTime() - (b as Date).getTime());
  }
  // Mixed types → type-aware sort: numbers first (numerically), then dates (chronologically), then strings (lexicographic)
  return result.sort((a, b) => {
    const ta = sortTypeRank(a);
    const tb = sortTypeRank(b);
    if (ta !== tb) {
      return ta - tb;
    }
    // Same type group
    if (ta === 0) {
      return (a as number) - (b as number);
    }
    if (ta === 1) {
      return (a as Date).getTime() - (b as Date).getTime();
    }
    return String(a).localeCompare(String(b));
  });
}

/** Rank for mixed-type sort: numbers=0, dates=1, everything else=2 */
function sortTypeRank(v: unknown): number {
  if (Number.isFinite(v)) {
    return 0;
  }
  if (v instanceof Date) {
    return 1;
  }
  return 2;
}

// =============================================================================
// Buffer utilities (cross-platform)
// =============================================================================

const textDecoder = new TextDecoder("utf-8");

let latin1Decoder: TextDecoder | undefined;
try {
  // Faster base64 encoding path in browsers: decode bytes into a binary string once.
  // Some environments may not support this encoding.
  latin1Decoder = new TextDecoder("latin1");
} catch {
  latin1Decoder = undefined;
}

/**
 * Convert a Buffer, ArrayBuffer, or Uint8Array to a UTF-8 string
 * Works in both Node.js and browser environments
 */
export function bufferToString(chunk: ArrayBuffer | Uint8Array | string): string {
  if (typeof chunk === "string") {
    return chunk;
  }
  return textDecoder.decode(chunk);
}

/**
 * Convert Uint8Array to base64 string
 * Uses native Buffer in Node.js, optimized chunked conversion in browser
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (isNode()) {
    return Buffer.from(bytes).toString("base64");
  }

  // Browser: fastest path when latin1 TextDecoder exists.
  // Some environments can still throw on `btoa(...)` (e.g. if decoding yields non-Latin1 chars),
  // so fall back to a guaranteed-binary string conversion.
  if (latin1Decoder) {
    try {
      return btoa(latin1Decoder.decode(bytes));
    } catch {
      // fall through
    }
  }

  // Browser: chunked String.fromCharCode.apply to avoid stack overflow and reduce string concatenation
  const CHUNK_SIZE = 0x8000; // 32KB chunks
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE) as any));
  }
  return btoa(chunks.join(""));
}

/**
 * Convert string to UTF-16LE Uint8Array (used for Excel password hashing)
 */
export function stringToUtf16Le(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    bytes[i * 2] = code & 0xff;
    bytes[i * 2 + 1] = (code >> 8) & 0xff;
  }
  return bytes;
}
