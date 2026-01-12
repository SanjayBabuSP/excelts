/**
 * Stream Utilities
 *
 * Small, cross-platform helpers built on top of the platform stream
 * implementation selected by `./streams` (Node.js or browser).
 */

import { consumers, createReadableFromArray, createTransform } from "@stream/streams";
import type { IReadable, ITransform } from "@stream/types";
import { stringToUint8Array as _stringToUint8Array } from "@stream/shared";

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
