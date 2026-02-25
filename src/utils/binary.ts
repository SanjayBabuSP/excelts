/**
 * Binary Utilities
 *
 * Cached TextEncoder/TextDecoder instances and core Uint8Array operations.
 * Platform-neutral — used across the entire codebase.
 */

// =============================================================================
// Cached TextEncoder/TextDecoder instances
// =============================================================================

/**
 * Cached TextEncoder instance for UTF-8 encoding
 */
export const textEncoder = new TextEncoder();

/**
 * Cached TextDecoder instance for UTF-8 decoding
 * ignoreBOM: true - preserves BOM in output to match Node.js behavior
 */
export const textDecoder = new TextDecoder("utf-8", { ignoreBOM: true });

// Cache non-default decoders by encoding to avoid repeated allocations.
const _decoderCache = new Map<string, TextDecoder>();

function normalizeEncodingLabel(encoding?: string): string {
  const normalized = (encoding ?? "utf-8").trim().toLowerCase();
  if (normalized === "" || normalized === "utf8" || normalized === "utf-8") {
    return "utf-8";
  }
  if (normalized === "utf16le" || normalized === "utf-16le") {
    return "utf-16le";
  }
  if (normalized === "ucs2" || normalized === "ucs-2") {
    return "utf-16le";
  }
  if (normalized === "binary") {
    return "latin1";
  }
  return normalized;
}

/**
 * Get a cached TextDecoder instance.
 *
 * Note: For the default UTF-8 path we reuse the module-level `textDecoder`.
 */
export function getTextDecoder(encoding?: string): TextDecoder {
  const key = normalizeEncodingLabel(encoding);
  if (key === "utf-8") {
    return textDecoder;
  }
  let decoder = _decoderCache.get(key);
  if (!decoder) {
    decoder = createTextDecoderOrTypeError(key);
    _decoderCache.set(key, decoder);
  }
  return decoder;
}

/**
 * Create a new TextDecoder instance.
 *
 * Use this for streaming decode (`decode(..., { stream: true })`) to avoid
 * sharing mutable decoder state across concurrent operations.
 */
export function createTextDecoder(encoding?: string): TextDecoder {
  return createTextDecoderOrTypeError(normalizeEncodingLabel(encoding), { ignoreBOM: true });
}

function createTextDecoderOrTypeError(encoding: string, options?: TextDecoderOptions): TextDecoder {
  try {
    return new TextDecoder(encoding, options);
  } catch (error) {
    throw new TypeError(`Unsupported text encoding: ${encoding}`, { cause: error as Error });
  }
}

// =============================================================================
// Binary Operations
// =============================================================================

/**
 * Convert string to Uint8Array using cached encoder
 */
export function stringToUint8Array(str: string): Uint8Array {
  return textEncoder.encode(str);
}

/**
 * Convert Uint8Array to string using cached decoder
 */
export function uint8ArrayToString(arr: Uint8Array, encoding?: string): string {
  return getTextDecoder(encoding).decode(arr);
}

/**
 * Concatenate multiple Uint8Arrays efficiently
 */
export function concatUint8Arrays(arrays: readonly Uint8Array[], totalLength?: number): Uint8Array {
  const len = arrays.length;
  if (len === 0) {
    return new Uint8Array(0);
  }
  if (len === 1) {
    const single = arrays[0];
    // Ensure we always return a plain Uint8Array, not a subclass (e.g. Buffer).
    if (single.constructor === Uint8Array) {
      return single;
    }
    return new Uint8Array(single.buffer, single.byteOffset, single.byteLength);
  }

  // Calculate total length with for loop for better performance
  if (totalLength === undefined) {
    let sum = 0;
    for (let i = 0; i < len; i++) {
      sum += arrays[i].length;
    }
    totalLength = sum;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (let i = 0; i < len; i++) {
    const arr = arrays[i];
    result.set(arr, offset);
    offset += arr.length;
  }

  return result;
}

/**
 * Compare two Uint8Arrays for equality
 */
export function uint8ArrayEquals(a: Uint8Array, b: Uint8Array): boolean {
  const len = a.length;
  if (len !== b.length) {
    return false;
  }
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Find pattern in Uint8Array.
 *
 * @param haystack  The array to search in
 * @param needle    The pattern to search for
 * @param start     Start index (inclusive, default 0)
 * @param end       End index (exclusive, default haystack.length) — limits the search
 *                  region without creating a subarray view
 */
export function uint8ArrayIndexOf(
  haystack: Uint8Array,
  needle: Uint8Array,
  start = 0,
  end?: number
): number {
  const needleLen = needle.length;
  if (needleLen === 0) {
    return start;
  }

  const haystackLen = end ?? haystack.length;
  if (needleLen > haystackLen) {
    return -1;
  }

  const firstByte = needle[0];
  const last = haystackLen - needleLen;

  outer: for (let i = start; i <= last; i++) {
    // Quick check first byte
    if (haystack[i] !== firstByte) {
      continue;
    }
    // Check rest of pattern
    for (let j = 1; j < needleLen; j++) {
      if (haystack[i + j] !== needle[j]) {
        continue outer;
      }
    }
    return i;
  }

  return -1;
}

/**
 * Convert any buffer-like input to Uint8Array
 */
export function toUint8Array(input: string | Uint8Array | ArrayBuffer | number[]): Uint8Array {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (typeof input === "string") {
    return textEncoder.encode(input);
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (Array.isArray(input)) {
    return new Uint8Array(input);
  }
  throw new TypeError(`Expected Uint8Array, got ${typeof input}`);
}

/**
 * Convert Uint8Array to a Node.js Buffer view when available.
 *
 * In browser environments this returns the original Uint8Array unchanged.
 */
export function uint8ArrayToNodeBufferView(data: Uint8Array): Uint8Array {
  const bufferCtor = (
    globalThis as {
      Buffer?: {
        from: (arrayBuffer: ArrayBufferLike, byteOffset?: number, length?: number) => Uint8Array;
      };
    }
  ).Buffer;

  if (!bufferCtor) {
    return data;
  }

  return bufferCtor.from(data.buffer, data.byteOffset, data.byteLength);
}

/**
 * Convert any input to string
 */
export function anyToString(
  input: string | Uint8Array | ArrayBuffer | number[],
  encoding?: string
): string {
  if (typeof input === "string") {
    return input;
  }
  const arr = toUint8Array(input);
  return getTextDecoder(encoding).decode(arr);
}

/**
 * Convert collected chunks to a string.
 *
 * Common logic shared by Node.js and browser Collector `toString()`:
 * - empty → ""
 * - string chunks → fast path (single return / join)
 * - binary chunks → decode via the provided `toUint8Array` callback
 */
export function chunksToString(chunks: unknown[], toBytes: () => Uint8Array): string {
  const len = chunks.length;
  if (len === 0) {
    return "";
  }

  const first = chunks[0];
  if (typeof first === "string") {
    if (len === 1) {
      return first;
    }
    return (chunks as string[]).join("");
  }

  return textDecoder.decode(toBytes());
}
