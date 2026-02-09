/**
 * Pure JavaScript DEFLATE implementation for browsers without CompressionStream support
 *
 * This fallback supports:
 * - Decompression: Full DEFLATE decompression (RFC 1951)
 * - Compression: STORE mode only (no compression, but valid DEFLATE format)
 *
 * Used automatically when CompressionStream with "deflate-raw" is unavailable:
 * - Firefox < 113
 * - Safari < 16.4
 * - Chrome < 103
 */

import { concatUint8Arrays } from "@stream/binary";

// ============================================================================
// DEFLATE Decompression (Full implementation)
// ============================================================================

// Fixed Huffman code lengths for literals/lengths (RFC 1951)
const FIXED_LITERAL_LENGTHS = new Uint8Array(288);
for (let i = 0; i <= 143; i++) {
  FIXED_LITERAL_LENGTHS[i] = 8;
}
for (let i = 144; i <= 255; i++) {
  FIXED_LITERAL_LENGTHS[i] = 9;
}
for (let i = 256; i <= 279; i++) {
  FIXED_LITERAL_LENGTHS[i] = 7;
}
for (let i = 280; i <= 287; i++) {
  FIXED_LITERAL_LENGTHS[i] = 8;
}

// Fixed Huffman code lengths for distances
const FIXED_DISTANCE_LENGTHS = new Uint8Array(32).fill(5);

// Length base values and extra bits (codes 257-285)
const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0
];

// Distance base values and extra bits (codes 0-29)
const DISTANCE_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577
];
const DISTANCE_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13
];

// Code length order for dynamic Huffman tables
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/**
 * Huffman tree node
 */
interface HuffmanNode {
  symbol?: number;
  left?: HuffmanNode;
  right?: HuffmanNode;
}

/**
 * Build Huffman tree from code lengths
 */
function buildHuffmanTree(lengths: Uint8Array, maxSymbol: number): HuffmanNode {
  // Count codes of each length
  const blCount = new Uint16Array(16);
  for (let i = 0; i < maxSymbol; i++) {
    if (lengths[i] > 0) {
      blCount[lengths[i]]++;
    }
  }

  // Find first code value for each length
  const nextCode = new Uint16Array(16);
  let code = 0;
  for (let bits = 1; bits <= 15; bits++) {
    code = (code + blCount[bits - 1]) << 1;
    nextCode[bits] = code;
  }

  // Build tree
  const root: HuffmanNode = {};

  for (let symbol = 0; symbol < maxSymbol; symbol++) {
    const len = lengths[symbol];
    if (len === 0) {
      continue;
    }

    code = nextCode[len]++;
    let node = root;

    for (let bit = len - 1; bit >= 0; bit--) {
      const b = (code >> bit) & 1;
      if (b === 0) {
        if (!node.left) {
          node.left = {};
        }
        node = node.left;
      } else {
        if (!node.right) {
          node.right = {};
        }
        node = node.right;
      }
    }
    node.symbol = symbol;
  }

  return root;
}

/**
 * Bit reader for DEFLATE streams
 */
class BitReader {
  private data: Uint8Array;
  private pos: number;
  private bitBuf: number;
  private bitCount: number;

  constructor(data: Uint8Array) {
    this.data = data;
    this.pos = 0;
    this.bitBuf = 0;
    this.bitCount = 0;
  }

  /**
   * Read n bits (LSB first)
   */
  readBits(n: number): number {
    while (this.bitCount < n) {
      if (this.pos >= this.data.length) {
        throw new Error("Unexpected end of DEFLATE data");
      }
      this.bitBuf |= this.data[this.pos++] << this.bitCount;
      this.bitCount += 8;
    }
    const result = this.bitBuf & ((1 << n) - 1);
    this.bitBuf >>= n;
    this.bitCount -= n;
    return result;
  }

  /**
   * Decode a symbol using Huffman tree
   */
  decodeSymbol(tree: HuffmanNode): number {
    let node = tree;
    while (node.symbol === undefined) {
      const bit = this.readBits(1);
      node = bit === 0 ? node.left! : node.right!;
      if (!node) {
        throw new Error("Invalid Huffman code");
      }
    }
    return node.symbol;
  }

  /**
   * Align to byte boundary
   */
  alignToByte(): void {
    this.bitBuf = 0;
    this.bitCount = 0;
  }

  /**
   * Read a byte directly (must be aligned)
   */
  readByte(): number {
    if (this.pos >= this.data.length) {
      throw new Error("Unexpected end of data");
    }
    return this.data[this.pos++];
  }

  /**
   * Read 16-bit little-endian value (must be aligned)
   */
  readUint16(): number {
    return this.readByte() | (this.readByte() << 8);
  }
}

/**
 * Decompress DEFLATE data (raw format, no zlib header)
 *
 * @param data - Compressed data in deflate-raw format
 * @returns Decompressed data
 */
export function inflateRaw(data: Uint8Array): Uint8Array {
  const reader = new BitReader(data);
  const output: number[] = [];

  let isFinal = false;

  while (!isFinal) {
    isFinal = reader.readBits(1) === 1;
    const blockType = reader.readBits(2);

    if (blockType === 0) {
      // Stored block (no compression)
      reader.alignToByte();
      const len = reader.readUint16();
      const nlen = reader.readUint16();

      if ((len ^ nlen) !== 0xffff) {
        throw new Error("Invalid stored block length");
      }

      for (let i = 0; i < len; i++) {
        output.push(reader.readByte());
      }
    } else if (blockType === 1 || blockType === 2) {
      // Compressed block
      let literalTree: HuffmanNode;
      let distanceTree: HuffmanNode;

      if (blockType === 1) {
        // Fixed Huffman codes
        literalTree = buildHuffmanTree(FIXED_LITERAL_LENGTHS, 288);
        distanceTree = buildHuffmanTree(FIXED_DISTANCE_LENGTHS, 32);
      } else {
        // Dynamic Huffman codes
        const hlit = reader.readBits(5) + 257;
        const hdist = reader.readBits(5) + 1;
        const hclen = reader.readBits(4) + 4;

        // Read code length code lengths
        const codeLengthLengths = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) {
          codeLengthLengths[CODE_LENGTH_ORDER[i]] = reader.readBits(3);
        }

        const codeLengthTree = buildHuffmanTree(codeLengthLengths, 19);

        // Decode literal/length and distance code lengths
        const allLengths = new Uint8Array(hlit + hdist);
        let i = 0;

        while (i < hlit + hdist) {
          const symbol = reader.decodeSymbol(codeLengthTree);

          if (symbol < 16) {
            allLengths[i++] = symbol;
          } else if (symbol === 16) {
            // Copy previous length 3-6 times
            const repeat = reader.readBits(2) + 3;
            const prev = allLengths[i - 1];
            for (let j = 0; j < repeat; j++) {
              allLengths[i++] = prev;
            }
          } else if (symbol === 17) {
            // Repeat 0 for 3-10 times
            const repeat = reader.readBits(3) + 3;
            for (let j = 0; j < repeat; j++) {
              allLengths[i++] = 0;
            }
          } else if (symbol === 18) {
            // Repeat 0 for 11-138 times
            const repeat = reader.readBits(7) + 11;
            for (let j = 0; j < repeat; j++) {
              allLengths[i++] = 0;
            }
          }
        }

        literalTree = buildHuffmanTree(allLengths.subarray(0, hlit), hlit);
        distanceTree = buildHuffmanTree(allLengths.subarray(hlit), hdist);
      }

      // Decode compressed data
      while (true) {
        const symbol = reader.decodeSymbol(literalTree);

        if (symbol < 256) {
          // Literal byte
          output.push(symbol);
        } else if (symbol === 256) {
          // End of block
          break;
        } else {
          // Length/distance pair
          const lengthCode = symbol - 257;
          const length = LENGTH_BASE[lengthCode] + reader.readBits(LENGTH_EXTRA[lengthCode]);

          const distCode = reader.decodeSymbol(distanceTree);
          const distance = DISTANCE_BASE[distCode] + reader.readBits(DISTANCE_EXTRA[distCode]);

          // Copy from output buffer
          const start = output.length - distance;
          for (let i = 0; i < length; i++) {
            output.push(output[start + i]);
          }
        }
      }
    } else {
      throw new Error("Invalid DEFLATE block type: " + blockType);
    }
  }

  return new Uint8Array(output);
}

// ============================================================================
// DEFLATE Compression (STORE mode only - no actual compression)
// ============================================================================

/**
 * Compress data using DEFLATE STORE mode (no compression)
 *
 * This creates valid DEFLATE data but without actual compression.
 * Files will be larger but this works on all browsers.
 *
 * @param data - Data to "compress"
 * @returns DEFLATE-formatted data (stored, not compressed)
 */
export function deflateRawStore(data: Uint8Array): Uint8Array {
  // Maximum stored block size is 65535 bytes
  const MAX_BLOCK_SIZE = 65535;
  const numBlocks = Math.ceil(data.length / MAX_BLOCK_SIZE) || 1;

  // Calculate output size: 5 bytes header per block + data
  const outputSize = numBlocks * 5 + data.length;
  const output = new Uint8Array(outputSize);
  let outPos = 0;
  let inPos = 0;

  for (let block = 0; block < numBlocks; block++) {
    const isLast = block === numBlocks - 1;
    const blockSize = Math.min(MAX_BLOCK_SIZE, data.length - inPos);

    // Block header: BFINAL (1 bit) + BTYPE=00 (2 bits) = stored block
    // Then align to byte boundary (5 bits padding)
    output[outPos++] = isLast ? 0x01 : 0x00;

    // LEN (16-bit little-endian)
    output[outPos++] = blockSize & 0xff;
    output[outPos++] = (blockSize >> 8) & 0xff;

    // NLEN (one's complement of LEN)
    output[outPos++] = ~blockSize & 0xff;
    output[outPos++] = (~blockSize >> 8) & 0xff;

    // Data
    output.set(data.subarray(inPos, inPos + blockSize), outPos);
    outPos += blockSize;
    inPos += blockSize;
  }

  return output.subarray(0, outPos);
}

// ============================================================================
// LZ77 + Huffman Compression (Basic implementation)
// ============================================================================

/**
 * Compress data using DEFLATE with fixed Huffman codes
 *
 * This provides real compression using LZ77 + fixed Huffman codes.
 * Not as efficient as full DEFLATE but much better than STORE mode.
 *
 * @param data - Data to compress
 * @returns Compressed data in deflate-raw format
 */
export function deflateRawCompressed(data: Uint8Array): Uint8Array {
  if (data.length === 0) {
    // Empty input: single final block with just end-of-block symbol
    return new Uint8Array([0x03, 0x00]);
  }

  // For small data, use STORE mode
  if (data.length < 100) {
    return deflateRawStore(data);
  }

  const output = new BitWriter();

  // Write final block header with fixed Huffman (BFINAL=1, BTYPE=01)
  output.writeBits(1, 1); // BFINAL
  output.writeBits(1, 2); // BTYPE = 01 (fixed Huffman)

  // LZ77 compression with hash table
  const hashTable = new Map<number, number>();
  let pos = 0;

  while (pos < data.length) {
    // Try to find a match
    let bestLen = 0;
    let bestDist = 0;

    if (pos + 2 < data.length) {
      const hash = (data[pos] << 16) | (data[pos + 1] << 8) | data[pos + 2];
      const matchPos = hashTable.get(hash);

      if (matchPos !== undefined && pos - matchPos <= 32768) {
        const dist = pos - matchPos;
        let len = 0;
        const maxLen = Math.min(258, data.length - pos);

        while (len < maxLen && data[matchPos + len] === data[pos + len]) {
          len++;
        }

        if (len >= 3) {
          bestLen = len;
          bestDist = dist;
        }
      }

      // Update hash table
      hashTable.set(hash, pos);
    }

    if (bestLen >= 3) {
      // Write length/distance pair
      writeLengthCode(output, bestLen);
      writeDistanceCode(output, bestDist);
      pos += bestLen;
    } else {
      // Write literal
      writeLiteralCode(output, data[pos]);
      pos++;
    }
  }

  // Write end-of-block symbol (256)
  writeLiteralCode(output, 256);

  return output.finish();
}

/**
 * Bit writer for DEFLATE output
 */
class BitWriter {
  private chunks: Uint8Array[] = [];
  private buffer: number[] = [];
  private bitBuf = 0;
  private bitCount = 0;

  writeBits(value: number, count: number): void {
    this.bitBuf |= value << this.bitCount;
    this.bitCount += count;

    while (this.bitCount >= 8) {
      this.buffer.push(this.bitBuf & 0xff);
      this.bitBuf >>= 8;
      this.bitCount -= 8;

      if (this.buffer.length >= 65536) {
        this.chunks.push(new Uint8Array(this.buffer));
        this.buffer = [];
      }
    }
  }

  writeBitsReverse(value: number, count: number): void {
    // Write bits in reverse order (MSB first, used for Huffman codes)
    let reversed = 0;
    for (let i = 0; i < count; i++) {
      reversed = (reversed << 1) | ((value >> i) & 1);
    }
    this.writeBits(reversed, count);
  }

  finish(): Uint8Array {
    // Flush remaining bits
    if (this.bitCount > 0) {
      this.buffer.push(this.bitBuf & 0xff);
    }

    if (this.chunks.length === 0) {
      return new Uint8Array(this.buffer);
    }

    this.chunks.push(new Uint8Array(this.buffer));
    return concatUint8Arrays(this.chunks);
  }
}

// Fixed Huffman code tables
const LITERAL_CODES: Array<[number, number]> = [];
const LITERAL_LENGTHS_TABLE: number[] = [];

// Build fixed literal/length Huffman codes
for (let i = 0; i <= 287; i++) {
  let code: number;
  let len: number;

  if (i <= 143) {
    // 00110000 - 10111111 (8 bits)
    code = 0x30 + i;
    len = 8;
  } else if (i <= 255) {
    // 110010000 - 111111111 (9 bits)
    code = 0x190 + (i - 144);
    len = 9;
  } else if (i <= 279) {
    // 0000000 - 0010111 (7 bits)
    code = i - 256;
    len = 7;
  } else {
    // 11000000 - 11000111 (8 bits)
    code = 0xc0 + (i - 280);
    len = 8;
  }

  LITERAL_CODES[i] = [code, len];
  LITERAL_LENGTHS_TABLE[i] = len;
}

/**
 * Write a literal or end-of-block symbol using fixed Huffman codes
 */
function writeLiteralCode(output: BitWriter, symbol: number): void {
  const [code, len] = LITERAL_CODES[symbol];
  output.writeBitsReverse(code, len);
}

/**
 * Write a length code (257-285)
 */
function writeLengthCode(output: BitWriter, length: number): void {
  let code: number;
  let extraBits: number;
  let extraValue: number;

  if (length <= 10) {
    code = 257 + length - 3;
    extraBits = 0;
    extraValue = 0;
  } else if (length <= 18) {
    const base = length - 11;
    code = 265 + Math.floor(base / 2);
    extraBits = 1;
    extraValue = base % 2;
  } else if (length <= 34) {
    const base = length - 19;
    code = 269 + Math.floor(base / 4);
    extraBits = 2;
    extraValue = base % 4;
  } else if (length <= 66) {
    const base = length - 35;
    code = 273 + Math.floor(base / 8);
    extraBits = 3;
    extraValue = base % 8;
  } else if (length <= 130) {
    const base = length - 67;
    code = 277 + Math.floor(base / 16);
    extraBits = 4;
    extraValue = base % 16;
  } else if (length <= 257) {
    const base = length - 131;
    code = 281 + Math.floor(base / 32);
    extraBits = 5;
    extraValue = base % 32;
  } else {
    code = 285;
    extraBits = 0;
    extraValue = 0;
  }

  writeLiteralCode(output, code);
  if (extraBits > 0) {
    output.writeBits(extraValue, extraBits);
  }
}

/**
 * Write a distance code
 */
function writeDistanceCode(output: BitWriter, distance: number): void {
  // Distance code table from RFC 1951
  // Each entry: [maxDistance, code, extraBits]
  const DIST_TABLE: Array<[number, number, number]> = [
    [1, 0, 0],
    [2, 1, 0],
    [3, 2, 0],
    [4, 3, 0],
    [6, 4, 1],
    [8, 5, 1],
    [12, 6, 2],
    [16, 7, 2],
    [24, 8, 3],
    [32, 9, 3],
    [48, 10, 4],
    [64, 11, 4],
    [96, 12, 5],
    [128, 13, 5],
    [192, 14, 6],
    [256, 15, 6],
    [384, 16, 7],
    [512, 17, 7],
    [768, 18, 8],
    [1024, 19, 8],
    [1536, 20, 9],
    [2048, 21, 9],
    [3072, 22, 10],
    [4096, 23, 10],
    [6144, 24, 11],
    [8192, 25, 11],
    [12288, 26, 12],
    [16384, 27, 12],
    [24576, 28, 13],
    [32768, 29, 13]
  ];

  // Find the appropriate distance code
  let code = 0;
  let extraBits = 0;
  let baseDistance = 1;

  for (const [maxDist, c, extra] of DIST_TABLE) {
    if (distance <= maxDist) {
      code = c;
      extraBits = extra;
      break;
    }
    baseDistance = maxDist + 1;
  }

  const extraValue = distance - baseDistance;

  // Distance codes use 5-bit fixed code (reversed for Huffman)
  output.writeBitsReverse(code, 5);
  if (extraBits > 0) {
    output.writeBits(extraValue, extraBits);
  }
}
