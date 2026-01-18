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
