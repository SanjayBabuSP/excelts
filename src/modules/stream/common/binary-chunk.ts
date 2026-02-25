import { stringToUint8Array } from "@utils/binary";

/**
 * Normalize a binary-like value into Uint8Array.
 */
export const toBinaryChunk = (value: unknown): Uint8Array | null => {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  return null;
};

/**
 * Convert any stream chunk to bytes for text decoding.
 * Handles: string, Uint8Array, ArrayBuffer, TypedArray, Array, array-like objects.
 * Returns null if the chunk type is not recognized.
 *
 * Shared by both Node.js and browser streamToString / streamToBuffer.
 */
export const toStreamBytes = (chunk: unknown): Uint8Array | null => {
  if (typeof chunk === "string") {
    return stringToUint8Array(chunk);
  }
  if (Array.isArray(chunk)) {
    return new Uint8Array(chunk);
  }
  const binary = toBinaryChunk(chunk);
  if (binary) {
    return binary;
  }
  return toArrayLikeBytes(chunk);
};

/**
 * Convert an array-like object (e.g. {0: 65, 1: 66, length: 2}) to Uint8Array.
 * Returns null if the value is not a valid array-like of numbers.
 */
const toArrayLikeBytes = (chunk: unknown): Uint8Array | null => {
  if (chunk == null || typeof chunk !== "object") {
    return null;
  }

  const lengthValue = (chunk as { length?: unknown }).length;
  if (
    typeof lengthValue !== "number" ||
    !Number.isFinite(lengthValue) ||
    lengthValue < 0 ||
    !Number.isInteger(lengthValue)
  ) {
    return null;
  }

  const result = new Uint8Array(lengthValue);
  const source = chunk as Record<number, unknown>;
  for (let index = 0; index < lengthValue; index++) {
    const value = source[index];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }
    result[index] = value;
  }

  return result;
};
