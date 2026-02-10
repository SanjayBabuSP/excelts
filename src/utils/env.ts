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
