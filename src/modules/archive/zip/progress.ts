import type { Zip64Mode } from "./zip64-mode";

export type ZipProgressPhase = "running" | "done" | "aborted" | "error";

export type ZipProgress = {
  type: "zip";
  phase: ZipProgressPhase;

  /** Total number of entries known at start. */
  entriesTotal: number;
  /** Entries fully finalized (data descriptor emitted). */
  entriesDone: number;

  currentEntry?: {
    name: string;
    index: number;
    bytesIn: number;
  };

  /** Total uncompressed bytes consumed from all sources. */
  bytesIn: number;
  /** Total ZIP bytes emitted to the consumer (like archiver.pointer()). */
  bytesOut: number;

  /** Zip64 mode in effect for the archive. */
  zip64: Zip64Mode;
};

export type ZipStreamOptions = {
  signal?: AbortSignal;
  onProgress?: (p: ZipProgress) => void;

  /** Throttle progress callbacks; 0 emits on the next microtask. */
  progressIntervalMs?: number;
};

export type ZipOperation = {
  iterable: AsyncIterable<Uint8Array>;
  signal: AbortSignal;

  abort(reason?: unknown): void;

  /** Returns bytes emitted so far (archiver-style pointer()). */
  pointer(): number;

  /** Latest progress snapshot. */
  progress(): ZipProgress;
};
