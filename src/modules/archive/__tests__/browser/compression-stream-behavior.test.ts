/**
 * Test to verify the ACTUAL behavior of browser's CompressionStream
 * This determines if CompressionStream provides true streaming or buffers until close()
 */

import { describe, it, expect } from "vitest";

describe("CompressionStream Behavior Analysis", () => {
  it("should check if CompressionStream emits data progressively or only at close", async () => {
    const cs = new CompressionStream("deflate-raw");
    const writer = cs.writable.getWriter();
    const reader = cs.readable.getReader();

    const timeline: { event: string; chunksReceived: number; time: number }[] = [];
    let chunksReceived = 0;
    const startTime = performance.now();

    const log = (event: string) => {
      timeline.push({
        event,
        chunksReceived,
        time: Math.round(performance.now() - startTime)
      });
    };

    // Start reading in background
    const readPromise = (async () => {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          chunksReceived++;
        }
      }
    })();

    // Write 3 chunks of 3MB each (use random data - less compressible)
    const chunk = new Uint8Array(3 * 1024 * 1024);
    for (let i = 0; i < chunk.length; i += 65536) {
      const size = Math.min(65536, chunk.length - i);
      crypto.getRandomValues(chunk.subarray(i, i + size));
    }

    log("write chunk 1 start");
    await writer.write(chunk);
    log("write chunk 1 done");
    await new Promise(r => setTimeout(r, 100));
    log("after 100ms wait 1");

    log("write chunk 2 start");
    await writer.write(chunk);
    log("write chunk 2 done");
    await new Promise(r => setTimeout(r, 100));
    log("after 100ms wait 2");

    log("write chunk 3 start");
    await writer.write(chunk);
    log("write chunk 3 done");
    await new Promise(r => setTimeout(r, 100));
    log("after 100ms wait 3");

    const chunksBeforeClose = chunksReceived;
    log("close start");
    await writer.close();
    log("close done");
    await readPromise;
    log("read complete");

    // Print timeline
    console.log("\n=== CompressionStream Timeline ===");
    for (const entry of timeline) {
      console.log(`[${entry.time}ms] ${entry.event} (chunks: ${entry.chunksReceived})`);
    }
    console.log("=====================================\n");

    console.log(`Chunks received BEFORE close: ${chunksBeforeClose}`);
    console.log(`Chunks received AFTER close: ${chunksReceived - chunksBeforeClose}`);
    console.log(`Total chunks: ${chunksReceived}`);

    if (chunksBeforeClose > 0) {
      console.log("✅ CompressionStream IS truly streaming - emits data during writes");
    } else {
      console.log("❌ CompressionStream is NOT truly streaming - buffers until close()");
    }

    // The test should pass either way - we're just documenting behavior
    expect(chunksReceived).toBeGreaterThan(0);
  });

  it("should test with larger data to see if it flushes", async () => {
    const cs = new CompressionStream("deflate-raw");
    const writer = cs.writable.getWriter();
    const reader = cs.readable.getReader();

    let chunksBeforeClose = 0;
    let totalChunks = 0;

    // Start reading in background
    const readPromise = (async () => {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          totalChunks++;
        }
      }
    })();

    // Write larger chunks - 3MB each (random data - minimal compression)
    const chunk = new Uint8Array(3 * 1024 * 1024);
    for (let i = 0; i < chunk.length; i += 65536) {
      const size = Math.min(65536, chunk.length - i);
      crypto.getRandomValues(chunk.subarray(i, i + size));
    }

    await writer.write(chunk);
    await new Promise(r => setTimeout(r, 200));

    await writer.write(chunk);
    await new Promise(r => setTimeout(r, 200));

    await writer.write(chunk);
    await new Promise(r => setTimeout(r, 200));

    chunksBeforeClose = totalChunks;

    await writer.close();
    await readPromise;

    console.log(`\n=== Large Random Data Test ===`);
    console.log(`Chunks before close: ${chunksBeforeClose}`);
    console.log(`Total chunks: ${totalChunks}`);

    if (chunksBeforeClose > 0) {
      console.log("✅ Large data triggers flush during writes");
    } else {
      console.log("❌ Even large data is buffered until close()");
    }

    expect(totalChunks).toBeGreaterThan(0);
  });
});
