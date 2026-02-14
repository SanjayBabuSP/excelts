/**
 * Stream Module - Common Consumers Factory
 *
 * Creates platform-neutral stream consumers given platform-specific converters.
 * Used by both Node.js and browser implementations.
 */

// =============================================================================
// Types
// =============================================================================

type StreamInput = AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>;

export interface StreamConsumers {
  arrayBuffer(stream: StreamInput): Promise<ArrayBuffer>;
  blob(stream: StreamInput, options?: BlobPropertyBag): Promise<Blob>;
  buffer(stream: StreamInput): Promise<Uint8Array>;
  json(stream: StreamInput): Promise<unknown>;
  text(stream: StreamInput, encoding?: string): Promise<string>;
}

export interface StreamConverters {
  streamToUint8Array(stream: StreamInput): Promise<Uint8Array>;
  streamToString(stream: StreamInput, encoding?: string): Promise<string>;
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a `consumers` object bound to platform-specific stream converters.
 *
 * Both Node.js and browser implementations delegate to their own
 * `streamToUint8Array` / `streamToString`; everything else is identical.
 */
export function createConsumers(converters: StreamConverters): StreamConsumers {
  const { streamToUint8Array, streamToString } = converters;

  return {
    async arrayBuffer(stream: StreamInput): Promise<ArrayBuffer> {
      const bytes = await streamToUint8Array(stream);
      if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
        return bytes.buffer as ArrayBuffer;
      }
      return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer;
    },

    async blob(stream: StreamInput, options?: BlobPropertyBag): Promise<Blob> {
      const bytes = await streamToUint8Array(stream);
      return new Blob([bytes as BlobPart], options);
    },

    async buffer(stream: StreamInput): Promise<Uint8Array> {
      return streamToUint8Array(stream);
    },

    async json(stream: StreamInput): Promise<unknown> {
      const text = await streamToString(stream);
      return JSON.parse(text);
    },

    async text(stream: StreamInput, encoding?: string): Promise<string> {
      return streamToString(stream, encoding);
    }
  };
}
