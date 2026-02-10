/**
 * Stream Utilities (browser)
 *
 * Browser counterpart of `utils.ts`, selected automatically
 * by the `preferBrowserFilesPlugin()` mechanism.
 */

import { createReadableFromArray, createTransform } from "@stream/browser/factories";
import { consumers } from "@stream/browser/utils";
import type { IReadable, ITransform } from "@stream/types";
import { stringToUint8Array as _stringToUint8Array } from "@utils/binary";
import { isReadableStream } from "@stream/internal/type-guards";

// =============================================================================
// High-Level Stream Consumers
// =============================================================================

export async function collect<T>(stream: {
  [Symbol.asyncIterator](): AsyncIterator<T>;
}): Promise<T[]> {
  const result: T[] = [];
  for await (const chunk of stream) {
    result.push(chunk);
  }
  return result;
}

export async function text(stream: {
  [Symbol.asyncIterator](): AsyncIterator<Uint8Array>;
}): Promise<string> {
  return consumers.text(stream as AsyncIterable<Uint8Array>);
}

export async function json<T = unknown>(stream: {
  [Symbol.asyncIterator](): AsyncIterator<Uint8Array>;
}): Promise<T> {
  return consumers.json(stream as AsyncIterable<Uint8Array>) as Promise<T>;
}

export async function bytes(stream: {
  [Symbol.asyncIterator](): AsyncIterator<Uint8Array>;
}): Promise<Uint8Array> {
  return consumers.buffer(stream as AsyncIterable<Uint8Array>);
}

// =============================================================================
// Stream Factory Helpers
// =============================================================================

export function fromString(str: string): IReadable<Uint8Array> {
  return createReadableFromArray([_stringToUint8Array(str)], {
    objectMode: false
  });
}

export function fromJSON(data: unknown): IReadable<Uint8Array> {
  return fromString(JSON.stringify(data));
}

export function fromBytes(data: Uint8Array): IReadable<Uint8Array> {
  return createReadableFromArray([data], { objectMode: false });
}

export function transform<TIn = Uint8Array, TOut = TIn>(
  fn: (chunk: TIn) => TOut | Promise<TOut>
): ITransform<TIn, TOut> {
  return createTransform<TIn, TOut>(fn);
}

export function filter<T>(predicate: (chunk: T) => boolean | Promise<boolean>): ITransform<T, T> {
  return createTransform<T, T>(
    async chunk => {
      if (await predicate(chunk)) {
        return chunk;
      }
      return undefined as any;
    },
    { objectMode: true }
  );
}

// =============================================================================
// ReadableStream Conversion
// =============================================================================

/**
 * Type guard for browser ReadableStream-like objects.
 * Re-exported from internal/type-guards for public API compatibility.
 */
export const isReadableStreamLike = isReadableStream as (
  value: unknown
) => value is { getReader: () => any };

/**
 * Convert a browser ReadableStream to an AsyncIterable.
 * This is useful for consuming fetch response bodies in a streaming fashion.
 *
 * @example
 * ```ts
 * const response = await fetch(url);
 * for await (const chunk of readableStreamToAsyncIterable(response.body)) {
 *   // process chunk
 * }
 * ```
 */
export async function* readableStreamToAsyncIterable<T = Uint8Array>(stream: {
  getReader: () => any;
}): AsyncGenerator<T, void, unknown> {
  const reader = stream.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result?.done) {
        return;
      }
      if (result?.value) {
        yield result.value as T;
      }
    }
  } finally {
    // Best-effort cleanup across environments.
    try {
      reader.releaseLock?.();
    } catch {
      // ignore
    }
  }
}
