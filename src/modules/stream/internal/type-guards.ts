/**
 * Lightweight runtime type guards shared across modules.
 *
 * Keep this file dependency-free to maximize deduping in bundled builds.
 */

export function isReadableStream(value: unknown): value is ReadableStream<unknown> {
  return !!value && typeof value === "object" && typeof (value as any).getReader === "function";
}

export function isWritableStream(value: unknown): value is WritableStream<unknown> {
  return !!value && typeof value === "object" && typeof (value as any).getWriter === "function";
}

export function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    !!value &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as any)[Symbol.asyncIterator] === "function"
  );
}

export function isTransformStream(value: unknown): value is TransformStream<unknown, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !!(value as any).readable &&
    !!(value as any).writable &&
    isReadableStream((value as any).readable) &&
    isWritableStream((value as any).writable)
  );
}
