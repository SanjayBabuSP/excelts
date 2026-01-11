export type ArchiveSink =
  | WritableStream<Uint8Array>
  | {
      write(chunk: Uint8Array): any;
      end?(cb?: any): any;
      on?(event: string, listener: (...args: any[]) => void): any;
      once?(event: string, listener: (...args: any[]) => void): any;
    };

export function isWritableStream(value: unknown): value is WritableStream<Uint8Array> {
  return !!value && typeof value === "object" && typeof (value as any).getWriter === "function";
}

function once(emitter: any, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: any) => {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const onDone = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      emitter.off?.("error", onError);
      emitter.off?.(event, onDone);
      emitter.removeListener?.("error", onError);
      emitter.removeListener?.(event, onDone);
    };

    emitter.on?.("error", onError);
    emitter.on?.(event, onDone);
  });
}

export async function pipeIterableToSink(
  iterable: AsyncIterable<Uint8Array>,
  sink: ArchiveSink
): Promise<void> {
  if (isWritableStream(sink)) {
    const writer = sink.getWriter();
    try {
      for await (const chunk of iterable) {
        await writer.write(chunk);
      }
      await writer.close();
    } finally {
      try {
        writer.releaseLock();
      } catch {
        // Ignore
      }
    }
    return;
  }

  // Node-style Writable
  for await (const chunk of iterable) {
    const ok = sink.write(chunk);
    if (ok === false && typeof (sink as any).once === "function") {
      await once(sink, "drain");
    }
  }

  if (typeof sink.end === "function") {
    sink.end();
  }

  if (typeof sink.once === "function") {
    await Promise.race([once(sink, "finish"), once(sink, "close")]);
  }
}

export async function collect(iterable: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of iterable) {
    chunks.push(chunk);
    total += chunk.length;
  }
  if (chunks.length === 0) {
    return new Uint8Array(0);
  }
  if (chunks.length === 1) {
    return chunks[0]!;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
