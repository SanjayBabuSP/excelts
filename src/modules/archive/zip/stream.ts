/**
 * True Streaming ZIP creator - shared implementation.
 *
 * This module is intentionally platform-agnostic.
 * - In Node builds it uses `./compression/crc32` + `./compression/streaming-compress` (zlib-backed).
 * - In browser builds the bundler aliases those imports to their browser variants.
 */

import { crc32Update, crc32Finalize } from "@archive/compression/crc32";
import { createDeflateStream } from "@archive/compression/streaming-compress";
import type { ZipTimestampMode } from "@archive/utils/timestamps";
import { DEFAULT_ZIP_LEVEL, DEFAULT_ZIP_TIMESTAMPS } from "@archive/defaults";
import {
  buildZipEntryMetadata,
  resolveZipCompressionMethod
} from "@archive/zip/zip-entry-metadata";
import { decodeUtf8, encodeUtf8 } from "@archive/utils/text";
import { isProbablyIncompressible } from "@archive/utils/compressibility";
import type { ZipEntryInfo as UnzipZipEntryInfo } from "@archive/zip-spec/zip-entry-info";
import {
  buildCentralDirectoryHeader,
  buildDataDescriptor,
  buildEndOfCentralDirectory,
  buildLocalFileHeader,
  VERSION_MADE_BY,
  VERSION_NEEDED
} from "@archive/zip-spec/zip-records";

/**
 * Internal entry info for central directory
 */
interface ZipEntryInfo {
  name: Uint8Array;
  extraField: Uint8Array;
  comment: Uint8Array;
  flags: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
  dosTime: number;
  dosDate: number;
  offset: number;
}

type CentralDirectoryEntryInfo = ZipEntryInfo;

/**
 * True Streaming ZIP File - compresses chunk by chunk
 */
export class ZipDeflateFile {
  private _deflate: ReturnType<typeof createDeflateStream> | null = null;
  private _crc: number = 0xffffffff;
  private _uncompressedSize: number = 0;
  private _compressedSize: number = 0;
  private _finalized = false;
  private _headerEmitted = false;
  private _ondata: ((data: Uint8Array, final: boolean) => void) | null = null;
  private _onerror: ((err: Error) => void) | null = null;
  private _centralDirEntryInfo: CentralDirectoryEntryInfo | null = null;
  private _pendingEnd = false;
  private _emittedDataDescriptor = false;
  private _localHeader: Uint8Array | null = null;

  // Smart STORE: delay method selection until we sample data.
  private _deflateWanted: boolean | null = null;
  private _pendingChunks: Uint8Array[] = [];
  private _sampleBuffer: Uint8Array;
  private _sampleLen = 0;
  private _smartStore: boolean;

  // Promise resolution for completion (including data descriptor)
  private _completeResolve: (() => void) | null = null;
  private _completeReject: ((err: Error) => void) | null = null;
  private _completePromise: Promise<void> | null = null;
  private _completeError: Error | null = null;

  // Queue for incoming data before ondata is set
  private _dataQueue: Uint8Array[] = [];
  private _finalQueued = false;

  // Serialize push() calls so callers don't need to await to preserve ordering.
  private _pushChain: Promise<void> = Promise.resolve();

  readonly name: string;
  readonly level: number;
  readonly nameBytes: Uint8Array;
  readonly commentBytes: Uint8Array;
  readonly dosTime: number;
  readonly dosDate: number;
  readonly extraField: Uint8Array;
  private readonly _flags: number;
  private _compressionMethod: number;
  private readonly _modTime: Date;

  constructor(
    name: string,
    options?: {
      level?: number;
      modTime?: Date;
      timestamps?: ZipTimestampMode;
      comment?: string;
      smartStore?: boolean;
    }
  ) {
    this.name = name;
    const modTime = options?.modTime ?? new Date();
    this._modTime = modTime;
    this.level = options?.level ?? DEFAULT_ZIP_LEVEL;

    this._smartStore = options?.smartStore ?? true;

    this._sampleBuffer = this._smartStore ? new Uint8Array(64 * 1024) : new Uint8Array(0);

    const metadata = buildZipEntryMetadata({
      name,
      comment: options?.comment ?? "",
      modTime,
      timestamps: options?.timestamps ?? DEFAULT_ZIP_TIMESTAMPS,
      useDataDescriptor: true,
      deflate: false
    });

    this.nameBytes = metadata.nameBytes;
    this.commentBytes = metadata.commentBytes;
    this.dosTime = metadata.dosTime;
    this.dosDate = metadata.dosDate;
    this.extraField = metadata.extraField;
    this._flags = metadata.flags;
    this._compressionMethod = metadata.compressionMethod;

    // If smart store is disabled, decide method upfront and keep true streaming semantics.
    if (!this._smartStore) {
      const deflate = this.level > 0;
      this._deflateWanted = deflate;
      this._compressionMethod = this._buildCompressionMethod(deflate);
      if (deflate) {
        this._initDeflateStream();
      }
      return;
    }

    // Level 0: always STORE.
    if (this.level === 0) {
      this._deflateWanted = false;
      this._compressionMethod = this._buildCompressionMethod(false);
    }
  }

  private _buildCompressionMethod(deflate: boolean): number {
    return resolveZipCompressionMethod(deflate);
  }

  private _initDeflateStream(): void {
    if (this._deflate) {
      return;
    }

    this._deflate = createDeflateStream({ level: this.level });

    this._deflate.on("error", (err: Error) => {
      this._rejectComplete(err);
    });

    // Handle compressed output - this is true streaming!
    this._deflate.on("data", (chunk: Uint8Array) => {
      this._compressedSize += chunk.length;
      this._enqueueData(chunk, false);
    });

    // Handle end - emit data descriptor
    // IMPORTANT: Only use 'end' event, NOT 'finish'!
    // Node.js zlib emits events in order: finish -> data -> end
    this._deflate.on("end", () => {
      if (this._pendingEnd && !this._emittedDataDescriptor) {
        this._emittedDataDescriptor = true;
        this._emitDataDescriptor();
      }
    });
  }

  private _buildLocalHeader(): Uint8Array {
    // CRC + sizes are written via data descriptor for true streaming.
    return buildLocalFileHeader({
      fileName: this.nameBytes,
      extraField: this.extraField,
      flags: this._flags,
      compressionMethod: this._compressionMethod,
      dosTime: this.dosTime,
      dosDate: this.dosDate,
      crc32: 0,
      compressedSize: 0,
      uncompressedSize: 0,
      versionNeeded: VERSION_NEEDED
    });
  }

  private _accumulateSample(data: Uint8Array): void {
    if (this._deflateWanted !== null) {
      return;
    }
    if (this._sampleLen >= this._sampleBuffer.length) {
      return;
    }
    const take = Math.min(this._sampleBuffer.length - this._sampleLen, data.length);
    if (take <= 0) {
      return;
    }
    this._sampleBuffer.set(data.subarray(0, take), this._sampleLen);
    this._sampleLen += take;
  }

  private _shouldDecide(final: boolean): boolean {
    if (this._deflateWanted !== null) {
      return false;
    }
    return final || this._sampleLen >= 16 * 1024;
  }

  private _decideCompressionIfNeeded(final: boolean): void {
    if (this._deflateWanted !== null) {
      return;
    }

    // Match non-streaming builder semantics: empty files never need DEFLATE.
    if (final && this._sampleLen === 0) {
      this._deflateWanted = false;
      this._compressionMethod = this._buildCompressionMethod(false);
      this._localHeader = null;
      return;
    }

    // Default to DEFLATE unless heuristic says STORE.
    const sample = this._sampleBuffer.subarray(0, this._sampleLen);
    const store = isProbablyIncompressible(sample);
    this._deflateWanted = !store;

    this._compressionMethod = this._buildCompressionMethod(this._deflateWanted);
    this._localHeader = null;

    if (this._deflateWanted) {
      this._initDeflateStream();
    }
  }

  private _emitHeaderIfNeeded(): void {
    if (this._headerEmitted) {
      return;
    }
    this._emitHeader();
    this._headerEmitted = true;
  }

  private async _flushPendingChunks(): Promise<void> {
    if (this._pendingChunks.length === 0) {
      return;
    }
    for (const chunk of this._pendingChunks) {
      await this._writeData(chunk);
    }
    this._pendingChunks = [];
  }

  private _enqueueData(data: Uint8Array, final: boolean): void {
    if (this._ondata) {
      this._ondata(data, final);
    } else {
      this._dataQueue.push(data);
      if (final) {
        this._finalQueued = true;
      }
    }
  }

  private _flushQueue(): void {
    if (!this._ondata) {
      return;
    }

    const len = this._dataQueue.length;
    const finalIndex = this._finalQueued ? len - 1 : -1;
    for (let i = 0; i < len; i++) {
      this._ondata(this._dataQueue[i], i === finalIndex);
    }
    this._dataQueue = [];
    this._finalQueued = false;
  }

  get ondata(): ((data: Uint8Array, final: boolean) => void) | undefined {
    return this._ondata ?? undefined;
  }

  set ondata(cb: (data: Uint8Array, final: boolean) => void) {
    this._ondata = cb;
    // Flush any queued data
    this._flushQueue();
  }

  get onerror(): ((err: Error) => void) | undefined {
    return this._onerror ?? undefined;
  }

  set onerror(cb: (err: Error) => void) {
    this._onerror = cb;
    // If an error already occurred, surface it immediately.
    if (this._completeError) {
      cb(this._completeError);
    }
  }

  private _resolveComplete(): void {
    if (this._completeResolve) {
      this._completeResolve();
    }
  }

  private _rejectComplete(err: Error): void {
    if (this._completeError) {
      return;
    }
    this._completeError = err;
    if (this._onerror) {
      this._onerror(err);
    }
    if (this._completeReject) {
      this._completeReject(err);
    }
  }

  private _ensureCompletePromise(): Promise<void> {
    if (this._completeError) {
      return Promise.reject(this._completeError);
    }
    if (this._emittedDataDescriptor) {
      return Promise.resolve();
    }
    if (!this._completePromise) {
      this._completePromise = new Promise<void>((resolve, reject) => {
        this._completeResolve = resolve;
        this._completeReject = reject;
      });
    }
    return this._completePromise;
  }

  private _tapCallback(promise: Promise<void>, callback?: (err?: Error | null) => void): void {
    if (!callback) {
      return;
    }
    promise.then(() => callback()).catch(err => callback(err));
  }

  private _writeData(data: Uint8Array): Promise<void> {
    if (data.length === 0) {
      return Promise.resolve();
    }

    // Update CRC32 on uncompressed data
    this._crc = crc32Update(this._crc, data);
    this._uncompressedSize += data.length;

    if (this._deflate) {
      // Write to deflate stream - returns Promise for async streaming
      return new Promise<void>((resolve, reject) => {
        this._deflate!.write(data, (err?: Error | null) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }

    // STORE mode - pass through
    this._compressedSize += data.length;
    this._enqueueData(data, false);
    return Promise.resolve();
  }

  private _endDeflateAndWait(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const deflate = this._deflate!;
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const onEnd = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        deflate.off("error", onError);
        deflate.off("end", onEnd);
      };

      deflate.once("error", onError);
      deflate.once("end", onEnd);
      deflate.end();
    });
  }

  private _finalizeAfterWrite(writePromise: Promise<void>): Promise<void> {
    this._finalized = true;
    this._pendingEnd = true;

    const completePromise = this._ensureCompletePromise();
    if (this._deflate) {
      return writePromise.then(() => this._endDeflateAndWait()).then(() => completePromise);
    }

    // STORE mode - emit data descriptor directly
    this._emittedDataDescriptor = true;
    this._emitDataDescriptor();
    return completePromise;
  }

  private _pushUnchained(
    data: Uint8Array,
    final: boolean,
    callback?: (err?: Error | null) => void
  ): Promise<void> {
    if (this._finalized) {
      const promise = Promise.reject(new Error("Cannot push to finalized ZipDeflateFile"));
      this._tapCallback(promise, callback);
      return promise;
    }

    if (this._deflateWanted === null) {
      this._accumulateSample(data);

      if (!this._shouldDecide(final)) {
        if (data.length > 0) {
          this._pendingChunks.push(data);
        }
        const promise = Promise.resolve();
        this._tapCallback(promise, callback);
        return promise;
      }

      this._decideCompressionIfNeeded(final);
      this._emitHeaderIfNeeded();

      const hadPendingChunks = this._pendingChunks.length > 0;
      const flushPromise = this._flushPendingChunks();

      let writePromise = flushPromise;
      if (data.length > 0) {
        writePromise = hadPendingChunks
          ? flushPromise.then(() => this._writeData(data))
          : this._writeData(data);
      }
      const promise = final ? this._finalizeAfterWrite(writePromise) : writePromise;
      this._tapCallback(promise, callback);
      return promise;
    }

    this._emitHeaderIfNeeded();

    const writePromise = this._writeData(data);
    const promise = final ? this._finalizeAfterWrite(writePromise) : writePromise;
    this._tapCallback(promise, callback);
    return promise;
  }

  /**
   * Push data - immediately compresses and outputs
   * Returns a Promise that resolves when the write is complete.
   * If final=true, it resolves after the data descriptor is emitted.
   */
  push(data: Uint8Array, final = false, callback?: (err?: Error | null) => void): Promise<void> {
    const promise = (this._pushChain = this._pushChain.then(() =>
      this._pushUnchained(data, final, callback)
    ));

    // Prevent unhandled rejection when callers intentionally ignore the Promise.
    promise.catch(() => {});
    return promise;
  }

  /**
   * Emit local file header with Data Descriptor flag
   */
  private _emitHeader(): void {
    if (!this._localHeader) {
      this._localHeader = this._buildLocalHeader();
    }
    this._enqueueData(this._localHeader, false);
  }

  /**
   * Emit Data Descriptor with CRC and sizes
   */
  private _emitDataDescriptor(): void {
    const crcValue = crc32Finalize(this._crc);

    const descriptor = buildDataDescriptor(crcValue, this._compressedSize, this._uncompressedSize);

    // Store entry info for central directory
    this._centralDirEntryInfo = {
      name: this.nameBytes,
      extraField: this.extraField,
      comment: this.commentBytes,
      flags: this._flags,
      crc: crcValue,
      compressedSize: this._compressedSize,
      uncompressedSize: this._uncompressedSize,
      compressionMethod: this._compressionMethod,
      dosTime: this.dosTime,
      dosDate: this.dosDate,
      offset: -1
    };

    this._enqueueData(descriptor, true);

    this._resolveComplete();
  }

  /**
   * Returns a promise that resolves when the file is completely written
   * (including data descriptor)
   */
  complete(): Promise<void> {
    return this._ensureCompletePromise();
  }

  /**
   * Get entry metadata in the same shape as unzip parser outputs.
   * This is best-effort: writer-only fields like encryption are always false.
   */
  getEntryInfo(): UnzipZipEntryInfo | null {
    if (!this._centralDirEntryInfo) {
      return null;
    }

    const path = this.name;
    const isDirectory = path.endsWith("/") || path.endsWith("\\");

    return {
      path,
      isDirectory,
      compressedSize: this._centralDirEntryInfo.compressedSize,
      uncompressedSize: this._centralDirEntryInfo.uncompressedSize,
      compressionMethod: this._centralDirEntryInfo.compressionMethod,
      crc32: this._centralDirEntryInfo.crc,
      lastModified: this._modTime,
      localHeaderOffset: this._centralDirEntryInfo.offset,
      comment: decodeUtf8(this._centralDirEntryInfo.comment),
      externalAttributes: 0,
      isEncrypted: false
    };
  }

  /** Writer-only metadata for building the Central Directory. */
  getCentralDirectoryEntryInfo(): CentralDirectoryEntryInfo | null {
    return this._centralDirEntryInfo;
  }

  isComplete(): boolean {
    return this._emittedDataDescriptor && this._centralDirEntryInfo !== null;
  }
}

/**
 * Streaming ZIP Creator - processes files sequentially
 */
export class StreamingZip {
  private callback: (err: Error | null, data: Uint8Array, final: boolean) => void;
  private entries: CentralDirectoryEntryInfo[] = [];
  private currentOffset = 0;
  private ended = false;
  private endPending = false;

  private zipComment: Uint8Array;

  // Queue for sequential file processing
  private fileQueue: ZipDeflateFile[] = [];
  private fileQueueIndex = 0;
  private activeFile: ZipDeflateFile | null = null;

  constructor(
    callback: (err: Error | null, data: Uint8Array, final: boolean) => void,
    options?: { comment?: string }
  ) {
    this.callback = callback;
    // Avoid per-instance TextEncoder allocations.
    this.zipComment = options?.comment ? encodeUtf8(options.comment) : new Uint8Array(0);
  }

  add(file: ZipDeflateFile): void {
    if (this.ended) {
      throw new Error("Cannot add files after calling end() ");
    }

    this.fileQueue.push(file);

    // If no active file, process this one
    if (!this.activeFile) {
      this._processNextFile();
    }
  }

  private _processNextFile(): void {
    if (this.fileQueueIndex >= this.fileQueue.length) {
      this.activeFile = null;

      // Reset queue storage
      this.fileQueue = [];
      this.fileQueueIndex = 0;

      // Check if we can finalize
      if (this.endPending) {
        this._finalize();
      }
      return;
    }

    const file = this.fileQueue[this.fileQueueIndex++]!;
    this.activeFile = file;
    const startOffset = this.currentOffset;

    const empty = new Uint8Array(0);

    file.onerror = (err: Error) => {
      if (this.ended) {
        return;
      }
      this.ended = true;
      this.callback(err, empty, true);
    };

    file.ondata = (data: Uint8Array, final: boolean) => {
      if (this.ended) {
        return;
      }
      this.currentOffset += data.length;
      this.callback(null, data, false);

      if (final) {
        const entryInfo = file.getCentralDirectoryEntryInfo();
        if (entryInfo) {
          entryInfo.offset = startOffset;
          this.entries.push(entryInfo);
        }

        // Process next file
        this._processNextFile();
      }
    };
  }

  private _finalize(): void {
    if (this.ended) {
      return;
    }
    this.ended = true;

    const centralDirOffset = this.currentOffset;
    let centralDirSize = 0;

    const empty = new Uint8Array(0);

    for (const entry of this.entries) {
      const header = buildCentralDirectoryHeader({
        fileName: entry.name,
        extraField: entry.extraField,
        comment: entry.comment ?? empty,
        flags: entry.flags,
        compressionMethod: entry.compressionMethod,
        dosTime: entry.dosTime,
        dosDate: entry.dosDate,
        crc32: entry.crc,
        compressedSize: entry.compressedSize,
        uncompressedSize: entry.uncompressedSize,
        localHeaderOffset: entry.offset,
        versionMadeBy: VERSION_MADE_BY,
        versionNeeded: VERSION_NEEDED
      });

      centralDirSize += header.length;
      this.callback(null, header, false);
    }

    const eocd = buildEndOfCentralDirectory({
      entryCount: this.entries.length,
      centralDirSize,
      centralDirOffset,
      comment: this.zipComment
    });

    this.callback(null, eocd, true);
  }

  end(): void {
    if (this.endPending || this.ended) {
      return;
    }
    this.endPending = true;

    // If no active file (all complete), finalize now
    if (!this.activeFile) {
      this._finalize();
    }
    // Otherwise, _processNextFile will call _finalize when done
  }
}

// =============================================================================
// Export aliases for fflate compatibility
export { StreamingZip as Zip, ZipDeflateFile as ZipDeflate };
