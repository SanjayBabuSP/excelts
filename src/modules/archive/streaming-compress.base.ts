/**
 * Shared types for true streaming compression.
 *
 * Kept in a dedicated base module so Node.js and browser implementations
 * don't depend on each other.
 */

export interface StreamCompressOptions {
  level?: number;
}

export type StreamCallback = (err?: Error | null) => void;

/**
 * Minimal cross-platform streaming codec surface.
 *
 * Both Node.js (zlib / stream.Transform) and browser implementations
 * support this subset.
 */
export interface StreamingCodec {
  on(event: "data", listener: (chunk: Uint8Array) => void): this;
  on(event: "end", listener: () => void): this;
  on(event: "error", listener: (err: Error) => void): this;
  on(event: string, listener: (...args: any[]) => void): this;

  once(event: "data", listener: (chunk: Uint8Array) => void): this;
  once(event: "end", listener: () => void): this;
  once(event: "error", listener: (err: Error) => void): this;
  once(event: string, listener: (...args: any[]) => void): this;

  off(event: "data", listener: (chunk: Uint8Array) => void): this;
  off(event: "end", listener: () => void): this;
  off(event: "error", listener: (err: Error) => void): this;
  off(event: string, listener: (...args: any[]) => void): this;

  write(chunk: Uint8Array, callback?: StreamCallback): boolean;
  end(callback?: StreamCallback): unknown;
  destroy(err?: Error): unknown;
}

export type DeflateStream = StreamingCodec;
export type InflateStream = StreamingCodec;

export function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
