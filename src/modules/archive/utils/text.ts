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
