/**
 * Stream Module Tests (Node.js Environment)
 *
 * Node.js-specific tests for native stream classes and properties.
 */

import { describe, it, expect } from "vitest";
import {
  Readable,
  Writable,
  Transform,
  Duplex,
  createNullWritable,
  createTransform,
  createReadableFromArray
} from "@stream";

// =============================================================================
// Node.js-Specific Tests (Not applicable to browser)
// =============================================================================
describe("Stream Module - Node.js Specific", () => {
  describe("Readable (Native Node.js)", () => {
    it("should create readable from options", async () => {
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
      const readable = createReadableFromArray([1, 2, 3], { objectMode: true });
      const writable = createNullWritable();

      readable.pipe(writable);
      readable.unpipe(writable);

      // After unpipe, readableFlowing should be null or false
      expect(readable.readableFlowing === null || readable.readableFlowing === false).toBe(true);
    });
  });

  describe("Writable (Native Node.js)", () => {
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

  describe("Transform (Native Node.js)", () => {
    it("should create transform from options", async () => {
      const transform = new Transform({
        objectMode: true,
        transform(chunk, _encoding, callback) {
          this.push(chunk * 2);
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

  describe("Duplex (Native Node.js)", () => {
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
