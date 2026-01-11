import { encodeUtf8 } from "@archive/utils/text";

export type ArchiveSource =
  | Uint8Array
  | ArrayBuffer
  | string
  | Blob
  | AsyncIterable<unknown>
  | ReadableStream<unknown>
  | { [Symbol.asyncIterator](): AsyncIterator<unknown> };

export function isReadableStream(value: unknown): value is ReadableStream<unknown> {
  return !!value && typeof value === "object" && typeof (value as any).getReader === "function";
}

export function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    !!value &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as any)[Symbol.asyncIterator] === "function"
  );
}

function normalizeChunk(value: unknown): Uint8Array | null {
  if (!value) {
    return null;
  }

  if (value instanceof Uint8Array) {
    return value.length ? value : null;
  }

  if (typeof value === "string") {
    const bytes = encodeUtf8(value);
    return bytes.length ? bytes : null;
  }

  if (value instanceof ArrayBuffer) {
    return value.byteLength ? new Uint8Array(value) : null;
  }

  if (ArrayBuffer.isView(value)) {
    return value.byteLength
      ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
      : null;
  }

  // Best-effort: treat unknown chunk as Uint8Array-like.
  if (typeof (value as any).length === "number" && (value as any).length) {
    return value as any as Uint8Array;
  }

  return null;
}

export function toUint8ArraySync(source: Uint8Array | ArrayBuffer | string): Uint8Array {
  if (source instanceof Uint8Array) {
    return source;
  }
  if (typeof source === "string") {
    return encodeUtf8(source);
  }
  return new Uint8Array(source);
}

export async function toUint8Array(
  source: Uint8Array | ArrayBuffer | string | Blob
): Promise<Uint8Array> {
  if (source instanceof Uint8Array) {
    return source;
  }
  if (typeof source === "string") {
    return encodeUtf8(source);
  }
  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source);
  }
  const buf = await source.arrayBuffer();
  return new Uint8Array(buf);
}

export async function* toAsyncIterable(source: ArchiveSource): AsyncIterable<Uint8Array> {
  if (source instanceof Uint8Array) {
    yield source;
    return;
  }
  if (typeof source === "string") {
    yield encodeUtf8(source);
    return;
  }
  if (source instanceof ArrayBuffer) {
    yield new Uint8Array(source);
    return;
  }
  if (typeof Blob !== "undefined" && source instanceof Blob) {
    yield await toUint8Array(source);
    return;
  }

  if (isReadableStream(source)) {
    const reader = source.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          return;
        }

        const chunk = normalizeChunk(value);
        if (chunk) {
          yield chunk;
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // Ignore
      }
    }
  }

  if (isAsyncIterable(source)) {
    for await (const value of source) {
      const chunk = normalizeChunk(value);
      if (chunk) {
        yield chunk;
      }
    }
    return;
  }

  throw new Error("Unsupported archive source");
}
