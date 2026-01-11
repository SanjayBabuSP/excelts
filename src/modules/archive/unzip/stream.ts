import zlib from "zlib";
import type { Duplex, PassThrough, Transform } from "@stream";
import {
  DATA_DESCRIPTOR_SIGNATURE_BYTES,
  PullStream,
  type PullStreamPublicApi,
  runParseLoop,
  streamUntilValidatedDataDescriptor,
  type CrxHeader,
  type EntryProps,
  type EntryVars,
  type InflateFactory,
  type ParseDriverState,
  type ParseEmitter,
  type ParseIO,
  type ParseOptions,
  type ZipEntry
} from "@archive/unzip/stream.base";

/**
 * Creates an InflateRaw stream using Node.js native zlib.
 */
function createInflateRaw(): Transform {
  return zlib.createInflateRaw();
}

export type { CrxHeader } from "@archive/unzip/stream.base";

export type { EntryProps, EntryVars, ParseOptions, ZipEntry };

const dataDescriptorSignature = DATA_DESCRIPTOR_SIGNATURE_BYTES;

export type ParseStream = Duplex & {
  promise(): Promise<void>;
} & PullStreamPublicApi & {
    crxHeader?: CrxHeader;
  };

export function createParseClass(createInflateRawFn: InflateFactory): {
  new (opts?: ParseOptions): ParseStream;
} {
  return class Parse extends PullStream {
    private _opts: ParseOptions;
    private _driverState: ParseDriverState = {};

    crxHeader?: CrxHeader;

    constructor(opts: ParseOptions = {}) {
      super();
      this._opts = opts;

      const io: ParseIO = {
        pull: async (length: number) => this.pull(length),
        pullUntil: async (pattern: Uint8Array, includeEof?: boolean) =>
          this.pull(pattern, includeEof),
        stream: (length: number) => this.stream(length),
        streamUntilDataDescriptor: () => this._streamUntilValidatedDataDescriptor(),
        setDone: () => {
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
      return new Promise<void>((resolve, reject) => {
        const done = (): void => resolve();
        this.on("end", done);
        this.on("close", done);
        this.on("error", reject);
      });
    }
  };
}

const BaseParse = createParseClass(createInflateRaw);

export class Parse extends BaseParse {}

export function createParse(opts?: ParseOptions): ParseStream {
  return new Parse(opts);
}
