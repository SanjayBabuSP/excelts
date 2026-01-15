import { encodeUtf8 } from "@archive/utils/text";
import { isAsyncIterable, isReadableStream } from "@stream/internal/type-guards";
import { createAbortError } from "@archive/utils/abort";

export type ArchiveSource =
  | Uint8Array
  | ArrayBuffer
  | string
  | Blob
  | AsyncIterable<unknown>
  | ReadableStream<unknown>
  | { [Symbol.asyncIterator](): AsyncIterator<unknown> };

export function isInMemoryArchiveSource(
  source: ArchiveSource
): source is Uint8Array | ArrayBuffer | string | Blob {
  return (
    source instanceof Uint8Array ||
    source instanceof ArrayBuffer ||
    typeof source === "string" ||
    (typeof Blob !== "undefined" && source instanceof Blob)
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

export async function* toAsyncIterable(
  source: ArchiveSource,
  options: { signal?: AbortSignal; onChunk?: (chunk: Uint8Array) => void } = {}
): AsyncIterable<Uint8Array> {
  const { signal, onChunk } = options;

  const checkAborted = (): void => {
    if (signal?.aborted) {
      throw createAbortError((signal as any).reason);
    }
  };

  checkAborted();

  if (source instanceof Uint8Array) {
    if (onChunk) {
      onChunk(source);
    }
    yield source;
    return;
  }
  if (typeof source === "string") {
    const bytes = encodeUtf8(source);
    if (onChunk) {
      onChunk(bytes);
    }
    yield bytes;
    return;
  }
  if (source instanceof ArrayBuffer) {
    const bytes = new Uint8Array(source);
    if (onChunk) {
      onChunk(bytes);
    }
    yield bytes;
    return;
  }
  if (typeof Blob !== "undefined" && source instanceof Blob) {
    const bytes = await toUint8Array(source);
    checkAborted();
    if (onChunk) {
      onChunk(bytes);
    }
    yield bytes;
    return;
  }

  if (isReadableStream(source)) {
    const reader = source.getReader();

    let aborted = false;
    const onAbort = () => {
      aborted = true;
      try {
        reader.cancel();
      } catch {
        // ignore
      }
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    try {
      while (true) {
        if (aborted) {
          throw createAbortError((signal as any).reason);
        }
        checkAborted();
        const { done, value } = await reader.read();
        if (done) {
          return;
        }

        const chunk = normalizeChunk(value);
        if (chunk) {
          if (aborted) {
            throw createAbortError((signal as any).reason);
          }
          checkAborted();
          if (onChunk) {
            onChunk(chunk);
          }
          yield chunk;
        }
      }
    } finally {
      if (signal) {
        try {
          signal.removeEventListener("abort", onAbort);
        } catch {
          // ignore
        }
      }
      try {
        reader.releaseLock();
      } catch {
        // Ignore
      }
    }
  }

  if (isAsyncIterable(source)) {
    for await (const value of source) {
      checkAborted();
      const chunk = normalizeChunk(value);
      if (chunk) {
        if (onChunk) {
          onChunk(chunk);
        }
        yield chunk;
      }
    }
    return;
  }

  throw new Error("Unsupported archive source");
}
