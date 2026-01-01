/**
 * Read unsigned little-endian integer from Uint8Array
 */
function readUIntLE(buffer: Uint8Array, offset: number, size: number): number {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  switch (size) {
    case 1:
      return view.getUint8(offset);
    case 2:
      return view.getUint16(offset, true);
    case 4:
      return view.getUint32(offset, true);
    case 8: {
      // Read as BigUint64 and convert to Number
      const low = view.getUint32(offset, true);
      const high = view.getUint32(offset + 4, true);
      return high * 0x100000000 + low;
    }
    default:
      throw new Error("Unsupported UInt LE size!");
  }
}

/**
 * Parses sequential unsigned little endian numbers from the head of the passed buffer according to
 * the specified format passed. If the buffer is not large enough to satisfy the full format,
 * null values will be assigned to the remaining keys.
 * @param buffer The buffer to sequentially extract numbers from.
 * @param format Expected format to follow when extracting values from the buffer. A list of list entries
 * with the following structure:
 * [
 *   [
 *     <key>,  // Name of the key to assign the extracted number to.
 *     <size>  // The size in bytes of the number to extract. possible values are 1, 2, 4, 8.
 *   ],
 *   ...
 * ]
 * @returns An object with keys set to their associated extracted values.
 */
export function parse(
  buffer: Uint8Array,
  format: [string, number][]
): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  let offset = 0;
  for (const [key, size] of format) {
    if (buffer.length >= offset + size) {
      result[key] = readUIntLE(buffer, offset, size);
    } else {
      result[key] = null;
    }
    offset += size;
  }
  return result;
}

export function parseTyped<T>(buffer: Uint8Array, format: [string, number][]): T {
  return parse(buffer, format) as T;
}
