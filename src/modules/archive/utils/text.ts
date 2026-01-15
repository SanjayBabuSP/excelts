/**
 * Shared text encoding/decoding utilities.
 *
 * Caches encoder/decoder instances for performance.
 */

export const utf8Encoder = new TextEncoder();
export const utf8Decoder = new TextDecoder("utf-8");

/**
 * Encode a string as UTF-8.
 */
export function encodeUtf8(value: string): Uint8Array {
  return utf8Encoder.encode(value);
}

/**
 * Decode bytes as UTF-8.
 */
export function decodeUtf8(bytes: Uint8Array): string {
  return utf8Decoder.decode(bytes);
}

/**
 * Decode bytes as Latin-1/byte-to-char.
 * Used as a fallback when UTF-8 flag is not set.
 */
export function decodeLatin1(bytes: Uint8Array): string {
  // Avoid spreading huge arrays; build incrementally.
  let out = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    out += String.fromCharCode(...chunk);
  }
  return out;
}

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
