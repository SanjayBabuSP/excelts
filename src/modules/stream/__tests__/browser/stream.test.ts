/**
 * Stream Module Browser Tests
 *
 * Imports and runs shared tests that are identical between Node.js and Browser.
 * Also includes Browser-specific tests that don't apply to Node.js environment.
 */

import { describe, it, expect } from "vitest";
import {
  EventEmitter,
  Readable,
  Writable,
  Transform,
  Duplex,
  BufferedStream,
  StringChunk,
  ByteChunk,
  ChunkedBuilder,
  TransactionalChunkedBuilder,
  PullStream,
  stringToUint8Array,
  uint8ArrayToString,
  uint8ArrayEquals,
  uint8ArrayIndexOf,
  concatUint8Arrays,
  createCollector,
  createDuplex,
  createEmptyReadable,
  createNullWritable,
  createReadableFromAsyncIterable,
  createReadableFromGenerator,
  createReadableFromPromise,
  isStream,
  isReadable,
  isWritable,
  isTransform,
  isDuplex,
  isDestroyed,
  isDisturbed,
  isErrored,
  createTransform,
  createReadableFromArray,
  pipeline,
  finished,
  streamToUint8Array,
  streamToString,
  drainStream,
  copyStream,
  addAbortSignal,
  compose,
  finishedAll,
  once,
  getDefaultHighWaterMark,
  setDefaultHighWaterMark,
  duplexPair,
  consumers,
  promises,
  promisify,
  createWritable,
  createPassThrough
} from "@stream";
import { runStreamTests, type StreamModuleImports } from "@stream/__tests__/stream.shared";

// =============================================================================
// Run Shared Tests (Identical behavior for Node.js and Browser)
// =============================================================================
describe("Stream Module - Shared Tests", () => {
  // Pass all imports to shared tests
  const imports: StreamModuleImports = {
    EventEmitter,
    Readable,
    Writable,
    Transform,
    Duplex,
    BufferedStream,
    PullStream,
    StringChunk,
    ByteChunk,
    ChunkedBuilder,
    TransactionalChunkedBuilder,
    createTransform,
    createCollector,
    createDuplex,
    createReadableFromArray,
    createReadableFromAsyncIterable,
    createReadableFromGenerator,
    createReadableFromPromise,
    createEmptyReadable,
    createNullWritable,
    duplexPair,
    pipeline,
    finished,
    streamToUint8Array,
    streamToString,
    drainStream,
    copyStream,
    concatUint8Arrays,
    addAbortSignal,
    compose,
    finishedAll,
    once,
    promisify,
    isReadable,
    isWritable,
    isTransform,
    isDuplex,
    isStream,
    isDestroyed,
    isDisturbed,
    isErrored,
    getDefaultHighWaterMark,
    setDefaultHighWaterMark,
    consumers,
    promises,
    stringToUint8Array,
    uint8ArrayToString,
    uint8ArrayEquals,
    uint8ArrayIndexOf
  };

  runStreamTests(imports);
});

// =============================================================================
// Browser-Specific Tests (Web Streams API specific behavior)
// =============================================================================
describe("Stream Module - Browser Specific", () => {
  describe("Readable (Web Streams)", () => {
    it("should create readable from options with read", async () => {
      const data = [1, 2, 3];
      let index = 0;

      const readable = new Readable({
        objectMode: true,
        read() {
          if (index < data.length) {
            this.push(data[index++]);
          } else {
            this.push(null);
          }
        }
      });

      const results: number[] = [];
      for await (const chunk of readable) {
        results.push(chunk);
      }

      expect(results).toEqual([1, 2, 3]);
    });

    it("should support unshift", () => {
      const readable = new Readable({
        objectMode: true,
        read() {}
      });

      readable.push(1);
      readable.push(2);
      readable.unshift(0);

      expect(readable.read()).toBe(0);
      expect(readable.read()).toBe(1);
      expect(readable.read()).toBe(2);
    });

    it("should support unpipe", () => {
      const readable = createReadableFromArray<number>([1, 2, 3], { objectMode: true });
      const writable = createNullWritable<number>({ objectMode: true });

      readable.pipe(writable);
      readable.unpipe(writable);

      // After unpipe, readableFlowing should be null or false
      expect(readable.readableFlowing === null || readable.readableFlowing === false).toBe(true);
    });

    it("should emit readable event", async () => {
      const readable = new Readable({
        objectMode: true,
        read() {}
      });

      const readablePromise = new Promise<void>(resolve => {
        readable.once("readable", resolve);
      });

      readable.push("data");

      await readablePromise;
      expect(readable.read()).toBe("data");
    });
  });

  describe("Writable (Web Streams)", () => {
    it("should create writable from options", async () => {
      const chunks: any[] = [];

      const writable = new Writable({
        objectMode: true,
        write(chunk, _encoding, callback) {
          chunks.push(chunk);
          callback();
        }
      });

      writable.write(1);
      writable.write(2);
      writable.end();

      await new Promise<void>(resolve => writable.on("finish", resolve));
      expect(chunks).toEqual([1, 2]);
    });

    it("should track writable state properties", () => {
      const writable = createNullWritable();

      expect(writable.writable).toBe(true);
      expect(typeof writable.writableHighWaterMark).toBe("number");
    });
  });

  describe("Transform (Web Streams)", () => {
    it("should create transform from options", async () => {
      const transform = new Transform({
        objectMode: true,
        transform(chunk, _encoding, callback) {
          this.push((chunk as number) * 2);
          callback();
        }
      });

      const results: number[] = [];
      transform.on("data", (n: number) => results.push(n));

      transform.write(1);
      transform.write(2);
      transform.end();

      await new Promise<void>(resolve => transform.on("finish", resolve));
      expect(results).toEqual([2, 4]);
    });
  });

  describe("Duplex (Web Streams)", () => {
    it("should create duplex from options", async () => {
      const duplex = new Duplex({
        objectMode: true,
        read() {},
        write(chunk: number, _encoding: string, callback: (error?: Error | null) => void) {
          this.push(chunk * 2);
          callback();
        },
        final(callback: (error?: Error | null) => void) {
          this.push(null);
          callback();
        }
      });

      const results: number[] = [];
      duplex.on("data", (n: number) => results.push(n));

      duplex.write(1);
      duplex.write(2);
      duplex.end();

      await new Promise<void>(resolve => duplex.on("finish", resolve));
      expect(results).toEqual([2, 4]);
    });
  });

  describe("PassThrough (Web Streams)", () => {
    it("should pass data through unchanged", async () => {
      const passThrough = createPassThrough<string>({ objectMode: true });
      const results: string[] = [];

      passThrough.on("data", (chunk: string) => results.push(chunk));

      passThrough.write("hello");
      passThrough.write("world");
      passThrough.end();

      await new Promise<void>(resolve => passThrough.on("finish", resolve));
      expect(results).toEqual(["hello", "world"]);
    });
  });

  describe("createWritable Helper", () => {
    it("should create writable stream with write function", async () => {
      const chunks: number[] = [];
      const writable = createWritable<number>({
        objectMode: true,
        write(chunk, _encoding, callback) {
          chunks.push(chunk);
          callback();
        }
      });

      writable.write(1);
      writable.write(2);
      writable.end();

      await new Promise<void>(resolve => writable.on("finish", resolve));
      expect(chunks).toEqual([1, 2]);
    });
  });

  describe("Stream Properties", () => {
    it("readable should have correct readable properties", () => {
      const readable = createReadableFromArray([1, 2], { objectMode: true });

      expect(readable.readable).toBe(true);
      expect(readable.readableObjectMode).toBe(true);
      expect(typeof readable.readableHighWaterMark).toBe("number");
    });

    it("writable should have correct writable properties", () => {
      const writable = createNullWritable();

      expect(writable.writable).toBe(true);
      expect(typeof writable.writableHighWaterMark).toBe("number");
    });

    it("transform should have both readable and writable properties", () => {
      const transform = createTransform<number, number>(n => n * 2, { objectMode: true });

      expect(transform.readable).toBe(true);
      expect(transform.writable).toBe(true);
    });
  });

  describe("Async Iterator Support", () => {
    it("readable should support for await...of", async () => {
      const readable = createReadableFromArray([1, 2, 3], { objectMode: true });
      const results: number[] = [];

      for await (const chunk of readable) {
        results.push(chunk as number);
      }

      expect(results).toEqual([1, 2, 3]);
    });

    it("transform should support for await...of", async () => {
      const transform = createTransform<number, number>(n => n * 2, { objectMode: true });

      transform.write(1);
      transform.write(2);
      transform.end();

      const results: number[] = [];
      for await (const chunk of transform) {
        results.push(chunk as number);
      }

      expect(results).toEqual([2, 4]);
    });
  });

  describe("Error Handling", () => {
    it("should emit error event on write failure", async () => {
      const writable = createWritable<string>({
        objectMode: true,
        write(_chunk, _encoding, callback) {
          callback(new Error("Write failed"));
        }
      });

      const errorPromise = new Promise<Error>(resolve => {
        writable.on("error", resolve);
      });

      writable.write("test");

      const error = await errorPromise;
      expect(error.message).toBe("Write failed");
    });

    it("should emit error event on transform failure", async () => {
      const transform = createTransform<string, string>(
        () => {
          throw new Error("Transform failed");
        },
        { objectMode: true }
      );

      const errorPromise = new Promise<Error>(resolve => {
        transform.on("error", resolve);
      });

      transform.write("test");

      const error = await errorPromise;
      expect(error.message).toBe("Transform failed");
    });

    it("should propagate errors through pipeline", async () => {
      const readable = createReadableFromArray(["test"], { objectMode: true });
      const transform = createTransform<string, string>(
        () => {
          throw new Error("Pipeline error");
        },
        { objectMode: true }
      );
      const collector = createCollector<string>();

      await expect(pipeline(readable, transform, collector)).rejects.toThrow("Pipeline error");
    });
  });

  describe("Backpressure", () => {
    it("should handle backpressure correctly", async () => {
      const readable = createReadableFromArray([1, 2, 3, 4, 5], { objectMode: true });
      const results: number[] = [];

      // Slow consumer
      const writable = createWritable<number>({
        objectMode: true,
        highWaterMark: 1,
        write(chunk, _encoding, callback) {
          results.push(chunk);
          setTimeout(callback, 1);
        }
      });

      await pipeline(readable, writable);
      expect(results).toEqual([1, 2, 3, 4, 5]);
    });
  });
});
