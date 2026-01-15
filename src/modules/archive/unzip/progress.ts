import type { UnzipEntry } from "./index";

export type UnzipProgressPhase = "running" | "done" | "aborted" | "error";

export type UnzipProgress = {
  type: "unzip";
  phase: UnzipProgressPhase;

  /** Total bytes consumed from the source stream so far. */
  bytesIn: number;

  /** Total decompressed bytes yielded to consumers so far (best-effort). */
  bytesOut: number;

  /** Number of entries emitted by the streaming parser. */
  entriesEmitted: number;

  currentEntry?: {
    path: string;
    isDirectory: boolean;
    bytesOut: number;
  };
};

export type UnzipStreamOptions = {
  signal?: AbortSignal;
  onProgress?: (p: UnzipProgress) => void;

  /** Throttle progress callbacks; 0 emits on the next microtask. */
  progressIntervalMs?: number;
};

export type UnzipOperation = {
  iterable: AsyncIterable<UnzipEntry>;
  signal: AbortSignal;

  abort(reason?: unknown): void;
  pointer(): number;
  progress(): UnzipProgress;
};
