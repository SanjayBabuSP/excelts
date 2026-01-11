/**
 * CRC32 calculation core (shared between Node.js and browser).
 *
 * Implements CRC-32 IEEE 802.3 using the reversed polynomial 0xEDB88320.
 *
 * Notes:
 * - Uses a lazily-initialized 256-entry lookup table.
 * - Exposes an incremental update API for streaming use cases.
 */

let _crc32Table: Uint32Array | null = null;

function getCrc32Table(): Uint32Array {
  if (_crc32Table) {
    return _crc32Table;
  }

  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[i] = crc;
  }

  _crc32Table = table;
  return table;
}

/**
 * Update a CRC32 value with a new data chunk.
 *
 * The CRC state here is the non-finalized (inverted) form:
 * - initial state: 0xffffffff
 * - finalize: xor with 0xffffffff
 */
export function crc32UpdateJS(crc: number, data: Uint8Array): number {
  const table = getCrc32Table();
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return crc;
}

/**
 * Finalize CRC32 calculation.
 */
export function crc32Finalize(crc: number): number {
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Compute CRC32 for the full input using the JS table implementation.
 */
export function crc32JS(data: Uint8Array): number {
  return crc32Finalize(crc32UpdateJS(0xffffffff, data));
}
