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

export function nop(): void {}

export const inherits = function <
  T extends new (...args: any[]) => any,
  S extends new (...args: any[]) => any
>(cls: T, superCtor: S, statics?: any, prototype?: any): void {
  (cls as any).super_ = superCtor;

  if (!prototype) {
    prototype = statics;
    statics = null;
  }

  if (statics) {
    Object.keys(statics).forEach(i => {
      Object.defineProperty(cls, i, Object.getOwnPropertyDescriptor(statics, i)!);
    });
  }

  const properties: PropertyDescriptorMap = {
    constructor: {
      value: cls,
      enumerable: false,
      writable: false,
      configurable: true
    }
  };
  if (prototype) {
    Object.keys(prototype).forEach(i => {
      properties[i] = Object.getOwnPropertyDescriptor(prototype, i)!;
    });
  }

  cls.prototype = Object.create(superCtor.prototype, properties);
};

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

export function toIsoDateString(dt: Date): string {
  return dt.toISOString().substr(0, 10);
}

// =============================================================================
// Path utilities
// =============================================================================

interface PathInfo {
  path: string;
  name: string;
}

export function parsePath(filepath: string): PathInfo {
  const last = filepath.lastIndexOf("/");
  return {
    path: filepath.substring(0, last),
    name: filepath.substring(last + 1)
  };
}

export function getRelsPath(filepath: string): string {
  const path = parsePath(filepath);
  return `${path.path}/_rels/${path.name}.rels`;
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
    let escape: string | null = null;
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

export function isDateFmt(fmt: string | null | undefined): boolean {
  if (!fmt) {
    return false;
  }
  // must not be a string fmt
  if (fmt.indexOf("@") > -1) {
    return false;
  }
  // must remove all chars inside quotes and []
  let cleanFmt = fmt.replace(/\[[^\]]*\]/g, "");
  cleanFmt = cleanFmt.replace(/"[^"]*"/g, "");
  // then check for date formatting chars
  return cleanFmt.match(/[ymdhMsb]+/) !== null;
}

export function parseBoolean(value: any): boolean {
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

export function toSortedArray(values: Iterable<any>): any[] {
  const result = Array.from(values);
  // If all numbers, use numeric sort
  if (result.every(item => Number.isFinite(item))) {
    return result.sort((a, b) => a - b);
  }
  return result.sort();
}

export function objectFromProps<T = any>(
  props: string[],
  value: T | null = null
): Record<string, T | null> {
  return props.reduce((result: Record<string, T | null>, property: string) => {
    result[property] = value;
    return result;
  }, {});
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
