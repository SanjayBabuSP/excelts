/**
 * Safe property key utilities — guards against prototype pollution.
 *
 * CodeQL flags dynamic property assignments like `obj[key] = value` when `key`
 * originates from user input. The inline string comparisons below act as
 * CodeQL-recognized sanitizer barriers while also providing runtime protection.
 *
 * NOTE: We intentionally use direct `===` comparisons rather than Set.has()
 * because CodeQL's taint-tracking recognizes string equality checks as barriers
 * but may not follow Set.has() interprocedurally.
 */

/**
 * Returns true if the key is safe for use as an object property.
 * Rejects `__proto__`, `constructor`, and `prototype`.
 */
export function isSafeKey(key: string): boolean {
  return key !== "__proto__" && key !== "constructor" && key !== "prototype";
}

/**
 * Set a property on an object only if the key is safe.
 * No-op for `__proto__`, `constructor`, `prototype`.
 */
export function safeSet<V>(obj: Record<string, V>, key: string, value: V): void {
  if (key !== "__proto__" && key !== "constructor" && key !== "prototype") {
    obj[key] = value;
  }
}
