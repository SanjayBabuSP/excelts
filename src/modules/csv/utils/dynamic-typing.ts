/**
 * CSV Dynamic Typing - Automatic Type Conversion
 *
 * Functions for converting CSV string values to appropriate JavaScript types.
 * Supports boolean, number, null detection with customizable per-column config.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Dynamic typing configuration for automatic type conversion.
 *
 * - `true`: Convert all columns using built-in rules
 * - `false`: Keep all values as strings
 * - `Record<string, boolean>`: Enable/disable per column
 * - `Record<string, (value: string) => unknown>`: Custom converter per column
 */
export type DynamicTypingConfig = boolean | Record<string, boolean | ((value: string) => unknown)>;

// =============================================================================
// Core Conversion
// =============================================================================

/**
 * Convert a string value to its appropriate JavaScript type.
 * Used internally by dynamicTyping feature.
 *
 * Conversion rules:
 * - Empty string → "" (unchanged)
 * - "true"/"TRUE"/"True" → true
 * - "false"/"FALSE"/"False" → false
 * - "null"/"NULL" → null
 * - Numeric strings → number (int or float)
 * - Everything else → original string
 *
 * Special cases:
 * - Leading zeros (e.g., "007") → preserved as string (for zip codes, IDs)
 * - "Infinity", "-Infinity", "NaN" → corresponding number values
 */
export function convertValue(value: string): string | number | boolean | null {
  const len = value.length;

  // Empty string stays empty (not converted to null)
  if (len === 0) {
    return "";
  }

  // Fast path: use charCodeAt for quick first-character checks
  const firstChar = value.charCodeAt(0);

  // Boolean detection - check first char before toLowerCase
  // 't' = 116, 'T' = 84, 'f' = 102, 'F' = 70, 'n' = 110, 'N' = 78
  if (len === 4) {
    if ((firstChar === 116 || firstChar === 84) && value.toLowerCase() === "true") {
      return true;
    }
    if ((firstChar === 110 || firstChar === 78) && value.toLowerCase() === "null") {
      return null;
    }
  } else if (
    len === 5 &&
    (firstChar === 102 || firstChar === 70) &&
    value.toLowerCase() === "false"
  ) {
    return false;
  }

  // Number detection - only if first char could start a number
  // '-' = 45, '.' = 46, '0'-'9' = 48-57, 'I' = 73, 'N' = 78
  if (
    (firstChar >= 48 && firstChar <= 57) || // 0-9
    firstChar === 45 || // -
    firstChar === 46 || // .
    firstChar === 73 || // I (Infinity)
    firstChar === 78 // N (NaN)
  ) {
    // Check for whitespace - if value has leading/trailing whitespace, skip number conversion
    const lastChar = value.charCodeAt(len - 1);
    // Space = 32, Tab = 9, \n = 10, \r = 13
    if (firstChar <= 32 || lastChar <= 32) {
      return value;
    }

    // Special numeric values
    if (value === "Infinity") {
      return Infinity;
    }
    if (value === "-Infinity") {
      return -Infinity;
    }
    if (value === "NaN") {
      return NaN;
    }

    // Preserve leading zeros (important for zip codes, phone numbers, IDs)
    // Check for pattern like "007" but allow "0" and "0.xxx"
    if (firstChar === 48 && len > 1) {
      // starts with '0'
      const secondChar = value.charCodeAt(1);
      // If second char is a digit (not '.'), preserve as string
      if (secondChar >= 48 && secondChar <= 57) {
        return value;
      }
    }
    // Handle negative leading zeros like "-007"
    if (firstChar === 45 && len > 2 && value.charCodeAt(1) === 48) {
      // starts with '-0'
      const thirdChar = value.charCodeAt(2);
      if (thirdChar >= 48 && thirdChar <= 57) {
        return value;
      }
    }

    // Check for valid number format (avoid converting "123abc" or "1.2.3")
    if (/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) {
      const num = Number(value);
      if (!isNaN(num)) {
        return num;
      }
    }
  }

  // Default: keep as string
  return value;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard to check if dynamicTyping config has custom converter function
 */
function isCustomConverter(
  config: boolean | ((value: string) => unknown)
): config is (value: string) => unknown {
  return typeof config === "function";
}

// =============================================================================
// Application Functions
// =============================================================================

/**
 * Apply dynamic typing to a single field value
 *
 * @param value - The string value to convert
 * @param columnConfig - Column-specific config (true, false, or custom function)
 * @returns Converted value
 */
export function applyDynamicTyping(
  value: string,
  columnConfig: boolean | ((value: string) => unknown)
): unknown {
  if (columnConfig === false) {
    return value;
  }

  if (isCustomConverter(columnConfig)) {
    return columnConfig(value);
  }

  // columnConfig === true → use default conversion
  return convertValue(value);
}

/**
 * Apply dynamic typing to an entire row (object form)
 *
 * @param row - Row object with string values
 * @param dynamicTyping - DynamicTyping configuration
 * @returns New row object with converted values
 */
export function applyDynamicTypingToRow(
  row: Record<string, string>,
  dynamicTyping: DynamicTypingConfig
): Record<string, unknown> {
  if (dynamicTyping === false) {
    // No conversion - return as-is (fast path)
    return row;
  }

  const result: Record<string, unknown> = {};

  if (dynamicTyping === true) {
    // Convert all columns - use for...in for better performance
    for (const key in row) {
      if (Object.hasOwn(row, key)) {
        result[key] = convertValue(row[key]);
      }
    }
  } else {
    // Per-column configuration - use for...in for better performance
    for (const key in row) {
      if (Object.hasOwn(row, key)) {
        const config = dynamicTyping[key];
        if (config === undefined) {
          // Column not in config → keep as string
          result[key] = row[key];
        } else {
          result[key] = applyDynamicTyping(row[key], config);
        }
      }
    }
  }

  return result;
}

/**
 * Apply dynamic typing to an array row
 *
 * @param row - Row array with string values
 * @param headers - Header names (for per-column config lookup)
 * @param dynamicTyping - DynamicTyping configuration
 * @returns New row array with converted values
 */
export function applyDynamicTypingToArrayRow(
  row: string[],
  headers: string[] | null,
  dynamicTyping: DynamicTypingConfig
): unknown[] {
  if (dynamicTyping === true) {
    // Convert all columns
    return row.map(convertValue);
  }

  if (dynamicTyping === false) {
    // No conversion
    return row;
  }

  // Per-column configuration - need headers to look up column names
  if (!headers) {
    // No headers available, can't use per-column config → no conversion
    return row;
  }

  return row.map((value, index) => {
    const header = headers[index];
    const config = header ? dynamicTyping[header] : undefined;
    if (config === undefined) {
      return value;
    }
    return applyDynamicTyping(value, config);
  });
}
