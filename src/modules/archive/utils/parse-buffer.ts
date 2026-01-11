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
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = 0;
  for (const [key, size] of format) {
    if (buffer.length >= offset + size) {
      switch (size) {
        case 1:
          result[key] = view.getUint8(offset);
          break;
        case 2:
          result[key] = view.getUint16(offset, true);
          break;
        case 4:
          result[key] = view.getUint32(offset, true);
          break;
        case 8: {
          // Keep behavior (Number) while avoiding BigInt costs.
          const low = view.getUint32(offset, true);
          const high = view.getUint32(offset + 4, true);
          result[key] = high * 0x100000000 + low;
          break;
        }
        default:
          throw new Error("Unsupported UInt LE size!");
      }
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
