/**
 * Async CSV Parser
 *
 * Provides async CSV parsing supporting:
 * - String input (delegates to sync parser)
 * - AsyncIterable<string|Uint8Array> inputs
 *
 * Notes:
 * - parseCsvAsync() returns a full result and may buffer the entire input.
 * - parseCsvStream() is a true streaming async generator that yields rows
 *   as the underlying stream parser emits them.
 */

import type {
  CsvParseOptions,
  CsvParseResult,
  CsvParseMeta,
  CsvParseError,
  RecordWithInfo
} from "./types";
import { parseCsv } from "./parse";
import { CsvParserStream } from "./csv-stream";

type ReadableStreamLike = { getReader: () => any };
type AsyncInput = AsyncIterable<string | Uint8Array>;
type AnyAsyncInput = AsyncInput | ReadableStreamLike;

function isAsyncIterable(value: unknown): value is AsyncInput {
  return Boolean(value && typeof (value as any)[Symbol.asyncIterator] === "function");
}

function isReadableStreamLike(value: unknown): value is ReadableStreamLike {
  return Boolean(value && typeof (value as any).getReader === "function");
}

async function* readableStreamToAsyncIterable(
  stream: ReadableStreamLike
): AsyncGenerator<Uint8Array, void, unknown> {
  const reader = stream.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result?.done) {
        return;
      }
      if (result?.value) {
        yield result.value as Uint8Array;
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

function normalizeAsyncInput(input: unknown): AsyncInput {
  if (isAsyncIterable(input)) {
    return input;
  }
  if (isReadableStreamLike(input)) {
    return readableStreamToAsyncIterable(input);
  }
  throw new TypeError("input must be an AsyncIterable or a ReadableStream");
}

/**
 * Convert AsyncIterable<string|Uint8Array> to a complete string.
 * This buffers the entire input in memory.
 */
async function collectAsyncInput(
  input: AsyncIterable<string | Uint8Array>,
  options: CsvParseOptions
): Promise<string> {
  const chunks: string[] = [];
  const decoder = new TextDecoder(options.encoding || "utf-8");

  for await (const chunk of input) {
    if (typeof chunk === "string") {
      chunks.push(chunk);
    } else {
      chunks.push(decoder.decode(chunk, { stream: true }));
    }
  }

  // Flush decoder
  const final = decoder.decode();
  if (final) {
    chunks.push(final);
  }

  return chunks.join("");
}

/**
 * Parse CSV asynchronously.
 *
 * For string input, this simply wraps the sync parser.
 * For AsyncIterable input (streams), collects chunks and parses.
 *
 * @example
 * ```ts
 * // From string
 * const result = await parseCsvAsync("a,b\n1,2", { headers: true });
 *
 * // From fetch response
 * const response = await fetch("data.csv");
 * const result = await parseCsvAsync(response.body, { headers: true });
 *
 * // From file stream (Node.js)
 * import { createReadStream } from "fs";
 * const result = await parseCsvAsync(createReadStream("data.csv"), { headers: true });
 * ```
 */
export async function parseCsvAsync(
  input: string | AnyAsyncInput,
  options: CsvParseOptions = {}
): Promise<
  | string[][]
  | CsvParseResult<Record<string, string>>
  | CsvParseResult<Record<string, unknown>>
  | CsvParseResult<RecordWithInfo<Record<string, unknown>>>
  | CsvParseResult<RecordWithInfo<string[]>>
> {
  // If input is a string, use sync parser directly
  if (typeof input === "string") {
    return parseCsv(input, options);
  }

  const asyncInput = normalizeAsyncInput(input);

  // For AsyncIterable, collect all chunks and parse
  const content = await collectAsyncInput(asyncInput, options);
  return parseCsv(content, options);
}

/**
 * Parse CSV as an async generator, yielding rows as they are parsed.
 * This is the true streaming version that yields rows one at a time.
 *
 * @example
 * ```ts
 * // Process large file row by row
 * for await (const row of parseCsvStream(fileStream, { headers: true })) {
 *   console.log(row);
 * }
 *
 * // With validation
 * for await (const row of parseCsvStream(input, {
 *   headers: true,
 *   validate: (row) => row.id !== ""
 * })) {
 *   // Only valid rows
 * }
 * ```
 */
export async function* parseCsvStream(
  input: string | AnyAsyncInput,
  options: CsvParseOptions = {}
): AsyncGenerator<
  | Record<string, unknown>
  | string[]
  | RecordWithInfo<Record<string, unknown>>
  | RecordWithInfo<string[]>,
  void,
  unknown
> {
  // objname produces a map output in the sync parser, which cannot be produced
  // in a true streaming fashion. Fall back to buffered parsing.
  if (options.objname) {
    const content =
      typeof input === "string" ? input : await collectAsyncInput(normalizeAsyncInput(input), options);

    const result = parseCsv(content, options);

    if (Array.isArray(result)) {
      for (const row of result) {
        yield row;
      }
      return;
    }

    const rowsValue = (result as CsvParseResult<any>).rows;
    if (Array.isArray(rowsValue)) {
      for (const row of rowsValue) {
        yield row;
      }
      return;
    }

    if (rowsValue && typeof rowsValue === "object") {
      for (const row of Object.values(rowsValue)) {
        yield row as any;
      }
    }
    return;
  }

  const parser = new CsvParserStream(options);

  type StreamEvent =
    | { type: "data"; value: any }
    | { type: "end" }
    | { type: "error"; error: unknown };

  const queue: StreamEvent[] = [];
  let pendingResolve: ((ev: StreamEvent) => void) | null = null;
  let ended = false;
  let streamError: unknown = null;
  let aborted = false;

  const pushEvent = (ev: StreamEvent): void => {
    if (pendingResolve) {
      const resolve = pendingResolve;
      pendingResolve = null;
      resolve(ev);
      return;
    }
    queue.push(ev);
  };

  const onData = (value: any): void => {
    pushEvent({ type: "data", value });
  };
  const onEnd = (): void => {
    ended = true;
    pushEvent({ type: "end" });
  };
  const onError = (error: unknown): void => {
    streamError = error;
    pushEvent({ type: "error", error });
  };

  parser.on("data", onData);
  parser.once("end", onEnd);
  parser.once("error", onError);

  const writePromise = (async (): Promise<void> => {
    try {
      if (typeof input === "string") {
        parser.end(input);
        return;
      }

      const asyncInput = normalizeAsyncInput(input);

      for await (const chunk of asyncInput) {
        if (aborted) {
          break;
        }
        parser.write(chunk as any);
      }

      if (!aborted) {
        parser.end();
      } else {
        parser.destroy();
      }
    } catch (e) {
      parser.destroy(e as Error);
    }
  })();

  try {
    while (true) {
      if (queue.length > 0) {
        const ev = queue.shift()!;
        if (ev.type === "data") {
          yield ev.value;
          continue;
        }
        if (ev.type === "error") {
          throw ev.error;
        }
        // end
        break;
      }

      if (streamError) {
        throw streamError;
      }
      if (ended) {
        break;
      }

      const ev = await new Promise<StreamEvent>(resolve => {
        pendingResolve = resolve;
      });

      if (ev.type === "data") {
        yield ev.value;
      } else if (ev.type === "error") {
        throw ev.error;
      } else {
        break;
      }
    }
  } finally {
    aborted = true;
    // Ensure stream stops as soon as possible.
    parser.destroy();
    parser.off("data", onData);
    parser.off("end", onEnd);
    parser.off("error", onError);
    // Avoid unhandled rejections from the writer task.
    await writePromise.catch(() => undefined);
  }
}

/**
 * Interface for streaming parse metadata
 */
export interface StreamParseMeta extends CsvParseMeta {
  /** Errors encountered during streaming parse */
  errors?: CsvParseError[];
  /** Invalid rows (if validation was used) */
  invalidRows?: Array<{ row: string[]; reason: string }>;
}

/**
 * Parse CSV with progress callback for large files.
 *
 * @param input - CSV string or async iterable
 * @param options - Parse options
 * @param onProgress - Called periodically with progress info
 */
export async function parseCsvWithProgress<T = Record<string, unknown>>(
  input: string | AnyAsyncInput,
  options: CsvParseOptions = {},
  onProgress?: (info: { rowsProcessed: number; bytesProcessed?: number }) => void
): Promise<CsvParseResult<T>> {
  // Collect input and track bytes
  let content: string;
  let totalBytes = 0;

  if (typeof input === "string") {
    content = input;
    totalBytes = new TextEncoder().encode(content).length;
  } else {
    const chunks: string[] = [];
    const decoder = new TextDecoder(options.encoding || "utf-8");

    const asyncInput = normalizeAsyncInput(input);

    for await (const chunk of asyncInput) {
      if (typeof chunk === "string") {
        chunks.push(chunk);
        totalBytes += new TextEncoder().encode(chunk).length;
      } else {
        chunks.push(decoder.decode(chunk, { stream: true }));
        totalBytes += chunk.length;
      }

      // Report progress during collection
      if (onProgress) {
        onProgress({ rowsProcessed: 0, bytesProcessed: totalBytes });
      }
    }

    const final = decoder.decode();
    if (final) {
      chunks.push(final);
    }

    content = chunks.join("");
  }

  // Parse
  const result = parseCsv(content, options);

  // Report final progress
  if (onProgress) {
    const rowCount = Array.isArray(result)
      ? result.length
      : ((result as CsvParseResult<T>).rows?.length ?? 0);
    onProgress({ rowsProcessed: rowCount, bytesProcessed: totalBytes });
  }

  return result as CsvParseResult<T>;
}
