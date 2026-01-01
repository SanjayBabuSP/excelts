/**
 * Environment detection utilities
 * Common functions to detect runtime environment (Node.js vs Browser)
 */

/**
 * Check if running in Node.js environment
 * Returns true if process.versions.node exists
 */
export function isNode(): boolean {
  return typeof process !== "undefined" && !!process.versions?.node;
}

/**
 * Check if running in browser environment
 * Returns true if window and document are defined
 */
export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}
