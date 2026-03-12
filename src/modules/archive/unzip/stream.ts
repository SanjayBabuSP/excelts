import zlib from "zlib";
import type { Duplex, PassThrough, Transform } from "@stream";
import {
  PullStream,
  type PullStreamPublicApi,
  runParseLoop,
  streamUntilValidatedDataDescriptor,
  type InflateFactory,
  type ParseEmitter,
  type ParseIO,
  type ZipEntry
} from "@archive/unzip/stream.base";
import {
  DATA_DESCRIPTOR_SIGNATURE_BYTES,
  type CrxHeader,
  type ParseDriverState,
  type ParseOptions
} from "@archive/unzip/parser-core";

/**
 * Creates an InflateRaw stream using Node.js native zlib.
 */
function createInflateRaw(): Transform {
  return zlib.createInflateRaw();
}

export type { CrxHeader, EntryProps, EntryVars, ParseOptions } from "@archive/unzip/parser-core";

export type { ZipEntry } from "@archive/unzip/stream.base";

const dataDescriptorSignature = DATA_DESCRIPTOR_SIGNATURE_BYTES;

export type ParseStream = Duplex & {
  promise(): Promise<void>;
} & PullStreamPublicApi & {
    crxHeader?: CrxHeader;
  };

export function createParseClass(createInflateRawFn: InflateFactory): {
  new (opts?: ParseOptions): ParseStream;
} {
  return class Parse extends PullStream<ZipEntry> {
    private _opts: ParseOptions;
    private _driverState: ParseDriverState = {};
    private _done = false;
    private _doneError: Error | null = null;
    private _donePromise: Promise<void> | null = null;
    private _doneDeferred: {
      resolve: () => void;
      reject: (err: Error) => void;
    } | null = null;

    crxHeader?: CrxHeader;

    constructor(opts: ParseOptions = {}) {
      super(opts);
      this._opts = opts;

      // Latch completion early to avoid missing terminal events, but do NOT
      // create a Promise eagerly (it can reject unhandled in tests/consumers
      // that never call `promise()`).
      const onDone = (): void => this._latchDone();
      const onError = (err: Error): void => this._latchError(err);
      this.on("close", onDone);
      this.on("end", onDone);
      this.on("error", onError);

      const io: ParseIO = {
        pull: async (length: number) => this.pull(length),
        pullUntil: async (pattern: Uint8Array, includeEof?: boolean) =>
          this.pull(pattern, includeEof),
        stream: (length: number) => this.stream(length),
        streamUntilDataDescriptor: () => this._streamUntilValidatedDataDescriptor(),
        setDone: () => {
          // If the parser reaches EOF without consuming all buffered bytes,
          // there may still be an in-flight writable callback waiting on
          // `_maybeReleaseWriteCallback()`. Release it to avoid deadlocks in
          // callers that await `write(..., cb)`.
          this._maybeReleaseWriteCallback();
          this.end();
          this.push(null);
        }
      };

      const emitter: ParseEmitter = {
        emitEntry: (entry: ZipEntry) => {
          this.emit("entry", entry);
        },
        pushEntry: (entry: ZipEntry) => {
          this.push(entry);
        },
        pushEntryIfPiped: (entry: ZipEntry) => {
          const state = (this as any)._readableState;
          if (state.pipesCount || (state.pipes && state.pipes.length)) {
            this.push(entry);
          }
        },
        emitCrxHeader: header => {
          (this as any).crxHeader = header;
          this.emit("crx-header", header);
        },
        emitError: err => {
          this.emit("error", err);
        },
        emitClose: () => {
          this.emit("close");
        }
      };

      // Parse records as data arrives. Only emit `close` when parsing is complete.
      runParseLoop(
        this._opts,
        io,
        emitter,
        createInflateRawFn,
        this._driverState,
        (data: Uint8Array) => zlib.inflateRawSync(data)
      ).catch((e: Error) => {
        if (!this.__emittedError || this.__emittedError !== e) {
          this.emit("error", e);
        }
        // Best-effort: ensure upstream writers don't hang waiting for a
        // deferred write callback if parsing terminates early.
        this._maybeReleaseWriteCallback();
        this.emit("close");
      });
    }

    /**
     * Stream file data until we reach a DATA_DESCRIPTOR record boundary.
     */
    private _streamUntilValidatedDataDescriptor(): PassThrough {
      return streamUntilValidatedDataDescriptor({
        source: {
          getLength: () => this._queue.length,
          read: (length: number) => this._queue.read(length),
          peekChunks: (length: number) => this._queue.peekChunks(length),
          discard: (length: number) => this._queue.discard(length),
          indexOfPattern: (pattern: Uint8Array, startIndex: number) =>
            this._queue.indexOfPattern(pattern, startIndex),
          peekUint32LE: (offset: number) => this._queue.peekUint32LE(offset),
          isFinished: () => this.finished,
          onDataAvailable: (cb: () => void) => {
            this.on("chunk", cb);
            return () => this.removeListener("chunk", cb);
          },
          maybeReleaseWriteCallback: () => this._maybeReleaseWriteCallback()
        },
        dataDescriptorSignature
      });
    }

    promise(): Promise<void> {
      if (this._done) {
        return this._doneError ? Promise.reject(this._doneError) : Promise.resolve();
      }

      if (this._donePromise) {
        return this._donePromise;
      }

      this._donePromise = new Promise<void>((resolve, reject) => {
        this._doneDeferred = { resolve, reject };
      });
      return this._donePromise;
    }

    private _latchDone(): void {
      if (this._done) {
        return;
      }
      this._done = true;

      const deferred = this._doneDeferred;
      this._doneDeferred = null;
      if (!deferred) {
        return;
      }
      try {
        deferred.resolve();
      } catch {
        // ignore
      }
    }

    private _latchError(err: Error): void {
      if (this._done) {
        return;
      }
      this._done = true;
      this._doneError = err;

      const deferred = this._doneDeferred;
      this._doneDeferred = null;
      if (!deferred) {
        return;
      }
      try {
        deferred.reject(err);
      } catch {
        // ignore
      }
    }
  };
}

const BaseParse = /* @__PURE__ */ createParseClass(createInflateRaw);

export class Parse extends BaseParse {}

export function createParse(opts?: ParseOptions): ParseStream {
  return new Parse(opts);
}
