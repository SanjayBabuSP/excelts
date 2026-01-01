/**
 * Stream Module Extended Tests
 *
 * Additional tests for stream utilities covering more edge cases
 * and advanced functionality.
 */

import { describe, it, expect } from "vitest";
import {
  EventEmitter,
  createWritable,
  createTransform,
  createCollector,
  createPassThrough,
  createReadableFromArray,
  createReadableFromAsyncIterable,
  createReadableFromGenerator,
  createReadableFromPromise,
  createEmptyReadable,
  createNullWritable,
  pipeline,
  finished,
  streamToUint8Array,
  streamToString,
  drainStream,
  copyStream,
  concatUint8Arrays,
  addAbortSignal,
  finishedAll,
  once,
  isReadable,
  isWritable,
  isTransform,
  isDuplex,
  isStream,
  isDestroyed,
  getDefaultHighWaterMark,
  setDefaultHighWaterMark,
  stringToUint8Array,
  uint8ArrayToString,
  uint8ArrayEquals,
  uint8ArrayIndexOf
} from "../index";

describe("Stream Extended Tests", () => {
  // ==========================================================================
  // Readable Stream Tests
  // ==========================================================================
  describe("Readable Streams", () => {
    it("should support async iteration", async () => {
      const readable = createReadableFromArray([1, 2, 3], { objectMode: true });
      const results: number[] = [];

      for await (const chunk of readable) {
        results.push(chunk as number);
      }

      expect(results).toEqual([1, 2, 3]);
    });

    it("should handle destroy()", async () => {
      const readable = createReadableFromArray([1, 2, 3], { objectMode: true });

      const closePromise = new Promise<void>(resolve => {
        readable.on("close", resolve);
      });

      readable.destroy();
      await closePromise;

      expect(readable.destroyed).toBe(true);
    });

    it("should handle destroy() with error", async () => {
      const readable = createReadableFromArray([1, 2, 3], { objectMode: true });
      const testError = new Error("Test destroy error");

      const errorPromise = new Promise<Error>(resolve => {
        readable.on("error", resolve);
      });

      readable.destroy(testError);
      const error = await errorPromise;

      expect(error.message).toBe("Test destroy error");
      expect(readable.destroyed).toBe(true);
    });
  });

  // ==========================================================================
  // Writable Stream Tests
  // ==========================================================================
  describe("Writable Streams", () => {
    it("should receive written data", async () => {
      const chunks: string[] = [];
      const writable = createWritable<string>({
        objectMode: true,
        write(chunk, _encoding, callback) {
          chunks.push(chunk);
          callback();
        }
      });

      const finishPromise = new Promise<void>(resolve => {
        writable.on("finish", resolve);
      });

      writable.write("hello");
      writable.write("world");
      writable.end();

      await finishPromise;
      expect(chunks).toEqual(["hello", "world"]);
    });

    it("should emit finish event when ended", async () => {
      const writable = createNullWritable();

      const finishPromise = new Promise<boolean>(resolve => {
        writable.on("finish", () => resolve(true));
      });

      writable.end();
      const didFinish = await finishPromise;

      expect(didFinish).toBe(true);
    });
  });

  // ==========================================================================
  // PassThrough Stream Tests
  // ==========================================================================
  describe("PassThrough Streams", () => {
    it("should pass data through unchanged", async () => {
      const passThrough = createPassThrough({ objectMode: true });
      const results: string[] = [];

      const finishPromise = new Promise<void>(resolve => {
        passThrough.on("data", (chunk: string) => results.push(chunk));
        passThrough.on("finish", resolve);
      });

      passThrough.write("hello");
      passThrough.write("world");
      passThrough.end();

      await finishPromise;
      expect(results).toEqual(["hello", "world"]);
    });

    it("should work in binary mode", async () => {
      const passThrough = createPassThrough();
      const results: Uint8Array[] = [];

      const finishPromise = new Promise<void>(resolve => {
        passThrough.on("data", (chunk: Uint8Array) => results.push(chunk));
        passThrough.on("finish", resolve);
      });

      passThrough.write(stringToUint8Array("test"));
      passThrough.end();

      await finishPromise;
      expect(results.length).toBe(1);
    });
  });

  // ==========================================================================
  // Pipeline Tests
  // ==========================================================================
  describe("Pipeline", () => {
    it("should pipe streams together", async () => {
      const source = createReadableFromArray(["hello", "world"], { objectMode: true });
      const transform = createTransform<string, string>(s => s.toUpperCase(), { objectMode: true });
      const collector = createCollector<string>();

      await pipeline(source, transform, collector);

      expect(collector.chunks).toEqual(["HELLO", "WORLD"]);
    });

    it("should handle binary pipeline", async () => {
      const source = createReadableFromArray([stringToUint8Array("test")]);
      const passThrough = createPassThrough();
      const collector = createCollector<Uint8Array>();

      await pipeline(source, passThrough, collector);

      expect(collector.chunks.length).toBe(1);
    });

    it("should propagate errors", async () => {
      const source = createReadableFromArray(["test"], { objectMode: true });
      const transform = createTransform<string, string>(
        () => {
          throw new Error("Pipeline error");
        },
        { objectMode: true }
      );
      const collector = createCollector<string>();

      await expect(pipeline(source, transform, collector)).rejects.toThrow("Pipeline error");
    });
  });

  // ==========================================================================
  // Finished Tests
  // ==========================================================================
  describe("Finished", () => {
    it("should resolve when stream finishes", async () => {
      const writable = createNullWritable();

      const finishPromise = finished(writable);
      writable.end();

      await expect(finishPromise).resolves.toBeUndefined();
    });

    it("should resolve when readable ends", async () => {
      const readable = createEmptyReadable();

      const endPromise = finished(readable);
      readable.resume();

      await expect(endPromise).resolves.toBeUndefined();
    });
  });

  // ==========================================================================
  // Stream Utility Functions Tests
  // ==========================================================================
  describe("Stream Utilities", () => {
    it("streamToUint8Array should collect stream into Uint8Array", async () => {
      const readable = createReadableFromArray([
        stringToUint8Array("Hello"),
        stringToUint8Array(" World")
      ]);

      const result = await streamToUint8Array(readable);
      expect(uint8ArrayToString(result)).toBe("Hello World");
    });

    it("streamToString should collect stream into string", async () => {
      const readable = createReadableFromArray([
        stringToUint8Array("Hello"),
        stringToUint8Array(" World")
      ]);

      const result = await streamToString(readable);
      expect(result).toBe("Hello World");
    });

    it("drainStream should consume all data from stream", async () => {
      const readable = createReadableFromArray([1, 2, 3], { objectMode: true });

      await drainStream(readable);

      // Stream should be fully consumed
      expect(readable.destroyed || readable.readableEnded).toBe(true);
    });

    it("copyStream should copy data from source to destination", async () => {
      const source = createReadableFromArray([stringToUint8Array("test")]);
      const collector = createCollector<Uint8Array>();

      await copyStream(source, collector);

      expect(collector.chunks.length).toBe(1);
    });

    it("concatUint8Arrays should concatenate empty array", () => {
      const result = concatUint8Arrays([]);
      expect(result).toEqual(new Uint8Array(0));
    });

    it("concatUint8Arrays should return single array unchanged", () => {
      const arr = new Uint8Array([1, 2, 3]);
      const result = concatUint8Arrays([arr]);
      expect(result).toEqual(arr);
    });

    it("concatUint8Arrays should concatenate multiple arrays", () => {
      const a = new Uint8Array([1, 2]);
      const b = new Uint8Array([3, 4]);
      const c = new Uint8Array([5]);

      const result = concatUint8Arrays([a, b, c]);
      expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    });
  });

  // ==========================================================================
  // Factory Functions Tests
  // ==========================================================================
  describe("Factory Functions", () => {
    it("createReadableFromAsyncIterable should create readable from async iterable", async () => {
      async function* generate(): AsyncGenerator<number> {
        yield 1;
        yield 2;
        yield 3;
      }

      const readable = createReadableFromAsyncIterable(generate(), { objectMode: true });
      const results: number[] = [];

      for await (const chunk of readable) {
        results.push(chunk as number);
      }

      expect(results).toEqual([1, 2, 3]);
    });

    it("createReadableFromGenerator should create readable from generator function", async () => {
      const readable = createReadableFromGenerator(
        async function* () {
          yield "a";
          yield "b";
        },
        { objectMode: true }
      );

      const results: string[] = [];
      for await (const chunk of readable) {
        results.push(chunk as string);
      }

      expect(results).toEqual(["a", "b"]);
    });

    it("createReadableFromPromise should create readable from promise", async () => {
      const readable = createReadableFromPromise(Promise.resolve("test"), { objectMode: true });

      const results: string[] = [];
      for await (const chunk of readable) {
        results.push(chunk as string);
      }

      expect(results).toEqual(["test"]);
    });

    it("createReadableFromPromise should handle rejected promise", async () => {
      const readable = createReadableFromPromise(Promise.reject(new Error("Promise error")), {
        objectMode: true
      });

      const errorPromise = new Promise<Error>(resolve => {
        readable.on("error", resolve);
      });

      const error = await errorPromise;
      expect(error.message).toBe("Promise error");
    });

    it("createEmptyReadable should create stream that immediately ends", async () => {
      const readable = createEmptyReadable();
      const results: unknown[] = [];

      for await (const chunk of readable) {
        results.push(chunk);
      }

      expect(results).toEqual([]);
    });

    it("createNullWritable should discard all data", async () => {
      const writable = createNullWritable();

      const finishPromise = new Promise<void>(resolve => {
        writable.on("finish", resolve);
      });

      writable.write("test");
      writable.write(new Uint8Array([1, 2, 3]));
      writable.end();

      await finishPromise;
      expect(writable.writableFinished).toBe(true);
    });
  });

  // ==========================================================================
  // Type Guards Tests
  // ==========================================================================
  describe("Type Guards", () => {
    it("isReadable should return true for Readable", () => {
      const readable = createReadableFromArray([1]);
      expect(isReadable(readable)).toBe(true);
    });

    it("isReadable should return false for non-readable", () => {
      expect(isReadable({})).toBe(false);
    });

    it("isWritable should return true for Writable", () => {
      const writable = createNullWritable();
      expect(isWritable(writable)).toBe(true);
    });

    it("isWritable should return false for non-writable", () => {
      expect(isWritable({})).toBe(false);
    });

    it("isTransform should return true for Transform", () => {
      const transform = createTransform(x => x);
      expect(isTransform(transform)).toBe(true);
    });

    it("isTransform should return false for non-transform", () => {
      const readable = createReadableFromArray([1]);
      expect(isTransform(readable)).toBe(false);
    });

    it("isDuplex should return true for Transform (which is also Duplex)", () => {
      const transform = createTransform(x => x);
      expect(isDuplex(transform)).toBe(true);
    });

    it("isStream should return true for any stream", () => {
      expect(isStream(createReadableFromArray([1]))).toBe(true);
      expect(isStream(createNullWritable())).toBe(true);
      expect(isStream(createTransform(x => x))).toBe(true);
    });

    it("isStream should return false for non-streams", () => {
      expect(isStream({})).toBe(false);
      expect(isStream("string")).toBe(false);
      expect(isStream(123)).toBe(false);
    });
  });

  // ==========================================================================
  // Stream State Inspection Tests
  // ==========================================================================
  describe("Stream State Inspection", () => {
    it("isDestroyed should return false for new stream", () => {
      const readable = createReadableFromArray([1]);
      expect(isDestroyed(readable)).toBe(false);
    });

    it("isDestroyed should return true after destroy()", () => {
      const readable = createReadableFromArray([1]);
      readable.destroy();
      expect(isDestroyed(readable)).toBe(true);
    });
  });

  // ==========================================================================
  // High Water Mark Tests
  // ==========================================================================
  describe("High Water Mark", () => {
    it("should return default high water mark for object mode", () => {
      const hwm = getDefaultHighWaterMark(true);
      expect(hwm).toBe(16);
    });

    it("should return default high water mark for byte mode", () => {
      const hwm = getDefaultHighWaterMark(false);
      expect(hwm).toBe(16 * 1024);
    });

    it("should not throw when setting high water mark", () => {
      expect(() => setDefaultHighWaterMark(true, 32)).not.toThrow();
    });
  });

  // ==========================================================================
  // Binary Utility Extended Tests
  // ==========================================================================
  describe("Binary Utilities Extended", () => {
    it("should convert Unicode strings", () => {
      const str = "Hello, 世界! 🌍";
      const arr = stringToUint8Array(str);
      const result = uint8ArrayToString(arr);
      expect(result).toBe(str);
    });

    it("should convert empty string", () => {
      const arr = stringToUint8Array("");
      expect(arr.length).toBe(0);
      expect(uint8ArrayToString(arr)).toBe("");
    });

    it("uint8ArrayEquals should return true for equal arrays", () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3]);
      expect(uint8ArrayEquals(a, b)).toBe(true);
    });

    it("uint8ArrayEquals should return false for different lengths", () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2]);
      expect(uint8ArrayEquals(a, b)).toBe(false);
    });

    it("uint8ArrayEquals should return true for empty arrays", () => {
      expect(uint8ArrayEquals(new Uint8Array(0), new Uint8Array(0))).toBe(true);
    });

    it("uint8ArrayIndexOf should find pattern with start offset", () => {
      const haystack = stringToUint8Array("abcabc");
      const needle = stringToUint8Array("abc");
      expect(uint8ArrayIndexOf(haystack, needle, 1)).toBe(3);
    });

    it("uint8ArrayIndexOf should return start for empty needle", () => {
      const haystack = stringToUint8Array("hello");
      const needle = new Uint8Array(0);
      expect(uint8ArrayIndexOf(haystack, needle, 3)).toBe(3);
    });
  });

  // ==========================================================================
  // Once Utility Tests
  // ==========================================================================
  describe("once utility", () => {
    it("should resolve with event arguments", async () => {
      const emitter = new EventEmitter();

      const promise = once(emitter, "data");
      // Use setImmediate/setTimeout to ensure the listener is registered first
      setTimeout(() => emitter.emit("data", "hello", "world"), 0);

      const args = await promise;
      expect(args).toEqual(["hello", "world"]);
    });

    it("should reject on error event", async () => {
      const emitter = new EventEmitter();

      const promise = once(emitter, "data");
      // Use setImmediate/setTimeout to ensure the listener is registered first
      setTimeout(() => emitter.emit("error", new Error("Test error")), 0);

      await expect(promise).rejects.toThrow("Test error");
    });

    it("should handle abort signal", async () => {
      const emitter = new EventEmitter();
      const controller = new AbortController();

      const promise = once(emitter, "data", { signal: controller.signal });
      // Use setImmediate/setTimeout to ensure the listener is registered first
      setTimeout(() => controller.abort(), 0);

      await expect(promise).rejects.toThrow("Aborted");
    });
  });

  // ==========================================================================
  // AddAbortSignal Tests
  // ==========================================================================
  describe("addAbortSignal", () => {
    it("should destroy stream when signal is aborted", async () => {
      const controller = new AbortController();
      const readable = createReadableFromArray([1, 2, 3], { objectMode: true });

      // Need to handle the error event to prevent unhandled error
      readable.on("error", () => {
        // Ignore the abort error
      });

      addAbortSignal(controller.signal, readable);

      controller.abort();

      // Give time for the abort to propagate
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(readable.destroyed).toBe(true);
    });

    it("should destroy immediately if signal already aborted", () => {
      const controller = new AbortController();
      controller.abort();

      const readable = createReadableFromArray([1, 2, 3], { objectMode: true });

      // Need to handle the error event to prevent unhandled error
      readable.on("error", () => {
        // Ignore the abort error
      });

      addAbortSignal(controller.signal, readable);

      expect(readable.destroyed).toBe(true);
    });
  });

  // ==========================================================================
  // FinishedAll Tests
  // ==========================================================================
  describe("finishedAll", () => {
    it("should wait for all streams to finish", async () => {
      const writable1 = createNullWritable();
      const writable2 = createNullWritable();
      const readable = createEmptyReadable();

      const promise = finishedAll([writable1, writable2, readable]);

      writable1.end();
      writable2.end();
      readable.resume();

      await expect(promise).resolves.toBeUndefined();
    });
  });
});
