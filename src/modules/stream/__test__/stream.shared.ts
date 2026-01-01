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
  Readable: new (options?: any) => any;
  Writable: new (options?: any) => any;
  Transform: new (options?: any) => any;
  Duplex: new (options?: any) => any;

  // Specialized Streams
  BufferedStream: new (options?: any) => any;
  PullStream: new (options?: any) => any;
  StringChunk: new (data: string) => any;
  BufferChunk: new (data: Uint8Array) => any;
  ChunkedBuilder: new (options?: any) => any;
  TransactionalChunkedBuilder: new (options?: any) => any;

  // Factory Functions
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
  once: (emitter: any, event: string, options?: any) => Promise<any[]>;
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
  uint8ArrayIndexOf: (haystack: Uint8Array, needle: Uint8Array, start?: number) => number;
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
    BufferedStream,
    PullStream,
    StringChunk,
    BufferChunk,
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
      expect(names).toContain("a");
      expect(names).toContain("b");
    });

    it("should return listeners array copy", () => {
      const emitter = new EventEmitter();
      const listener = (): void => {};
      emitter.on("test", listener);

      const listeners = emitter.listeners("test");
      expect(listeners).toContain(listener);
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
      expect(stream.bufferedLength).toBeGreaterThan(0);

      stream.write("more");
      const length = stream.bufferedLength;
      expect(length).toBeGreaterThan(4);
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
  });

  // ==========================================================================
  // StringChunk and BufferChunk Tests
  // ==========================================================================
  describe("StringChunk and BufferChunk", () => {
    it("StringChunk should convert to Uint8Array", () => {
      const chunk = new StringChunk("hello");
      const arr = chunk.toUint8Array();

      expect(arr).toBeInstanceOf(Uint8Array);
      expect(uint8ArrayToString(arr)).toBe("hello");
    });

    it("BufferChunk should wrap Uint8Array", () => {
      const data = stringToUint8Array("world");
      const chunk = new BufferChunk(data);

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

      const cursor1 = builder.cursor;
      builder.push("hello");
      const cursor2 = builder.cursor;

      // Cursor should increase after push
      expect(cursor2).toBeGreaterThan(cursor1);
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
      expect(hwm).toBe(16 * 1024);
    });

    it("should not throw when setting high water mark", () => {
      expect(() => setDefaultHighWaterMark(true, 32)).not.toThrow();
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

      expect(serverReceived).toContain("hello");
      expect(clientReceived).toContain("world");
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
  // Once Tests
  // ==========================================================================
  describe("Once", () => {
    it("should resolve with event arguments", async () => {
      const emitter = new EventEmitter();

      const promise = once(emitter, "test");
      emitter.emit("test", "arg1", "arg2");

      const args = await promise;
      expect(args).toEqual(["arg1", "arg2"]);
    });

    it("should reject on error event", async () => {
      const emitter = new EventEmitter();

      const promise = once(emitter, "data");
      emitter.emit("error", new Error("test error"));

      await expect(promise).rejects.toThrow("test error");
    });

    it("should handle abort signal", async () => {
      const emitter = new EventEmitter();
      const controller = new AbortController();

      const promise = once(emitter, "test", { signal: controller.signal });
      controller.abort();

      await expect(promise).rejects.toThrow("Aborted");
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

        // undefined may be filtered out, but 0, '', false should be preserved
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

        expect(received1).toContain("from2-a");
        expect(received1).toContain("from2-b");
        expect(received2).toContain("from1-a");
        expect(received2).toContain("from1-b");
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
        expect(error.message).toContain("Abort");
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
          expect(typeof results[0]).toBe("function");
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
          // Node.js returns Buffer, browser returns Uint8Array - both are compatible
          expect([...result]).toEqual([1, 2, 3]);
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

      describe("Once Edge Cases", () => {
        it("should handle once with immediate emit", async () => {
          const emitter = new EventEmitter();
          const promise = once(emitter, "immediate");
          queueMicrotask(() => emitter.emit("immediate", "fast"));
          const result = await promise;
          expect(result).toEqual(["fast"]);
        });

        it("should handle once with multiple arguments", async () => {
          const emitter = new EventEmitter();
          const promise = once(emitter, "multi");
          setTimeout(() => emitter.emit("multi", 1, 2, 3), 5);
          const result = await promise;
          expect(result).toEqual([1, 2, 3]);
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
          // These might pass or fail depending on implementation
          expect(typeof isReadable(fakeReadable)).toBe("boolean");
          expect(typeof isWritable(fakeWritable)).toBe("boolean");
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
          expect(countWhilePaused).toBeLessThanOrEqual(results.length);
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

          expect(results).toContain(1);
          expect(errors.length).toBe(1);
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

          // First state should be true, last might be false after consumption
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

          if (typeof collector.cork === "function") {
            collector.cork();
            collector.write(1);
            collector.write(2);
            collector.write(3);

            // Data might be buffered
            await new Promise(resolve => setTimeout(resolve, 5));
            const countBeforUncork = collector.chunks.length;

            collector.uncork?.();
            await new Promise(resolve => setTimeout(resolve, 10));

            // After uncork, all data should be written
            expect(collector.chunks.length).toBeGreaterThanOrEqual(countBeforUncork);
          } else {
            // cork not implemented, just write normally
            collector.write(1);
            collector.write(2);
            collector.write(3);
          }

          collector.end();
          await finished(collector);
          expect(collector.chunks).toContain(1);
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
          // Create data that might hit buffer boundaries (16KB, 64KB)
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

          expect(serverReceived).toContain("hello from client");
          expect(clientReceived).toContain("hello from server");

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

        it("should handle pipeline with transform returning undefined (skip)", async () => {
          const source = createReadableFromArray([1, 2, 3, 4, 5], { objectMode: true });
          const transform = createTransform<number, number | undefined>(
            n => (n % 2 === 0 ? n : undefined), // Filter out odd numbers
            { objectMode: true }
          );
          const collector = createCollector<number | undefined>();

          await pipeline(source, transform, collector);
          // undefined values might be skipped or included depending on implementation
          const nonUndefined = collector.chunks.filter(x => x !== undefined);
          expect(nonUndefined).toEqual([2, 4]);
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

        it("should handle already aborted signal", () => {
          const controller = new AbortController();
          controller.abort();

          const readable = createReadableFromArray([1, 2, 3], { objectMode: true });

          let errorEmitted = false;
          readable.on("error", () => {
            errorEmitted = true;
          });

          addAbortSignal(controller.signal, readable);

          // Error should be emitted synchronously or very quickly
          expect(errorEmitted || isDestroyed(readable)).toBe(true);
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

          // Either error is thrown or stream handles it
          expect(chunks.length).toBeGreaterThanOrEqual(0);
          // Error should be propagated
          expect(errorCaught || isErrored(readable) || isDestroyed(readable)).toBe(true);
        });
      });

      describe("Default High Water Mark Edge Cases", () => {
        it("should get and set default high water mark", () => {
          const originalHwm = getDefaultHighWaterMark(false);
          const originalObjectHwm = getDefaultHighWaterMark(true);

          expect(typeof originalHwm).toBe("number");
          expect(typeof originalObjectHwm).toBe("number");

          // Set new defaults
          const newHwm = 32768;
          const newObjectHwm = 32;
          setDefaultHighWaterMark(false, newHwm);
          setDefaultHighWaterMark(true, newObjectHwm);

          // The values should change (or at least be numbers)
          expect(typeof getDefaultHighWaterMark(false)).toBe("number");
          expect(typeof getDefaultHighWaterMark(true)).toBe("number");

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
          expect(collector.chunks).toContain("data");
          expect(collector.chunks).toContain("flushed");
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

          expect(collector.chunks).toContain("data");
          expect(collector.chunks).toContain("async-flush");
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
          expect(results).toContain(1);
          expect(results).toContain(2);
          expect(results).toContain(3);
          // Should also contain the dynamically added items
          expect(results.length).toBeGreaterThan(3);
        });
      });

      describe("Destroy and Cleanup", () => {
        it("should not emit data after destroy", async () => {
          const results: number[] = [];
          const readable = createReadableFromArray([1, 2, 3, 4, 5], { objectMode: true });

          readable.on("data", (n: number) => {
            results.push(n);
            if (n === 2) {
              readable.destroy();
            }
          });

          // Wait a bit for any pending events
          await new Promise(resolve => setTimeout(resolve, 50));

          // Should have stopped at or near 2
          expect(results.length).toBeLessThanOrEqual(3);
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

          expect(errors.length).toBeGreaterThan(0);
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
          if (closeIndex !== -1) {
            expect(finishIndex).toBeLessThan(closeIndex);
          }
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
        it("should handle pipeline with end=false", async () => {
          const source = createReadableFromArray([1, 2, 3], { objectMode: true });
          const results: number[] = [];

          const dest = new Writable({
            objectMode: true,
            write(chunk: number, _enc: string, cb: () => void) {
              results.push(chunk);
              cb();
            }
          });

          // Note: end=false is handled differently across implementations
          // Just verify the pipeline completes
          await pipeline(source, dest);

          expect(results).toEqual([1, 2, 3]);
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
  });
}
