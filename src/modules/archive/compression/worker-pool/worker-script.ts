/**
 * Inline Worker Script Generator
 *
 * Generates the worker script code that handles compression/decompression tasks.
 * Uses native CompressionStream/DecompressionStream when available,
 * falls back to a pure JS implementation message protocol.
 */

/**
 * Generate the inline worker script code
 *
 * The worker supports:
 * - deflate: Compress data using deflate-raw
 * - inflate: Decompress data using deflate-raw
 *
 * It uses native Web Streams API when available, which is significantly faster
 * than any pure JS implementation.
 */
export function generateWorkerScript(): string {
  return `
'use strict';

// Check deflate-raw support once at startup
const hasDeflateRaw = (() => {
  try {
    new CompressionStream('deflate-raw');
    new DecompressionStream('deflate-raw');
    return true;
  } catch {
    return false;
  }
})();

/**
 * Process data through a TransformStream (compress or decompress)
 */
async function processWithStream(stream, data) {
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();

  // Start reading output
  const chunks = [];
  const readPromise = (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  })();

  // Write input and close
  await writer.write(data);
  await writer.close();

  // Wait for all output
  await readPromise;

  // Fast path for common cases
  if (chunks.length === 0) return new Uint8Array(0);
  if (chunks.length === 1) return chunks[0];

  // Pre-calculate total length and allocate once
  const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Streaming sessions keyed by taskId.
 * Each session keeps a transform stream open and produces output chunks as they are available.
 */
const streamingSessions = new Map();

function closeSession(taskId) {
  const session = streamingSessions.get(taskId);
  if (!session) return;
  streamingSessions.delete(taskId);
  try {
    if (session.reader) {
      session.reader.cancel();
    }
  } catch {
    // ignore
  }
  try {
    if (session.writer) {
      session.writer.abort();
    }
  } catch {
    // ignore
  }
}

// Signal ready
self.postMessage({ type: 'ready' });

/**
 * Handle incoming messages
 */
self.onmessage = async function(event) {
  const msg = event.data;

  if (!msg || typeof msg.type !== 'string') {
    return;
  }

  // Handle termination request
  if (msg.type === 'terminate') {
    self.close();
    return;
  }

  // Streaming: start
  if (msg.type === 'start') {
    const { taskId, taskType, level } = msg;
    const startTime = performance.now();
    try {
      if (!hasDeflateRaw) {
        throw new Error('deflate-raw not supported in this worker');
      }
      if (typeof taskId !== 'number') {
        throw new Error('Invalid taskId');
      }
      if (streamingSessions.has(taskId)) {
        throw new Error('Streaming task already started');
      }

      const stream = taskType === 'deflate'
        ? new CompressionStream('deflate-raw')
        : taskType === 'inflate'
          ? new DecompressionStream('deflate-raw')
          : null;
      if (!stream) {
        throw new Error('Unknown task type: ' + taskType);
      }

      // Note: CompressionStream does not expose compression level.
      // We keep level for API shape parity (ignored in worker).
      void level;

      const writer = stream.writable.getWriter();
      const reader = stream.readable.getReader();

      const session = {
        writer,
        reader,
        startTime,
        closed: false,
        readLoop: null
      };

      session.readLoop = (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              self.postMessage({ type: 'out', taskId, data: value }, [value.buffer]);
            }
          }
        } catch (err) {
          // Reader failures will be handled by chunk/end paths too.
        }
      })();

      streamingSessions.set(taskId, session);
      self.postMessage({ type: 'started', taskId });
      return;
    } catch (err) {
      self.postMessage({
        type: 'error',
        taskId,
        error: err?.message || String(err),
        duration: performance.now() - startTime
      });
      closeSession(taskId);
      return;
    }
  }

  // Streaming: chunk
  if (msg.type === 'chunk') {
    const { taskId, data } = msg;
    const session = streamingSessions.get(taskId);
    if (!session || session.closed) {
      // If the session is gone, ignore.
      return;
    }
    try {
      await session.writer.write(data);
      self.postMessage({ type: 'ack', taskId });
    } catch (err) {
      self.postMessage({
        type: 'error',
        taskId,
        error: err?.message || String(err),
        duration: performance.now() - session.startTime
      });
      session.closed = true;
      closeSession(taskId);
    }
    return;
  }

  // Streaming: end
  if (msg.type === 'end') {
    const { taskId } = msg;
    const session = streamingSessions.get(taskId);
    if (!session || session.closed) {
      return;
    }
    session.closed = true;
    try {
      await session.writer.close();
      if (session.readLoop) {
        await session.readLoop;
      }
      self.postMessage({
        type: 'done',
        taskId,
        duration: performance.now() - session.startTime
      });
    } catch (err) {
      self.postMessage({
        type: 'error',
        taskId,
        error: err?.message || String(err),
        duration: performance.now() - session.startTime
      });
    } finally {
      closeSession(taskId);
    }
    return;
  }

  // Streaming: abort
  if (msg.type === 'abort') {
    const { taskId } = msg;
    const session = streamingSessions.get(taskId);
    if (!session) {
      return;
    }
    session.closed = true;
    closeSession(taskId);
    self.postMessage({
      type: 'error',
      taskId,
      error: msg.error || 'aborted',
      duration: performance.now() - session.startTime
    });
    return;
  }

  // Handle task request
  if (msg.type === 'task') {
    const { taskId, taskType, data } = msg;
    const startTime = performance.now();

    try {
      if (!hasDeflateRaw) {
        throw new Error('deflate-raw not supported in this worker');
      }

      let result;
      if (taskType === 'deflate') {
        result = await processWithStream(new CompressionStream('deflate-raw'), data);
      } else if (taskType === 'inflate') {
        result = await processWithStream(new DecompressionStream('deflate-raw'), data);
      } else {
        throw new Error('Unknown task type: ' + taskType);
      }

      const duration = performance.now() - startTime;

      // Transfer the result buffer for zero-copy
      self.postMessage(
        { type: 'result', taskId, data: result, duration },
        [result.buffer]
      );
    } catch (err) {
      self.postMessage({
        type: 'error',
        taskId,
        error: err?.message || String(err),
        duration: performance.now() - startTime
      });
    }
  }
};
`;
}

// Cache the worker URL with reference counting
let _workerBlobUrl: string | null = null;
let _workerBlobUrlRefCount = 0;

/**
 * Get or create the worker blob URL (increments reference count)
 */
export function getWorkerBlobUrl(): string {
  if (_workerBlobUrl === null) {
    const script = generateWorkerScript();
    const blob = new Blob([script], { type: "text/javascript" });
    _workerBlobUrl = URL.createObjectURL(blob);
  }
  _workerBlobUrlRefCount++;
  return _workerBlobUrl;
}

/**
 * Release the cached worker blob URL (decrements reference count)
 */
export function releaseWorkerBlobUrl(): void {
  if (_workerBlobUrl !== null && --_workerBlobUrlRefCount <= 0) {
    try {
      URL.revokeObjectURL(_workerBlobUrl);
    } catch {
      // Ignore errors during cleanup
    }
    _workerBlobUrl = null;
    _workerBlobUrlRefCount = 0;
  }
}
