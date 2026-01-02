/**
 * Stream Utilities
 *
 * Small, cross-platform helpers built on top of the platform stream
 * implementation selected by `./streams` (Node.js or browser).
 */

import { createReadableFromArray, createTransform } from "@stream/streams";
import type { IReadable, ITransform } from "@stream/types";
import {
  stringToUint8Array as _stringToUint8Array,
  uint8ArrayToString as _uint8ArrayToString
} from "@stream/shared";

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
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  for await (const chunk of stream) {
    chunks.push(chunk);
    totalLength += chunk.length;
  }
  if (chunks.length === 1) {
    return _uint8ArrayToString(chunks[0]);
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (let i = 0, len = chunks.length; i < len; i++) {
    const c = chunks[i];
    result.set(c, offset);
    offset += c.length;
  }
  return _uint8ArrayToString(result);
}

export async function json<T = unknown>(stream: {
  [Symbol.asyncIterator](): AsyncIterator<Uint8Array>;
}): Promise<T> {
  const str = await text(stream);
  return JSON.parse(str) as T;
}

export async function bytes(stream: {
  [Symbol.asyncIterator](): AsyncIterator<Uint8Array>;
}): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  for await (const chunk of stream) {
    chunks.push(chunk);
    totalLength += chunk.length;
  }
  if (chunks.length === 1) {
    return chunks[0];
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (let i = 0, len = chunks.length; i < len; i++) {
    const c = chunks[i];
    result.set(c, offset);
    offset += c.length;
  }
  return result;
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
