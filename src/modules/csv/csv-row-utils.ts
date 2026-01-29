/**
 * CSV Row Utilities
 *
 * Helper functions for working with different row formats:
 * - RowHashArray (array of [key, value] tuples)
 * - RowMap (Record<string, any>)
 * - RowArray (string[])
 */

// Types are duplicated here to avoid circular dependencies
/** Header array type (can include undefined to skip columns) */
export type HeaderArray = (string | undefined | null)[];
/** Row as array of [header, value] tuples */
export type RowHashArray<V = any> = [string, V][];

// =============================================================================
// RowHashArray Utilities
// =============================================================================

/**
 * Check if a row is a RowHashArray (array of [key, value] tuples)
 */
export function isRowHashArray(row: unknown): row is RowHashArray {
  if (!Array.isArray(row) || row.length === 0) {
    return false;
  }
  // Check if first element is a 2-element array with string key
  const first = row[0];
  return Array.isArray(first) && first.length === 2 && typeof first[0] === "string";
}

/**
 * Convert RowHashArray to RowMap
 * Note: Manual loop is ~4x faster than Object.fromEntries
 */
export function rowHashArrayToMap<V = any>(row: RowHashArray<V>): Record<string, V> {
  const obj: Record<string, V> = {};
  for (const [key, value] of row) {
    obj[key] = value;
  }
  return obj;
}

/**
 * Convert RowHashArray to values array (preserving order)
 */
export function rowHashArrayToValues<V = any>(row: RowHashArray<V>): V[] {
  return row.map(([, value]) => value);
}

/**
 * Get headers from RowHashArray
 */
export function rowHashArrayToHeaders(row: RowHashArray): string[] {
  return row.map(([key]) => key);
}

/**
 * Get value by key from RowHashArray (returns undefined if not found)
 * More efficient than creating a full map when you need only specific values
 */
export function rowHashArrayGet<V = any>(row: RowHashArray<V>, key: string): V | undefined {
  for (const [k, v] of row) {
    if (k === key) {
      return v;
    }
  }
  return undefined;
}

/**
 * Map RowHashArray values according to header order
 * Optimized: builds values array in single pass without intermediate object
 */
export function rowHashArrayMapByHeaders<V = any>(
  row: RowHashArray<V>,
  headers: string[]
): (V | undefined)[] {
  // For small headers array, linear search per header is faster than building a map
  // For larger headers (>10), build a map once
  if (headers.length <= 10) {
    return headers.map(h => rowHashArrayGet(row, h));
  }
  const map = rowHashArrayToMap(row);
  return headers.map(h => map[h]);
}

// =============================================================================
// Header Utilities
// =============================================================================

/**
 * Deduplicate headers by appending suffix to duplicates.
 * Example: ["A", "B", "A", "A"] → ["A", "B", "A_1", "A_2"]
 *
 * @param headers - Original header array
 * @returns New array with unique header names
 */
export function deduplicateHeaders(headers: HeaderArray): HeaderArray {
  return deduplicateHeadersWithRenames(headers).headers;
}

export function deduplicateHeadersWithRenames(headers: HeaderArray): {
  headers: HeaderArray;
  renamedHeaders: Record<string, string> | null;
} {
  const headerCount = new Map<string, number>();
  const usedHeaders = new Set<string>();
  // Reserve all original header names so we don't generate a rename that
  // collides with a header that appears later in the row.
  const reservedHeaders = new Set<string>();
  const result: HeaderArray = [];
  const renamedHeaders: Record<string, string> = {};

  let hasRenames = false;

  for (const header of headers) {
    if (header !== null && header !== undefined) {
      reservedHeaders.add(header);
    }
  }

  for (const header of headers) {
    if (header === null || header === undefined) {
      result.push(header);
      continue;
    }

    if (!usedHeaders.has(header)) {
      usedHeaders.add(header);
      headerCount.set(header, 1);
      result.push(header);
      continue;
    }

    // Duplicate: find a unique suffix, avoiding collisions with already-present headers
    let suffix = headerCount.get(header) ?? 1;
    let candidate = `${header}_${suffix}`;
    while (usedHeaders.has(candidate) || reservedHeaders.has(candidate)) {
      suffix++;
      candidate = `${header}_${suffix}`;
    }

    headerCount.set(header, suffix + 1);
    usedHeaders.add(candidate);
    result.push(candidate);
    renamedHeaders[candidate] = header;
    hasRenames = true;
  }

  return { headers: result, renamedHeaders: hasRenames ? renamedHeaders : null };
}
