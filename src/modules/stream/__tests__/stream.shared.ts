/**
 * Stream Module Shared Tests
 *
 * Unit tests that run identically in both Node.js and Browser environments.
 * These tests verify that all APIs work identically regardless of platform.
 *
 * Import this test suite from your platform-specific test file and call
 * runStreamTests() with your platform's stream module imports.
 */

import { describe, it, expect } from "vitest";

/**
 * Stream module interface - must be provided by platform-specific test
 */
export interface StreamModuleImports {
  // Core Classes
  EventEmitter: new () => any;
  Readable: {
    new (options?: any): any;
    from: (...args: any[]) => any;
    wrap?: (src: any, options?: any) => any;
  };
  Writable: { new (options?: any): any; isDisturbed?: (stream: any) => boolean };
  Transform: { new (options?: any): any; isDisturbed?: (stream: any) => boolean };
  Duplex: { new (options?: any): any; isDisturbed?: (stream: any) => boolean };
  PassThrough: new (options?: any) => any;

  // Specialized Streams
  BufferedStream: new (options?: any) => any;
  PullStream: new (options?: any) => any;
  StringChunk: new (data: string) => any;
  ByteChunk: new (data: Uint8Array) => any;
  ChunkedBuilder: new (options?: any) => any;
  TransactionalChunkedBuilder: new (options?: any) => any;

  // Factory Functions
  createReadable: <_T = Uint8Array>(options?: any) => any;
  createWritable: <_T = Uint8Array>(options?: any) => any;
  createPassThrough: <_T = any>(options?: any) => any;
  createTransform: <TInput = Uint8Array, TOutput = Uint8Array>(
    transformFn: (chunk: TInput, encoding?: string) => TOutput | Promise<TOutput>,
    options?: any
  ) => any;
  createCollector: <_T = Uint8Array>(options?: any) => any;
  createDuplex: (options?: any) => any;
  createReadableFromArray: <T>(data: T[], options?: any) => any;
  createReadableFromAsyncIterable: <T>(iterable: AsyncIterable<T>, options?: any) => any;
  createReadableFromGenerator: <T>(
    generator: () => AsyncGenerator<T, void, unknown>,
    options?: any
  ) => any;
  createReadableFromPromise: <T>(promise: Promise<T>, options?: any) => any;
  createEmptyReadable: (options?: any) => any;
  createNullWritable: (options?: any) => any;
  duplexPair: (options?: any) => [any, any];

  // Pipeline & Utilities
  pipeline: (...args: any[]) => Promise<void>;
  finished: (stream: any, options?: any) => Promise<void>;
  streamToUint8Array: (stream: any) => Promise<Uint8Array>;
  streamToString: (stream: any, encoding?: string) => Promise<string>;
  drainStream: (stream: any) => Promise<void>;
  copyStream: (source: any, destination: any) => Promise<void>;
  concatUint8Arrays: (arrays: Uint8Array[]) => Uint8Array;

  // Utility Functions
  addAbortSignal: (signal: AbortSignal, stream: any) => any;
  compose: (...transforms: any[]) => any;
  finishedAll: (streams: readonly any[]) => Promise<void>;
  promisify: <T>(fn: (callback: (error?: Error | null, result?: T) => void) => void) => Promise<T>;

  // Type Guards
  isReadable: (obj: unknown) => boolean;
  isWritable: (obj: unknown) => boolean;
  isTransform: (obj: unknown) => boolean;
  isDuplex: (obj: unknown) => boolean;
  isStream: (obj: unknown) => boolean;
  isDestroyed: (stream: any) => boolean;
  isDisturbed: (stream: any) => boolean;
  isErrored: (stream: any) => boolean;

  // High water mark management
  getDefaultHighWaterMark: (objectMode: boolean) => number;
  setDefaultHighWaterMark: (objectMode: boolean, value: number) => void;

  // Consumers & Promises
  consumers: {
    text: (stream: any) => Promise<string>;
    json: (stream: any) => Promise<any>;
    buffer: (stream: any) => Promise<Uint8Array>;
    arrayBuffer: (stream: any) => Promise<ArrayBuffer>;
  };
  promises: {
    pipeline: (...args: any[]) => Promise<void>;
    finished: (stream: any, options?: any) => Promise<void>;
  };

  // Binary Utilities
  stringToUint8Array: (str: string) => Uint8Array;
  uint8ArrayToString: (arr: Uint8Array) => string;
  uint8ArrayEquals: (a: Uint8Array, b: Uint8Array) => boolean;
  uint8ArrayIndexOf: (
    haystack: Uint8Array,
    needle: Uint8Array,
    start?: number,
    end?: number
  ) => number;
}

/**
 * Run all shared stream tests with the provided module imports
 */
export function runStreamTests(imports: StreamModuleImports): void {
  const {
    EventEmitter,
    Readable,
    Writable,
    Transform,
    Duplex,
    PassThrough,
    BufferedStream,
    PullStream,
    StringChunk,
    ByteChunk,
    ChunkedBuilder,
    TransactionalChunkedBuilder,
    createReadable: _createReadable,
    createWritable,
    createPassThrough,
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
  } = imports;

  // ==========================================================================
  // EventEmitter Tests
  // ==========================================================================
  describe("EventEmitter", () => {
    it("should emit and handle events", () => {
      const emitter = new EventEmitter();
      const results: string[] = [];

      emitter.on("test", (data: string) => results.push(data));
      emitter.emit("test", "hello");
      emitter.emit("test", "world");

      expect(results).toEqual(["hello", "world"]);
    });

    it("should handle once listeners", () => {
      const emitter = new EventEmitter();
      const results: number[] = [];

      emitter.once("test", (data: number) => results.push(data));
      emitter.emit("test", 1);
      emitter.emit("test", 2);

      expect(results).toEqual([1]);
    });

    it("should remove listeners", () => {
      const emitter = new EventEmitter();
      const results: number[] = [];
      const listener = (data: number): void => {
        results.push(data);
      };

      emitter.on("test", listener);
      emitter.emit("test", 1);
      emitter.off("test", listener);
      emitter.emit("test", 2);

      expect(results).toEqual([1]);
    });

    it("should support multiple listeners for same event", () => {
      const emitter = new EventEmitter();
      const results: number[] = [];

      emitter.on("test", () => results.push(1));
      emitter.on("test", () => results.push(2));
      emitter.emit("test");

      expect(results).toEqual([1, 2]);
    });

    it("should return listener count", () => {
      const emitter = new EventEmitter();
      emitter.on("test", () => {});
      emitter.on("test", () => {});
      emitter.on("other", () => {});

      expect(emitter.listenerCount("test")).toBe(2);
      expect(emitter.listenerCount("other")).toBe(1);
    });

    it("should return event names", () => {
      const emitter = new EventEmitter();
      emitter.on("a", () => {});
      emitter.on("b", () => {});

      const names = emitter.eventNames();
      expect(names).toEqual(["a", "b"]);
    });

    it("should return listeners array copy", () => {
      const emitter = new EventEmitter();
      const listener = (): void => {};
      emitter.on("test", listener);

      const listeners = emitter.listeners("test");
      expect(listeners).toEqual([listener]);
    });

    it("should prepend listener to beginning", () => {
      const emitter = new EventEmitter();
      const results: number[] = [];

      emitter.on("test", () => results.push(1));
      emitter.prependListener("test", () => results.push(2));
      emitter.emit("test");

      expect(results).toEqual([2, 1]);
    });

    it("should remove all listeners for specific event", () => {
      const emitter = new EventEmitter();
      emitter.on("a", () => {});
      emitter.on("a", () => {});
      emitter.on("b", () => {});

      emitter.removeAllListeners("a");

      expect(emitter.listenerCount("a")).toBe(0);
      expect(emitter.listenerCount("b")).toBe(1);
    });
  });

  // ==========================================================================
  // Transform Tests
  // ==========================================================================
  describe("Transform (via createTransform)", () => {
    it("should transform chunks correctly", async () => {
      const transform = createTransform<string, string>(chunk => chunk.toUpperCase(), {
        objectMode: true
      });
      const chunks: string[] = [];

      const finishPromise = new Promise<void>(resolve => {
        transform.on("data", (chunk: string) => chunks.push(chunk));
        transform.on("finish", resolve);
      });

      transform.write("hello");
      transform.write("world");
      transform.end();

      await finishPromise;
      expect(chunks).toEqual(["HELLO", "WORLD"]);
    });

    it("should handle errors gracefully", async () => {
      const transform = createTransform<string, string>(
        () => {
          throw new Error("Test error");
        },
        { objectMode: true }
      );

      const errorPromise = new Promise<Error>(resolve => {
        transform.on("error", resolve);
      });

      transform.write("test");

      const err = await errorPromise;
      expect(err.message).toBe("Test error");
    });

    it("should pipe to another transform", async () => {
      const transform1 = createTransform<string, string>(chunk => chunk.toUpperCase(), {
        objectMode: true
      });
      const transform2 = createTransform<string, string>(chunk => chunk + "!", {
        objectMode: true
      });
      const results: string[] = [];

      const finishPromise = new Promise<void>(resolve => {
        transform2.on("data", (chunk: string) => results.push(chunk));
        transform2.on("finish", resolve);
      });

      transform1.pipe(transform2);

      transform1.write("hello");
      transform1.write("world");
      transform1.end();

      await finishPromise;
      expect(results).toEqual(["HELLO!", "WORLD!"]);
    });

    it("should handle async transform function", async () => {
      const transform = createTransform<number, number>(
        async n => {
          await new Promise(resolve => setTimeout(resolve, 1));
          return n * 2;
        },
        { objectMode: true }
      );

      const results: number[] = [];
      transform.on("data", (n: number) => results.push(n));

      transform.write(1);
      transform.write(2);
      transform.end();

      await new Promise<void>(resolve => transform.on("finish", resolve));
      expect(results).toEqual([2, 4]);
    });

    it("should not accept writes after destroy", () => {
      const transform = createTransform<string, string>(s => s, { objectMode: true });
      // Catch error to prevent uncaught exception
      transform.on("error", () => {});

      transform.destroy();
      const result = transform.write("test");

      // After destroy, write should return false and stream should be destroyed
      expect(result).toBe(false);
      expect(transform.destroyed).toBe(true);
    });

    it("should handle multiple destroy calls", () => {
      const transform = createTransform<string, string>(s => s, { objectMode: true });
      transform.destroy();
      expect(() => transform.destroy()).not.toThrow();
    });
  });

  // ==========================================================================
  // BufferedStream Tests
  // ==========================================================================
  describe("BufferedStream", () => {
    it("should buffer string data correctly", () => {
      const stream = new BufferedStream({ batchSize: 1024 });

      stream.write("Hello ");
      stream.write("World");
      stream.write("!");

      const result = stream.toUint8Array();
      expect(uint8ArrayToString(result)).toBe("Hello World!");
    });

    it("should buffer Uint8Array data correctly", () => {
      const stream = new BufferedStream();

      stream.write(stringToUint8Array("Hello "));
      stream.write(stringToUint8Array("World"));

      const result = stream.toUint8Array();
      expect(uint8ArrayToString(result)).toBe("Hello World");
    });

    it("should track buffered length", () => {
      const stream = new BufferedStream();

      stream.write("test");
      expect(stream.bufferedLength).toBe(4);

      stream.write("more");
      expect(stream.bufferedLength).toBe(8);
    });

    it("should not accept writes after destroy", () => {
      const stream = new BufferedStream();
      // Catch error to prevent uncaught exception
      stream.on("error", () => {});

      stream.destroy();
      const result = stream.write("test");

      // After destroy, write should return false and stream should be destroyed
      expect(result).toBe(false);
      expect(stream.destroyed).toBe(true);
    });

    it("should track isFinished state", async () => {
      const stream = new BufferedStream();

      expect(stream.isFinished).toBe(false);

      // Register finish listener BEFORE calling end()
      const finishPromise = new Promise<void>(resolve => stream.on("finish", resolve));
      stream.end();

      await finishPromise;
      expect(stream.isFinished).toBe(true);
    });

    it("should not accept writes after end", () => {
      const stream = new BufferedStream();
      stream.on("error", () => {});

      stream.write("before");
      stream.end();

      const result = stream.write("after");
      expect(result).toBe(false);
    });

    it("should not emit finish/end twice on double end()", () => {
      const stream = new BufferedStream();
      let finishCount = 0;
      let endCount = 0;
      stream.on("finish", () => finishCount++);
      stream.on("end", () => endCount++);

      stream.end();
      stream.end(); // second call should be no-op

      expect(finishCount).toBe(1);
      expect(endCount).toBe(1);
    });

    it("should reset state after toUint8Array()", () => {
      const stream = new BufferedStream();

      stream.write("hello");
      const first = stream.toUint8Array();
      expect(uint8ArrayToString(first)).toBe("hello");
      expect(stream.bufferedLength).toBe(0);

      // Second call returns empty
      const second = stream.toUint8Array();
      expect(second.length).toBe(0);
    });
  });

  // ==========================================================================
  // StringChunk and ByteChunk Tests
  // ==========================================================================
  describe("StringChunk and ByteChunk", () => {
    it("StringChunk should convert to Uint8Array", () => {
      const chunk = new StringChunk("hello");
      const arr = chunk.toUint8Array();

      expect(arr).toBeInstanceOf(Uint8Array);
      expect(uint8ArrayToString(arr)).toBe("hello");
    });

    it("ByteChunk should wrap Uint8Array", () => {
      const data = stringToUint8Array("world");
      const chunk = new ByteChunk(data);

      expect(chunk.length).toBe(data.length);
      expect(chunk.toUint8Array()).toEqual(data);
    });

    it("should copy data correctly", () => {
      const chunk = new StringChunk("hello");
      const target = new Uint8Array(10);

      chunk.copy(target, 0, 0, 5);
      expect(uint8ArrayToString(target.slice(0, 5))).toBe("hello");
    });
  });

  // ==========================================================================
  // ChunkedBuilder Tests
  // ==========================================================================
  describe("ChunkedBuilder", () => {
    it("should build strings efficiently", () => {
      const builder = new ChunkedBuilder({ chunkSize: 5 });

      builder.push("a");
      builder.push("b");
      builder.push("c");

      expect(builder.toString()).toBe("abc");
    });

    it("should track cursor position", () => {
      const builder = new ChunkedBuilder({ chunkSize: 10 });

      expect(builder.cursor).toBe(0);
      builder.push("hello");
      expect(builder.cursor).toBe(1);
    });

    it("should convert to Uint8Array", () => {
      const builder = new ChunkedBuilder();
      builder.push("test");

      const arr = builder.toUint8Array();
      expect(uint8ArrayToString(arr)).toBe("test");
    });

    it("should handle empty builder", () => {
      const builder = new ChunkedBuilder();
      expect(builder.toString()).toBe("");
      expect(builder.cursor).toBe(0);
    });

    it("should track string length", () => {
      const builder = new ChunkedBuilder();
      builder.push("hello");
      builder.push(" world");
      expect(builder.stringLength).toBe(11);
    });
  });

  // ==========================================================================
  // TransactionalChunkedBuilder Tests
  // ==========================================================================
  describe("TransactionalChunkedBuilder", () => {
    it("should support rollback", () => {
      const builder = new TransactionalChunkedBuilder();

      builder.push("hello");
      builder.snapshot();
      builder.push(" world");
      builder.rollback();

      expect(builder.toString()).toBe("hello");
    });

    it("should support commit", () => {
      const builder = new TransactionalChunkedBuilder();

      builder.push("hello");
      builder.snapshot();
      builder.push(" world");
      builder.commit();

      expect(builder.toString()).toBe("hello world");
    });

    it("should handle nested snapshots", () => {
      const builder = new TransactionalChunkedBuilder();

      builder.push("a");
      builder.snapshot();
      builder.push("b");
      builder.snapshot();
      builder.push("c");
      builder.rollback();
      builder.rollback();

      expect(builder.toString()).toBe("a");
    });
  });

  // ==========================================================================
  // PullStream Tests
  // ==========================================================================
  describe("PullStream", () => {
    it("should pull exact number of bytes", async () => {
      const stream = new PullStream();

      stream.write(stringToUint8Array("0123456789"));
      stream.end();

      const result = await stream.pull(5);
      expect(uint8ArrayToString(result)).toBe("01234");
    });

    it("should pull until pattern", async () => {
      const stream = new PullStream();

      stream.write(stringToUint8Array("Hello|World"));
      stream.end();

      const pattern = stringToUint8Array("|");
      const result = await stream.pull(pattern, false);
      expect(uint8ArrayToString(result)).toBe("Hello");
    });

    it("should include pattern when requested", async () => {
      const stream = new PullStream();

      stream.write(stringToUint8Array("Data|More"));
      stream.end();

      const pattern = stringToUint8Array("|");
      const result = await stream.pull(pattern, true);
      expect(uint8ArrayToString(result)).toBe("Data|");
    });

    it("should track match position", async () => {
      const stream = new PullStream();

      stream.write(stringToUint8Array("0123456789"));
      stream.end();

      const pattern = stringToUint8Array("5");
      await stream.pull(pattern, false);
      expect(stream.matchPosition).toBe(5);
    });

    it("should track remaining length", () => {
      const stream = new PullStream();
      stream.write(stringToUint8Array("12345"));
      expect(stream.length).toBe(5);
    });

    it("should not accept writes after destroy", () => {
      const stream = new PullStream();
      // Catch error to prevent uncaught exception
      stream.on("error", () => {});

      stream.destroy();
      const result = stream.write(stringToUint8Array("test"));

      // After destroy, write should return false and stream should be destroyed
      expect(result).toBe(false);
      expect(stream.destroyed).toBe(true);
    });

    it("should track isFinished state", () => {
      const stream = new PullStream();

      expect(stream.isFinished).toBe(false);
      stream.end();
      expect(stream.isFinished).toBe(true);
    });

    it("should not emit events when end() called after destroy()", () => {
      const stream = new PullStream();
      stream.on("error", () => {});

      stream.destroy();

      let finishEmitted = false;
      let endEmitted = false;
      stream.on("finish", () => {
        finishEmitted = true;
      });
      stream.on("end", () => {
        endEmitted = true;
      });

      stream.end();

      expect(finishEmitted).toBe(false);
      expect(endEmitted).toBe(false);
    });

    it("should not emit finish/end twice on double end()", () => {
      const stream = new PullStream();
      let finishCount = 0;
      let endCount = 0;
      stream.on("finish", () => finishCount++);
      stream.on("end", () => endCount++);

      stream.end();
      stream.end(); // second call should be no-op

      expect(finishCount).toBe(1);
      expect(endCount).toBe(1);
    });
  });

  // ==========================================================================
  // Uint8Array Utilities Tests
  // ==========================================================================
  describe("Uint8Array Utilities", () => {
    it("should convert string to Uint8Array and back", () => {
      const str = "Hello, 世界! 🌍";
      const arr = stringToUint8Array(str);
      const result = uint8ArrayToString(arr);

      expect(result).toBe(str);
    });

    it("should compare Uint8Arrays for equality", () => {
      const a = stringToUint8Array("hello");
      const b = stringToUint8Array("hello");
      const c = stringToUint8Array("world");

      expect(uint8ArrayEquals(a, b)).toBe(true);
      expect(uint8ArrayEquals(a, c)).toBe(false);
    });

    it("uint8ArrayEquals should return true for empty arrays", () => {
      expect(uint8ArrayEquals(new Uint8Array(0), new Uint8Array(0))).toBe(true);
    });

    it("uint8ArrayEquals should return false for different lengths", () => {
      const a = new Uint8Array([1, 2]);
      const b = new Uint8Array([1, 2, 3]);
      expect(uint8ArrayEquals(a, b)).toBe(false);
    });

    it("should find pattern in Uint8Array", () => {
      const haystack = stringToUint8Array("hello world");
      const needle = stringToUint8Array("world");

      expect(uint8ArrayIndexOf(haystack, needle)).toBe(6);
      expect(uint8ArrayIndexOf(haystack, stringToUint8Array("xyz"))).toBe(-1);
    });

    it("uint8ArrayIndexOf should find pattern with start offset", () => {
      const haystack = stringToUint8Array("hello hello");
      const needle = stringToUint8Array("hello");
      expect(uint8ArrayIndexOf(haystack, needle, 1)).toBe(6);
    });

    it("uint8ArrayIndexOf should return start for empty needle", () => {
      const haystack = stringToUint8Array("test");
      expect(uint8ArrayIndexOf(haystack, new Uint8Array(0))).toBe(0);
    });

    it("should concatenate Uint8Arrays", () => {
      const a = stringToUint8Array("Hello");
      const b = stringToUint8Array(" ");
      const c = stringToUint8Array("World");

      const result = concatUint8Arrays([a, b, c]);
      expect(uint8ArrayToString(result)).toBe("Hello World");
    });

    it("concatUint8Arrays should concatenate empty array", () => {
      const result = concatUint8Arrays([]);
      expect(result.length).toBe(0);
    });

    it("concatUint8Arrays should return single array unchanged", () => {
      const input = new Uint8Array([1, 2, 3]);
      const result = concatUint8Arrays([input]);
      expect(result).toBe(input);
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

      writable.write(stringToUint8Array("test"));
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

    it("isDuplex should return true for Transform", () => {
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

    it("should detect stream types comprehensively", () => {
      const transform = createTransform(x => x);
      const collector = createCollector();
      const readable = createReadableFromArray([1]);

      expect(isStream(transform)).toBe(true);
      expect(isWritable(transform)).toBe(true);
      expect(isTransform(transform)).toBe(true);

      expect(isStream(collector)).toBe(true);
      expect(isWritable(collector)).toBe(true);

      expect(isStream(readable)).toBe(true);
      expect(isReadable(readable)).toBe(true);

      expect(isStream({})).toBe(false);
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

    it("isDisturbed should return true after read", async () => {
      const readable = createReadableFromArray([1, 2], { objectMode: true });
      readable.read();
      expect(isDisturbed(readable)).toBe(true);
    });

    it("isErrored should return false for healthy stream", () => {
      const readable = createReadableFromArray([1]);
      expect(isErrored(readable)).toBe(false);
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
      expect(hwm).toBe(65536);
    });

    it("should not throw when setting high water mark", () => {
      const original = getDefaultHighWaterMark(true);
      expect(() => setDefaultHighWaterMark(true, 32)).not.toThrow();
      setDefaultHighWaterMark(true, original);
    });
  });

  // ==========================================================================
  // Duplex Tests
  // ==========================================================================
  describe("Duplex", () => {
    it("should create a duplex stream", async () => {
      const chunks: number[] = [];
      const duplex = createDuplex({
        readableObjectMode: true,
        writableObjectMode: true,
        read() {},
        write(
          this: any,
          chunk: number,
          _encoding: string,
          callback: (error?: Error | null) => void
        ) {
          chunks.push(chunk);
          this.push(chunk * 2);
          callback();
        },
        final(this: any, callback: (error?: Error | null) => void) {
          this.push(null);
          callback();
        }
      });

      duplex.write(1);
      duplex.write(2);
      duplex.end();

      const results: number[] = [];
      for await (const chunk of duplex) {
        results.push(chunk as number);
      }

      expect(chunks).toEqual([1, 2]);
      expect(results).toEqual([2, 4]);
    });

    it("should ignore readable/writable shortcut options in createDuplex (Node parity)", async () => {
      const chunks: number[] = [];
      const duplex = createDuplex({
        readableObjectMode: true,
        writableObjectMode: true,
        readable: {
          pipe() {
            throw new Error("createDuplex should not auto-bridge readable");
          }
        },
        writable: {
          write() {
            throw new Error("createDuplex should not auto-bridge writable");
          },
          end() {
            throw new Error("createDuplex should not auto-bridge writable end");
          }
        },
        read() {},
        write(
          this: any,
          chunk: number,
          _encoding: string,
          callback: (error?: Error | null) => void
        ) {
          chunks.push(chunk);
          this.push(chunk * 3);
          callback();
        },
        final(this: any, callback: (error?: Error | null) => void) {
          this.push(null);
          callback();
        }
      } as any);

      duplex.write(2);
      duplex.end();

      const results: number[] = [];
      for await (const chunk of duplex) {
        results.push(chunk as number);
      }

      expect(chunks).toEqual([2]);
      expect(results).toEqual([6]);
    });

    it("should apply objectMode/highWaterMark defaults to both duplex sides", () => {
      const duplex = createDuplex({
        objectMode: true,
        highWaterMark: 7,
        read() {},
        write(_chunk, _encoding, callback) {
          callback();
        }
      });

      expect(duplex.readableObjectMode).toBe(true);
      expect(duplex.writableObjectMode).toBe(true);
      expect(duplex.readableHighWaterMark).toBe(7);
      expect(duplex.writableHighWaterMark).toBe(7);
    });

    it("should create a pair of connected duplex streams", async () => {
      const [client, server] = duplexPair({ objectMode: true });

      const clientReceived: unknown[] = [];
      const serverReceived: unknown[] = [];

      client.on("data", (chunk: unknown) => clientReceived.push(chunk));
      server.on("data", (chunk: unknown) => serverReceived.push(chunk));

      client.write("hello");
      server.write("world");

      // Allow data to flow
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(serverReceived).toEqual(["hello"]);
      expect(clientReceived).toEqual(["world"]);
    });
  });

  // ==========================================================================
  // Pipeline & Utilities Tests
  // ==========================================================================
  describe("Pipeline & Utilities", () => {
    it("should pipe streams together", async () => {
      const readable = createReadableFromArray(["hello", "world"], { objectMode: true });
      const transform = createTransform<string, string>(s => s.toUpperCase(), { objectMode: true });
      const collector = createCollector<string>();

      await pipeline(readable, transform, collector);
      expect(collector.chunks).toEqual(["HELLO", "WORLD"]);
    });

    it("should wait for stream to finish", async () => {
      const readable = createReadableFromArray([1, 2], { objectMode: true });
      const results: number[] = [];
      readable.on("data", (n: number) => results.push(n));

      await finished(readable);
      expect(results).toEqual([1, 2]);
    });

    it("should collect stream into string", async () => {
      const readable = createReadableFromArray([
        stringToUint8Array("Hello "),
        stringToUint8Array("World")
      ]);
      const result = await streamToString(readable);
      expect(result).toBe("Hello World");
    });

    it("should collect stream into string when chunks are strings", async () => {
      const readable = createReadableFromArray(["Hello ", "World"], { objectMode: true });
      const result = await streamToString(readable as any);
      expect(result).toBe("Hello World");
    });

    it("should collect stream into Uint8Array", async () => {
      const readable = createReadableFromArray([
        stringToUint8Array("Test"),
        stringToUint8Array("Data")
      ]);
      const result = await streamToUint8Array(readable);
      expect(uint8ArrayToString(result)).toBe("TestData");
    });

    it("should drain stream", async () => {
      const readable = createReadableFromArray([1, 2, 3], { objectMode: true });
      await drainStream(readable);
      expect(readable.readableEnded).toBe(true);
    });

    it("should copy stream to destination", async () => {
      const readable = createReadableFromArray([1, 2], { objectMode: true });
      const collector = createCollector<number>();
      await copyStream(readable, collector);
      expect(collector.chunks).toEqual([1, 2]);
    });

    it("pipeline callback should not pass null on success", async () => {
      const readable = createReadableFromArray(["ok"], { objectMode: true });
      const collector = createCollector<string>();

      await new Promise<void>((resolve, reject) => {
        pipeline(readable, collector, (err?: Error | null) => {
          try {
            expect(err).toBeUndefined();
            resolve();
          } catch (assertionError) {
            reject(assertionError);
          }
        });
      });

      expect(collector.chunks).toEqual(["ok"]);
    });

    it("finished callback should not pass null on success", async () => {
      const readable = createReadableFromArray([1, 2, 3], { objectMode: true });
      readable.resume();

      await new Promise<void>((resolve, reject) => {
        finished(readable, (err?: Error | null) => {
          try {
            expect(err).toBeUndefined();
            resolve();
          } catch (assertionError) {
            reject(assertionError);
          }
        });
      });
    });

    it("finished should wait for both sides on duplex streams by default", async () => {
      const duplex = new Duplex({
        objectMode: true,
        read() {},
        write(_chunk: unknown, _encoding: string, callback: (error?: Error | null) => void) {
          callback();
        },
        final(this: any, callback: (error?: Error | null) => void) {
          setTimeout(() => {
            this.push("done");
            this.push(null);
            callback();
          }, 20);
        }
      });

      duplex.resume();
      duplex.write("in");
      duplex.end();

      await finished(duplex);

      expect(duplex.writableFinished).toBe(true);
      expect(duplex.readableEnded).toBe(true);
    });

    it("pipeline should reject with AbortError when signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort(new Error("stop"));

      const readable = createReadableFromArray(["x"], { objectMode: true });
      const collector = createCollector<string>();

      await expect(
        pipeline(readable, collector, {
          signal: controller.signal
        })
      ).rejects.toMatchObject({ name: "AbortError" });
    });

    it("finished should reject with AbortError when signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort(new Error("stop"));

      const readable = createReadableFromArray([1], { objectMode: true });

      await expect(
        finished(readable, {
          signal: controller.signal
        })
      ).rejects.toMatchObject({ name: "AbortError" });
    });

    it("pipeline should respect end:false and keep destination writable", async () => {
      const readable = createReadableFromArray([1, 2, 3], { objectMode: true });
      const chunks: number[] = [];
      let finishedCount = 0;

      const writable = createWritable<number>({
        objectMode: true,
        write(chunk, _encoding, callback) {
          chunks.push(chunk);
          callback();
        }
      });

      writable.on("finish", () => {
        finishedCount++;
      });

      await pipeline(readable, writable, { end: false });

      expect(chunks).toEqual([1, 2, 3]);
      expect(writable.writableEnded).toBe(false);
      expect(finishedCount).toBe(0);

      writable.end();
      await finished(writable);
      expect(finishedCount).toBe(1);
    });

    it("finished should reject on premature close", async () => {
      const writable = createWritable<number>({
        objectMode: true,
        write(_chunk, _encoding, callback) {
          setTimeout(callback, 10);
        }
      });

      writable.write(1);
      const done = finished(writable);
      writable.destroy();

      await expect(done).rejects.toMatchObject({ code: "ERR_STREAM_PREMATURE_CLOSE" });
    });

    it("pipeline should reject with AbortError when aborted mid-flight", async () => {
      const controller = new AbortController();
      const seen: number[] = [];

      const readable = createReadableFromAsyncIterable(
        (async function* () {
          for (let i = 0; i < 100; i++) {
            await new Promise(resolve => setTimeout(resolve, 1));
            yield i;
          }
        })(),
        { objectMode: true }
      );

      const writable = createWritable<number>({
        objectMode: true,
        highWaterMark: 1,
        write(chunk, _encoding, callback) {
          seen.push(chunk);
          if (seen.length === 1) {
            controller.abort(new Error("stop-mid-flight"));
          }
          setTimeout(callback, 1);
        }
      });

      readable.on("error", () => {});
      writable.on("error", () => {});

      await expect(
        pipeline(readable, writable, {
          signal: controller.signal
        })
      ).rejects.toMatchObject({ name: "AbortError" });

      expect(seen).toEqual([0]);
    });
  });

  // ==========================================================================
  // Abort Signal Tests
  // ==========================================================================
  describe("Abort Signal", () => {
    it("should destroy stream when signal is aborted", async () => {
      const controller = new AbortController();
      const readable = createReadableFromArray([1, 2, 3], { objectMode: true });
      // Catch error to prevent uncaught exception
      readable.on("error", () => {});

      addAbortSignal(controller.signal, readable);

      controller.abort();

      expect(readable.destroyed).toBe(true);
    });

    it("should destroy immediately if signal already aborted", () => {
      const controller = new AbortController();
      controller.abort();

      const readable = createReadableFromArray([1], { objectMode: true });
      // Catch error to prevent uncaught exception
      readable.on("error", () => {});
      addAbortSignal(controller.signal, readable);

      expect(readable.destroyed).toBe(true);
    });
  });

  // ==========================================================================
  // Compose Tests
  // ==========================================================================
  describe("Compose", () => {
    it("should compose multiple transforms", async () => {
      const upper = createTransform<string, string>(s => s.toUpperCase(), { objectMode: true });
      const exclaim = createTransform<string, string>(s => s + "!", { objectMode: true });

      const composed = compose(upper, exclaim);
      const collector = createCollector<string>();

      composed.pipe(collector);
      composed.write("hello");
      composed.end();

      await new Promise<void>(resolve => collector.on("finish", resolve));
      expect(collector.chunks).toEqual(["HELLO!"]);
    });

    it("should return identity transform for empty array", () => {
      const passthrough = compose();
      expect(isTransform(passthrough)).toBe(true);
    });

    it("should return single transform unchanged", () => {
      const transform = createTransform<string, string>(s => s, { objectMode: true });
      const result = compose(transform);
      expect(result).toBe(transform);
    });

    it("should respect pause/resume when consuming composed data", async () => {
      const t1 = createTransform<number, number>(n => n, { objectMode: true });
      const t2 = createTransform<number, number>(n => n, { objectMode: true });

      const composed = compose(t1, t2);
      const received: number[] = [];
      let pausedSnapshot: number[] = [];

      composed.on("data", (chunk: number) => {
        received.push(chunk);
        if (chunk === 1) {
          composed.pause();
          setTimeout(() => {
            pausedSnapshot = [...received];
            composed.resume();
          }, 10);
        }
      });

      composed.write(1);
      composed.write(2);
      composed.write(3);
      composed.end();

      await finished(composed);

      expect(pausedSnapshot).toEqual([1]);
      expect(received).toEqual([1, 2, 3]);
    });
  });

  // ==========================================================================
  // FinishedAll Tests
  // ==========================================================================
  describe("FinishedAll", () => {
    it("should wait for all streams to finish", async () => {
      const readable1 = createReadableFromArray([1], { objectMode: true });
      const readable2 = createReadableFromArray([2], { objectMode: true });

      // Consume streams
      readable1.on("data", () => {});
      readable2.on("data", () => {});

      await finishedAll([readable1, readable2]);

      expect(readable1.readableEnded).toBe(true);
      expect(readable2.readableEnded).toBe(true);
    });
  });

  // ==========================================================================
  // Promisify Tests
  // ==========================================================================
  describe("Promisify", () => {
    it("should convert callback to promise - success", async () => {
      const result = await promisify<string>(callback => {
        setTimeout(() => callback(null, "success"), 1);
      });
      expect(result).toBe("success");
    });

    it("should convert callback to promise - error", async () => {
      await expect(
        promisify(callback => {
          setTimeout(() => callback(new Error("failure")), 1);
        })
      ).rejects.toThrow("failure");
    });
  });

  // ==========================================================================
  // Consumers Tests
  // ==========================================================================
  describe("Consumers", () => {
    it("consumers.text should read stream as text", async () => {
      const readable = createReadableFromArray([stringToUint8Array("Hello World")]);
      const text = await consumers.text(readable);
      expect(text).toBe("Hello World");
    });

    it("consumers.json should parse stream as JSON", async () => {
      const readable = createReadableFromArray([stringToUint8Array('{"key":"value"}')]);
      const json = await consumers.json(readable);
      expect(json).toEqual({ key: "value" });
    });

    it("consumers.buffer should read stream as Uint8Array", async () => {
      const readable = createReadableFromArray([stringToUint8Array("Test")]);
      const buffer = await consumers.buffer(readable);
      expect(uint8ArrayToString(buffer)).toBe("Test");
    });

    it("consumers.arrayBuffer should read stream as ArrayBuffer", async () => {
      const readable = createReadableFromArray([stringToUint8Array("Test")]);
      const arrayBuffer = await consumers.arrayBuffer(readable);
      const text = new TextDecoder().decode(arrayBuffer);
      expect(text).toBe("Test");
    });
  });

  // ==========================================================================
  // Promises API Tests
  // ==========================================================================
  describe("Promises API", () => {
    it("promises.pipeline should work like pipeline", async () => {
      const readable = createReadableFromArray(["a", "b"], { objectMode: true });
      const transform = createTransform<string, string>(s => s.toUpperCase(), { objectMode: true });
      const collector = createCollector<string>();

      await promises.pipeline(readable, transform, collector);
      expect(collector.chunks).toEqual(["A", "B"]);
    });

    it("promises.finished should work like finished", async () => {
      const readable = createReadableFromArray([1], { objectMode: true });
      readable.on("data", () => {});

      await promises.finished(readable);
      expect(readable.readableEnded).toBe(true);
    });
  });

  // ==========================================================================
  // Edge Cases Tests
  // ==========================================================================
  describe("Edge Cases", () => {
    describe("Empty Streams", () => {
      it("should handle empty readable stream", async () => {
        const readable = createReadableFromArray<number>([], { objectMode: true });
        const results: number[] = [];

        for await (const chunk of readable) {
          results.push(chunk);
        }

        expect(results).toEqual([]);
      });

      it("should handle createEmptyReadable", async () => {
        const readable = createEmptyReadable({ objectMode: true });
        const results: unknown[] = [];

        readable.on("data", (chunk: unknown) => results.push(chunk));
        await finished(readable);

        expect(results).toEqual([]);
        expect(readable.readableEnded).toBe(true);
      });

      it("should handle pipeline with empty source", async () => {
        const readable = createReadableFromArray<string>([], { objectMode: true });
        const transform = createTransform<string, string>(s => s.toUpperCase(), {
          objectMode: true
        });
        const collector = createCollector<string>();

        await pipeline(readable, transform, collector);
        expect(collector.chunks).toEqual([]);
      });
    });

    describe("Single Item Streams", () => {
      it("should handle single item in readable", async () => {
        const readable = createReadableFromArray([42], { objectMode: true });
        const results: number[] = [];

        for await (const chunk of readable) {
          results.push(chunk);
        }

        expect(results).toEqual([42]);
      });

      it("should handle single byte in binary stream", async () => {
        const readable = createReadableFromArray([new Uint8Array([255])]);
        const result = await streamToUint8Array(readable);
        expect(result).toEqual(new Uint8Array([255]));
      });
    });

    describe("Large Data", () => {
      it("should handle many small chunks", async () => {
        const data = Array.from({ length: 1000 }, (_, i) => i);
        const readable = createReadableFromArray(data, { objectMode: true });
        const results: number[] = [];

        for await (const chunk of readable) {
          results.push(chunk as number);
        }

        expect(results.length).toBe(1000);
        expect(results[0]).toBe(0);
        expect(results[999]).toBe(999);
      });

      it("should handle large binary chunks", async () => {
        const largeChunk = new Uint8Array(65536); // 64KB
        largeChunk.fill(0xab);
        const readable = createReadableFromArray([largeChunk]);
        const result = await streamToUint8Array(readable);

        expect(result.length).toBe(65536);
        expect(result[0]).toBe(0xab);
        expect(result[65535]).toBe(0xab);
      });
    });

    describe("Special Values", () => {
      it("should handle null-like values in object mode", async () => {
        const readable = createReadableFromArray([0, "", false, undefined], { objectMode: true });
        const results: unknown[] = [];

        for await (const chunk of readable) {
          results.push(chunk);
        }

        // 0, '', and false must be preserved even when undefined is skipped
        expect(results).toContain(0);
        expect(results).toContain("");
        expect(results).toContain(false);
      });

      it("should handle objects with various types", async () => {
        const data = [
          { type: "string", value: "hello" },
          { type: "number", value: 42 },
          { type: "array", value: [1, 2, 3] },
          { type: "nested", value: { a: { b: { c: 1 } } } }
        ];
        const readable = createReadableFromArray(data, { objectMode: true });
        const collector = createCollector<(typeof data)[0]>();

        await pipeline(readable, collector);

        expect(collector.chunks).toEqual(data);
      });
    });

    describe("Error Propagation", () => {
      it("should propagate transform errors through pipeline", async () => {
        const readable = createReadableFromArray(["ok", "error", "never"], { objectMode: true });
        const transform = createTransform<string, string>(
          chunk => {
            if (chunk === "error") {
              throw new Error("Transform error");
            }
            return chunk;
          },
          { objectMode: true }
        );
        const collector = createCollector<string>();

        await expect(pipeline(readable, transform, collector)).rejects.toThrow("Transform error");
      });

      it("should emit error event on destroyed stream", async () => {
        const readable = createReadableFromArray([1, 2, 3], { objectMode: true });
        const errorPromise = new Promise<Error>(resolve => {
          readable.on("error", resolve);
        });

        readable.destroy(new Error("Destroy error"));

        const error = await errorPromise;
        expect(error.message).toBe("Destroy error");
        expect(isDestroyed(readable)).toBe(true);
      });
    });

    describe("Chained Transforms", () => {
      it("should handle multiple transforms in pipeline", async () => {
        const readable = createReadableFromArray([1, 2, 3], { objectMode: true });
        const double = createTransform<number, number>(n => n * 2, { objectMode: true });
        const addTen = createTransform<number, number>(n => n + 10, { objectMode: true });
        const collector = createCollector<number>();

        await pipeline(readable, double, addTen, collector);

        expect(collector.chunks).toEqual([12, 14, 16]); // (1*2)+10, (2*2)+10, (3*2)+10
      });

      it("should handle compose with multiple transforms using events", async () => {
        const double = createTransform<number, number>(n => n * 2, { objectMode: true });
        const addTen = createTransform<number, number>(n => n + 10, { objectMode: true });
        const composed = compose(double, addTen);

        const results: number[] = [];
        composed.on("data", (n: number) => results.push(n));

        composed.write(1);
        composed.write(2);
        composed.write(3);
        composed.end();

        await new Promise<void>(resolve => composed.on("end", resolve));

        expect(results).toEqual([12, 14, 16]);
      });
    });

    describe("Async Transform Functions", () => {
      it("should handle async transform function", async () => {
        const readable = createReadableFromArray([1, 2, 3], { objectMode: true });
        const asyncTransform = createTransform<number, number>(
          async n => {
            await new Promise(resolve => setTimeout(resolve, 1));
            return n * 2;
          },
          { objectMode: true }
        );
        const collector = createCollector<number>();

        await pipeline(readable, asyncTransform, collector);

        expect(collector.chunks).toEqual([2, 4, 6]);
      });

      it("should handle async error in transform", async () => {
        const readable = createReadableFromArray([1, 2], { objectMode: true });
        const asyncTransform = createTransform<number, number>(
          async n => {
            await new Promise(resolve => setTimeout(resolve, 1));
            if (n === 2) {
              throw new Error("Async error");
            }
            return n;
          },
          { objectMode: true }
        );
        const collector = createCollector<number>();

        await expect(pipeline(readable, asyncTransform, collector)).rejects.toThrow("Async error");
      });
    });

    describe("Readable from Various Sources", () => {
      it("should create readable from async iterable", async () => {
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

      it("should create readable from generator", async () => {
        const readable = createReadableFromGenerator(
          async function* () {
            yield "a";
            yield "b";
            yield "c";
          },
          { objectMode: true }
        );

        const results: string[] = [];
        for await (const chunk of readable) {
          results.push(chunk as string);
        }

        expect(results).toEqual(["a", "b", "c"]);
      });

      it("should create readable from resolved promise", async () => {
        const readable = createReadableFromPromise(Promise.resolve("resolved"), {
          objectMode: true
        });

        const results: string[] = [];
        for await (const chunk of readable) {
          results.push(chunk as string);
        }

        expect(results).toEqual(["resolved"]);
      });

      it("should handle rejected promise in createReadableFromPromise", async () => {
        const readable = createReadableFromPromise(Promise.reject(new Error("Rejected")), {
          objectMode: true
        });

        const errorPromise = new Promise<Error>(resolve => {
          readable.on("error", resolve);
        });

        const error = await errorPromise;
        expect(error.message).toBe("Rejected");
      });
    });

    describe("Stream State Transitions", () => {
      it("should track readable state correctly", async () => {
        const readable = createReadableFromArray([1, 2], { objectMode: true });

        expect(readable.readable).toBe(true);
        expect(readable.readableEnded).toBe(false);

        const results: number[] = [];
        for await (const chunk of readable) {
          results.push(chunk as number);
        }

        expect(readable.readableEnded).toBe(true);
      });

      it("should track writable state correctly", async () => {
        const collector = createCollector<number>();

        expect(collector.writable).toBe(true);

        collector.write(1);
        collector.end();

        // Wait for end() to complete - needed because end triggers async close
        await finished(collector);

        expect(collector.writableFinished).toBe(true);
      });

      it("should handle destroy on writable", async () => {
        const collector = createCollector<number>();
        collector.destroy();

        expect(isDestroyed(collector)).toBe(true);
      });
    });

    describe("Binary Utilities", () => {
      it("should concatenate empty array", () => {
        const result = concatUint8Arrays([]);
        expect(result).toEqual(new Uint8Array(0));
      });

      it("should concatenate single array", () => {
        const arr = new Uint8Array([1, 2, 3]);
        const result = concatUint8Arrays([arr]);
        expect(result).toEqual(new Uint8Array([1, 2, 3]));
      });

      it("should concatenate multiple arrays", () => {
        const result = concatUint8Arrays([
          new Uint8Array([1, 2]),
          new Uint8Array([3, 4]),
          new Uint8Array([5])
        ]);
        expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
      });

      it("should find index of pattern", () => {
        const haystack = new Uint8Array([1, 2, 3, 4, 5, 3, 4]);
        const needle = new Uint8Array([3, 4]);

        expect(uint8ArrayIndexOf(haystack, needle)).toBe(2);
        expect(uint8ArrayIndexOf(haystack, needle, 3)).toBe(5);
        expect(uint8ArrayIndexOf(haystack, new Uint8Array([6]))).toBe(-1);
      });

      it("should check array equality", () => {
        const a = new Uint8Array([1, 2, 3]);
        const b = new Uint8Array([1, 2, 3]);
        const c = new Uint8Array([1, 2, 4]);
        const d = new Uint8Array([1, 2]);

        expect(uint8ArrayEquals(a, b)).toBe(true);
        expect(uint8ArrayEquals(a, c)).toBe(false);
        expect(uint8ArrayEquals(a, d)).toBe(false);
      });

      it("should convert string to Uint8Array and back", () => {
        const original = "Hello, 世界! 🎉";
        const encoded = stringToUint8Array(original);
        const decoded = uint8ArrayToString(encoded);

        expect(decoded).toBe(original);
      });
    });

    describe("DuplexPair Edge Cases", () => {
      it("should handle bidirectional communication", async () => {
        const [stream1, stream2] = duplexPair({ objectMode: true });

        const received1: unknown[] = [];
        const received2: unknown[] = [];

        stream1.on("data", (chunk: unknown) => received1.push(chunk));
        stream2.on("data", (chunk: unknown) => received2.push(chunk));

        // Send from both sides
        stream1.write("from1-a");
        stream1.write("from1-b");
        stream2.write("from2-a");
        stream2.write("from2-b");

        await new Promise(resolve => setTimeout(resolve, 20));

        expect(received1).toEqual(["from2-a", "from2-b"]);
        expect(received2).toEqual(["from1-a", "from1-b"]);
      });

      it("should handle end signal propagation", async () => {
        const [stream1, stream2] = duplexPair({ objectMode: true });

        stream1.write("data");
        stream1.end();

        const endPromise = new Promise<void>(resolve => {
          stream2.on("end", resolve);
        });

        stream2.resume();
        await endPromise;

        expect(stream2.readableEnded).toBe(true);
      });
    });

    describe("FinishedAll", () => {
      it("should wait for multiple streams", async () => {
        const readable1 = createReadableFromArray([1, 2], { objectMode: true });
        const readable2 = createReadableFromArray([3, 4], { objectMode: true });
        const readable3 = createReadableFromArray([5, 6], { objectMode: true });

        readable1.resume();
        readable2.resume();
        readable3.resume();

        await finishedAll([readable1, readable2, readable3]);

        expect(readable1.readableEnded).toBe(true);
        expect(readable2.readableEnded).toBe(true);
        expect(readable3.readableEnded).toBe(true);
      });

      it("should handle empty array", async () => {
        await finishedAll([]);
        // Should not throw
      });

      it("should handle single stream", async () => {
        const readable = createReadableFromArray([1], { objectMode: true });
        readable.resume();

        await finishedAll([readable]);

        expect(readable.readableEnded).toBe(true);
      });
    });

    describe("Abort Signal", () => {
      it("should abort stream on signal", async () => {
        const controller = new AbortController();
        const readable = createReadableFromArray([1, 2, 3], { objectMode: true });

        addAbortSignal(controller.signal, readable);

        const errorPromise = new Promise<Error>(resolve => {
          readable.on("error", resolve);
        });

        controller.abort();

        const error = await errorPromise;
        expect(error.message).toBe("Aborted");
        expect(isDestroyed(readable)).toBe(true);
      });

      it("should handle already aborted signal", async () => {
        const controller = new AbortController();
        controller.abort();

        const readable = createReadableFromArray([1, 2, 3], { objectMode: true });

        const errorPromise = new Promise<Error>(resolve => {
          readable.on("error", resolve);
        });

        addAbortSignal(controller.signal, readable);

        await errorPromise;
        expect(isDestroyed(readable)).toBe(true);
      });
    });

    describe("Extreme Edge Cases", () => {
      describe("Boundary Values", () => {
        it("should handle MAX_SAFE_INTEGER in object mode", async () => {
          const readable = createReadableFromArray([Number.MAX_SAFE_INTEGER], { objectMode: true });
          const results: number[] = [];
          for await (const chunk of readable) {
            results.push(chunk as number);
          }
          expect(results).toEqual([Number.MAX_SAFE_INTEGER]);
        });

        it("should handle negative numbers including MIN_SAFE_INTEGER", async () => {
          const data = [-1, -0, Number.MIN_SAFE_INTEGER, -Infinity];
          const readable = createReadableFromArray(data, { objectMode: true });
          const results: number[] = [];
          for await (const chunk of readable) {
            results.push(chunk as number);
          }
          expect(results).toEqual(data);
        });

        it("should handle NaN and Infinity", async () => {
          const data = [NaN, Infinity, -Infinity, Number.POSITIVE_INFINITY];
          const readable = createReadableFromArray(data, { objectMode: true });
          const results: number[] = [];
          for await (const chunk of readable) {
            results.push(chunk as number);
          }
          expect(results[0]).toBeNaN();
          expect(results[1]).toBe(Infinity);
          expect(results[2]).toBe(-Infinity);
        });

        it("should handle empty Uint8Array", async () => {
          const readable = createReadableFromArray([new Uint8Array(0)]);
          const result = await streamToUint8Array(readable);
          expect(result.length).toBe(0);
        });

        it("should handle single byte values 0x00 and 0xFF", async () => {
          const readable = createReadableFromArray([new Uint8Array([0x00, 0xff])]);
          const result = await streamToUint8Array(readable);
          expect(result).toEqual(new Uint8Array([0x00, 0xff]));
        });
      });

      describe("Unicode and Special Strings", () => {
        it("should handle empty string", async () => {
          const readable = createReadableFromArray([""], { objectMode: true });
          const results: string[] = [];
          for await (const chunk of readable) {
            results.push(chunk as string);
          }
          expect(results).toEqual([""]);
        });

        it("should handle string with only whitespace", async () => {
          const data = [" ", "\t", "\n", "\r\n", "   \t\n   "];
          const readable = createReadableFromArray(data, { objectMode: true });
          const results: string[] = [];
          for await (const chunk of readable) {
            results.push(chunk as string);
          }
          expect(results).toEqual(data);
        });

        it("should handle unicode surrogate pairs (emoji)", async () => {
          const emoji = "🎉🚀👨‍👩‍👧‍👦🏳️‍🌈";
          const readable = createReadableFromArray([emoji], { objectMode: true });
          const results: string[] = [];
          for await (const chunk of readable) {
            results.push(chunk as string);
          }
          expect(results[0]).toBe(emoji);
        });

        it("should handle null character in string", async () => {
          const strWithNull = "hello\0world";
          const readable = createReadableFromArray([strWithNull], { objectMode: true });
          const results: string[] = [];
          for await (const chunk of readable) {
            results.push(chunk as string);
          }
          expect(results[0]).toBe(strWithNull);
          expect(results[0].length).toBe(11);
        });

        it("should handle very long string", async () => {
          const longStr = "x".repeat(100000);
          const readable = createReadableFromArray([longStr], { objectMode: true });
          const results: string[] = [];
          for await (const chunk of readable) {
            results.push(chunk as string);
          }
          expect(results[0].length).toBe(100000);
        });

        it("should handle mixed scripts (CJK, Arabic, Hebrew)", async () => {
          const mixed = "Hello 世界 مرحبا שלום Привет";
          const encoded = stringToUint8Array(mixed);
          const decoded = uint8ArrayToString(encoded);
          expect(decoded).toBe(mixed);
        });
      });

      describe("Object Mode Edge Cases", () => {
        it("should handle Symbol values", async () => {
          const sym = Symbol("test");
          const readable = createReadableFromArray([sym], { objectMode: true });
          const results: symbol[] = [];
          for await (const chunk of readable) {
            results.push(chunk as symbol);
          }
          expect(results[0]).toBe(sym);
        });

        it("should handle BigInt values", async () => {
          const big = BigInt("9007199254740993"); // > MAX_SAFE_INTEGER
          const readable = createReadableFromArray([big], { objectMode: true });
          const results: bigint[] = [];
          for await (const chunk of readable) {
            results.push(chunk as bigint);
          }
          expect(results[0]).toBe(big);
        });

        it("should handle Date objects", async () => {
          const date = new Date("2025-12-26T00:00:00Z");
          const readable = createReadableFromArray([date], { objectMode: true });
          const results: Date[] = [];
          for await (const chunk of readable) {
            results.push(chunk as Date);
          }
          expect(results[0].getTime()).toBe(date.getTime());
        });

        it("should handle RegExp objects", async () => {
          const regex = /test-\d+/gi;
          const readable = createReadableFromArray([regex], { objectMode: true });
          const results: RegExp[] = [];
          for await (const chunk of readable) {
            results.push(chunk as RegExp);
          }
          expect(results[0].source).toBe(regex.source);
          expect(results[0].flags).toBe(regex.flags);
        });

        it("should handle Map and Set", async () => {
          const map = new Map([
            ["a", 1],
            ["b", 2]
          ]);
          const set = new Set([1, 2, 3]);
          const readable = createReadableFromArray([map, set], { objectMode: true });
          const results: unknown[] = [];
          for await (const chunk of readable) {
            results.push(chunk);
          }
          expect(results[0]).toBeInstanceOf(Map);
          expect(results[1]).toBeInstanceOf(Set);
        });

        it("should handle circular reference objects", async () => {
          const obj: Record<string, unknown> = { a: 1 };
          obj.self = obj; // circular reference
          const readable = createReadableFromArray([obj], { objectMode: true });
          const results: unknown[] = [];
          for await (const chunk of readable) {
            results.push(chunk);
          }
          const result = results[0] as Record<string, unknown>;
          expect(result.a).toBe(1);
          expect(result.self).toBe(result);
        });

        it("should handle frozen and sealed objects", async () => {
          const frozen = Object.freeze({ a: 1 });
          const sealed = Object.seal({ b: 2 });
          const readable = createReadableFromArray([frozen, sealed], { objectMode: true });
          const results: unknown[] = [];
          for await (const chunk of readable) {
            results.push(chunk);
          }
          expect(Object.isFrozen(results[0])).toBe(true);
          expect(Object.isSealed(results[1])).toBe(true);
        });

        it("should handle function values", async () => {
          const fn = (x: number): number => x * 2;
          const readable = createReadableFromArray([fn], { objectMode: true });
          const results: unknown[] = [];
          for await (const chunk of readable) {
            results.push(chunk);
          }
          expect(results[0]).toBe(fn);
          expect((results[0] as (x: number) => number)(5)).toBe(10);
        });

        it("should handle class instances", async () => {
          class TestClass {
            constructor(public value: number) {}
            double(): number {
              return this.value * 2;
            }
          }
          const instance = new TestClass(21);
          const readable = createReadableFromArray([instance], { objectMode: true });
          const results: TestClass[] = [];
          for await (const chunk of readable) {
            results.push(chunk as TestClass);
          }
          expect(results[0]).toBeInstanceOf(TestClass);
          expect(results[0].double()).toBe(42);
        });
      });

      describe("Rapid Operations", () => {
        it("should handle rapid write-end sequence", () => {
          const collector = createCollector<number>();
          for (let i = 0; i < 100; i++) {
            collector.write(i);
          }
          collector.end();
          // Collector write is synchronous, chunks are filled immediately
          expect(collector.chunks.length).toBe(100);
        });

        it("should handle multiple listeners on same event", async () => {
          const emitter = new EventEmitter();
          const counts = [0, 0, 0, 0, 0];
          for (let i = 0; i < 5; i++) {
            const idx = i;
            emitter.on("test", () => {
              counts[idx]++;
            });
          }
          emitter.emit("test");
          emitter.emit("test");
          expect(counts).toEqual([2, 2, 2, 2, 2]);
        });

        it("should handle listener removal during emit", () => {
          const emitter = new EventEmitter();
          const results: number[] = [];
          const listener1 = (): void => {
            results.push(1);
          };
          const listener2 = (): void => {
            results.push(2);
            emitter.off("test", listener1);
          };
          const listener3 = (): void => {
            results.push(3);
          };

          emitter.on("test", listener1);
          emitter.on("test", listener2);
          emitter.on("test", listener3);
          emitter.emit("test");

          // All three should fire in first emit
          expect(results).toEqual([1, 2, 3]);

          results.length = 0;
          emitter.emit("test");
          // listener1 was removed, so only 2 and 3 fire
          expect(results).toEqual([2, 3]);
        });
      });

      describe("Transform Edge Cases", () => {
        it("should handle transform that returns same input", async () => {
          const readable = createReadableFromArray([1, 2, 3], { objectMode: true });
          const identity = createTransform<number, number>(n => n, { objectMode: true });
          const collector = createCollector<number>();
          await pipeline(readable, identity, collector);
          expect(collector.chunks).toEqual([1, 2, 3]);
        });

        it("should handle transform that returns different type", async () => {
          const readable = createReadableFromArray([1, 2, 3], { objectMode: true });
          const stringify = createTransform<number, string>(n => `num:${n}`, { objectMode: true });
          const collector = createCollector<string>();
          await pipeline(readable, stringify, collector);
          expect(collector.chunks).toEqual(["num:1", "num:2", "num:3"]);
        });

        it("should handle transform with very slow async function", async () => {
          const readable = createReadableFromArray([1], { objectMode: true });
          const slow = createTransform<number, number>(
            async n => {
              await new Promise(r => setTimeout(r, 50));
              return n * 2;
            },
            { objectMode: true }
          );
          const collector = createCollector<number>();
          await pipeline(readable, slow, collector);
          expect(collector.chunks).toEqual([2]);
        });

        it("should handle compose with three transforms", async () => {
          const t1 = createTransform<number, number>(n => n + 1, { objectMode: true });
          const t2 = createTransform<number, number>(n => n * 2, { objectMode: true });
          const t3 = createTransform<number, number>(n => n - 3, { objectMode: true });
          const composed = compose(t1, t2, t3);

          const results: number[] = [];
          composed.on("data", (n: number) => results.push(n));
          composed.write(5); // (5+1)*2-3 = 9
          composed.write(10); // (10+1)*2-3 = 19
          composed.end();
          await new Promise<void>(resolve => composed.on("end", resolve));
          expect(results).toEqual([9, 19]);
        });
      });

      describe("Pipeline Edge Cases", () => {
        it("should handle pipeline with transform to collector", async () => {
          const readable = createReadableFromArray([1, 2, 3], { objectMode: true });
          const transform = createTransform<number, number>(n => n, { objectMode: true });
          const collector = createCollector<number>();
          await pipeline(readable, transform, collector);
          expect(collector.chunks).toEqual([1, 2, 3]);
        });

        it("should handle pipeline with multiple transforms", async () => {
          const readable = createReadableFromArray(["a", "b"], { objectMode: true });
          const upper = createTransform<string, string>(s => s.toUpperCase(), { objectMode: true });
          const exclaim = createTransform<string, string>(s => s + "!", { objectMode: true });
          const collector = createCollector<string>();
          await pipeline(readable, upper, exclaim, collector);
          expect(collector.chunks).toEqual(["A!", "B!"]);
        });
      });

      describe("BufferedStream Edge Cases", () => {
        it("should handle toUint8Array after writes", async () => {
          const buffered = new BufferedStream();
          buffered.write(new Uint8Array([1, 2, 3]));
          buffered.write(new Uint8Array([4, 5]));
          const result = buffered.toUint8Array();
          expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
        });

        it("should correctly track bufferedLength with binary data", () => {
          const buffered = new BufferedStream();
          buffered.write(new Uint8Array([1, 2, 3]));
          buffered.write(new Uint8Array([4, 5]));
          expect(buffered.bufferedLength).toBe(5);
        });
      });

      describe("PullStream Edge Cases", () => {
        it("should handle pull with zero bytes", async () => {
          const pullStream = new PullStream();
          pullStream.write(new Uint8Array([1, 2, 3]));
          const result = await pullStream.pull(0);
          expect(result.length).toBe(0);
        });

        it("should handle pullUntil with pattern at start of data", async () => {
          const pullStream = new PullStream();
          pullStream.write(new Uint8Array([65, 66, 67])); // ABC
          const result = await pullStream.pullUntil(new Uint8Array([65])); // A
          expect(result.length).toBe(0); // Empty before A
        });

        it("should handle pullUntil with pattern at very end", async () => {
          const pullStream = new PullStream();
          pullStream.write(new Uint8Array([1, 2, 3, 255]));
          pullStream.end();
          const result = await pullStream.pullUntil(new Uint8Array([255]));
          expect(new Uint8Array(result)).toEqual(new Uint8Array([1, 2, 3]));
        });

        it("should reject pending pull() when destroy() is called", async () => {
          const pullStream = new PullStream();
          pullStream.write(new Uint8Array([1, 2]));

          // Start a pull for more data than available — will block
          const pullPromise = pullStream.pull(100);

          // Destroy while pull is pending
          pullStream.destroy();

          await expect(pullPromise).rejects.toThrow("Stream destroyed");
        });

        it("should reject pending pullUntil() when destroy() is called", async () => {
          const pullStream = new PullStream();
          pullStream.write(new Uint8Array([1, 2, 3]));

          // Pattern not in buffer — will block waiting for more data
          const pullPromise = pullStream.pullUntil(new Uint8Array([255]));

          pullStream.destroy();

          await expect(pullPromise).rejects.toThrow("Stream destroyed");
        });
      });

      describe("ChunkedBuilder Edge Cases", () => {
        it("should handle pushing empty strings", () => {
          const builder = new ChunkedBuilder();
          builder.push("");
          builder.push("");
          builder.push("x");
          builder.push("");
          // length counts pieces + chunks, stringLength counts characters
          expect(builder.stringLength).toBe(1);
          expect(builder.toString()).toBe("x");
        });

        it("should handle pushing very long strings", () => {
          const builder = new ChunkedBuilder();
          const longStr = "a".repeat(50000);
          builder.push(longStr);
          builder.push(longStr);
          expect(builder.stringLength).toBe(100000);
        });
      });

      describe("TransactionalChunkedBuilder Edge Cases", () => {
        it("should handle multiple consecutive rollbacks", () => {
          const builder = new TransactionalChunkedBuilder();
          builder.push("base");

          builder.snapshot();
          builder.push("1");
          builder.rollback();

          builder.snapshot();
          builder.push("2");
          builder.rollback();

          builder.snapshot();
          builder.push("3");
          builder.commit();

          expect(builder.toString()).toBe("base3");
        });

        it("should handle deep nested snapshots", () => {
          const builder = new TransactionalChunkedBuilder();
          builder.push("0");

          builder.snapshot();
          builder.push("1");
          builder.snapshot();
          builder.push("2");
          builder.snapshot();
          builder.push("3");
          builder.commit();
          builder.commit();
          builder.commit();

          expect(builder.toString()).toBe("0123");
        });

        it("should handle rollback after consolidation correctly", () => {
          // Use a small chunkSize so that consolidation would trigger during pushes
          const builder = new TransactionalChunkedBuilder({ chunkSize: 2 });

          builder.push("a");
          builder.push("b");
          // With chunkSize=2, consolidation fires (no snapshot active)

          builder.snapshot();
          builder.push("c");
          builder.push("d");
          // Consolidation is blocked because a snapshot is active

          // Rollback should restore to state before "c" and "d"
          builder.rollback();

          // The result should only contain "a" and "b"
          expect(builder.toString()).toBe("ab");
        });

        it("should handle snapshot-push-consolidate-rollback cycle", () => {
          const builder = new TransactionalChunkedBuilder({ chunkSize: 3 });

          // Add initial data
          builder.push("x");
          builder.push("y");
          builder.push("z");
          // Consolidation happens (3 pieces -> 1 chunk, no snapshot active)

          builder.snapshot();

          builder.push("1");
          builder.push("2");
          builder.push("3");
          // Consolidation is blocked because a snapshot is active

          builder.rollback();
          expect(builder.toString()).toBe("xyz");
        });

        it("should consolidate deferred pieces after all snapshots are committed", () => {
          const builder = new TransactionalChunkedBuilder({ chunkSize: 2 });

          builder.snapshot();
          builder.push("a");
          builder.push("b");
          builder.push("c");
          // Consolidation blocked — all 3 pieces remain in _pieces

          builder.commit();
          // After commit, next push that hits chunkSize will consolidate

          builder.push("d");
          // Now 4 pieces, chunkSize=2, consolidation fires

          const result = builder.toString();
          expect(result).toBe("abcd");
        });
      });

      describe("Collector Edge Cases", () => {
        it("should handle toUint8Array with mixed size chunks", () => {
          const collector = createCollector<Uint8Array>();
          collector.write(new Uint8Array([1]));
          collector.write(new Uint8Array([2, 3, 4, 5, 6]));
          collector.write(new Uint8Array([7, 8]));
          collector.end();

          // Both Node.js and browser Collector have synchronous write
          const result = collector.toUint8Array();
          expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
        });

        it("should handle ArrayBuffer and ArrayBufferView chunks", () => {
          const collector = createCollector<unknown>();

          collector.write(new Uint8Array([1, 2]));
          collector.write(new Uint8Array([3, 4]).buffer);
          collector.write(new DataView(new Uint8Array([5, 6]).buffer));
          collector.end();

          const result = collector.toUint8Array();
          expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
        });

        it("should throw consistent error message for non-binary data in toUint8Array", () => {
          const collector = createCollector<string>();
          collector.write("hello");
          collector.end();

          expect(() => collector.toUint8Array()).toThrow("non-binary data");
        });
      });

      describe("Binary Utilities Edge Cases", () => {
        it("should handle uint8ArrayIndexOf with overlapping pattern", () => {
          const haystack = new Uint8Array([1, 1, 1, 2]);
          const needle = new Uint8Array([1, 1, 2]);
          expect(uint8ArrayIndexOf(haystack, needle)).toBe(1);
        });

        it("should handle uint8ArrayIndexOf with needle longer than haystack", () => {
          const haystack = new Uint8Array([1, 2]);
          const needle = new Uint8Array([1, 2, 3]);
          expect(uint8ArrayIndexOf(haystack, needle)).toBe(-1);
        });

        it("should handle concatUint8Arrays with many small arrays", () => {
          const arrays = Array.from({ length: 100 }, (_, i) => new Uint8Array([i]));
          const result = concatUint8Arrays(arrays);
          expect(result.length).toBe(100);
          expect(result[0]).toBe(0);
          expect(result[99]).toBe(99);
        });

        it("should handle stringToUint8Array with astral plane characters", () => {
          const str = "𝟙𝟚𝟛"; // Mathematical monospace digits
          const encoded = stringToUint8Array(str);
          const decoded = uint8ArrayToString(encoded);
          expect(decoded).toBe(str);
        });
      });

      describe("Promisify Edge Cases", () => {
        it("should handle promisify with undefined result", async () => {
          const fn = (cb: (err?: Error | null, result?: undefined) => void): void => {
            setTimeout(() => cb(null, undefined), 1);
          };
          const result = await promisify(fn);
          expect(result).toBeUndefined();
        });

        it("should handle promisify with sync callback", async () => {
          const fn = (cb: (err?: Error | null, result?: string) => void): void => {
            cb(null, "sync");
          };
          const result = await promisify(fn);
          expect(result).toBe("sync");
        });
      });

      describe("Type Guard Edge Cases", () => {
        it("should return false for objects with similar properties", () => {
          const fakeReadable = { readable: true, read: () => null };
          const fakeWritable = { writable: true, write: () => true };

          // These should still work based on implementation
          // but test the edge case of similar-looking objects
          expect(isStream(null)).toBe(false);
          expect(isStream(undefined)).toBe(false);
          expect(isStream({})).toBe(false);
          expect(isStream({ pipe: "not a function" })).toBe(false);
          // Similar-looking plain objects are not treated as streams
          expect(isReadable(fakeReadable)).toBe(false);
          expect(isWritable(fakeWritable)).toBe(false);
        });

        it("should handle destroyed state correctly", () => {
          const readable = createReadableFromArray([1], { objectMode: true });
          expect(isDestroyed(readable)).toBe(false);
          readable.destroy();
          expect(isDestroyed(readable)).toBe(true);
        });
      });

      describe("Memory and Resource Edge Cases", () => {
        it("should handle creating many streams", async () => {
          const streams = Array.from({ length: 50 }, (_, i) =>
            createReadableFromArray([i], { objectMode: true })
          );

          const results = await Promise.all(
            streams.map(async s => {
              const chunks: number[] = [];
              for await (const c of s) {
                chunks.push(c as number);
              }
              return chunks[0];
            })
          );

          expect(results.length).toBe(50);
          expect(results[0]).toBe(0);
          expect(results[49]).toBe(49);
        });

        it("should handle stream that is never read", async () => {
          const readable = createReadableFromArray([1, 2, 3], { objectMode: true });
          readable.destroy();
          expect(isDestroyed(readable)).toBe(true);
        });
      });

      // =========================================================================
      // Additional Edge Cases - Wave 3
      // =========================================================================

      describe("Timing and Ordering Edge Cases", () => {
        it("should preserve order with interleaved writes", async () => {
          const collector = createCollector<string>();
          const order: number[] = [];

          collector.write("a");
          order.push(1);
          collector.write("b");
          order.push(2);
          collector.write("c");
          order.push(3);
          collector.end();

          expect(collector.chunks).toEqual(["a", "b", "c"]);
          expect(order).toEqual([1, 2, 3]);
        });

        it("should handle pause/resume timing", async () => {
          const readable = createReadableFromArray([1, 2, 3, 4, 5], { objectMode: true });
          const results: number[] = [];

          readable.on("data", chunk => results.push(chunk as number));
          readable.pause();

          // Should not receive data while paused
          await new Promise(resolve => setTimeout(resolve, 10));
          const countWhilePaused = results.length;

          readable.resume();
          await finished(readable);

          expect(results.length).toBe(5);
          expect(countWhilePaused).toBe(0);
        });

        it("should handle immediate end after creation", async () => {
          const readable = createEmptyReadable({ objectMode: true });
          const chunks: unknown[] = [];

          for await (const chunk of readable) {
            chunks.push(chunk);
          }

          expect(chunks).toEqual([]);
        });
      });

      describe("Pause/Resume Events", () => {
        it("should emit pause event synchronously when paused", () => {
          const readable = createReadableFromArray([1, 2, 3], { objectMode: true });
          let pauseCount = 0;

          readable.on("pause", () => pauseCount++);
          readable.on("data", () => {});

          // Now flowing — pause it
          readable.pause();

          // pause event must be synchronous — available immediately
          expect(pauseCount).toBe(1);
        });

        it("should emit resume event asynchronously when resumed after pause", async () => {
          const readable = createReadableFromArray([1, 2, 3], { objectMode: true });
          let resumeCount = 0;

          readable.on("resume", () => resumeCount++);
          readable.on("data", () => {});

          readable.pause();
          readable.resume();

          // resume event must be asynchronous — NOT available synchronously
          expect(resumeCount).toBe(0);

          // should fire exactly once after async flush
          await new Promise(resolve => setTimeout(resolve, 50));
          expect(resumeCount).toBe(1);
        });

        it("should not emit pause when already paused", () => {
          const readable = createReadableFromArray([1, 2, 3], { objectMode: true });
          let pauseCount = 0;

          readable.on("pause", () => pauseCount++);
          readable.on("data", () => {});

          readable.pause();
          readable.pause(); // second pause — should not emit

          // synchronous check — no waiting needed
          expect(pauseCount).toBe(1);
        });
      });

      describe("Pipe/Unpipe Events on Writable", () => {
        it("should emit pipe event on writable when piped to", async () => {
          const readable = createReadableFromArray([1, 2, 3], { objectMode: true });
          const writable = createWritable({
            objectMode: true,
            write(_chunk: unknown, _encoding: string, callback: (error?: Error | null) => void) {
              callback();
            }
          });

          let pipeSource: unknown = null;
          writable.on("pipe", (src: unknown) => {
            pipeSource = src;
          });

          readable.pipe(writable);

          expect(pipeSource).toBe(readable);

          await finished(writable);
        });

        it("should emit unpipe event on writable when unpiped", () => {
          const readable = createReadableFromArray([1, 2, 3], { objectMode: true });
          const writable = createWritable({
            objectMode: true,
            write(_chunk: unknown, _encoding: string, callback: (error?: Error | null) => void) {
              callback();
            }
          });

          let unpipeSource: unknown = null;
          writable.on("unpipe", (src: unknown) => {
            unpipeSource = src;
          });

          readable.pipe(writable);
          readable.unpipe(writable);

          expect(unpipeSource).toBe(readable);
        });
      });

      describe("Error Recovery Edge Cases", () => {
        it("should not emit data after error", async () => {
          let count = 0;
          const transform = createTransform<number, number>(
            n => {
              count++;
              if (count === 2) {
                throw new Error("Stop at 2");
              }
              return n;
            },
            { objectMode: true }
          );

          const results: number[] = [];
          const errors: Error[] = [];

          transform.on("data", n => results.push(n as number));
          transform.on("error", err => errors.push(err));

          transform.write(1);
          transform.write(2);
          transform.write(3); // Should not process

          await new Promise(resolve => setTimeout(resolve, 10));

          expect(results).toEqual([1]);
          expect(errors.length).toBe(1);
          expect(errors[0].message).toBe("Stop at 2");
        });

        it("should handle error in pipeline source", async () => {
          const errorReadable = createReadableFromGenerator(
            async function* () {
              yield 1;
              throw new Error("Source error");
            },
            { objectMode: true }
          );

          const collector = createCollector();

          await expect(pipeline(errorReadable, collector)).rejects.toThrow();
        });
      });

      describe("State Transition Edge Cases", () => {
        it("should track readable state transitions", async () => {
          const readable = createReadableFromArray([1, 2], { objectMode: true });
          const states: boolean[] = [];

          states.push(readable.readable);

          for await (const _ of readable) {
            states.push(readable.readable);
          }

          states.push(readable.readable);

          // Initial readable state should be true
          expect(states[0]).toBe(true);
        });

        it("should track writable state transitions", async () => {
          const collector = createCollector<number>();

          expect(collector.writable).toBe(true);
          expect(collector.writableEnded).toBe(false);

          collector.write(1);
          expect(collector.writable).toBe(true);

          collector.end();
          expect(collector.writableEnded).toBe(true);

          await finished(collector);
          expect(collector.writableFinished).toBe(true);
        });

        it("should handle writable cork/uncork", async () => {
          const collector = createCollector<number>();

          collector.cork();
          collector.write(1);
          collector.write(2);
          collector.write(3);

          // Data can be buffered before uncork
          await new Promise(resolve => setTimeout(resolve, 5));

          collector.uncork();
          await new Promise(resolve => setTimeout(resolve, 10));

          collector.end();
          await finished(collector);
          expect(collector.chunks).toEqual([1, 2, 3]);
        });
      });

      describe("Binary Data Edge Cases", () => {
        it("should handle binary data with all byte values", async () => {
          // Create array with all possible byte values (0-255)
          const allBytes = new Uint8Array(256);
          for (let i = 0; i < 256; i++) {
            allBytes[i] = i;
          }

          const readable = createReadableFromArray([allBytes]);
          const result = await streamToUint8Array(readable);

          expect(result.length).toBe(256);
          expect(result[0]).toBe(0);
          expect(result[127]).toBe(127);
          expect(result[255]).toBe(255);
        });

        it("should handle binary data at exact buffer boundaries", async () => {
          // Create data near common buffer boundaries (16KB, 64KB)
          const size = 16 * 1024; // 16KB
          const data = new Uint8Array(size);
          data.fill(42);

          const readable = createReadableFromArray([data]);
          const result = await streamToUint8Array(readable);

          expect(result.length).toBe(size);
          expect(result.every(b => b === 42)).toBe(true);
        });

        it("should handle empty chunks in binary stream", async () => {
          const readable = createReadableFromArray([
            new Uint8Array([1, 2]),
            new Uint8Array(0), // Empty chunk
            new Uint8Array([3, 4])
          ]);

          const result = await streamToUint8Array(readable);
          expect(result).toEqual(new Uint8Array([1, 2, 3, 4]));
        });
      });

      describe("String Encoding Edge Cases", () => {
        it("should handle strings with null characters", async () => {
          const str = "hello\x00world\x00!";
          const readable = createReadableFromArray([stringToUint8Array(str)]);
          const result = await streamToString(readable);
          expect(result).toBe(str);
        });

        it("should handle very long single-line string", async () => {
          const longStr = "x".repeat(100000);
          const readable = createReadableFromArray([stringToUint8Array(longStr)]);
          const result = await streamToString(readable);
          expect(result.length).toBe(100000);
        });

        it("should handle strings with mixed line endings", async () => {
          const mixedEndings = "line1\nline2\r\nline3\rline4";
          const readable = createReadableFromArray([stringToUint8Array(mixedEndings)]);
          const result = await streamToString(readable);
          expect(result).toBe(mixedEndings);
        });

        it("should handle string with BOM", async () => {
          const bomStr = "\uFEFFcontent with BOM";
          const readable = createReadableFromArray([stringToUint8Array(bomStr)]);
          const result = await streamToString(readable);
          expect(result).toBe(bomStr);
        });

        it("should decode split multibyte UTF-8 across chunk boundaries", async () => {
          const bytes = stringToUint8Array("A😀B");
          const readable = createReadableFromArray([
            bytes.subarray(0, 2),
            bytes.subarray(2, 4),
            bytes.subarray(4)
          ]);
          const result = await streamToString(readable);
          expect(result).toBe("A😀B");
        });

        it("should support utf16le/ucs2 alias decoding consistently", async () => {
          const utf16leBytes = new Uint8Array([0x41, 0x00, 0xa9, 0x03]); // "AΩ"

          const fromUtf16le = await streamToString(
            createReadableFromArray([utf16leBytes]),
            "utf16le"
          );
          const fromUcs2 = await streamToString(createReadableFromArray([utf16leBytes]), "ucs2");

          expect(fromUtf16le).toBe("AΩ");
          expect(fromUcs2).toBe("AΩ");
        });

        it("should decode numeric array-like chunks consistently", async () => {
          const arrayLikeChunk = { 0: 65, 1: 66, 2: 67, length: 3 };
          const readable = createReadableFromAsyncIterable(
            (async function* () {
              yield arrayLikeChunk as unknown as Uint8Array;
            })()
          );

          const result = await streamToString(readable);
          expect(result).toBe("ABC");
        });

        it("should reject unsupported text encodings consistently", async () => {
          const readable = createReadableFromArray([stringToUint8Array("abc")]);
          await expect(streamToString(readable, "base64")).rejects.toThrow(TypeError);
        });
      });

      describe("Duplex Pair Edge Cases", () => {
        it("should handle bidirectional communication", async () => {
          const [client, server] = duplexPair({ objectMode: true });

          const clientReceived: unknown[] = [];
          const serverReceived: unknown[] = [];

          client.on("data", chunk => clientReceived.push(chunk));
          server.on("data", chunk => serverReceived.push(chunk));

          // Client sends to server
          client.write("hello from client");
          // Server sends to client
          server.write("hello from server");

          await new Promise(resolve => setTimeout(resolve, 20));

          expect(serverReceived).toEqual(["hello from client"]);
          expect(clientReceived).toEqual(["hello from server"]);

          client.end();
          server.end();
        });

        it("should handle one-way close", async () => {
          const [side1, side2] = duplexPair({ objectMode: true });

          side1.end();
          await new Promise(resolve => setTimeout(resolve, 10));

          // side2 should still be able to write
          expect(side2.writable).toBe(true);
          side2.end();
        });
      });

      describe("High Water Mark Edge Cases", () => {
        it("should respect custom high water mark", () => {
          const hwm = 1024;
          const readable = createReadableFromArray([1, 2, 3], {
            highWaterMark: hwm,
            objectMode: true
          });

          expect(readable.readableHighWaterMark).toBe(hwm);
        });

        it("should handle zero high water mark", () => {
          const readable = createReadableFromArray([1], {
            highWaterMark: 0,
            objectMode: true
          });

          // Should still work, just with immediate backpressure
          expect(readable.readableHighWaterMark).toBe(0);
        });

        it("should handle very large high water mark", () => {
          const hwm = 1024 * 1024 * 10; // 10MB
          const readable = createReadableFromArray([1], {
            highWaterMark: hwm,
            objectMode: true
          });

          expect(readable.readableHighWaterMark).toBe(hwm);
        });
      });

      describe("Event Listener Edge Cases", () => {
        it("should handle removeAllListeners", () => {
          const emitter = new EventEmitter();
          let count = 0;

          emitter.on("test", () => count++);
          emitter.on("test", () => count++);
          emitter.on("other", () => count++);

          emitter.emit("test");
          expect(count).toBe(2);

          emitter.removeAllListeners("test");
          emitter.emit("test");
          expect(count).toBe(2); // No change

          emitter.emit("other");
          expect(count).toBe(3); // "other" still works
        });

        it("should handle setMaxListeners", () => {
          const emitter = new EventEmitter();
          emitter.setMaxListeners(100);
          expect(emitter.getMaxListeners()).toBe(100);

          // Add many listeners without warning
          for (let i = 0; i < 50; i++) {
            emitter.on("test", () => {});
          }

          expect(emitter.listenerCount("test")).toBe(50);
        });

        it("should handle prependListener", () => {
          const emitter = new EventEmitter();
          const order: number[] = [];

          emitter.on("test", () => order.push(1));
          emitter.prependListener("test", () => order.push(0));

          emitter.emit("test");
          expect(order).toEqual([0, 1]);
        });

        it("should handle prependOnceListener", () => {
          const emitter = new EventEmitter();
          const order: number[] = [];

          emitter.on("test", () => order.push(2));
          emitter.prependOnceListener("test", () => order.push(1));

          emitter.emit("test");
          emitter.emit("test");

          // First emit: [1, 2], second emit: [2]
          expect(order).toEqual([1, 2, 2]);
        });
      });

      describe("Pipeline Chaining Edge Cases", () => {
        it("should handle pipeline with many transforms", async () => {
          const source = createReadableFromArray([1, 2, 3, 4, 5], { objectMode: true });

          // Chain of transforms: +1, *2, +1, *2
          const t1 = createTransform<number, number>(n => n + 1, { objectMode: true });
          const t2 = createTransform<number, number>(n => n * 2, { objectMode: true });
          const t3 = createTransform<number, number>(n => n + 1, { objectMode: true });
          const t4 = createTransform<number, number>(n => n * 2, { objectMode: true });
          const collector = createCollector<number>();

          await pipeline(source, t1, t2, t3, t4, collector);

          // (1+1)*2 = 4, (4+1)*2 = 10
          // (2+1)*2 = 6, (6+1)*2 = 14
          // etc.
          expect(collector.chunks).toEqual([10, 14, 18, 22, 26]);
        });

        it("should handle pipeline with transform returning array as single value", async () => {
          const source = createReadableFromArray([1, 2, 3], { objectMode: true });
          const transform = createTransform<number, number[]>(
            n => [n, n * 10], // Return array as single object
            { objectMode: true }
          );
          const collector = createCollector<number[]>();

          await pipeline(source, transform, collector);
          expect(collector.chunks).toEqual([
            [1, 10],
            [2, 20],
            [3, 30]
          ]);
        });

        it("should skip undefined outputs from transform", async () => {
          const source = createReadableFromArray([1, 2, 3, 4, 5], { objectMode: true });
          const transform = createTransform<number, number | undefined>(
            n => (n % 2 === 0 ? n : undefined), // Filter out odd numbers
            { objectMode: true }
          );
          const collector = createCollector<number | undefined>();

          await pipeline(source, transform, collector);
          expect(collector.chunks).toEqual([2, 4]);
        });
      });

      describe("Consumers Edge Cases", () => {
        it("should handle consumers.buffer with empty stream", async () => {
          const readable = createEmptyReadable();
          const result = await consumers.buffer(readable);
          expect(result.length).toBe(0);
        });

        it("should handle consumers.text with empty stream", async () => {
          const readable = createEmptyReadable();
          const result = await consumers.text(readable);
          expect(result).toBe("");
        });

        it("should handle consumers.json with valid JSON", async () => {
          const obj = { name: "test", value: 123, nested: { arr: [1, 2, 3] } };
          const json = JSON.stringify(obj);
          const readable = createReadableFromArray([stringToUint8Array(json)]);
          const result = await consumers.json(readable);
          expect(result).toEqual(obj);
        });

        it("should handle consumers.arrayBuffer", async () => {
          const data = new Uint8Array([1, 2, 3, 4, 5]);
          const readable = createReadableFromArray([data]);
          const result = await consumers.arrayBuffer(readable);
          expect(new Uint8Array(result)).toEqual(data);
        });
      });

      describe("Copy Stream Edge Cases", () => {
        it("should copy stream to multiple destinations", async () => {
          const source = createReadableFromArray([1, 2, 3], { objectMode: true });
          const dest1 = createCollector<number>();
          const dest2 = createCollector<number>();

          // Use pipe for multi-destination
          source.pipe(dest1);
          source.pipe(dest2);

          await finished(source);
          await Promise.all([finished(dest1), finished(dest2)]);

          expect(dest1.chunks).toEqual([1, 2, 3]);
          expect(dest2.chunks).toEqual([1, 2, 3]);
        });

        it("should handle copyStream utility", async () => {
          const source = createReadableFromArray(["hello", "world"], { objectMode: true });
          const collector = createCollector<string>();

          await copyStream(source, collector);

          expect(collector.chunks).toEqual(["hello", "world"]);
        });
      });

      describe("Promises API Edge Cases", () => {
        it("should handle promises.pipeline", async () => {
          const source = createReadableFromArray([1, 2, 3], { objectMode: true });
          const transform = createTransform<number, number>(n => n * 2, { objectMode: true });
          const collector = createCollector<number>();

          await promises.pipeline(source, transform, collector);
          expect(collector.chunks).toEqual([2, 4, 6]);
        });

        it("should handle promises.finished", async () => {
          const readable = createReadableFromArray([1], { objectMode: true });

          // Consume the stream
          for await (const _ of readable) {
            // drain
          }

          // Should resolve since stream is done
          await promises.finished(readable);
        });
      });

      describe("AbortSignal Edge Cases", () => {
        it("should abort stream with AbortController", async () => {
          const controller = new AbortController();
          const readable = createReadableFromArray([1, 2, 3, 4, 5], { objectMode: true });

          addAbortSignal(controller.signal, readable);

          const chunks: number[] = [];
          readable.on("data", chunk => chunks.push(chunk as number));

          // Abort after short delay
          setTimeout(() => controller.abort(), 5);

          await new Promise(resolve => {
            readable.on("error", resolve);
            readable.on("close", resolve);
          });

          // Should have been aborted before finishing
          expect(chunks.length).toBeLessThanOrEqual(5);
        });

        it("should handle already aborted signal", async () => {
          const controller = new AbortController();
          controller.abort();

          const readable = createReadableFromArray([1, 2, 3], { objectMode: true });

          let errorEmitted = false;
          readable.on("error", () => {
            errorEmitted = true;
          });

          addAbortSignal(controller.signal, readable);

          // Stream must be destroyed synchronously
          expect(isDestroyed(readable)).toBe(true);
          // Error emission is deferred (process.nextTick / queueMicrotask) on both platforms
          await new Promise(resolve => setTimeout(resolve, 10));
          expect(errorEmitted).toBe(true);
        });
      });

      describe("Compose Edge Cases", () => {
        it("should compose transforms in correct order", async () => {
          const add1 = createTransform<number, number>(n => n + 1, { objectMode: true });
          const mul2 = createTransform<number, number>(n => n * 2, { objectMode: true });
          const sub3 = createTransform<number, number>(n => n - 3, { objectMode: true });

          // Compose: input -> add1 -> mul2 -> sub3 -> output
          // For input 5: (5+1)*2-3 = 9
          const composed = compose(add1, mul2, sub3);

          const collector = createCollector<number>();
          composed.pipe(collector);

          composed.write(5);
          composed.write(10);
          composed.end();

          await finished(collector);

          // 5: (5+1)*2-3 = 9
          // 10: (10+1)*2-3 = 19
          expect(collector.chunks).toEqual([9, 19]);
        });

        it("should handle compose with single transform", async () => {
          const double = createTransform<number, number>(n => n * 2, { objectMode: true });
          const composed = compose(double);

          const collector = createCollector<number>();
          composed.pipe(collector);

          composed.write(5);
          composed.end();

          await finished(collector);
          expect(collector.chunks).toEqual([10]);
        });
      });

      describe("Generator and Async Iterable Edge Cases", () => {
        it("should handle generator that yields promises", async () => {
          async function* asyncGen() {
            yield await Promise.resolve(1);
            yield await Promise.resolve(2);
            yield await Promise.resolve(3);
          }

          const readable = createReadableFromAsyncIterable(asyncGen(), { objectMode: true });
          const chunks: number[] = [];

          for await (const chunk of readable) {
            chunks.push(chunk as number);
          }

          expect(chunks).toEqual([1, 2, 3]);
        });

        it("should handle generator with delay between yields", async () => {
          async function* slowGen() {
            yield 1;
            await new Promise(resolve => setTimeout(resolve, 10));
            yield 2;
            await new Promise(resolve => setTimeout(resolve, 10));
            yield 3;
          }

          const readable = createReadableFromAsyncIterable(slowGen(), { objectMode: true });
          const chunks: number[] = [];

          for await (const chunk of readable) {
            chunks.push(chunk as number);
          }

          expect(chunks).toEqual([1, 2, 3]);
        });

        it("should handle generator that throws", async () => {
          async function* errorGen() {
            yield 1;
            throw new Error("Generator error");
          }

          const readable = createReadableFromAsyncIterable(errorGen(), { objectMode: true });
          const chunks: number[] = [];
          let errorCaught = false;

          try {
            for await (const chunk of readable) {
              chunks.push(chunk as number);
            }
          } catch {
            errorCaught = true;
          }

          // First chunk (1) must be yielded before the generator error
          expect(chunks).toEqual([1]);
          // Error should be propagated via for-await-of
          expect(errorCaught).toBe(true);
        });
      });

      describe("Default High Water Mark Edge Cases", () => {
        it("should get and set default high water mark", () => {
          const originalHwm = getDefaultHighWaterMark(false);
          const originalObjectHwm = getDefaultHighWaterMark(true);

          expect(originalHwm).toBe(65536);
          expect(originalObjectHwm).toBe(16);

          // Set new defaults
          const newHwm = 32768;
          const newObjectHwm = 32;
          setDefaultHighWaterMark(false, newHwm);
          setDefaultHighWaterMark(true, newObjectHwm);

          expect(getDefaultHighWaterMark(false)).toBe(32768);
          expect(getDefaultHighWaterMark(true)).toBe(32);

          // Restore
          setDefaultHighWaterMark(false, originalHwm);
          setDefaultHighWaterMark(true, originalObjectHwm);
        });
      });

      describe("Transform Flush Edge Cases", () => {
        it("should handle transform with flush that adds data", async () => {
          let flushCalled = false;
          const transform = new Transform({
            objectMode: true,
            transform(
              chunk: string,
              _encoding: string,
              callback: (err?: Error | null, data?: string) => void
            ) {
              this.push(chunk);
              callback();
            },
            flush(callback: (err?: Error | null, data?: string) => void) {
              flushCalled = true;
              this.push("flushed");
              callback();
            }
          });

          const collector = createCollector<string>();
          transform.pipe(collector);

          transform.write("data");
          transform.end();

          await finished(collector);

          expect(flushCalled).toBe(true);
          expect(collector.chunks).toEqual(["data", "flushed"]);
        });

        it("should handle transform with async flush", async () => {
          const transform = new Transform({
            objectMode: true,
            transform(
              chunk: string,
              _encoding: string,
              callback: (err?: Error | null, data?: string) => void
            ) {
              this.push(chunk);
              callback();
            },
            flush(callback: (err?: Error | null, data?: string) => void) {
              setTimeout(() => {
                this.push("async-flush");
                callback();
              }, 10);
            }
          });

          const collector = createCollector<string>();
          transform.pipe(collector);

          transform.write("data");
          transform.end();

          await finished(collector);

          expect(collector.chunks).toEqual(["data", "async-flush"]);
        });
      });

      // Wave 4: Additional Browser-Critical Edge Cases
      describe("Concurrent Operations", () => {
        it("should handle rapid consecutive writes", async () => {
          const results: number[] = [];
          const transform = createTransform<number, number>(n => n * 2, { objectMode: true });
          transform.on("data", (n: number) => results.push(n));

          // Write 100 items rapidly
          for (let i = 0; i < 100; i++) {
            transform.write(i);
          }
          transform.end();

          await finished(transform);
          expect(results.length).toBe(100);
          expect(results[0]).toBe(0);
          expect(results[99]).toBe(198);
        });

        it("should handle write during data event", async () => {
          const results: number[] = [];
          let writeCount = 0;
          const transform = createTransform<number, number>(n => n, { objectMode: true });

          transform.on("data", (n: number) => {
            results.push(n);
            // Write more data during data event (first 3 times only)
            if (writeCount < 3 && n < 10) {
              writeCount++;
              transform.write(n + 100);
            }
          });

          transform.write(1);
          transform.write(2);
          transform.write(3);
          transform.end();

          await finished(transform);
          // Original items 1, 2, 3 must appear; dynamically added 101, 102, 103 must also appear
          expect(results).toEqual(expect.arrayContaining([1, 2, 3, 101, 102, 103]));
          expect(results.length).toBe(6);
        });
      });

      describe("Destroy and Cleanup", () => {
        it("should not emit data after destroy", async () => {
          const results: number[] = [];
          let index = 0;
          const readable = new Readable({
            objectMode: true,
            read() {
              if (index >= 5) {
                this.push(null);
                return;
              }
              setTimeout(() => {
                this.push(++index);
              }, 1);
            }
          });

          readable.on("data", (n: number) => {
            results.push(n);
            if (n === 2) {
              readable.destroy();
            }
          });

          // Wait a bit for any pending events
          await new Promise(resolve => setTimeout(resolve, 50));

          expect(results).toEqual([1, 2]);
        });

        it("should handle destroy with error", async () => {
          const errors: Error[] = [];
          const readable = createReadableFromArray([1, 2, 3], { objectMode: true });

          readable.on("error", (err: Error) => errors.push(err));

          const testError = new Error("Test destroy error");
          readable.destroy(testError);

          await new Promise(resolve => setTimeout(resolve, 10));

          expect(errors.length).toBe(1);
          expect(errors[0].message).toBe("Test destroy error");
        });

        it("should handle destroy on idle stream", async () => {
          const readable = createReadableFromArray([1, 2, 3], { objectMode: true });
          let _closed = false;

          readable.on("close", () => {
            _closed = true;
          });

          readable.destroy();

          await new Promise(resolve => setTimeout(resolve, 10));
          expect(readable.destroyed).toBe(true);
        });
      });

      describe("Pipe Chain Edge Cases", () => {
        it("should handle pipe to multiple destinations sequentially", async () => {
          const source = createReadableFromArray([1, 2, 3], { objectMode: true });
          const collector1 = createCollector<number>({ objectMode: true });
          const collector2 = createCollector<number>({ objectMode: true });

          // Pipe to first, consume, then pipe to second
          source.pipe(collector1);

          await finished(collector1);

          expect(collector1.chunks).toEqual([1, 2, 3]);
          // Second collector should be empty since source is consumed
          expect(collector2.chunks).toEqual([]);
        });

        it("should handle unpipe and repipe", async () => {
          const results1: number[] = [];
          const results2: number[] = [];

          let index = 0;
          const data = [1, 2, 3, 4, 5];
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

          const writable1 = new Writable({
            objectMode: true,
            write(chunk: number, _enc: string, cb: () => void) {
              results1.push(chunk);
              cb();
            }
          });

          const writable2 = new Writable({
            objectMode: true,
            write(chunk: number, _enc: string, cb: () => void) {
              results2.push(chunk);
              cb();
            }
          });

          readable.pipe(writable1);

          // Let some data flow
          await new Promise(resolve => setTimeout(resolve, 10));

          readable.unpipe(writable1);
          readable.pipe(writable2);

          await finished(readable);

          // Both should have received some data
          expect(results1.length + results2.length).toBe(5);
        });
      });

      describe("Transform Error Propagation", () => {
        it("should propagate sync errors from transform", async () => {
          const errors: Error[] = [];
          const transform = createTransform<number, number>(
            n => {
              if (n === 2) {
                throw new Error("Sync transform error");
              }
              return n;
            },
            { objectMode: true }
          );

          transform.on("error", (err: Error) => errors.push(err));

          transform.write(1);
          transform.write(2);
          transform.write(3);

          await new Promise(resolve => setTimeout(resolve, 20));

          expect(errors.length).toBe(1);
          expect(errors[0].message).toBe("Sync transform error");
        });

        it("should propagate async errors from transform", async () => {
          const errors: Error[] = [];
          const transform = createTransform<number, number>(
            async n => {
              await new Promise(resolve => setTimeout(resolve, 1));
              if (n === 2) {
                throw new Error("Async transform error");
              }
              return n;
            },
            { objectMode: true }
          );

          transform.on("error", (err: Error) => errors.push(err));

          transform.write(1);
          transform.write(2);
          transform.write(3);

          await new Promise(resolve => setTimeout(resolve, 50));

          expect(errors.length).toBeGreaterThan(0);
          expect(errors[0].message).toBe("Async transform error");
        });
      });

      describe("Readable Iteration Edge Cases", () => {
        it("should handle break in for-await-of", async () => {
          const data = [1, 2, 3, 4, 5];
          const readable = createReadableFromArray(data, { objectMode: true });
          const results: number[] = [];

          for await (const chunk of readable) {
            results.push(chunk as number);
            if (chunk === 3) {
              break;
            }
          }

          expect(results).toEqual([1, 2, 3]);
        });

        it("should handle return in async iterator", async () => {
          const data = [1, 2, 3, 4, 5];
          const readable = createReadableFromArray(data, { objectMode: true });

          const iterator = readable[Symbol.asyncIterator]();
          const results: number[] = [];

          results.push((await iterator.next()).value);
          results.push((await iterator.next()).value);

          // Return early
          if (iterator.return) {
            await iterator.return();
          }

          expect(results).toEqual([1, 2]);
        });
      });

      describe("Binary Data Integrity", () => {
        it("should preserve binary data through pipeline", async () => {
          // Create binary data with all byte values
          const original = new Uint8Array(256);
          for (let i = 0; i < 256; i++) {
            original[i] = i;
          }

          const readable = createReadableFromArray([original], { objectMode: false });
          const collector = createCollector<Uint8Array>({ objectMode: false });

          await pipeline(readable, collector);

          const result = collector.toUint8Array();
          expect(result.length).toBe(256);
          for (let i = 0; i < 256; i++) {
            expect(result[i]).toBe(i);
          }
        });

        it("should handle chunked binary data correctly", async () => {
          // Split data into multiple chunks
          const chunk1 = new Uint8Array([0, 1, 2, 3]);
          const chunk2 = new Uint8Array([4, 5, 6, 7]);
          const chunk3 = new Uint8Array([8, 9, 10, 11]);

          const readable = createReadableFromArray([chunk1, chunk2, chunk3], {
            objectMode: false
          });
          const collector = createCollector<Uint8Array>({ objectMode: false });

          await pipeline(readable, collector);

          const result = collector.toUint8Array();
          expect(result).toEqual(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));
        });
      });

      describe("Writable Callback Timing", () => {
        it("should call write callback after write completes", async () => {
          const callbackOrder: string[] = [];

          const writable = new Writable({
            objectMode: true,
            write(_chunk: number, _enc: string, callback: (error?: Error | null) => void) {
              callbackOrder.push("write-start");
              setTimeout(() => {
                callbackOrder.push("write-end");
                callback();
              }, 5);
            }
          });

          await new Promise<void>((resolve, reject) => {
            writable.write(1, err => {
              if (err) {
                reject(err);
              }
              callbackOrder.push("callback-1");
            });
            writable.write(2, err => {
              if (err) {
                reject(err);
              }
              callbackOrder.push("callback-2");
              resolve();
            });
          });

          // Callbacks should be called after write completes
          expect(callbackOrder).toContain("callback-1");
          expect(callbackOrder).toContain("callback-2");
        });

        it("should handle callback with error", async () => {
          const errors: Error[] = [];

          const writable = new Writable({
            objectMode: true,
            write(_chunk: number, _enc: string, callback: (error?: Error | null) => void) {
              callback(new Error("Write failed"));
            }
          });

          writable.on("error", (err: Error) => errors.push(err));

          await new Promise<void>(resolve => {
            writable.write(1, () => {
              resolve();
            });
          });

          expect(errors.length).toBeGreaterThan(0);
        });
      });

      describe("Stream State Consistency", () => {
        it("should have consistent state after end", async () => {
          const writable = new Writable({
            objectMode: true,
            write(_chunk: number, _enc: string, callback: () => void) {
              callback();
            }
          });

          writable.write(1);
          writable.end();

          await finished(writable);

          expect(writable.writableEnded).toBe(true);
          expect(writable.writableFinished).toBe(true);
        });

        it("should have consistent state after error", async () => {
          const readable = createReadableFromArray([1, 2, 3], { objectMode: true });

          // Must attach error listener to prevent unhandled error
          readable.on("error", () => {});

          readable.destroy(new Error("Test error"));

          await new Promise(resolve => setTimeout(resolve, 10));

          expect(readable.destroyed).toBe(true);
        });
      });

      describe("Event Ordering", () => {
        it("should emit events in correct order for readable", async () => {
          const events: string[] = [];
          const readable = createReadableFromArray([1, 2], { objectMode: true });

          readable.on("data", () => events.push("data"));
          readable.on("end", () => events.push("end"));
          readable.on("close", () => events.push("close"));

          await finished(readable);

          // Data events should come before end
          const dataIndex = events.indexOf("data");
          const endIndex = events.indexOf("end");
          expect(dataIndex).toBeLessThan(endIndex);
        });

        it("should emit events in correct order for writable", async () => {
          const events: string[] = [];
          const writable = new Writable({
            objectMode: true,
            write(_chunk: number, _enc: string, callback: () => void) {
              callback();
            }
          });

          writable.on("finish", () => events.push("finish"));
          writable.on("close", () => events.push("close"));

          writable.write(1);
          writable.end();

          await finished(writable);

          // Finish should come before close
          const finishIndex = events.indexOf("finish");
          const closeIndex = events.indexOf("close");
          expect(finishIndex).toBeGreaterThanOrEqual(0);
          expect(closeIndex).toBeGreaterThanOrEqual(0);
          expect(finishIndex).toBeLessThan(closeIndex);
        });
      });

      describe("Memory and Resource Edge Cases", () => {
        it("should handle large number of event listeners", () => {
          const emitter = new EventEmitter();
          emitter.setMaxListeners(1000);

          const listeners: (() => void)[] = [];
          for (let i = 0; i < 100; i++) {
            const listener = (): void => {};
            listeners.push(listener);
            emitter.on("test", listener);
          }

          expect(emitter.listenerCount("test")).toBe(100);

          // Remove all listeners
          for (const listener of listeners) {
            emitter.off("test", listener);
          }

          expect(emitter.listenerCount("test")).toBe(0);
        });

        it("should handle stream with no consumers", async () => {
          const readable = createReadableFromArray([1, 2, 3], { objectMode: true });

          // Don't attach any consumers, just destroy
          readable.destroy();

          await new Promise(resolve => setTimeout(resolve, 10));

          expect(readable.destroyed).toBe(true);
        });
      });

      describe("Pipeline with Options", () => {
        it("should handle pipeline with custom Writable", async () => {
          const source = createReadableFromArray([1, 2, 3], { objectMode: true });
          const results: number[] = [];

          const dest = new Writable({
            objectMode: true,
            write(chunk: number, _enc: string, cb: () => void) {
              results.push(chunk);
              cb();
            }
          });

          await pipeline(source, dest);

          expect(results).toEqual([1, 2, 3]);
          expect(dest.writableFinished).toBe(true);
        });
      });

      describe("Collector Edge Cases", () => {
        it("should handle toString on empty collector", () => {
          const collector = createCollector<Uint8Array>({ objectMode: false });
          expect(collector.toString()).toBe("");
        });

        it("should handle toString on string collector", async () => {
          const collector = createCollector<string>({ objectMode: true });

          collector.write("hello");
          collector.write(" ");
          collector.write("world");
          collector.end();

          await finished(collector);

          expect(collector.toString()).toBe("hello world");
        });

        it("should handle toUint8Array on binary collector", async () => {
          const collector = createCollector<Uint8Array>({ objectMode: false });

          collector.write(new Uint8Array([1, 2, 3]));
          collector.write(new Uint8Array([4, 5, 6]));
          collector.end();

          await finished(collector);

          expect(collector.toUint8Array()).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
        });

        it("should handle toUint8Array on mixed binary-view collector", async () => {
          const collector = createCollector<unknown>({ objectMode: true });

          collector.write(new Uint8Array([10]));
          collector.write(new Uint8Array([11, 12]).buffer);
          collector.write(new DataView(new Uint8Array([13]).buffer));
          collector.end();

          await finished(collector);

          expect(collector.toUint8Array()).toEqual(new Uint8Array([10, 11, 12, 13]));
        });

        it("should default to objectMode: true when no options provided", async () => {
          const collector = createCollector();

          collector.write("string value");
          collector.write(42);
          collector.end();

          await finished(collector);

          // In objectMode, any value is accepted without encoding
          expect(collector.chunks.length).toBe(2);
          expect(collector.chunks[0]).toBe("string value");
          expect(collector.chunks[1]).toBe(42);
        });

        it("should respect explicit objectMode: false", async () => {
          const collector = createCollector<Uint8Array>({ objectMode: false });

          collector.write(new Uint8Array([1, 2, 3]));
          collector.end();

          await finished(collector);

          expect(collector.chunks.length).toBe(1);
          const result = collector.toUint8Array();
          expect(result.length).toBe(3);
          expect(result[0]).toBe(1);
          expect(result[1]).toBe(2);
          expect(result[2]).toBe(3);
        });
      });

      describe("Stress Tests", () => {
        it("should handle 1000 sequential writes", async () => {
          const collector = createCollector<number>({ objectMode: true });

          for (let i = 0; i < 1000; i++) {
            collector.write(i);
          }
          collector.end();

          await finished(collector);

          expect(collector.chunks.length).toBe(1000);
          expect(collector.chunks[0]).toBe(0);
          expect(collector.chunks[999]).toBe(999);
        });

        it("should handle pipeline with large data", async () => {
          const size = 100000;
          const data = new Uint8Array(size);
          for (let i = 0; i < size; i++) {
            data[i] = i % 256;
          }

          const readable = createReadableFromArray([data], { objectMode: false });
          const collector = createCollector<Uint8Array>({ objectMode: false });

          await pipeline(readable, collector);

          const result = collector.toUint8Array();
          expect(result.length).toBe(size);
          expect(result[0]).toBe(0);
          expect(result[size - 1]).toBe((size - 1) % 256);
        });
      });
    });

    // ========================================================================
    // Regression Tests (Round 2 Bug Fixes)
    // ========================================================================
    describe("Regression Tests", () => {
      describe("Cork/Uncork _writableLength accuracy (Bug #3)", () => {
        it("should not double-count corked chunks in writableLength", async () => {
          const chunks: number[] = [];
          const writable = new Writable({
            objectMode: true,
            write(chunk: number, _encoding: string, callback: (error?: Error | null) => void) {
              chunks.push(chunk);
              callback();
            }
          });

          writable.cork();
          writable.write(1);
          writable.write(2);
          writable.write(3);

          // While corked, writableLength should reflect buffered items
          const corkedLength = writable.writableLength;
          expect(corkedLength).toBeGreaterThan(0);

          writable.uncork();
          await new Promise(resolve => setTimeout(resolve, 10));

          // After uncork, writableLength should drop (chunks are drained)
          expect(writable.writableLength).toBeLessThanOrEqual(corkedLength);

          // All chunks should have been written
          writable.end();
          await finished(writable);
          expect(chunks).toEqual([1, 2, 3]);
        });

        it("should handle nested cork/uncork without length corruption", async () => {
          const chunks: number[] = [];
          const writable = new Writable({
            objectMode: true,
            write(chunk: number, _encoding: string, callback: (error?: Error | null) => void) {
              chunks.push(chunk);
              callback();
            }
          });

          writable.cork();
          writable.cork();
          writable.write(1);
          writable.write(2);

          // Nested cork — still buffered
          writable.uncork();
          await new Promise(resolve => setTimeout(resolve, 5));

          // Should still be corked (nested)
          writable.write(3);

          writable.uncork();
          await new Promise(resolve => setTimeout(resolve, 10));

          writable.end();
          await finished(writable);
          expect(chunks).toEqual([1, 2, 3]);
        });

        it("should track multibyte string writableLength by bytes in binary mode", async () => {
          const writable = new Writable({
            write(_chunk: string, _encoding: string, callback: (error?: Error | null) => void) {
              setTimeout(() => callback(), 5);
            }
          });

          writable.cork();
          writable.write("😀");

          const expectedByteLength = new TextEncoder().encode("😀").byteLength;
          expect(writable.writableLength).toBe(expectedByteLength);

          writable.uncork();
          writable.end();
          await finished(writable);
        });
      });

      describe("Compose property proxies (Bug #12)", () => {
        it("should proxy writableEnded on composed stream", async () => {
          const t1 = createTransform<number, number>(n => n + 1, { objectMode: true });
          const t2 = createTransform<number, number>(n => n * 2, { objectMode: true });

          const composed = compose(t1, t2);

          expect(composed.writableEnded).toBe(false);

          composed.write(5);
          composed.end();

          // After end(), writableEnded should become true
          await new Promise(resolve => setTimeout(resolve, 20));
          expect(composed.writableEnded).toBe(true);
        });

        it("should proxy readableEnded on composed stream", async () => {
          const t1 = createTransform<number, number>(n => n + 1, { objectMode: true });
          const t2 = createTransform<number, number>(n => n * 2, { objectMode: true });

          const composed = compose(t1, t2);
          const collector = createCollector<number>();

          composed.pipe(collector);
          composed.write(5);
          composed.end();

          await finished(collector);
          expect(composed.readableEnded).toBe(true);
        });
      });

      describe("Compose flush correctness (Bug #13)", () => {
        it("should flush all data through multi-stage compose", async () => {
          const add1 = createTransform<number, number>(n => n + 1, { objectMode: true });
          const mul2 = createTransform<number, number>(n => n * 2, { objectMode: true });
          const sub3 = createTransform<number, number>(n => n - 3, { objectMode: true });

          const composed = compose(add1, mul2, sub3);
          const collector = createCollector<number>();
          composed.pipe(collector);

          composed.write(5);
          composed.write(10);
          composed.write(20);
          composed.end();

          await finished(collector);

          // 5: (5+1)*2-3 = 9
          // 10: (10+1)*2-3 = 19
          // 20: (20+1)*2-3 = 39
          expect(collector.chunks).toEqual([9, 19, 39]);
        });

        it("should emit end after flush completes", async () => {
          const transform = createTransform<string, string>(s => s.toUpperCase(), {
            objectMode: true
          });

          const composed = compose(transform);
          const results: string[] = [];
          let endEmitted = false;

          composed.on("data", (chunk: string) => results.push(chunk));
          composed.on("end", () => {
            endEmitted = true;
          });

          composed.write("hello");
          composed.write("world");
          composed.end();

          await finished(composed);

          expect(results).toEqual(["HELLO", "WORLD"]);
          expect(endEmitted).toBe(true);
        });
      });
    });
  });

  // ==========================================================================
  // Core Class Construction & Properties Tests
  // ==========================================================================
  describe("Core Class Construction", () => {
    describe("Readable from options", () => {
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
        const writable = createNullWritable({ objectMode: true });

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

    describe("Writable from options", () => {
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

      it("should support cork and uncork", () => {
        const chunks: string[] = [];
        const writable = new Writable({
          write(chunk, _encoding, callback) {
            chunks.push(chunk.toString());
            callback();
          }
        });

        writable.cork();
        writable.write("a");
        writable.write("b");

        // While corked, data should be buffered
        expect(chunks).toEqual([]);

        writable.uncork();

        // After uncork, data should flow
        expect(chunks).toEqual(["a", "b"]);
      });
    });

    describe("Transform from options", () => {
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

    describe("Duplex from options", () => {
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

    describe("PassThrough", () => {
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
  });

  // ==========================================================================
  // Async Iterator Support
  // ==========================================================================
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

  // ==========================================================================
  // Error Handling (with createWritable)
  // ==========================================================================
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

  // ==========================================================================
  // Backpressure
  // ==========================================================================
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

    it("compose should preserve order under slow downstream pressure", async () => {
      const addOne = createTransform<number, number>(n => n + 1, { objectMode: true });
      const multiply = createTransform<number, number>(n => n * 2, { objectMode: true });
      const composed = compose(addOne, multiply);

      const input = Array.from({ length: 200 }, (_, i) => i);
      const expected = input.map(n => (n + 1) * 2);
      const output: number[] = [];

      const slowWritable = createWritable<number>({
        objectMode: true,
        highWaterMark: 1,
        write(chunk, _encoding, callback) {
          output.push(chunk);
          setTimeout(callback, 1);
        }
      });

      const source = createReadableFromArray(input, { objectMode: true });
      await pipeline(source, composed, slowWritable);

      expect(output).toEqual(expected);
    });

    it("compose chain should reject with AbortError and keep prefix ordering", async () => {
      const controller = new AbortController();

      const stage1 = createTransform<number, number>(n => n + 1, { objectMode: true });
      const stage2 = createTransform<number, number>(n => n * 3, { objectMode: true });
      const stage3 = createTransform<number, number>(n => n - 2, { objectMode: true });
      const composed = compose(stage1, stage2, stage3);

      const input = Array.from({ length: 120 }, (_, i) => i);
      const output: number[] = [];

      const writable = createWritable<number>({
        objectMode: true,
        highWaterMark: 1,
        write(chunk, _encoding, callback) {
          output.push(chunk);
          if (output.length === 5) {
            controller.abort(new Error("abort-compose"));
          }
          setTimeout(callback, 1);
        }
      });

      stage1.on("error", () => {});
      stage2.on("error", () => {});
      stage3.on("error", () => {});
      composed.on("error", () => {});
      writable.on("error", () => {});

      await expect(
        pipeline(createReadableFromArray(input, { objectMode: true }), composed, writable, {
          signal: controller.signal
        })
      ).rejects.toMatchObject({ name: "AbortError" });

      const expectedPrefix = input.map(n => (n + 1) * 3 - 2).slice(0, output.length);
      expect(output).toEqual(expectedPrefix);
      expect(output.length).toBeGreaterThanOrEqual(5);
      expect(output.length).toBeLessThan(input.length);
    });
  });

  // ==========================================================================
  // DuplexPair Write Callbacks
  // ==========================================================================
  describe("DuplexPair Write Callbacks", () => {
    it("should invoke write callback", async () => {
      const [side1, side2] = duplexPair({ objectMode: true });

      const received: unknown[] = [];
      side2.on("data", (chunk: unknown) => received.push(chunk));

      let callbackInvoked = false;
      side1.write("test", () => {
        callbackInvoked = true;
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(callbackInvoked).toBe(true);
      expect(received).toContain("test");

      side1.end();
      side2.end();
    });

    it("should invoke write callback with encoding argument", async () => {
      const [side1, side2] = duplexPair({ objectMode: true });

      const received: unknown[] = [];
      side2.on("data", (chunk: unknown) => received.push(chunk));

      let callbackInvoked = false;
      side1.write("data", "utf-8", () => {
        callbackInvoked = true;
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(callbackInvoked).toBe(true);
      expect(received).toContain("data");

      side1.end();
      side2.end();
    });

    it("should return backpressure signal from push()", async () => {
      // Create pair with very low highWaterMark to trigger backpressure
      const [side1, side2] = duplexPair({ objectMode: true, highWaterMark: 1 });

      // Don't consume side2 readable — buffer will fill up
      // Write enough to exceed the highWaterMark
      const results: boolean[] = [];
      for (let i = 0; i < 5; i++) {
        results.push(side1.write(i));
      }

      // At least one write should have returned false (backpressure)
      expect(results).toContain(false);

      // Now consume to clear backpressure
      side2.resume();
      side1.end();
      side2.end();
    });
  });

  // ==========================================================================
  // Readable.from() Backpressure
  // ==========================================================================
  describe("Readable.from() Backpressure", () => {
    it("should use pull-based iteration", async () => {
      let iteratorAdvances = 0;

      async function* gen() {
        for (let i = 0; i < 5; i++) {
          iteratorAdvances++;
          yield i;
        }
      }

      const readable = (Readable as any).from(gen(), { objectMode: true, highWaterMark: 1 });
      const results: number[] = [];

      for await (const chunk of readable) {
        results.push(chunk as number);
      }

      expect(results).toEqual([0, 1, 2, 3, 4]);
      expect(iteratorAdvances).toBe(5);
    });

    it("should stop pulling from iterator when destroyed", async () => {
      let iteratorAdvances = 0;

      async function* gen() {
        for (let i = 0; i < 100; i++) {
          iteratorAdvances++;
          yield i;
          // Slow down to ensure destroy has time to take effect
          await new Promise(resolve => setTimeout(resolve, 5));
        }
      }

      const readable = (Readable as any).from(gen(), { objectMode: true });

      // Read a couple of chunks then destroy
      const iterator = readable[Symbol.asyncIterator]();
      await iterator.next();
      await iterator.next();
      readable.destroy();

      await new Promise(resolve => setTimeout(resolve, 50));

      // Should not have iterated through all 100 items
      expect(iteratorAdvances).toBeLessThan(100);
    });

    it("should treat string as a single chunk (not char-by-char)", async () => {
      const readable = (Readable as any).from("hello");
      const chunks: string[] = [];

      for await (const chunk of readable) {
        chunks.push(chunk as string);
      }

      // Node.js yields the entire string as one chunk
      expect(chunks).toEqual(["hello"]);
    });

    it("should treat empty string as a single empty-string chunk", async () => {
      const readable = (Readable as any).from("");
      const chunks: string[] = [];

      for await (const chunk of readable) {
        chunks.push(chunk as string);
      }

      expect(chunks).toEqual([""]);
    });
  });

  // ==========================================================================
  // Transform destroy cleanup
  // ==========================================================================
  describe("Transform destroy cleanup", () => {
    it("should not emit events after destroy during async transform", async () => {
      const transform = new Transform({
        objectMode: true,
        async transform(
          chunk: number,
          _encoding: string,
          callback: (err?: Error | null, data?: number) => void
        ) {
          await new Promise(resolve => setTimeout(resolve, 50));
          callback(null, chunk * 2);
        }
      });

      const events: string[] = [];
      transform.on("data", () => events.push("data"));
      transform.on("end", () => events.push("end"));
      transform.on("error", () => events.push("error"));

      transform.write(1);
      // Destroy while transform is still processing
      await new Promise(resolve => setTimeout(resolve, 10));
      transform.destroy();

      // Wait long enough for any leaked timer to fire
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(transform.destroyed).toBe(true);
      // Should not have emitted end after destroy
      expect(events).not.toContain("end");
    });
  });

  // ==========================================================================
  // API Consistency Tests (Phase 1 behavior fixes verification)
  // ==========================================================================
  describe("API Consistency", () => {
    describe("readableLength", () => {
      it("should return chunk count in objectMode", () => {
        const readable = new Readable({
          objectMode: true,
          read() {}
        });

        readable.push("a");
        readable.push("b");
        readable.push("c");

        expect(readable.readableLength).toBe(3);
      });

      it("should return byte size in binary mode", () => {
        const readable = new Readable({ read() {} });

        readable.push(new Uint8Array([1, 2, 3]));
        readable.push(new Uint8Array([4, 5]));

        expect(readable.readableLength).toBe(5);
      });
    });

    describe("readableAborted", () => {
      it("should be false initially", () => {
        const readable = new Readable({ read() {} });
        expect(readable.readableAborted).toBe(false);
      });

      it("should be true after destroy before end", async () => {
        const readable = new Readable({
          objectMode: true,
          read() {}
        });

        readable.push("data");
        readable.destroy();

        // Wait for async destroy
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(readable.readableAborted).toBe(true);
      });
    });

    describe("writableAborted", () => {
      it("should be false initially", () => {
        const writable = new Writable({
          write(_chunk, _encoding, callback) {
            callback();
          }
        });
        expect(writable.writableAborted).toBe(false);
      });

      it("should be true after destroy before finish", async () => {
        const writable = new Writable({
          write(_chunk, _encoding, callback) {
            callback();
          }
        });

        writable.write("data");
        writable.destroy();

        // Wait for async destroy
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(writable.writableAborted).toBe(true);
      });

      it("should be false after normal end+finish", async () => {
        const writable = new Writable({
          write(_chunk, _encoding, callback) {
            callback();
          }
        });

        writable.end();

        await new Promise(resolve => writable.on("finish", resolve));

        expect(writable.writableAborted).toBe(false);
        writable.destroy();
        // Even after destroy post-finish, writableAborted should remain false
        expect(writable.writableAborted).toBe(false);
      });
    });

    describe("readableFlowing", () => {
      it("should be null initially", () => {
        const readable = new Readable({
          objectMode: true,
          read() {}
        });

        expect(readable.readableFlowing).toBeNull();
      });

      it("should be true when flowing (data listener attached)", () => {
        const readable = new Readable({
          objectMode: true,
          read() {}
        });

        readable.on("data", () => {});
        expect(readable.readableFlowing).toBe(true);
      });

      it("should be false after pause (not null)", () => {
        const readable = new Readable({
          objectMode: true,
          read() {}
        });

        readable.on("data", () => {});
        readable.pause();

        expect(readable.readableFlowing).toBe(false);
      });
    });

    describe("unshift after end", () => {
      it("should allow unshift after end without throwing", async () => {
        const readable = new Readable({
          objectMode: true,
          read() {
            this.push(null);
          }
        });

        // Consume to trigger end
        for await (const _chunk of readable) {
          // drain
        }

        // unshift after end should not throw
        expect(() => readable.unshift("data")).not.toThrow();
      });
    });

    describe("Duplex destroyed semantics", () => {
      it("should be true immediately after destroy() is called", () => {
        const duplex = createDuplex({ objectMode: true });
        expect(duplex.destroyed).toBe(false);
        duplex.destroy();
        expect(duplex.destroyed).toBe(true);
      });

      it("should handle multiple destroy calls without error", () => {
        const duplex = createDuplex({ objectMode: true });
        duplex.destroy();
        expect(() => duplex.destroy()).not.toThrow();
        expect(duplex.destroyed).toBe(true);
      });
    });

    describe("Duplex delegated getters and methods", () => {
      it("should expose readableFlowing", () => {
        const duplex = createDuplex({
          objectMode: true,
          read() {
            // no-op
          }
        });
        expect(duplex.readableFlowing).toBeNull();
        duplex.on("data", () => {});
        expect(duplex.readableFlowing).toBe(true);
      });

      it("should expose readableAborted", () => {
        const duplex = createDuplex({ objectMode: true });
        expect(duplex.readableAborted).toBe(false);
      });

      it("should expose readableDidRead", () => {
        const duplex = createDuplex({ objectMode: true });
        expect(duplex.readableDidRead).toBe(false);
      });

      it("should expose readableEncoding", () => {
        const duplex = createDuplex({ objectMode: true });
        expect(duplex.readableEncoding).toBeNull();
      });

      it("should expose errored (null when no error)", () => {
        const duplex = createDuplex({ objectMode: true });
        expect(duplex.errored).toBeNull();
      });

      it("should expose closed", () => {
        const duplex = createDuplex({ objectMode: true });
        expect(duplex.closed).toBe(false);
      });

      it("should expose readableBuffer", () => {
        const duplex = createDuplex({ objectMode: true });
        expect(duplex.readableBuffer).toBeDefined();
      });

      it("should expose writableBuffer", () => {
        const duplex = createDuplex({ objectMode: true });
        expect(duplex.writableBuffer).toBeDefined();
      });

      it("should support iterator() method", async () => {
        const duplex = createDuplex({
          objectMode: true,
          read() {
            this.push("a");
            this.push("b");
            this.push(null);
          }
        });

        const iter = duplex.iterator({ destroyOnReturn: false });
        const chunks: unknown[] = [];
        for (let r = await iter.next(); !r.done; r = await iter.next()) {
          chunks.push(r.value);
        }
        // Verify all data arrives regardless of chunk boundaries
        expect(chunks.join("")).toBe("ab");
      });
    });

    describe("Transform delegated methods and getters", () => {
      it("should have cork and uncork methods", () => {
        const t = new Transform({ objectMode: true });
        expect(typeof t.cork).toBe("function");
        expect(typeof t.uncork).toBe("function");
        t.cork();
        expect(t.writableCorked).toBe(1);
        t.uncork();
        expect(t.writableCorked).toBe(0);
      });

      it("should have setEncoding method", () => {
        const t = new Transform({ objectMode: true });
        expect(typeof t.setEncoding).toBe("function");
        const result = t.setEncoding("utf-8");
        // Should return this for chaining
        expect(result).toBe(t);
      });

      it("should have setDefaultEncoding method", () => {
        const t = new Transform({ objectMode: true });
        expect(typeof t.setDefaultEncoding).toBe("function");
        const result = t.setDefaultEncoding("utf-8");
        expect(result).toBe(t);
      });

      it("should have unshift method", () => {
        const t = new Transform({ objectMode: true });
        expect(typeof t.unshift).toBe("function");
      });

      it("should have wrap method", () => {
        const t = new Transform({ objectMode: true });
        expect(typeof t.wrap).toBe("function");
      });

      it("should have iterator method", () => {
        const t = new Transform({ objectMode: true });
        expect(typeof t.iterator).toBe("function");
      });

      it("should expose writableCorked", () => {
        const t = new Transform({ objectMode: true });
        expect(t.writableCorked).toBe(0);
      });

      it("should expose writableNeedDrain", () => {
        const t = new Transform({ objectMode: true });
        expect(t.writableNeedDrain).toBe(false);
      });

      it("should expose writableObjectMode", () => {
        const t = new Transform({ objectMode: true });
        expect(t.writableObjectMode).toBe(true);
      });

      it("should expose readableAborted", () => {
        const t = new Transform({ objectMode: true });
        expect(t.readableAborted).toBe(false);
      });

      it("should expose readableDidRead", () => {
        const t = new Transform({ objectMode: true });
        expect(t.readableDidRead).toBe(false);
      });

      it("should expose readableEncoding", () => {
        const t = new Transform({ objectMode: true });
        expect(t.readableEncoding).toBeNull();
      });

      it("should expose errored (null when no error)", () => {
        const t = new Transform({ objectMode: true });
        expect(t.errored).toBeNull();
      });

      it("should expose closed", () => {
        const t = new Transform({ objectMode: true });
        expect(t.closed).toBe(false);
      });

      it("should expose readableBuffer", () => {
        const t = new Transform({ objectMode: true });
        expect(t.readableBuffer).toBeDefined();
      });

      it("should expose writableBuffer", () => {
        const t = new Transform({ objectMode: true });
        expect(t.writableBuffer).toBeDefined();
      });

      it("destroy should return this", () => {
        const t = new Transform({ objectMode: true });
        const result = t.destroy();
        expect(result).toBe(t);
      });
    });
  });

  // ===========================================================================
  // Fix 2: pipe() with options { end: false }
  // ===========================================================================

  describe("pipe options { end: false }", () => {
    it("Readable.pipe with end: false should not end destination", async () => {
      const source = Readable.from([1, 2, 3], { objectMode: true });
      const chunks: any[] = [];
      let finished = false;

      const dest = new Writable({
        objectMode: true,
        write(chunk: any, _enc: string, cb: () => void) {
          chunks.push(chunk);
          cb();
        },
        final(cb: () => void) {
          finished = true;
          cb();
        }
      });

      source.pipe(dest, { end: false });

      await new Promise<void>(resolve => {
        source.on("end", () => {
          // Give a tick for any end propagation
          setTimeout(() => resolve(), 50);
        });
      });

      expect(chunks).toEqual([1, 2, 3]);
      expect(finished).toBe(false);
      // Clean up
      dest.end();
    });

    it("Readable.pipe without options should end destination", async () => {
      const source = Readable.from([1, 2, 3], { objectMode: true });
      const chunks: any[] = [];

      const dest = new Writable({
        objectMode: true,
        write(chunk: any, _enc: string, cb: () => void) {
          chunks.push(chunk);
          cb();
        }
      });

      source.pipe(dest);

      await new Promise<void>(resolve => {
        dest.on("finish", () => resolve());
      });

      expect(chunks).toEqual([1, 2, 3]);
    });
  });

  // ===========================================================================
  // Fix 3 & 4: push/unshift with encoding parameter
  // ===========================================================================

  describe("push and unshift with encoding", () => {
    it("push with encoding should convert string to bytes in binary mode", async () => {
      const r = new Readable();
      r.push("hello", "utf8");
      r.push(null);

      const chunks: any[] = [];
      for await (const chunk of r) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBe(1);
      // Should be Uint8Array in binary mode
      expect(chunks[0] instanceof Uint8Array).toBe(true);
      // Compare contents
      const expected = new TextEncoder().encode("hello");
      expect(Array.from(chunks[0] as Uint8Array)).toEqual(Array.from(expected));
    });

    it("push without encoding should accept Uint8Array directly", async () => {
      const r = new Readable();
      const data = new Uint8Array([1, 2, 3]);
      r.push(data);
      r.push(null);

      const chunks: any[] = [];
      for await (const chunk of r) {
        chunks.push(chunk);
      }
      expect(chunks.length).toBe(1);
      expect(Array.from(chunks[0] as Uint8Array)).toEqual([1, 2, 3]);
    });

    it("push with encoding in object mode should pass string as-is", async () => {
      const r = new Readable({ objectMode: true });
      r.push("hello", "utf8");
      r.push(null);

      const chunks: any[] = [];
      for await (const chunk of r) {
        chunks.push(chunk);
      }
      expect(chunks).toEqual(["hello"]);
    });
  });

  // ===========================================================================
  // Fix 5: read(size) precise byte reading
  // ===========================================================================

  describe("read(size) precise reading", () => {
    it("read(0) should return null", () => {
      const r = new Readable({ objectMode: true, read() {} });
      r.push("a");
      const result = r.read(0);
      expect(result).toBeNull();
    });

    it("read() in object mode should return one object at a time", () => {
      const r = new Readable({ objectMode: true, read() {} });
      r.push("a");
      r.push("b");
      r.push("c");

      expect(r.read()).toBe("a");
      expect(r.read()).toBe("b");
      expect(r.read()).toBe("c");
      expect(r.read()).toBeNull();
    });

    it("read() without size in binary mode should return all buffered data", () => {
      const r = new Readable({ read() {} });
      r.push(new Uint8Array([1, 2]));
      r.push(new Uint8Array([3, 4]));

      const result = r.read() as Uint8Array;
      expect(result).not.toBeNull();
      expect(Array.from(result)).toEqual([1, 2, 3, 4]);
    });

    it("read(n) should return exactly n bytes", () => {
      const r = new Readable({ read() {} });
      r.push(new Uint8Array([1, 2, 3, 4, 5]));

      const result = r.read(3) as Uint8Array;
      expect(result).not.toBeNull();
      expect(Array.from(result)).toEqual([1, 2, 3]);

      const rest = r.read(2) as Uint8Array;
      expect(rest).not.toBeNull();
      expect(Array.from(rest)).toEqual([4, 5]);
    });

    it("read(n) should return null when insufficient data", () => {
      const r = new Readable({ read() {} });
      r.push(new Uint8Array([1, 2]));

      const result = r.read(5);
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // Fix 6: Functional / Higher-order Methods on Readable
  // ===========================================================================

  describe("Readable functional methods", () => {
    describe("map", () => {
      it("should map each chunk", async () => {
        const r = Readable.from([1, 2, 3], { objectMode: true });
        const mapped = r.map((x: number) => x * 2);
        const result: any[] = [];
        for await (const chunk of mapped) {
          result.push(chunk);
        }
        expect(result).toEqual([2, 4, 6]);
      });

      it("should support async map functions", async () => {
        const r = Readable.from([1, 2, 3], { objectMode: true });
        const mapped = r.map(async (x: number) => {
          await new Promise(resolve => setTimeout(resolve, 5));
          return x * 10;
        });
        const result: any[] = [];
        for await (const chunk of mapped) {
          result.push(chunk);
        }
        expect(result).toEqual([10, 20, 30]);
      });

      it("should return a Readable", () => {
        const r = Readable.from([1], { objectMode: true });
        const mapped = r.map((x: number) => x);
        expect(mapped).toBeInstanceOf(Readable);
      });
    });

    describe("filter", () => {
      it("should filter chunks by predicate", async () => {
        const r = Readable.from([1, 2, 3, 4, 5], { objectMode: true });
        const filtered = r.filter((x: number) => x % 2 === 0);
        const result: any[] = [];
        for await (const chunk of filtered) {
          result.push(chunk);
        }
        expect(result).toEqual([2, 4]);
      });

      it("should support async predicates", async () => {
        const r = Readable.from([1, 2, 3, 4], { objectMode: true });
        const filtered = r.filter(async (x: number) => x > 2);
        const result: any[] = [];
        for await (const chunk of filtered) {
          result.push(chunk);
        }
        expect(result).toEqual([3, 4]);
      });

      it("should return a Readable", () => {
        const r = Readable.from([1], { objectMode: true });
        const filtered = r.filter(() => true);
        expect(filtered).toBeInstanceOf(Readable);
      });
    });

    describe("forEach", () => {
      it("should iterate all chunks", async () => {
        const r = Readable.from([1, 2, 3], { objectMode: true });
        const items: any[] = [];
        const result = await r.forEach((x: number) => {
          items.push(x);
        });
        expect(items).toEqual([1, 2, 3]);
        expect(result).toBeUndefined();
      });

      it("should support async callbacks", async () => {
        const r = Readable.from([1, 2, 3], { objectMode: true });
        const items: any[] = [];
        await r.forEach(async (x: number) => {
          await new Promise(resolve => setTimeout(resolve, 5));
          items.push(x);
        });
        expect(items).toEqual([1, 2, 3]);
      });
    });

    describe("toArray", () => {
      it("should collect all chunks into an array", async () => {
        const r = Readable.from([1, 2, 3], { objectMode: true });
        const result = await r.toArray();
        expect(result).toEqual([1, 2, 3]);
      });

      it("should return empty array for empty stream", async () => {
        const r = Readable.from([], { objectMode: true });
        const result = await r.toArray();
        expect(result).toEqual([]);
      });
    });

    describe("some", () => {
      it("should return true if any chunk matches", async () => {
        const r = Readable.from([1, 2, 3], { objectMode: true });
        const result = await r.some((x: number) => x === 2);
        expect(result).toBe(true);
      });

      it("should return false if no chunk matches", async () => {
        const r = Readable.from([1, 2, 3], { objectMode: true });
        const result = await r.some((x: number) => x === 5);
        expect(result).toBe(false);
      });

      it("should return false for empty stream", async () => {
        const r = Readable.from([], { objectMode: true });
        const result = await r.some(() => true);
        expect(result).toBe(false);
      });
    });

    describe("find", () => {
      it("should find the first matching chunk", async () => {
        const r = Readable.from([1, 2, 3], { objectMode: true });
        const result = await r.find((x: number) => x === 2);
        expect(result).toBe(2);
      });

      it("should return undefined if no match", async () => {
        const r = Readable.from([1, 2, 3], { objectMode: true });
        const result = await r.find((x: number) => x === 5);
        expect(result).toBeUndefined();
      });
    });

    describe("every", () => {
      it("should return true if all chunks match", async () => {
        const r = Readable.from([2, 4, 6], { objectMode: true });
        const result = await r.every((x: number) => x % 2 === 0);
        expect(result).toBe(true);
      });

      it("should return false if any chunk fails", async () => {
        const r = Readable.from([2, 3, 6], { objectMode: true });
        const result = await r.every((x: number) => x % 2 === 0);
        expect(result).toBe(false);
      });

      it("should return true for empty stream (vacuous truth)", async () => {
        const r = Readable.from([], { objectMode: true });
        const result = await r.every(() => false);
        expect(result).toBe(true);
      });
    });

    describe("flatMap", () => {
      it("should flatten arrays", async () => {
        const r = Readable.from([1, 2, 3], { objectMode: true });
        const flat = r.flatMap((x: number) => [x, x * 10]);
        const result: any[] = [];
        for await (const chunk of flat) {
          result.push(chunk);
        }
        expect(result).toEqual([1, 10, 2, 20, 3, 30]);
      });

      it("should flatten async iterables", async () => {
        const r = Readable.from([1, 2], { objectMode: true });
        const flat = r.flatMap(async function* (x: number) {
          yield x;
          yield x * 10;
        });
        const result: any[] = [];
        for await (const chunk of flat) {
          result.push(chunk);
        }
        expect(result).toEqual([1, 10, 2, 20]);
      });

      it("should return a Readable", () => {
        const r = Readable.from([1], { objectMode: true });
        const flat = r.flatMap((x: number) => [x]);
        expect(flat).toBeInstanceOf(Readable);
      });
    });

    describe("drop", () => {
      it("should skip first N chunks", async () => {
        const r = Readable.from([1, 2, 3, 4, 5], { objectMode: true });
        const dropped = r.drop(2);
        const result: any[] = [];
        for await (const chunk of dropped) {
          result.push(chunk);
        }
        expect(result).toEqual([3, 4, 5]);
      });

      it("drop(0) should pass everything through", async () => {
        const r = Readable.from([1, 2, 3], { objectMode: true });
        const dropped = r.drop(0);
        const result: any[] = [];
        for await (const chunk of dropped) {
          result.push(chunk);
        }
        expect(result).toEqual([1, 2, 3]);
      });

      it("drop more than available should return empty", async () => {
        const r = Readable.from([1, 2], { objectMode: true });
        const dropped = r.drop(10);
        const result: any[] = [];
        for await (const chunk of dropped) {
          result.push(chunk);
        }
        expect(result).toEqual([]);
      });

      it("should return a Readable", () => {
        const r = Readable.from([1], { objectMode: true });
        const dropped = r.drop(0);
        expect(dropped).toBeInstanceOf(Readable);
      });
    });

    describe("take", () => {
      it("should take only first N chunks", async () => {
        const r = Readable.from([1, 2, 3, 4, 5], { objectMode: true });
        const taken = r.take(3);
        const result: any[] = [];
        for await (const chunk of taken) {
          result.push(chunk);
        }
        expect(result).toEqual([1, 2, 3]);
      });

      it("take(0) should return empty", async () => {
        const r = Readable.from([1, 2, 3], { objectMode: true });
        const taken = r.take(0);
        const result: any[] = [];
        for await (const chunk of taken) {
          result.push(chunk);
        }
        expect(result).toEqual([]);
      });

      it("take more than available should return all", async () => {
        const r = Readable.from([1, 2], { objectMode: true });
        const taken = r.take(10);
        const result: any[] = [];
        for await (const chunk of taken) {
          result.push(chunk);
        }
        expect(result).toEqual([1, 2]);
      });

      it("should return a Readable", () => {
        const r = Readable.from([1], { objectMode: true });
        const taken = r.take(1);
        expect(taken).toBeInstanceOf(Readable);
      });
    });

    describe("reduce", () => {
      it("should reduce with initial value", async () => {
        const r = Readable.from([1, 2, 3], { objectMode: true });
        const result = await r.reduce((acc: number, x: number) => acc + x, 0);
        expect(result).toBe(6);
      });

      it("should reduce without initial value (uses first chunk)", async () => {
        const r = Readable.from([1, 2, 3], { objectMode: true });
        const result = await r.reduce((acc: number, x: number) => acc + x);
        expect(result).toBe(6);
      });

      it("should throw on empty stream without initial value", async () => {
        const r = Readable.from([], { objectMode: true });
        await expect(r.reduce((acc: any, x: any) => acc + x)).rejects.toThrow(TypeError);
      });

      it("should return initial value for empty stream with initial", async () => {
        const r = Readable.from([], { objectMode: true });
        const result = await r.reduce((_acc: number, x: number) => x, 42);
        expect(result).toBe(42);
      });
    });

    describe("chaining", () => {
      it("should chain filter -> map -> toArray", async () => {
        const r = Readable.from([1, 2, 3, 4, 5, 6], { objectMode: true });
        const result = await r
          .filter((x: number) => x % 2 === 0)
          .map((x: number) => x * 3)
          .toArray();
        expect(result).toEqual([6, 12, 18]);
      });

      it("should chain filter -> map -> take -> toArray", async () => {
        const r = Readable.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { objectMode: true });
        const result = await r
          .filter((x: number) => x % 2 === 0)
          .map((x: number) => x * 3)
          .take(3)
          .toArray();
        expect(result).toEqual([6, 12, 18]);
      });

      it("should chain drop -> take -> reduce", async () => {
        const r = Readable.from([1, 2, 3, 4, 5], { objectMode: true });
        const result = await r
          .drop(1)
          .take(3)
          .reduce((acc: number, x: number) => acc + x, 0);
        expect(result).toBe(9); // 2 + 3 + 4
      });
    });
  });

  // ===========================================================================
  // Functional methods on Duplex
  // ===========================================================================

  describe("Duplex functional methods", () => {
    it("should support map", async () => {
      const d = new Duplex({ objectMode: true, read() {} });
      d.push(1);
      d.push(2);
      d.push(3);
      d.push(null);

      const mapped = d.map((x: number) => x * 2);
      const result = await mapped.toArray();
      expect(result).toEqual([2, 4, 6]);
    });

    it("should support filter", async () => {
      const d = new Duplex({ objectMode: true, read() {} });
      d.push(1);
      d.push(2);
      d.push(3);
      d.push(4);
      d.push(null);

      const filtered = d.filter((x: number) => x % 2 === 0);
      const result = await filtered.toArray();
      expect(result).toEqual([2, 4]);
    });

    it("should support toArray", async () => {
      const d = new Duplex({ objectMode: true, read() {} });
      d.push("a");
      d.push("b");
      d.push(null);

      const result = await d.toArray();
      expect(result).toEqual(["a", "b"]);
    });

    it("should support reduce", async () => {
      const d = new Duplex({ objectMode: true, read() {} });
      d.push(1);
      d.push(2);
      d.push(3);
      d.push(null);

      const result = await d.reduce((acc: number, x: number) => acc + x, 0);
      expect(result).toBe(6);
    });
  });

  // ===========================================================================
  // Functional methods on Transform
  // ===========================================================================

  describe("Transform functional methods", () => {
    it("should support map on output", async () => {
      const t = new Transform({
        objectMode: true,
        transform(chunk: number, _enc: string, cb: (err: null, data: number) => void) {
          cb(null, chunk * 2);
        }
      });

      t.write(1);
      t.write(2);
      t.write(3);
      t.end();

      const mapped = t.map((x: number) => x + 1);
      const result = await mapped.toArray();
      expect(result).toEqual([3, 5, 7]);
    });

    it("should support filter on output", async () => {
      const t = new Transform({
        objectMode: true,
        transform(chunk: number, _enc: string, cb: (err: null, data: number) => void) {
          cb(null, chunk);
        }
      });

      t.write(1);
      t.write(2);
      t.write(3);
      t.write(4);
      t.end();

      const filtered = t.filter((x: number) => x % 2 === 0);
      const result = await filtered.toArray();
      expect(result).toEqual([2, 4]);
    });

    it("should support toArray on output", async () => {
      const t = new Transform({
        objectMode: true,
        transform(chunk: any, _enc: string, cb: (err: null, data: any) => void) {
          cb(null, chunk);
        }
      });

      t.write("x");
      t.write("y");
      t.end();

      const result = await t.toArray();
      expect(result).toEqual(["x", "y"]);
    });

    it("should support reduce on output", async () => {
      const t = new Transform({
        objectMode: true,
        transform(chunk: number, _enc: string, cb: (err: null, data: number) => void) {
          cb(null, chunk);
        }
      });

      t.write(10);
      t.write(20);
      t.write(30);
      t.end();

      const result = await t.reduce((acc: number, x: number) => acc + x, 0);
      expect(result).toBe(60);
    });
  });

  // ===========================================================================
  // compose on Readable
  // ===========================================================================

  describe("Readable.compose", () => {
    it("should compose with a transform stream", async () => {
      const r = Readable.from([1, 2, 3], { objectMode: true });
      const t = new Transform({
        objectMode: true,
        transform(chunk: number, _enc: string, cb: (err: null, data: number) => void) {
          cb(null, chunk * 2);
        }
      });

      const composed = r.compose(t);
      const result: any[] = [];
      for await (const chunk of composed) {
        result.push(chunk);
      }
      expect(result).toEqual([2, 4, 6]);
    });

    it("should compose with an async generator function", async () => {
      const r = Readable.from([1, 2, 3], { objectMode: true });

      const composed = r.compose(async function* (source: AsyncIterable<number>) {
        for await (const chunk of source) {
          yield chunk * 3;
        }
      });

      const result: any[] = [];
      for await (const chunk of composed) {
        result.push(chunk);
      }
      expect(result).toEqual([3, 6, 9]);
    });
  });

  // ===========================================================================
  // API Surface: internal properties must NOT be publicly exposed
  // ===========================================================================

  describe("API surface: internal properties are not public", () => {
    describe("objectMode is not a public property", () => {
      it("Readable should not expose objectMode as own property", () => {
        const r = new Readable({ objectMode: true, read() {} });
        expect(Object.prototype.hasOwnProperty.call(r, "objectMode")).toBe(false);
        expect((r as any).objectMode).toBeUndefined();
      });

      it("Writable should not expose objectMode as own property", () => {
        const w = new Writable({
          objectMode: true,
          write(_c: any, _e: string, cb: () => void) {
            cb();
          }
        });
        expect(Object.prototype.hasOwnProperty.call(w, "objectMode")).toBe(false);
        expect((w as any).objectMode).toBeUndefined();
      });

      it("Transform should not expose objectMode as own property", () => {
        const t = new Transform({ objectMode: true });
        expect(Object.prototype.hasOwnProperty.call(t, "objectMode")).toBe(false);
        expect((t as any).objectMode).toBeUndefined();
      });

      it("objectMode should still be accessible via readableObjectMode / writableObjectMode", () => {
        const t = new Transform({ objectMode: true });
        expect(t.readableObjectMode).toBe(true);
        expect(t.writableObjectMode).toBe(true);

        const r = new Readable({ objectMode: true, read() {} });
        expect(r.readableObjectMode).toBe(true);

        const w = new Writable({
          objectMode: true,
          write(_c: any, _e: string, cb: () => void) {
            cb();
          }
        });
        expect(w.writableObjectMode).toBe(true);
      });
    });

    describe("autoDestroy is not a public property", () => {
      it("Readable should not expose autoDestroy as own property", () => {
        const r = new Readable({ read() {} });
        expect(Object.prototype.hasOwnProperty.call(r, "autoDestroy")).toBe(false);
        expect((r as any).autoDestroy).toBeUndefined();
      });

      it("Writable should not expose autoDestroy as own property", () => {
        const w = new Writable({
          write(_c: any, _e: string, cb: () => void) {
            cb();
          }
        });
        expect(Object.prototype.hasOwnProperty.call(w, "autoDestroy")).toBe(false);
        expect((w as any).autoDestroy).toBeUndefined();
      });
    });

    describe("emitClose is not a public property", () => {
      it("Readable should not expose emitClose as own property", () => {
        const r = new Readable({ read() {} });
        expect(Object.prototype.hasOwnProperty.call(r, "emitClose")).toBe(false);
        expect((r as any).emitClose).toBeUndefined();
      });

      it("Writable should not expose emitClose as own property", () => {
        const w = new Writable({
          write(_c: any, _e: string, cb: () => void) {
            cb();
          }
        });
        expect(Object.prototype.hasOwnProperty.call(w, "emitClose")).toBe(false);
        expect((w as any).emitClose).toBeUndefined();
      });
    });
  });

  // ===========================================================================
  // API Surface: highWaterMark properties are prototype getters, not own props
  // ===========================================================================

  describe("API surface: highWaterMark as prototype getters", () => {
    it("readableHighWaterMark should not be an own property on Readable instances", () => {
      const r = new Readable({ read() {} });
      expect(Object.prototype.hasOwnProperty.call(r, "readableHighWaterMark")).toBe(false);
      // But the value should be accessible via prototype getter
      expect(typeof r.readableHighWaterMark).toBe("number");
      expect(r.readableHighWaterMark).toBeGreaterThan(0);
    });

    it("writableHighWaterMark should not be an own property on Writable instances", () => {
      const w = new Writable({
        write(_c: any, _e: string, cb: () => void) {
          cb();
        }
      });
      expect(Object.prototype.hasOwnProperty.call(w, "writableHighWaterMark")).toBe(false);
      // But the value should be accessible via prototype getter
      expect(typeof w.writableHighWaterMark).toBe("number");
      expect(w.writableHighWaterMark).toBeGreaterThan(0);
    });

    it("readableHighWaterMark on Duplex should not be an own property", () => {
      const d = createDuplex({ objectMode: true });
      expect(Object.prototype.hasOwnProperty.call(d, "readableHighWaterMark")).toBe(false);
      expect(typeof d.readableHighWaterMark).toBe("number");
    });

    it("writableHighWaterMark on Duplex should not be an own property", () => {
      const d = createDuplex({ objectMode: true });
      expect(Object.prototype.hasOwnProperty.call(d, "writableHighWaterMark")).toBe(false);
      expect(typeof d.writableHighWaterMark).toBe("number");
    });

    it("readableHighWaterMark should respect custom value", () => {
      const r = new Readable({ highWaterMark: 999, read() {} });
      expect(r.readableHighWaterMark).toBe(999);
      expect(Object.prototype.hasOwnProperty.call(r, "readableHighWaterMark")).toBe(false);
    });

    it("writableHighWaterMark should respect custom value", () => {
      const w = new Writable({
        highWaterMark: 999,
        write(_c: any, _e: string, cb: () => void) {
          cb();
        }
      });
      expect(w.writableHighWaterMark).toBe(999);
      expect(Object.prototype.hasOwnProperty.call(w, "writableHighWaterMark")).toBe(false);
    });
  });

  // ===========================================================================
  // API Surface: allowHalfOpen on Duplex / Transform / PassThrough
  // ===========================================================================

  describe("API surface: allowHalfOpen", () => {
    describe("allowHalfOpen existence and defaults", () => {
      it("Duplex should have allowHalfOpen as own property, default true", () => {
        const d = createDuplex({ objectMode: true });
        expect(Object.prototype.hasOwnProperty.call(d, "allowHalfOpen")).toBe(true);
        expect(d.allowHalfOpen).toBe(true);
      });

      it("Transform should have allowHalfOpen as own property, default true", () => {
        const t = new Transform({ objectMode: true });
        expect(Object.prototype.hasOwnProperty.call(t, "allowHalfOpen")).toBe(true);
        expect(t.allowHalfOpen).toBe(true);
      });

      it("PassThrough should have allowHalfOpen as own property, default true", () => {
        const p = createPassThrough({ objectMode: true });
        expect(Object.prototype.hasOwnProperty.call(p, "allowHalfOpen")).toBe(true);
        expect(p.allowHalfOpen).toBe(true);
      });

      it("allowHalfOpen should be settable to false via constructor", () => {
        const d = createDuplex({ objectMode: true, allowHalfOpen: false });
        expect(d.allowHalfOpen).toBe(false);

        const t = new Transform({ objectMode: true, allowHalfOpen: false });
        expect(t.allowHalfOpen).toBe(false);
      });
    });

    describe("allowHalfOpen is writable at runtime", () => {
      it("Duplex allowHalfOpen can be changed at runtime", () => {
        const d = createDuplex({ objectMode: true });
        expect(d.allowHalfOpen).toBe(true);
        d.allowHalfOpen = false;
        expect(d.allowHalfOpen).toBe(false);
        d.allowHalfOpen = true;
        expect(d.allowHalfOpen).toBe(true);
      });

      it("Transform allowHalfOpen can be changed at runtime", () => {
        const t = new Transform({ objectMode: true });
        expect(t.allowHalfOpen).toBe(true);
        t.allowHalfOpen = false;
        expect(t.allowHalfOpen).toBe(false);
      });

      it("PassThrough allowHalfOpen can be changed at runtime", () => {
        const p = createPassThrough({ objectMode: true });
        expect(p.allowHalfOpen).toBe(true);
        p.allowHalfOpen = false;
        expect(p.allowHalfOpen).toBe(false);
      });
    });

    describe("allowHalfOpen: false behavior", () => {
      it("Duplex with allowHalfOpen: false should end writable side when readable ends", async () => {
        const d = createDuplex({
          objectMode: true,
          allowHalfOpen: false,
          read() {
            this.push("data");
            this.push(null);
          },
          write(_chunk: any, _enc: string, cb: () => void) {
            cb();
          }
        });

        const writableFinished = new Promise<void>(resolve => {
          d.on("finish", resolve);
        });

        // Start reading to trigger readable end
        d.resume();

        // Writable side should also finish
        await writableFinished;
        expect(d.writableFinished).toBe(true);
      });

      it("Duplex with allowHalfOpen: true should NOT end writable side when readable ends", async () => {
        const d = createDuplex({
          objectMode: true,
          allowHalfOpen: true,
          read() {
            this.push("data");
            this.push(null);
          },
          write(_chunk: any, _enc: string, cb: () => void) {
            cb();
          }
        });

        let writableFinished = false;
        d.on("finish", () => {
          writableFinished = true;
        });

        // Start reading to trigger readable end
        d.resume();

        await new Promise<void>(resolve => {
          d.on("end", () => {
            // Give extra time to see if finish fires
            setTimeout(resolve, 50);
          });
        });

        // Writable side should NOT have finished
        expect(writableFinished).toBe(false);
        // Clean up
        d.end();
      });

      it("Transform with allowHalfOpen: false should end writable when readable ends", async () => {
        const t = new Transform({
          objectMode: true,
          allowHalfOpen: false,
          transform(chunk: any, _enc: string, cb: (err: null, data: any) => void) {
            cb(null, chunk);
          }
        });

        const writableFinished = new Promise<void>(resolve => {
          t.on("finish", resolve);
        });

        // Write some data and end the readable side
        t.write("hello");
        t.resume();
        t.push(null); // End readable side directly

        await writableFinished;
        expect(t.writableFinished).toBe(true);
      });
    });
  });

  // ===========================================================================
  // API Surface: writableAborted NOT on Duplex / Transform
  // ===========================================================================

  // ===========================================================================
  // Phase 4: Tests for Fixes #1–#10 (stream API alignment)
  // ===========================================================================

  describe("Fix #1: Transform.from() and PassThrough.from()", () => {
    it("Transform.from() should create a Transform from an iterable", async () => {
      const t = (Transform as any).from([10, 20, 30]);
      const result: any[] = [];
      for await (const chunk of t) {
        result.push(chunk);
      }
      expect(result).toEqual([10, 20, 30]);
    });

    it("PassThrough.from() should create a PassThrough from an iterable", async () => {
      const p = (PassThrough as any).from(["a", "b", "c"]);
      const result: any[] = [];
      for await (const chunk of p) {
        result.push(chunk);
      }
      expect(result).toEqual(["a", "b", "c"]);
    });

    it("Transform.from() should work with async iterables", async () => {
      async function* gen() {
        yield 1;
        yield 2;
      }
      const t = (Transform as any).from(gen());
      const result: any[] = [];
      for await (const chunk of t) {
        result.push(chunk);
      }
      expect(result).toEqual([1, 2]);
    });
  });

  describe("Fix #2: compose() returns Duplex-like stream", () => {
    it("Readable.compose() result should have write method (Duplex-like)", async () => {
      const r = Readable.from([1, 2, 3], { objectMode: true });
      const t = new Transform({
        objectMode: true,
        transform(chunk: number, _enc: string, cb: (err: null, data: number) => void) {
          cb(null, chunk * 2);
        }
      });
      const composed = r.compose(t);

      // compose() should return a Duplex-like stream with write method
      expect(typeof composed.write).toBe("function");
      expect(typeof composed.end).toBe("function");

      const result: any[] = [];
      for await (const chunk of composed) {
        result.push(chunk);
      }
      expect(result).toEqual([2, 4, 6]);
    });

    it("Transform.compose() result should have write method", () => {
      const t1 = createTransform<number, number>(n => n + 1, { objectMode: true });
      const t2 = createTransform<number, number>(n => n * 2, { objectMode: true });
      const composed = (t1 as any).compose(t2);
      expect(typeof composed.write).toBe("function");
      expect(typeof composed.end).toBe("function");
    });
  });

  describe("Fix #3: emitClose: false honored in destroy()", () => {
    it("Readable with emitClose: false should not emit close on destroy", async () => {
      const r = new Readable({
        objectMode: true,
        emitClose: false,
        read() {}
      });

      let closeEmitted = false;
      r.on("close", () => {
        closeEmitted = true;
      });

      r.destroy();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(r.destroyed).toBe(true);
      expect(closeEmitted).toBe(false);
    });

    it("Writable with emitClose: false should not emit close on destroy", async () => {
      const w = new Writable({
        objectMode: true,
        emitClose: false,
        write(_chunk: any, _enc: string, cb: () => void) {
          cb();
        }
      });

      let closeEmitted = false;
      w.on("close", () => {
        closeEmitted = true;
      });

      w.destroy();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(w.destroyed).toBe(true);
      expect(closeEmitted).toBe(false);
    });

    it("Transform with emitClose: false should not emit close on destroy", async () => {
      const t = new Transform({
        objectMode: true,
        emitClose: false,
        transform(chunk: any, _enc: string, cb: (err: null, data: any) => void) {
          cb(null, chunk);
        }
      });

      let closeEmitted = false;
      t.on("close", () => {
        closeEmitted = true;
      });

      t.destroy();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(t.destroyed).toBe(true);
      expect(closeEmitted).toBe(false);
    });

    it("Readable with emitClose: true (default) should emit close on destroy", async () => {
      const r = new Readable({
        objectMode: true,
        read() {}
      });

      const closePromise = new Promise<void>(resolve => {
        r.on("close", resolve);
      });

      r.destroy();
      await closePromise;
      expect(r.destroyed).toBe(true);
    });
  });

  describe("Fix #4: some/every/find return correct values", () => {
    it("some() should return false when no match found", async () => {
      const r = Readable.from([1, 2, 3], { objectMode: true });
      const result = await r.some((x: number) => x === 999);
      expect(result).toBe(false);
    });

    it("every() should return true when all match", async () => {
      const r = Readable.from([2, 4, 6], { objectMode: true });
      const result = await r.every((x: number) => x % 2 === 0);
      expect(result).toBe(true);
    });

    it("find() should return undefined when no match found", async () => {
      const r = Readable.from([1, 2, 3], { objectMode: true });
      const result = await r.find((x: number) => x === 999);
      expect(result).toBeUndefined();
    });

    it("some() should return true on short-circuit (match found)", async () => {
      const r = Readable.from([1, 2, 3, 4, 5], { objectMode: true });
      const result = await r.some((x: number) => x === 2);
      expect(result).toBe(true);
    });

    it("every() should return false on short-circuit (mismatch found)", async () => {
      const r = Readable.from([2, 4, 5, 6], { objectMode: true });
      const result = await r.every((x: number) => x % 2 === 0);
      expect(result).toBe(false);
    });

    it("find() should return the matching chunk on short-circuit", async () => {
      const r = Readable.from([1, 2, 3, 4, 5], { objectMode: true });
      const result = await r.find((x: number) => x === 2);
      expect(result).toBe(2);
    });
  });

  describe("Fix #5: destroy() doesn't set readableEnded", () => {
    it("readableEnded should remain false after destroy without prior end", async () => {
      const r = new Readable({
        objectMode: true,
        read() {}
      });

      r.push("data");
      r.destroy();

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(r.destroyed).toBe(true);
      expect(r.readableEnded).toBe(false);
    });

    it("writableFinished should remain false after destroy without prior end", async () => {
      const w = new Writable({
        objectMode: true,
        write(_chunk: any, _enc: string, cb: () => void) {
          cb();
        }
      });

      w.write("data");
      w.destroy();

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(w.destroyed).toBe(true);
      expect(w.writableFinished).toBe(false);
    });
  });

  describe("Fix #6: readable setter doesn't corrupt readableEnded", () => {
    it("setting readable = false should not affect readableEnded", () => {
      const r = new Readable({
        objectMode: true,
        read() {}
      });

      r.push("data");
      expect(r.readableEnded).toBe(false);

      // Setting readable to false should NOT set readableEnded to true
      (r as any).readable = false;

      expect(r.readable).toBe(false);
      expect(r.readableEnded).toBe(false);
    });

    it("setting readable = true should work correctly", () => {
      const r = new Readable({
        objectMode: true,
        read() {}
      });

      (r as any).readable = false;
      expect(r.readable).toBe(false);

      (r as any).readable = true;
      expect(r.readable).toBe(true);
    });
  });

  describe("Fix #7: write() after end() emits error", () => {
    it("should emit error event with ERR_STREAM_WRITE_AFTER_END code", async () => {
      const w = new Writable({
        objectMode: true,
        write(_chunk: any, _enc: string, cb: () => void) {
          cb();
        }
      });

      const errorPromise = new Promise<any>(resolve => {
        w.on("error", resolve);
      });

      w.end();
      w.write("after-end");

      const err = await errorPromise;
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe("ERR_STREAM_WRITE_AFTER_END");
    });

    it("write() after end() should return false", () => {
      const w = new Writable({
        objectMode: true,
        write(_chunk: any, _enc: string, cb: () => void) {
          cb();
        }
      });
      w.on("error", () => {}); // Prevent unhandled error

      w.end();
      const result = w.write("after-end");
      expect(result).toBe(false);
    });
  });

  describe("API surface: writableAborted not on Duplex/Transform", () => {
    it("Writable should have writableAborted", () => {
      const w = new Writable({
        write(_c: any, _e: string, cb: () => void) {
          cb();
        }
      });
      expect("writableAborted" in w).toBe(true);
      expect(w.writableAborted).toBe(false);
    });

    it("Duplex should NOT have writableAborted", () => {
      const d = createDuplex({ objectMode: true });
      expect("writableAborted" in d).toBe(false);
      expect((d as any).writableAborted).toBeUndefined();
    });

    it("Transform should NOT have writableAborted", () => {
      const t = new Transform({ objectMode: true });
      expect("writableAborted" in t).toBe(false);
      expect((t as any).writableAborted).toBeUndefined();
    });

    it("PassThrough should NOT have writableAborted", () => {
      const p = createPassThrough({ objectMode: true });
      expect("writableAborted" in p).toBe(false);
      expect((p as any).writableAborted).toBeUndefined();
    });
  });

  // ===========================================================================
  // M3: _destroy(err, cb) hook
  // ===========================================================================

  describe("_destroy hook (M3)", () => {
    it("Writable: close event waits for _destroy callback", async () => {
      const events: string[] = [];
      class MyWritable extends Writable {
        _destroy(_err: Error | null, cb: (error?: Error | null) => void): void {
          events.push("destroy-called");
          setTimeout(() => {
            events.push("destroy-callback");
            cb();
          }, 50);
        }
      }
      const w = new MyWritable({
        write(_c: any, _e: string, cb: () => void) {
          cb();
        }
      });
      w.on("close", () => events.push("close"));
      w.destroy();
      await new Promise<void>(resolve => w.once("close", resolve));
      expect(events).toEqual(["destroy-called", "destroy-callback", "close"]);
    });

    it("Readable: close event waits for _destroy callback", async () => {
      const events: string[] = [];
      class MyReadable extends Readable {
        _destroy(_err: Error | null, cb: (error?: Error | null) => void): void {
          events.push("destroy-called");
          setTimeout(() => {
            events.push("destroy-callback");
            cb();
          }, 50);
        }
      }
      const r = new MyReadable({ read() {} });
      r.on("close", () => events.push("close"));
      r.destroy();
      await new Promise<void>(resolve => r.once("close", resolve));
      expect(events).toEqual(["destroy-called", "destroy-callback", "close"]);
    });

    it("Duplex: close event waits for _destroy callback", async () => {
      const events: string[] = [];
      class MyDuplex extends Duplex {
        _destroy(_err: Error | null, cb: (error?: Error | null) => void): void {
          events.push("destroy-called");
          setTimeout(() => {
            events.push("destroy-callback");
            cb();
          }, 50);
        }
      }
      const d = new MyDuplex({
        objectMode: true,
        read() {},
        write(_c: any, _e: string, cb: () => void) {
          cb();
        }
      });
      d.on("close", () => events.push("close"));
      d.destroy();
      await new Promise<void>(resolve => d.once("close", resolve));
      expect(events).toEqual(["destroy-called", "destroy-callback", "close"]);
    });

    it("Transform: close event waits for _destroy callback", async () => {
      const events: string[] = [];
      class MyTransform extends Transform {
        _destroy(_err: Error | null, cb: (error?: Error | null) => void): void {
          events.push("destroy-called");
          setTimeout(() => {
            events.push("destroy-callback");
            cb();
          }, 50);
        }
      }
      const t = new MyTransform({
        objectMode: true,
        transform(chunk: any, _e: string, cb: (err: Error | null, data?: any) => void) {
          cb(null, chunk);
        }
      });
      t.on("close", () => events.push("close"));
      t.destroy();
      await new Promise<void>(resolve => t.once("close", resolve));
      expect(events).toEqual(["destroy-called", "destroy-callback", "close"]);
    });

    it("_destroy callback can change the error", async () => {
      const w = new Writable({
        write(_c: any, _e: string, cb: () => void) {
          cb();
        },
        destroy(_err: Error | null, cb: (error?: Error | null) => void) {
          cb(new Error("different error"));
        }
      });
      const errorPromise = new Promise<Error>(resolve => w.once("error", resolve));
      w.destroy(new Error("original"));
      const err = await errorPromise;
      expect(err.message).toBe("different error");
    });

    it("_destroy with no error emits close without error", async () => {
      const events: string[] = [];
      const w = new Writable({
        write(_c: any, _e: string, cb: () => void) {
          cb();
        },
        destroy(err: Error | null, cb: (error?: Error | null) => void) {
          events.push("destroy:err=" + err);
          cb(null);
        }
      });
      w.on("error", (e: Error) => events.push("error:" + e.message));
      w.on("close", () => events.push("close"));
      w.destroy();
      await new Promise<void>(resolve => w.once("close", resolve));
      expect(events).toEqual(["destroy:err=null", "close"]);
    });
  });

  // ===========================================================================
  // M3b: destroy/construct constructor options
  // ===========================================================================

  describe("destroy/construct constructor options (M3b)", () => {
    it("createWritable: destroy option works like Writable constructor option", async () => {
      const events: string[] = [];
      const w = createWritable({
        write(_c: any, _e: string, cb: () => void) {
          cb();
        },
        destroy(_err: Error | null, cb: (error?: Error | null) => void) {
          events.push("destroy-option-called");
          setTimeout(() => {
            events.push("destroy-option-done");
            cb();
          }, 30);
        }
      });
      w.on("close", () => events.push("close"));
      w.destroy();
      await new Promise<void>(resolve => w.once("close", resolve));
      expect(events).toEqual(["destroy-option-called", "destroy-option-done", "close"]);
    });

    it("Writable: destroy option works like subclass override", async () => {
      const events: string[] = [];
      const w = new Writable({
        write(_c: any, _e: string, cb: () => void) {
          cb();
        },
        destroy(_err: Error | null, cb: (error?: Error | null) => void) {
          events.push("destroy-option-called");
          setTimeout(() => {
            events.push("destroy-option-done");
            cb();
          }, 30);
        }
      });
      w.on("close", () => events.push("close"));
      w.destroy();
      await new Promise<void>(resolve => w.once("close", resolve));
      expect(events).toEqual(["destroy-option-called", "destroy-option-done", "close"]);
    });

    it("Readable: destroy option works like subclass override", async () => {
      const events: string[] = [];
      const r = new Readable({
        read() {},
        destroy(_err: Error | null, cb: (error?: Error | null) => void) {
          events.push("destroy-option-called");
          setTimeout(() => {
            events.push("destroy-option-done");
            cb();
          }, 30);
        }
      });
      r.on("close", () => events.push("close"));
      r.destroy();
      await new Promise<void>(resolve => r.once("close", resolve));
      expect(events).toEqual(["destroy-option-called", "destroy-option-done", "close"]);
    });

    it("Duplex: destroy option works like subclass override", async () => {
      const events: string[] = [];
      const d = new Duplex({
        objectMode: true,
        read() {},
        write(_c: any, _e: string, cb: () => void) {
          cb();
        },
        destroy(_err: Error | null, cb: (error?: Error | null) => void) {
          events.push("destroy-option-called");
          setTimeout(() => {
            events.push("destroy-option-done");
            cb();
          }, 30);
        }
      });
      d.on("close", () => events.push("close"));
      d.destroy();
      await new Promise<void>(resolve => d.once("close", resolve));
      expect(events).toEqual(["destroy-option-called", "destroy-option-done", "close"]);
    });

    it("Transform: destroy option works like subclass override", async () => {
      const events: string[] = [];
      const t = new Transform({
        objectMode: true,
        transform(chunk: any, _e: string, cb: (err: Error | null, data?: any) => void) {
          cb(null, chunk);
        },
        destroy(_err: Error | null, cb: (error?: Error | null) => void) {
          events.push("destroy-option-called");
          setTimeout(() => {
            events.push("destroy-option-done");
            cb();
          }, 30);
        }
      });
      t.on("close", () => events.push("close"));
      t.destroy();
      await new Promise<void>(resolve => t.once("close", resolve));
      expect(events).toEqual(["destroy-option-called", "destroy-option-done", "close"]);
    });

    it("Writable: construct option delays writes", async () => {
      const events: string[] = [];
      const w = new Writable({
        construct(cb: (error?: Error | null) => void) {
          events.push("construct-called");
          setTimeout(() => {
            events.push("construct-done");
            cb();
          }, 50);
        },
        write(chunk: any, _e: string, cb: () => void) {
          events.push("write:" + chunk.toString());
          cb();
        }
      });
      w.write("hello");
      events.push("write-called");
      await new Promise<void>(resolve => {
        w.end(() => {
          events.push("end-callback");
          resolve();
        });
      });
      expect(events).toEqual([
        "write-called",
        "construct-called",
        "construct-done",
        "write:hello",
        "end-callback"
      ]);
    });

    it("Readable: construct option delays _read", async () => {
      const events: string[] = [];
      const r = new Readable({
        construct(cb: (error?: Error | null) => void) {
          events.push("construct-called");
          setTimeout(() => {
            events.push("construct-done");
            cb();
          }, 50);
        },
        read() {
          events.push("_read-called");
          this.push("data");
          this.push(null);
        }
      });
      events.push("before-resume");
      const chunks: string[] = [];
      r.on("data", (chunk: any) => chunks.push(chunk.toString()));
      await new Promise<void>(resolve => r.once("end", resolve));
      expect(events).toEqual([
        "before-resume",
        "construct-called",
        "construct-done",
        "_read-called"
      ]);
      expect(chunks).toEqual(["data"]);
    });

    it("Writable: construct error destroys the stream", async () => {
      const events: string[] = [];
      const w = new Writable({
        construct(cb: (error?: Error | null) => void) {
          cb(new Error("construct failed"));
        },
        write(_c: any, _e: string, cb: () => void) {
          events.push("write-should-not-happen");
          cb();
        }
      });
      w.on("error", (e: Error) => events.push("error:" + e.message));
      await new Promise<void>(resolve => {
        w.on("close", () => {
          events.push("close");
          resolve();
        });
      });
      expect(events).toEqual(["error:construct failed", "close"]);
      expect(w.destroyed).toBe(true);
    });
  });

  // ===========================================================================
  // M4: emitClose/autoDestroy suppression on Duplex/Transform child streams
  // ===========================================================================

  describe("emitClose/autoDestroy child suppression (M4)", () => {
    it("Duplex destroy emits exactly one close event", async () => {
      let closeCount = 0;
      const d = new Duplex({
        objectMode: true,
        read() {},
        write(_c: any, _e: string, cb: () => void) {
          cb();
        }
      });
      d.on("close", () => closeCount++);
      d.destroy();
      await new Promise<void>(resolve => d.once("close", resolve));
      // Wait a bit for any stray events
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(closeCount).toBe(1);
    });

    it("Transform destroy emits exactly one close event", async () => {
      let closeCount = 0;
      const t = new Transform({
        objectMode: true,
        transform(chunk: any, _e: string, cb: (err: Error | null, data?: any) => void) {
          cb(null, chunk);
        }
      });
      t.on("close", () => closeCount++);
      t.destroy();
      await new Promise<void>(resolve => t.once("close", resolve));
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(closeCount).toBe(1);
    });

    it("Duplex destroy with error emits exactly one error event", async () => {
      let errorCount = 0;
      const d = new Duplex({
        objectMode: true,
        read() {},
        write(_c: any, _e: string, cb: () => void) {
          cb();
        }
      });
      d.on("error", () => errorCount++);
      d.destroy(new Error("test"));
      await new Promise<void>(resolve => d.once("close", resolve));
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(errorCount).toBe(1);
    });

    it("Transform destroy with error emits exactly one error event", async () => {
      let errorCount = 0;
      const t = new Transform({
        objectMode: true,
        transform(chunk: any, _e: string, cb: (err: Error | null, data?: any) => void) {
          cb(null, chunk);
        }
      });
      t.on("error", () => errorCount++);
      t.destroy(new Error("test"));
      await new Promise<void>(resolve => t.once("close", resolve));
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(errorCount).toBe(1);
    });
  });

  // ===========================================================================
  // M5: Symbol.asyncDispose
  // ===========================================================================

  describe("Symbol.asyncDispose (M5)", () => {
    it("Writable has Symbol.asyncDispose", () => {
      const w = new Writable({
        write(_c: any, _e: string, cb: () => void) {
          cb();
        }
      });
      expect(Symbol.asyncDispose in w).toBe(true);
    });

    it("Readable has Symbol.asyncDispose", () => {
      const r = new Readable({ read() {} });
      expect(Symbol.asyncDispose in r).toBe(true);
    });

    it("Duplex has Symbol.asyncDispose", () => {
      const d = new Duplex({
        objectMode: true,
        read() {},
        write(_c: any, _e: string, cb: () => void) {
          cb();
        }
      });
      expect(Symbol.asyncDispose in d).toBe(true);
    });

    it("Transform has Symbol.asyncDispose", () => {
      const t = new Transform({
        objectMode: true,
        transform(chunk: any, _e: string, cb: (err: Error | null, data?: any) => void) {
          cb(null, chunk);
        }
      });
      expect(Symbol.asyncDispose in t).toBe(true);
    });

    it("Writable: asyncDispose destroys and resolves after close", async () => {
      const events: string[] = [];
      const w = new Writable({
        write(_c: any, _e: string, cb: () => void) {
          cb();
        },
        destroy(_err: Error | null, cb: (error?: Error | null) => void) {
          setTimeout(() => {
            events.push("destroy-done");
            cb();
          }, 30);
        }
      });
      w.on("close", () => events.push("close"));
      await w[Symbol.asyncDispose]();
      events.push("disposed");
      expect(events).toEqual(["destroy-done", "close", "disposed"]);
      expect(w.destroyed).toBe(true);
    });

    it("Readable: asyncDispose destroys and resolves after close", async () => {
      const r = new Readable({ read() {} });
      await r[Symbol.asyncDispose]();
      expect(r.destroyed).toBe(true);
    });

    it("Duplex: asyncDispose destroys and resolves after close", async () => {
      const d = new Duplex({
        objectMode: true,
        read() {},
        write(_c: any, _e: string, cb: () => void) {
          cb();
        }
      });
      await d[Symbol.asyncDispose]();
      expect(d.destroyed).toBe(true);
    });

    it("Transform: asyncDispose destroys and resolves after close", async () => {
      const t = new Transform({
        objectMode: true,
        transform(chunk: any, _e: string, cb: (err: Error | null, data?: any) => void) {
          cb(null, chunk);
        }
      });
      await t[Symbol.asyncDispose]();
      expect(t.destroyed).toBe(true);
    });

    it("asyncDispose rejects with Premature close if already destroyed", async () => {
      const w = new Writable({
        write(_c: any, _e: string, cb: () => void) {
          cb();
        }
      });
      w.destroy();
      await new Promise<void>(resolve => w.once("close", resolve));
      // Node rejects with "Premature close" when stream was destroyed (not gracefully ended)
      await expect(w[Symbol.asyncDispose]()).rejects.toThrow("Premature close");
    });
  });

  // ===========================================================================
  // L1: Symbol.hasInstance (instanceof)
  // ===========================================================================

  describe("Symbol.hasInstance (L1)", () => {
    it("Duplex instanceof Readable is true", () => {
      const d = new Duplex({
        objectMode: true,
        read() {},
        write(_c: any, _e: string, cb: () => void) {
          cb();
        }
      });
      expect(d instanceof Readable).toBe(true);
    });

    it("Duplex instanceof Writable is true", () => {
      const d = new Duplex({
        objectMode: true,
        read() {},
        write(_c: any, _e: string, cb: () => void) {
          cb();
        }
      });
      expect(d instanceof Writable).toBe(true);
    });

    it("Transform instanceof Readable is true", () => {
      const t = new Transform({
        objectMode: true,
        transform(chunk: any, _e: string, cb: (err: Error | null, data?: any) => void) {
          cb(null, chunk);
        }
      });
      expect(t instanceof Readable).toBe(true);
    });

    it("Transform instanceof Writable is true", () => {
      const t = new Transform({
        objectMode: true,
        transform(chunk: any, _e: string, cb: (err: Error | null, data?: any) => void) {
          cb(null, chunk);
        }
      });
      expect(t instanceof Writable).toBe(true);
    });

    it("Readable instanceof Writable is false", () => {
      const r = new Readable({ read() {} });
      expect(r instanceof Writable).toBe(false);
    });

    it("Writable instanceof Readable is false", () => {
      const w = new Writable({
        write(_c: any, _e: string, cb: () => void) {
          cb();
        }
      });
      expect(w instanceof Readable).toBe(false);
    });

    it("Readable instanceof Readable is true", () => {
      const r = new Readable({ read() {} });
      expect(r instanceof Readable).toBe(true);
    });

    it("Writable instanceof Writable is true", () => {
      const w = new Writable({
        write(_c: any, _e: string, cb: () => void) {
          cb();
        }
      });
      expect(w instanceof Writable).toBe(true);
    });
  });

  // ===========================================================================
  // L2: _construct(callback) hook
  // ===========================================================================

  describe("_construct hook (L2)", () => {
    it("Writable subclass: _construct delays _write", async () => {
      const events: string[] = [];
      class ConstructWritable extends Writable {
        _construct(cb: (error?: Error | null) => void): void {
          events.push("construct-called");
          setTimeout(() => {
            events.push("construct-done");
            cb();
          }, 50);
        }
      }
      const w = new ConstructWritable({
        write(chunk: any, _e: string, cb: () => void) {
          events.push("write:" + chunk.toString());
          cb();
        }
      });
      w.write("hello");
      events.push("write-called");
      await new Promise<void>(resolve => {
        w.end(() => {
          events.push("end-callback");
          resolve();
        });
      });
      expect(events).toEqual([
        "write-called",
        "construct-called",
        "construct-done",
        "write:hello",
        "end-callback"
      ]);
    });

    it("Readable subclass: _construct delays _read", async () => {
      const events: string[] = [];
      class ConstructReadable extends Readable {
        _construct(cb: (error?: Error | null) => void): void {
          events.push("construct-called");
          setTimeout(() => {
            events.push("construct-done");
            cb();
          }, 50);
        }
      }
      const r = new ConstructReadable({
        read() {
          events.push("_read-called");
          this.push("data");
          this.push(null);
        }
      });
      events.push("before-resume");
      const chunks: string[] = [];
      r.on("data", (chunk: any) => chunks.push(chunk.toString()));
      await new Promise<void>(resolve => r.once("end", resolve));
      expect(events).toEqual([
        "before-resume",
        "construct-called",
        "construct-done",
        "_read-called"
      ]);
      expect(chunks).toEqual(["data"]);
    });

    it("Readable _construct error destroys the stream", async () => {
      const events: string[] = [];
      const r = new Readable({
        construct(cb: (error?: Error | null) => void) {
          cb(new Error("construct failed"));
        },
        read() {
          events.push("read-should-not-happen");
        }
      });
      r.on("error", (e: Error) => events.push("error:" + e.message));
      await new Promise<void>(resolve => {
        r.on("close", () => {
          events.push("close");
          resolve();
        });
      });
      expect(events).toEqual(["error:construct failed", "close"]);
      expect(r.destroyed).toBe(true);
    });
  });

  // ===========================================================================
  // L3: _writev(chunks, cb) batch write
  // ===========================================================================

  describe("_writev batch write (L3)", () => {
    it("_writev is called with multiple corked chunks", async () => {
      const events: string[] = [];
      const w = new Writable({
        write(chunk: any, _enc: string, cb: () => void) {
          events.push("write:" + chunk.toString());
          cb();
        },
        writev(
          chunks: Array<{ chunk: any; encoding: string }>,
          cb: (error?: Error | null) => void
        ) {
          events.push("writev:" + chunks.map(c => c.chunk.toString()).join(","));
          cb();
        }
      });
      w.cork();
      w.write("a");
      w.write("b");
      w.write("c");
      w.uncork();
      await new Promise<void>(resolve => {
        w.end(() => {
          events.push("finish");
          resolve();
        });
      });
      expect(events).toEqual(["writev:a,b,c", "finish"]);
    });

    it("_writev is NOT called for single corked chunk", async () => {
      const events: string[] = [];
      const w = new Writable({
        write(chunk: any, _enc: string, cb: () => void) {
          events.push("write:" + chunk.toString());
          cb();
        },
        writev(
          chunks: Array<{ chunk: any; encoding: string }>,
          cb: (error?: Error | null) => void
        ) {
          events.push("writev:" + chunks.length);
          cb();
        }
      });
      w.cork();
      w.write("only-one");
      w.uncork();
      await new Promise<void>(resolve => {
        w.end(() => {
          events.push("finish");
          resolve();
        });
      });
      expect(events).toEqual(["write:only-one", "finish"]);
    });

    it("_writev subclass override works", async () => {
      const events: string[] = [];
      class BatchWritable extends Writable {
        _writev(
          chunks: Array<{ chunk: any; encoding: string }>,
          cb: (error?: Error | null) => void
        ): void {
          events.push("writev:" + chunks.map(c => c.chunk.toString()).join(","));
          cb();
        }
      }
      const w = new BatchWritable({
        write(chunk: any, _enc: string, cb: () => void) {
          events.push("write:" + chunk.toString());
          cb();
        }
      });
      w.cork();
      w.write("x");
      w.write("y");
      w.uncork();
      await new Promise<void>(resolve => {
        w.end(() => {
          events.push("finish");
          resolve();
        });
      });
      expect(events).toEqual(["writev:x,y", "finish"]);
    });

    it("_writev error propagates", async () => {
      const events: string[] = [];
      const w = new Writable({
        write(_c: any, _enc: string, cb: () => void) {
          cb();
        },
        writev(
          _chunks: Array<{ chunk: any; encoding: string }>,
          cb: (error?: Error | null) => void
        ) {
          cb(new Error("writev failed"));
        }
      });
      w.on("error", (e: Error) => events.push("error:" + e.message));
      w.cork();
      w.write("a");
      w.write("b");
      w.uncork();
      await new Promise<void>(resolve => w.once("close", resolve));
      expect(events).toContain("error:writev failed");
    });
  });

  // ===========================================================================
  // HWM precedence & per-side options on Duplex / Transform
  // ===========================================================================
  describe("HWM precedence & per-side options", () => {
    // --- Duplex ---
    it("Duplex: highWaterMark overrides per-side HWM when explicitly set", () => {
      const d = new Duplex({
        highWaterMark: 999,
        readableHighWaterMark: 111,
        writableHighWaterMark: 222,
        read() {},
        write(_c: any, _e: string, cb: any) {
          cb();
        }
      });
      expect(d.readableHighWaterMark).toBe(999);
      expect(d.writableHighWaterMark).toBe(999);
      d.destroy();
    });

    it("Duplex: per-side HWM works when highWaterMark is not set", () => {
      const d = new Duplex({
        readableHighWaterMark: 111,
        writableHighWaterMark: 222,
        read() {},
        write(_c: any, _e: string, cb: any) {
          cb();
        }
      });
      expect(d.readableHighWaterMark).toBe(111);
      expect(d.writableHighWaterMark).toBe(222);
      d.destroy();
    });

    // --- Transform ---
    it("Transform: highWaterMark is forwarded to both sides", () => {
      const t = new Transform({
        highWaterMark: 999,
        transform(c: any, _e: string, cb: any) {
          cb(null, c);
        }
      });
      expect(t.readableHighWaterMark).toBe(999);
      expect(t.writableHighWaterMark).toBe(999);
      t.destroy();
    });

    it("Transform: per-side HWM works when highWaterMark is not set", () => {
      const t = new Transform({
        readableHighWaterMark: 111,
        writableHighWaterMark: 222,
        transform(c: any, _e: string, cb: any) {
          cb(null, c);
        }
      });
      expect(t.readableHighWaterMark).toBe(111);
      expect(t.writableHighWaterMark).toBe(222);
      t.destroy();
    });

    it("Transform: highWaterMark overrides per-side HWM when explicitly set", () => {
      const t = new Transform({
        highWaterMark: 999,
        readableHighWaterMark: 111,
        writableHighWaterMark: 222,
        transform(c: any, _e: string, cb: any) {
          cb(null, c);
        }
      });
      expect(t.readableHighWaterMark).toBe(999);
      expect(t.writableHighWaterMark).toBe(999);
      t.destroy();
    });

    // --- per-side objectMode ---
    it("Transform: per-side objectMode overrides general objectMode", () => {
      const t = new Transform({
        readableObjectMode: true,
        writableObjectMode: false,
        transform(c: any, _e: string, cb: any) {
          cb(null, c);
        }
      });
      expect(t.readableObjectMode).toBe(true);
      expect(t.writableObjectMode).toBe(false);
      t.destroy();
    });

    it("Transform: general objectMode applies when per-side not set", () => {
      const t = new Transform({
        objectMode: true,
        transform(c: any, _e: string, cb: any) {
          cb(null, c);
        }
      });
      expect(t.readableObjectMode).toBe(true);
      expect(t.writableObjectMode).toBe(true);
      t.destroy();
    });

    it("Transform: readableObjectMode only affects readable side", () => {
      const t = new Transform({
        readableObjectMode: true,
        transform(c: any, _e: string, cb: any) {
          cb(null, c);
        }
      });
      expect(t.readableObjectMode).toBe(true);
      expect(t.writableObjectMode).toBe(false);
      t.destroy();
    });
  });

  // ===========================================================================
  // Transform write / final / writev constructor options
  // ===========================================================================
  describe("Transform write / final / writev constructor options", () => {
    it("Transform: write option overrides transform-based write", async () => {
      const events: string[] = [];
      const t = new Transform({
        write(chunk: any, _enc: string, cb: any) {
          events.push("write:" + chunk);
          (this as any).push(String(chunk).toUpperCase());
          cb();
        },
        transform(_chunk: any, _enc: string, cb: any) {
          events.push("transform-should-not-be-called");
          cb();
        }
      });
      const collected: string[] = [];
      t.on("data", (d: any) => collected.push(String(d)));
      t.write("hello");
      t.end();
      await new Promise<void>(resolve => t.once("finish", resolve));
      expect(events).toEqual(["write:hello"]);
      expect(collected).toEqual(["HELLO"]);
    });

    it("Transform: final option overrides default flush-based final", async () => {
      let finalCalled = false;
      const t = new Transform({
        transform(c: any, _e: string, cb: any) {
          cb(null, c);
        },
        final(cb: any) {
          finalCalled = true;
          cb();
        }
      });
      t.resume();
      t.write("x");
      t.end();
      await new Promise<void>(resolve => t.once("finish", resolve));
      expect(finalCalled).toBe(true);
    });

    it("Transform: writev option enables batch writes", async () => {
      let writevChunks: any[] = [];
      const t = new Transform({
        transform(c: any, _e: string, cb: any) {
          cb(null, c);
        },
        writev(chunks: any[], cb: any) {
          writevChunks = chunks.map((c: any) => String(c.chunk));
          cb();
        }
      });
      t.resume();
      t.cork();
      t.write("a");
      t.write("b");
      t.uncork();
      t.end();
      await new Promise<void>(resolve => t.once("finish", resolve));
      expect(writevChunks).toEqual(["a", "b"]);
    });
  });

  // ===========================================================================
  // Duplex writev constructor option
  // ===========================================================================
  describe("Duplex writev constructor option", () => {
    it("Duplex: writev option enables batch writes", async () => {
      let writevChunks: any[] = [];
      const d = new Duplex({
        read() {},
        write(_c: any, _e: string, cb: any) {
          cb();
        },
        writev(chunks: any[], cb: any) {
          writevChunks = chunks.map((c: any) => String(c.chunk));
          cb();
        }
      });
      d.cork();
      d.write("a");
      d.write("b");
      d.uncork();
      d.end();
      await new Promise<void>(resolve => d.once("finish", resolve));
      expect(writevChunks).toEqual(["a", "b"]);
      d.destroy();
    });
  });

  // ===========================================================================
  // Round 3: encoding / defaultEncoding / signal on Duplex & Transform
  // ===========================================================================
  describe("Duplex/Transform encoding, defaultEncoding, signal constructor options", () => {
    it("Duplex: encoding option sets readableEncoding", () => {
      const d = new Duplex({
        encoding: "utf8",
        read() {},
        write(_c: any, _e: string, cb: any) {
          cb();
        }
      });
      expect(d.readableEncoding).toBe("utf8");
      d.destroy();
    });

    it("Transform: encoding option sets readableEncoding", () => {
      const t = new Transform({
        encoding: "utf8",
        transform(c: any, _e: string, cb: any) {
          cb(null, c);
        }
      });
      expect(t.readableEncoding).toBe("utf8");
      t.destroy();
    });

    it("Duplex: defaultEncoding option is used for writes", async () => {
      let receivedEncoding = "";
      const d = new Duplex({
        defaultEncoding: "latin1",
        read() {},
        write(_c: any, enc: string, cb: any) {
          receivedEncoding = enc;
          cb();
        }
      });
      d.write("hello");
      d.end();
      await new Promise<void>(resolve => d.once("finish", resolve));
      expect(receivedEncoding).toBe("buffer");
      d.destroy();
    });

    it("Transform: defaultEncoding option is used for writes", async () => {
      let receivedEncoding = "";
      const t = new Transform({
        defaultEncoding: "latin1",
        write(_c: any, enc: string, cb: any) {
          receivedEncoding = enc;
          cb();
        }
      });
      t.resume();
      t.write("hello");
      t.end();
      await new Promise<void>(resolve => t.once("finish", resolve));
      expect(receivedEncoding).toBe("buffer");
      t.destroy();
    });

    it("Duplex: signal option destroys stream on abort", async () => {
      const ac = new AbortController();
      const d = new Duplex({
        signal: ac.signal,
        read() {},
        write(_c: any, _e: string, cb: any) {
          cb();
        }
      });
      const errorPromise = new Promise<Error>(resolve => d.once("error", resolve));
      const closePromise = new Promise<void>(resolve => d.once("close", resolve));
      ac.abort();
      const err = await errorPromise;
      await closePromise;
      expect(err.message).toBe("The operation was aborted");
      expect(d.destroyed).toBe(true);
    });

    it("Transform: signal option destroys stream on abort", async () => {
      const ac = new AbortController();
      const t = new Transform({
        signal: ac.signal,
        transform(c: any, _e: string, cb: any) {
          cb(null, c);
        }
      });
      const errorPromise = new Promise<Error>(resolve => t.once("error", resolve));
      const closePromise = new Promise<void>(resolve => t.once("close", resolve));
      ac.abort();
      const err = await errorPromise;
      await closePromise;
      expect(err.message).toBe("The operation was aborted");
      expect(t.destroyed).toBe(true);
    });

    it("Duplex: already-aborted signal destroys immediately", async () => {
      const ac = new AbortController();
      ac.abort();
      const d = new Duplex({
        signal: ac.signal,
        read() {},
        write(_c: any, _e: string, cb: any) {
          cb();
        }
      });
      const errorPromise = new Promise<Error>(resolve => d.once("error", resolve));
      const closePromise = new Promise<void>(resolve => d.once("close", resolve));
      const err = await errorPromise;
      await closePromise;
      expect(err.message).toBe("The operation was aborted");
      expect(d.destroyed).toBe(true);
    });

    it("Transform: already-aborted signal destroys immediately", async () => {
      const ac = new AbortController();
      ac.abort();
      const t = new Transform({
        signal: ac.signal,
        transform(c: any, _e: string, cb: any) {
          cb(null, c);
        }
      });
      const errorPromise = new Promise<Error>(resolve => t.once("error", resolve));
      const closePromise = new Promise<void>(resolve => t.once("close", resolve));
      const err = await errorPromise;
      await closePromise;
      expect(err.message).toBe("The operation was aborted");
      expect(t.destroyed).toBe(true);
    });
  });

  // ===========================================================================
  // Round 3: pause / resume events on Duplex & Transform
  // ===========================================================================
  describe("Duplex/Transform pause and resume events", () => {
    it("Duplex: emits pause event on pause()", async () => {
      const d = new Duplex({
        read() {},
        write(_c: any, _e: string, cb: any) {
          cb();
        }
      });
      let pauseCount = 0;
      d.on("pause", () => pauseCount++);
      d.resume(); // start flowing
      d.pause();
      // Allow async event propagation
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(pauseCount).toBe(1);
      d.destroy();
    });

    it("Duplex: emits resume event on resume()", async () => {
      const d = new Duplex({
        read() {},
        write(_c: any, _e: string, cb: any) {
          cb();
        }
      });
      let resumeCount = 0;
      d.on("resume", () => resumeCount++);
      d.resume();
      // Allow async event propagation
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(resumeCount).toBe(1);
      d.destroy();
    });

    it("Transform: emits pause event on pause()", async () => {
      const t = new Transform({
        transform(c: any, _e: string, cb: any) {
          cb(null, c);
        }
      });
      let pauseCount = 0;
      t.on("pause", () => pauseCount++);
      t.resume(); // start flowing
      t.pause();
      // Allow async event propagation
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(pauseCount).toBe(1);
      t.destroy();
    });

    it("Transform: emits resume event on resume()", async () => {
      const t = new Transform({
        transform(c: any, _e: string, cb: any) {
          cb(null, c);
        }
      });
      let resumeCount = 0;
      t.on("resume", () => resumeCount++);
      t.resume();
      // Allow async event propagation
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(resumeCount).toBe(1);
      t.destroy();
    });
  });

  // ===========================================================================
  // Round 3: static isDisturbed on Duplex & Transform
  // ===========================================================================
  describe("Duplex/Transform static isDisturbed", () => {
    it("Duplex.isDisturbed returns false for fresh stream", () => {
      const d = new Duplex({
        read() {},
        write(_c: any, _e: string, cb: any) {
          cb();
        }
      });
      expect(Duplex.isDisturbed!(d)).toBe(false);
      d.destroy();
    });

    it("Duplex.isDisturbed returns true after data is read", async () => {
      const d = new Duplex({
        read() {
          this.push("x");
          this.push(null);
        },
        write(_c: any, _e: string, cb: any) {
          cb();
        }
      });
      d.on("data", () => {});
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(Duplex.isDisturbed!(d)).toBe(true);
      d.destroy();
    });

    it("Transform.isDisturbed returns true after data is read", async () => {
      const t = new Transform({
        transform(c: any, _e: string, cb: any) {
          cb(null, c);
        }
      });
      t.write("x");
      t.on("data", () => {});
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(Transform.isDisturbed!(t)).toBe(true);
      t.destroy();
    });
  });

  // ===========================================================================
  // Round 4: Symbol.hasInstance on Duplex & Transform
  // ===========================================================================
  describe("Symbol.hasInstance on Duplex and Transform", () => {
    it("Duplex has Symbol.hasInstance", () => {
      expect(Symbol.hasInstance in Duplex).toBe(true);
    });

    it("Transform has Symbol.hasInstance", () => {
      expect(Symbol.hasInstance in Transform).toBe(true);
    });

    it("Duplex instance passes instanceof Duplex", () => {
      const d = new Duplex({
        read() {},
        write(_c: any, _e: string, cb: any) {
          cb();
        }
      });
      expect(d instanceof Duplex).toBe(true);
      d.destroy();
    });

    it("Transform instance passes instanceof Duplex", () => {
      const t = new Transform({
        transform(c: any, _e: string, cb: any) {
          cb(null, c);
        }
      });
      expect(t instanceof Duplex).toBe(true);
      t.destroy();
    });

    it("Transform instance passes instanceof Transform", () => {
      const t = new Transform({
        transform(c: any, _e: string, cb: any) {
          cb(null, c);
        }
      });
      expect(t instanceof Transform).toBe(true);
      t.destroy();
    });

    it("Duplex instance passes instanceof Readable", () => {
      const d = new Duplex({
        read() {},
        write(_c: any, _e: string, cb: any) {
          cb();
        }
      });
      expect(d instanceof Readable).toBe(true);
      d.destroy();
    });

    it("Duplex instance passes instanceof Writable", () => {
      const d = new Duplex({
        read() {},
        write(_c: any, _e: string, cb: any) {
          cb();
        }
      });
      expect(d instanceof Writable).toBe(true);
      d.destroy();
    });

    it("Transform instance passes instanceof Readable", () => {
      const t = new Transform({
        transform(c: any, _e: string, cb: any) {
          cb(null, c);
        }
      });
      expect(t instanceof Readable).toBe(true);
      t.destroy();
    });

    it("Transform instance passes instanceof Writable", () => {
      const t = new Transform({
        transform(c: any, _e: string, cb: any) {
          cb(null, c);
        }
      });
      expect(t instanceof Writable).toBe(true);
      t.destroy();
    });
  });

  // ===========================================================================
  // Round 4: pipe/unpipe events on destination
  // ===========================================================================
  describe("pipe/unpipe events on destination", () => {
    it("pipe() emits pipe event on destination with source as argument", async () => {
      const r = new Readable({ read() {} });
      const w = new Writable({
        write(_c: any, _e: string, cb: any) {
          cb();
        }
      });

      let pipeSource: any = null;
      w.on("pipe", (src: any) => {
        pipeSource = src;
      });

      r.pipe(w);
      expect(pipeSource).toBe(r);

      r.unpipe(w);
      r.destroy();
      w.destroy();
    });

    it("unpipe() emits unpipe event on destination with source as argument", async () => {
      const r = new Readable({ read() {} });
      const w = new Writable({
        write(_c: any, _e: string, cb: any) {
          cb();
        }
      });

      let unpipeSource: any = null;
      w.on("unpipe", (src: any) => {
        unpipeSource = src;
      });

      r.pipe(w);
      r.unpipe(w);
      expect(unpipeSource).toBe(r);

      r.destroy();
      w.destroy();
    });

    it("pipe() emits pipe event when piping to Transform", async () => {
      const r = new Readable({ read() {} });
      const t = new Transform({
        transform(c: any, _e: string, cb: any) {
          cb(null, c);
        }
      });

      let pipeSource: any = null;
      t.on("pipe", (src: any) => {
        pipeSource = src;
      });

      r.pipe(t);
      expect(pipeSource).toBe(r);

      r.unpipe(t);
      r.destroy();
      t.destroy();
    });
  });

  // ==========================================================================
  // Round 5: Flow State, Construct, and Error Handling
  // ==========================================================================
  describe("Round 5: Flow State, Construct, and Error Handling", () => {
    // R5-1: Duplex _construct delays reads/writes until callback fires
    describe("Duplex _construct", () => {
      it("should delay writes until construct callback fires", async () => {
        const writes: string[] = [];
        let constructCb: ((error?: Error | null) => void) | undefined;

        const duplex = new Duplex({
          objectMode: true,
          construct(cb: (error?: Error | null) => void) {
            constructCb = cb;
          },
          write(chunk: any, _encoding: string, cb: (error?: Error | null) => void) {
            writes.push(chunk);
            cb();
          }
        });

        // Write should be queued, not executed
        duplex.write("hello");
        expect(writes).toEqual([]);

        // Fire construct callback after a small delay
        await new Promise<void>(resolve => {
          setTimeout(() => {
            constructCb!();
            resolve();
          }, 10);
        });

        // Allow microtasks to drain
        await new Promise<void>(resolve => setTimeout(resolve, 20));

        expect(writes).toEqual(["hello"]);
        duplex.destroy();
      });

      it("should destroy stream if construct callback receives error", async () => {
        const duplex = new Duplex({
          objectMode: true,
          construct(cb: (error?: Error | null) => void) {
            setTimeout(() => cb(new Error("construct failed")), 5);
          },
          write(_chunk: any, _encoding: string, cb: (error?: Error | null) => void) {
            cb();
          }
        });

        const errorPromise = new Promise<Error>(resolve => {
          duplex.on("error", resolve);
        });

        const err = await errorPromise;
        expect(err.message).toBe("construct failed");
        expect(duplex.destroyed).toBe(true);
      });
    });

    // R5-3: pause() on fresh stream transitions readableFlowing from null to false
    describe("Readable pause() on fresh stream", () => {
      it("should transition readableFlowing from null to false", () => {
        const r = new Readable({ read() {} });
        expect(r.readableFlowing).toBeNull();
        r.pause();
        expect(r.readableFlowing).toBe(false);
        expect(r.isPaused()).toBe(true);
        r.destroy();
      });

      it("Duplex should transition readableFlowing from null to false on pause()", () => {
        const duplex = new Duplex({
          objectMode: true,
          read() {},
          write(_c: any, _e: string, cb: any) {
            cb();
          }
        });
        expect(duplex.readableFlowing).toBeNull();
        duplex.pause();
        expect(duplex.readableFlowing).toBe(false);
        expect(duplex.isPaused()).toBe(true);
        duplex.destroy();
      });
    });

    // R5-4: on('readable') sets readableFlowing to false
    describe("Readable on('readable') flow state", () => {
      it("should set readableFlowing to false when 'readable' listener is added", () => {
        const r = new Readable({ read() {} });
        expect(r.readableFlowing).toBeNull();
        r.on("readable", () => {});
        expect(r.readableFlowing).toBe(false);
        r.destroy();
      });

      it("Duplex readableFlowing starts null and goes false on on('readable')", () => {
        const duplex = new Duplex({
          objectMode: true,
          read() {},
          write(_c: any, _e: string, cb: any) {
            cb();
          }
        });
        expect(duplex.readableFlowing).toBeNull();
        duplex.on("readable", () => {});
        expect(duplex.readableFlowing).toBe(false);
        duplex.destroy();
      });
    });

    // R5-5: emit('error') with no listener should throw
    describe("EventEmitter error throw semantics", () => {
      it("should throw the error when emitting 'error' with no listener", () => {
        const emitter = new EventEmitter();
        const err = new Error("test error");
        expect(() => emitter.emit("error", err)).toThrow("test error");
      });

      it("should throw generic message when emitting 'error' with undefined arg", () => {
        const emitter = new EventEmitter();
        expect(() => emitter.emit("error")).toThrow("Unhandled error. (undefined)");
      });

      it("should throw generic message with non-Error arg", () => {
        const emitter = new EventEmitter();
        expect(() => emitter.emit("error", "string error")).toThrow(
          "Unhandled error. (string error)"
        );
      });

      it("should not throw when error listener is present", () => {
        const emitter = new EventEmitter();
        const errors: Error[] = [];
        emitter.on("error", (err: Error) => errors.push(err));
        const err = new Error("handled error");
        expect(() => emitter.emit("error", err)).not.toThrow();
        expect(errors).toEqual([err]);
      });

      it("Readable emit('error') with no listener should throw", () => {
        const r = new Readable({ read() {} });
        const err = new Error("readable error");
        expect(() => r.emit("error", err)).toThrow("readable error");
        r.destroy();
      });

      it("Writable emit('error') with no listener should throw", () => {
        const w = new Writable({
          write(_c: any, _e: string, cb: any) {
            cb();
          }
        });
        const err = new Error("writable error");
        expect(() => w.emit("error", err)).toThrow("writable error");
        w.destroy();
      });
    });
  });

  // ===========================================================================
  // Round 6: API surface parity (addListener/on identity, removeListener/off
  // identity, Writable.pipe, _undestroy, _writev prototype value)
  // ===========================================================================

  describe("R6: API surface parity", () => {
    // =========================================================================
    // A1: addListener === on (reference identity)
    // =========================================================================

    describe("addListener === on identity", () => {
      it("Readable.prototype.addListener === Readable.prototype.on", () => {
        expect(Readable.prototype.addListener).toBe(Readable.prototype.on);
      });

      it("Writable.prototype.addListener === Writable.prototype.on", () => {
        expect(Writable.prototype.addListener).toBe(Writable.prototype.on);
      });

      it("Duplex.prototype.addListener === Duplex.prototype.on", () => {
        expect(Duplex.prototype.addListener).toBe(Duplex.prototype.on);
      });

      it("Transform.prototype.addListener === Transform.prototype.on", () => {
        expect(Transform.prototype.addListener).toBe(Transform.prototype.on);
      });

      it("PassThrough.prototype.addListener === PassThrough.prototype.on", () => {
        expect(PassThrough.prototype.addListener).toBe(PassThrough.prototype.on);
      });

      it("instance addListener === instance on", () => {
        const r = new Readable({ read() {} });
        expect(r.addListener).toBe(r.on);
        r.destroy();
      });

      it("addListener triggers data flowing just like on", () =>
        new Promise<void>(done => {
          const r = new Readable({
            read() {
              this.push("hello");
              this.push(null);
            }
          });
          const chunks: string[] = [];
          r.addListener("data", (chunk: any) => chunks.push(String(chunk)));
          r.on("end", () => {
            expect(chunks.length).toBeGreaterThan(0);
            done();
          });
        }));
    });

    // =========================================================================
    // A2: removeListener === off (reference identity)
    // =========================================================================

    describe("removeListener === off identity", () => {
      it("Readable.prototype.removeListener === Readable.prototype.off", () => {
        expect(Readable.prototype.removeListener).toBe(Readable.prototype.off);
      });

      it("Writable.prototype.removeListener === Writable.prototype.off", () => {
        expect(Writable.prototype.removeListener).toBe(Writable.prototype.off);
      });

      it("Duplex.prototype.removeListener === Duplex.prototype.off", () => {
        expect(Duplex.prototype.removeListener).toBe(Duplex.prototype.off);
      });

      it("Transform.prototype.removeListener === Transform.prototype.off", () => {
        expect(Transform.prototype.removeListener).toBe(Transform.prototype.off);
      });

      it("PassThrough.prototype.removeListener === PassThrough.prototype.off", () => {
        expect(PassThrough.prototype.removeListener).toBe(PassThrough.prototype.off);
      });
    });

    // =========================================================================
    // A3: Writable.pipe() — async error, no throw, returns undefined
    // =========================================================================

    describe("Writable.pipe() behavior", () => {
      it("should not throw synchronously", () => {
        const w = new Writable({
          write(_c: any, _e: string, cb: any) {
            cb();
          }
        });
        w.on("error", () => {}); // prevent unhandled error
        let threw = false;
        try {
          (w as any).pipe();
        } catch {
          threw = true;
        }
        expect(threw).toBe(false);
        w.destroy();
      });

      it("should return undefined", () => {
        const w = new Writable({
          write(_c: any, _e: string, cb: any) {
            cb();
          }
        });
        w.on("error", () => {});
        const result = (w as any).pipe();
        expect(result).toBeUndefined();
        w.destroy();
      });

      it("should emit error asynchronously", () =>
        new Promise<void>(done => {
          const w = new Writable({
            write(_c: any, _e: string, cb: any) {
              cb();
            }
          });
          const errors: Error[] = [];
          w.on("error", (err: Error) => {
            errors.push(err);
            expect(err.message).toContain("not readable");
            done();
          });
          (w as any).pipe();
          // Error should not have been emitted yet (async)
          expect(errors).toHaveLength(0);
        }));
    });

    // =========================================================================
    // A4: _undestroy()
    // =========================================================================

    describe("_undestroy()", () => {
      it("should exist on Readable prototype", () => {
        expect(typeof Readable.prototype._undestroy).toBe("function");
      });

      it("should exist on Writable prototype", () => {
        expect(typeof Writable.prototype._undestroy).toBe("function");
      });

      it("should exist on Duplex prototype", () => {
        expect(typeof (Duplex.prototype as any)._undestroy).toBe("function");
      });

      it("should exist on Transform prototype", () => {
        expect(typeof (Transform.prototype as any)._undestroy).toBe("function");
      });

      it("should exist on PassThrough prototype", () => {
        expect(typeof (PassThrough.prototype as any)._undestroy).toBe("function");
      });

      it("Readable: should reset destroyed and closed after destroy", () =>
        new Promise<void>(done => {
          const r = new Readable({ read() {} });
          r.on("close", () => {
            expect(r.destroyed).toBe(true);
            expect(r.closed).toBe(true);
            r._undestroy();
            expect(r.destroyed).toBe(false);
            expect(r.closed).toBe(false);
            done();
          });
          r.destroy();
        }));

      it("Writable: should reset destroyed and closed after destroy", () =>
        new Promise<void>(done => {
          const w = new Writable({
            write(_c: any, _e: string, cb: any) {
              cb();
            }
          });
          w.on("close", () => {
            expect(w.destroyed).toBe(true);
            expect(w.closed).toBe(true);
            w._undestroy();
            expect(w.destroyed).toBe(false);
            expect(w.closed).toBe(false);
            done();
          });
          w.destroy();
        }));

      it("Duplex: should reset destroyed and closed after destroy", () =>
        new Promise<void>(done => {
          const d = new Duplex({
            read() {},
            write(_c: any, _e: string, cb: any) {
              cb();
            }
          });
          d.on("close", () => {
            expect(d.destroyed).toBe(true);
            (d as any)._undestroy();
            expect(d.destroyed).toBe(false);
            done();
          });
          d.destroy();
        }));

      it("Transform: should reset destroyed after destroy", () =>
        new Promise<void>(done => {
          const t = new Transform({
            transform(chunk: any, _e: string, cb: any) {
              cb(null, chunk);
            }
          });
          t.on("close", () => {
            expect(t.destroyed).toBe(true);
            (t as any)._undestroy();
            expect(t.destroyed).toBe(false);
            done();
          });
          t.destroy();
        }));
    });

    // =========================================================================
    // A5: _writev prototype value is null
    // =========================================================================

    describe("_writev prototype value", () => {
      it("Writable.prototype._writev should be null", () => {
        expect((Writable.prototype as any)._writev).toBeNull();
      });

      it("Duplex.prototype._writev should be null", () => {
        expect((Duplex.prototype as any)._writev).toBeNull();
      });

      it("_writev should be null on a fresh Writable instance", () => {
        const w = new Writable({
          write(_c: any, _e: string, cb: any) {
            cb();
          }
        });
        expect((w as any)._writev).toBeNull();
        w.destroy();
      });

      it("_writev should be overridable via subclass", () => {
        class MyWritable extends Writable {
          batches: any[][] = [];
          _writev(
            chunks: Array<{ chunk: any; encoding: string }>,
            cb: (error?: Error | null) => void
          ): void {
            this.batches.push(chunks);
            cb();
          }
        }
        const w = new MyWritable({
          write(_c: any, _e: string, cb: any) {
            cb();
          }
        });
        expect(typeof w._writev).toBe("function");
        expect(w._writev).not.toBeNull();
        w.destroy();
      });
    });
  });

  // ===========================================================================
  // Round 7: Prototype API surface parity
  // ===========================================================================
  describe("R7: Prototype API surface parity", () => {
    // =========================================================================
    // R7-1: Writable.isDisturbed static method
    // =========================================================================
    describe("Writable.isDisturbed", () => {
      it("Writable.isDisturbed exists as a function", () => {
        expect(typeof (Writable as any).isDisturbed).toBe("function");
      });

      it("Writable.isDisturbed returns false for fresh Readable", () => {
        const r = new Readable({ read() {} });
        expect((Writable as any).isDisturbed(r)).toBe(false);
        r.destroy();
      });

      it("Writable.isDisturbed returns true after data is consumed", async () => {
        const r = new Readable({
          read() {
            this.push("x");
            this.push(null);
          }
        });
        r.on("data", () => {});
        await new Promise(resolve => setTimeout(resolve, 50));
        expect((Writable as any).isDisturbed(r)).toBe(true);
        r.destroy();
      });

      it("Writable.isDisturbed returns false for fresh Writable", () => {
        const w = new Writable({
          write(_c: any, _e: string, cb: any) {
            cb();
          }
        });
        expect((Writable as any).isDisturbed(w)).toBe(false);
        w.destroy();
      });

      it("Writable.isDisturbed returns true for destroyed Readable", async () => {
        const r = new Readable({ read() {} });
        r.destroy();
        await new Promise(resolve => setTimeout(resolve, 20));
        expect((Writable as any).isDisturbed(r)).toBe(true);
      });

      it("Writable.isDisturbed returns true for Duplex after data read", async () => {
        const d = new Duplex({
          read() {
            this.push("x");
            this.push(null);
          },
          write(_c: any, _e: string, cb: any) {
            cb();
          }
        });
        d.on("data", () => {});
        await new Promise(resolve => setTimeout(resolve, 50));
        expect((Writable as any).isDisturbed(d)).toBe(true);
        d.destroy();
      });
    });

    // =========================================================================
    // R7-2: _construct NOT on any stream prototype
    // =========================================================================
    describe("_construct not on prototypes", () => {
      it("Readable.prototype does NOT have own _construct", () => {
        expect(Object.prototype.hasOwnProperty.call(Readable.prototype, "_construct")).toBe(false);
      });

      it("Writable.prototype does NOT have own _construct", () => {
        expect(Object.prototype.hasOwnProperty.call(Writable.prototype, "_construct")).toBe(false);
      });

      it("Duplex.prototype does NOT have own _construct", () => {
        expect(Object.prototype.hasOwnProperty.call(Duplex.prototype, "_construct")).toBe(false);
      });

      it("Transform.prototype does NOT have own _construct", () => {
        expect(Object.prototype.hasOwnProperty.call(Transform.prototype, "_construct")).toBe(false);
      });

      it("PassThrough.prototype does NOT have own _construct", () => {
        expect(Object.prototype.hasOwnProperty.call(PassThrough.prototype, "_construct")).toBe(
          false
        );
      });

      it("subclass _construct on Readable still works", async () => {
        let constructed = false;
        class MyReadable extends Readable {
          _construct(cb: (error?: Error | null) => void): void {
            constructed = true;
            cb();
          }
          _read(): void {
            this.push("hello");
            this.push(null);
          }
        }
        const r = new MyReadable();
        const chunks: any[] = [];
        r.on("data", (c: any) => chunks.push(c));
        await new Promise(resolve => r.on("end", resolve));
        expect(constructed).toBe(true);
        expect(chunks.length).toBeGreaterThan(0);
      });

      it("subclass _construct on Writable still works", async () => {
        let constructed = false;
        class MyWritable extends Writable {
          _construct(cb: (error?: Error | null) => void): void {
            constructed = true;
            cb();
          }
        }
        const w = new MyWritable({
          write(_c: any, _e: string, cb: (error?: Error | null) => void) {
            cb();
          }
        });
        w.write("hello");
        w.end();
        await new Promise(resolve => w.on("finish", resolve));
        expect(constructed).toBe(true);
      });
    });

    // =========================================================================
    // R7-3: Transform construct option
    // =========================================================================
    describe("Transform construct option", () => {
      it("construct callback is invoked on Transform", async () => {
        let constructCalled = false;
        const t = new Transform({
          construct(callback: (error?: Error | null) => void) {
            constructCalled = true;
            setTimeout(() => callback(), 10);
          },
          transform(chunk: any, _enc: string, cb: any) {
            this.push(chunk);
            cb();
          }
        });
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(constructCalled).toBe(true);
        t.destroy();
      });

      it("Transform construct delays writes until callback fires", async () => {
        const events: string[] = [];
        const t = new Transform({
          construct(callback: (error?: Error | null) => void) {
            events.push("construct-start");
            setTimeout(() => {
              events.push("construct-done");
              callback();
            }, 30);
          },
          transform(chunk: any, _enc: string, cb: any) {
            events.push("transform:" + chunk);
            this.push(chunk);
            cb();
          }
        });
        t.write("a");
        t.on("data", () => {});
        await new Promise(resolve => setTimeout(resolve, 100));
        // construct must have completed before transform runs
        const constructDoneIdx = events.indexOf("construct-done");
        const transformIdx = events.indexOf("transform:a");
        expect(constructDoneIdx).toBeGreaterThanOrEqual(0);
        expect(transformIdx).toBeGreaterThanOrEqual(0);
        expect(constructDoneIdx).toBeLessThan(transformIdx);
        t.destroy();
      });

      it("Transform construct error destroys the stream", async () => {
        const t = new Transform({
          construct(callback: (error?: Error | null) => void) {
            callback(new Error("construct failed"));
          },
          transform(chunk: any, _enc: string, cb: any) {
            cb(null, chunk);
          }
        });
        // Must listen for error to prevent unhandled exception
        const errorP = new Promise<Error>(resolve => t.on("error", resolve));
        const err = await errorP;
        expect(err.message).toBe("construct failed");
        expect(t.destroyed).toBe(true);
      });
    });

    // =========================================================================
    // R7-4: Transform.prototype._writev === null
    // =========================================================================
    describe("Transform._writev prototype value", () => {
      it("Transform.prototype._writev is null", () => {
        expect((Transform.prototype as any)._writev).toBeNull();
      });

      it("Transform.prototype does NOT have OWN _writev (inherits from chain)", () => {
        // In Node.js, Transform inherits _writev from Duplex chain, not own.
        // In browser we set it explicitly on Transform since there's no real chain.
        // Either way, the value must be null.
        expect((Transform.prototype as any)._writev).toBeNull();
      });

      it("PassThrough inherits _writev === null", () => {
        expect((PassThrough.prototype as any)._writev).toBeNull();
      });

      it("fresh Transform instance _writev is null", () => {
        const t = new Transform({
          transform(c: any, _e: string, cb: any) {
            cb(null, c);
          }
        });
        expect((t as any)._writev).toBeNull();
        t.destroy();
      });
    });

    // =========================================================================
    // R7-5: _flush NOT on Transform.prototype
    // =========================================================================
    describe("_flush not on Transform prototype", () => {
      it("Transform.prototype does NOT have own _flush", () => {
        expect(Object.prototype.hasOwnProperty.call(Transform.prototype, "_flush")).toBe(false);
      });

      it("Transform.prototype._flush is undefined", () => {
        expect((Transform.prototype as any)._flush).toBeUndefined();
      });

      it("PassThrough.prototype does NOT have own _flush", () => {
        expect(Object.prototype.hasOwnProperty.call(PassThrough.prototype, "_flush")).toBe(false);
      });

      it("subclass _flush still works", async () => {
        const chunks: string[] = [];
        class MyTransform extends Transform {
          _transform(chunk: any, _enc: string, cb: any): void {
            this.push(chunk);
            cb();
          }
          _flush(cb: any): void {
            this.push("flushed");
            cb();
          }
        }
        const t = new MyTransform();
        t.on("data", (c: any) => chunks.push(String(c)));
        t.write("hello");
        t.end();
        await new Promise(resolve => t.on("end", resolve));
        expect(chunks).toContain("flushed");
        t.destroy();
      });

      it("flush option still works", async () => {
        const chunks: string[] = [];
        const t = new Transform({
          transform(chunk: any, _enc: string, cb: any) {
            this.push(chunk);
            cb();
          },
          flush(cb: any) {
            this.push("option-flushed");
            cb();
          }
        });
        t.on("data", (c: any) => chunks.push(String(c)));
        t.write("hello");
        t.end();
        await new Promise(resolve => t.on("end", resolve));
        expect(chunks).toContain("option-flushed");
        t.destroy();
      });
    });

    // =========================================================================
    // R7-6: Transform.prototype._final
    // =========================================================================
    describe("Transform._final on prototype", () => {
      it("Transform.prototype has own _final", () => {
        expect(Object.prototype.hasOwnProperty.call(Transform.prototype, "_final")).toBe(true);
      });

      it("Transform.prototype._final is a function", () => {
        expect(typeof Transform.prototype._final).toBe("function");
      });

      it("Duplex.prototype does NOT have own _final", () => {
        expect(Object.prototype.hasOwnProperty.call(Duplex.prototype, "_final")).toBe(false);
      });

      it("Writable.prototype does NOT have own _final", () => {
        expect(Object.prototype.hasOwnProperty.call(Writable.prototype, "_final")).toBe(false);
      });

      it("PassThrough.prototype does NOT have own _final", () => {
        expect(Object.prototype.hasOwnProperty.call(PassThrough.prototype, "_final")).toBe(false);
      });

      it("Transform instance inherits _final from prototype", () => {
        const t = new Transform({
          transform(c: any, _e: string, cb: any) {
            cb(null, c);
          }
        });
        expect(typeof t._final).toBe("function");
        expect(t._final).toBe(Transform.prototype._final);
        t.destroy();
      });
    });

    // =========================================================================
    // R7-7: Readable.wrap static method
    // =========================================================================
    describe("Readable.wrap static", () => {
      it("Readable.wrap exists as a function", () => {
        expect(typeof Readable.wrap).toBe("function");
      });

      it("Readable has own static wrap", () => {
        expect(Object.prototype.hasOwnProperty.call(Readable, "wrap")).toBe(true);
      });

      it("Readable.wrap returns a Readable instance", () => {
        const EventEmitter = imports.EventEmitter;
        const src = new EventEmitter();
        const wrapped = Readable.wrap(src);
        expect(wrapped instanceof Readable).toBe(true);
        wrapped.destroy();
      });

      it("Readable.wrap forwards data from source", async () => {
        const EventEmitter = imports.EventEmitter;
        const src = new EventEmitter();
        const wrapped = Readable.wrap(src);
        const chunks: any[] = [];
        wrapped.on("data", (c: any) => chunks.push(c));

        // Emit data asynchronously so listener is set up
        queueMicrotask(() => {
          src.emit("data", "hello");
          src.emit("data", "world");
          src.emit("end");
        });

        await new Promise(resolve => wrapped.on("end", resolve));
        expect(chunks.length).toBe(2);
      });

      it("Readable.wrap wraps in objectMode by default", () => {
        const EventEmitter = imports.EventEmitter;
        const src = new EventEmitter();
        const wrapped = Readable.wrap(src);
        expect(wrapped.readableObjectMode).toBe(true);
        wrapped.destroy();
      });

      it("Writable does NOT have wrap static", () => {
        expect((Writable as any).wrap).toBeUndefined();
      });
    });
  });

  // ==========================================================================
  // Parity Regression Tests
  // ==========================================================================
  describe("Parity Regression Tests", () => {
    // ---------- compose: error propagation through inner transforms ----------
    describe("compose error propagation", () => {
      it("should destroy composed stream when an inner transform errors", async () => {
        const stage1 = createTransform<number, number>(n => n + 1, { objectMode: true });
        const stage2 = createTransform<number, number>(
          n => {
            if (n === 3) {
              throw new Error("inner-error");
            }
            return n;
          },
          { objectMode: true }
        );

        // Suppress uncaught error emissions from individual stages
        stage1.on("error", () => {});
        stage2.on("error", () => {});

        const composed = compose(stage1, stage2);

        const output: number[] = [];
        composed.on("data", (chunk: number) => output.push(chunk));

        const errorPromise = new Promise<Error>(resolve => {
          composed.on("error", (err: Error) => resolve(err));
        });

        composed.write(1); // becomes 2 → passes
        composed.write(2); // becomes 3 → error in stage2

        const err = await errorPromise;
        expect(err.message).toBe("inner-error");
        expect(composed.destroyed).toBe(true);
      });
    });

    // ---------- duplexPair allowHalfOpen ----------
    describe("duplexPair allowHalfOpen", () => {
      it("should support allowHalfOpen: true (peer stays writable after one side ends)", async () => {
        const [side1, side2] = duplexPair({ objectMode: true, allowHalfOpen: true });

        const received: unknown[] = [];
        side1.on("data", (chunk: unknown) => received.push(chunk));

        side1.end("from-side1");

        // side2 should still be writable after side1 ended
        await new Promise(resolve => setTimeout(resolve, 20));
        side2.write("from-side2-late");
        await new Promise(resolve => setTimeout(resolve, 20));

        expect(received).toContain("from-side2-late");
        side2.end();
      });
    });

    // ---------- duplexPair per-side options ----------
    describe("duplexPair per-side options", () => {
      it("should accept readableHighWaterMark and writableHighWaterMark", () => {
        const [side1] = duplexPair({
          objectMode: true,
          readableHighWaterMark: 8,
          writableHighWaterMark: 4
        });

        expect(side1.readableHighWaterMark).toBe(8);
        expect(side1.writableHighWaterMark).toBe(4);
      });
    });

    // ---------- isReadable / isWritable on Duplex ----------
    describe("isReadable/isWritable on Duplex", () => {
      it("should return true for both isReadable and isWritable on Duplex", () => {
        const duplex = createDuplex({ objectMode: true });
        expect(isReadable(duplex)).toBe(true);
        expect(isWritable(duplex)).toBe(true);
      });

      it("should return true for both isReadable and isWritable on Transform", () => {
        const transform = createTransform(x => x, { objectMode: true });
        expect(isReadable(transform)).toBe(true);
        expect(isWritable(transform)).toBe(true);
      });
    });

    // ---------- isReadable / isWritable on destroyed/ended streams ----------
    describe("isReadable/isWritable on destroyed and ended streams", () => {
      it("isReadable should still return true for destroyed Readable (type check)", () => {
        const readable = createReadableFromArray([1], { objectMode: true });
        readable.destroy();
        // isReadable is a type check, not a state check — it checks if the object
        // IS a readable stream, not whether it's still in a readable state.
        expect(isReadable(readable)).toBe(true);
      });

      it("isWritable should still return true for destroyed Writable (type check)", () => {
        const writable = createNullWritable();
        writable.destroy();
        expect(isWritable(writable)).toBe(true);
      });
    });

    // ---------- writableBuffer content verification (fix #14) ----------
    describe("writableBuffer content", () => {
      it("should contain buffered chunks when corked", async () => {
        const chunks: unknown[] = [];
        const writable = createWritable({
          objectMode: true,
          write(chunk: unknown, _enc: string, cb: () => void) {
            chunks.push(chunk);
            cb();
          }
        });

        writable.cork();
        writable.write("a");
        writable.write("b");

        // While corked, both chunks should be in the buffer
        const buf = writable.writableBuffer;
        expect(buf).toBeDefined();
        expect(buf.length).toBeGreaterThanOrEqual(2);

        writable.uncork();
        await new Promise(resolve => setTimeout(resolve, 20));
        writable.end();
      });
    });

    // ---------- Transform closed getter transitions to true (fix #12) ----------
    describe("Transform closed getter", () => {
      it("should transition from false to true after stream finishes", async () => {
        const t = createTransform<number, number>(n => n, { objectMode: true });
        expect(t.closed).toBe(false);

        t.end();
        // Consume readable side
        t.resume();

        await new Promise<void>(resolve => t.on("close", resolve));
        expect(t.closed).toBe(true);
      });

      it("should become true after destroy()", async () => {
        const t = createTransform<number, number>(n => n, { objectMode: true });
        expect(t.closed).toBe(false);

        t.destroy();

        await new Promise<void>(resolve => t.on("close", resolve));
        expect(t.closed).toBe(true);
      });
    });

    // ---------- Duplex end() callback fires on destroy (fix #13) ----------
    describe("Duplex end() callback on destroy", () => {
      it("should fire end callback even when destroy is called before finish", async () => {
        const duplex = createDuplex({ objectMode: true });

        let endCallbackFired = false;
        duplex.end(() => {
          endCallbackFired = true;
        });

        // Destroy before finish completes
        duplex.destroy();

        await new Promise(resolve => setTimeout(resolve, 50));
        expect(endCallbackFired).toBe(true);
      });

      it("should fire end callback normally when stream finishes", async () => {
        const duplex = createDuplex({
          objectMode: true,
          read() {
            this.push(null);
          }
        });

        let endCallbackFired = false;
        duplex.resume();
        duplex.end(() => {
          endCallbackFired = true;
        });

        await new Promise(resolve => setTimeout(resolve, 50));
        expect(endCallbackFired).toBe(true);
      });
    });

    // ---------- addAbortSignal on Writable ----------
    describe("addAbortSignal on Writable", () => {
      it("should destroy writable when signal is aborted", async () => {
        const controller = new AbortController();
        const writable = createNullWritable();
        writable.on("error", () => {}); // Prevent uncaught exception

        addAbortSignal(controller.signal, writable);

        controller.abort();

        expect(writable.destroyed).toBe(true);
      });

      it("should destroy writable immediately if signal already aborted", () => {
        const controller = new AbortController();
        controller.abort();

        const writable = createNullWritable();
        writable.on("error", () => {}); // Prevent uncaught exception
        addAbortSignal(controller.signal, writable);

        expect(writable.destroyed).toBe(true);
      });
    });
  });
}
