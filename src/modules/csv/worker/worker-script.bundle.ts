/**
 * CSV Worker Script - Generated Bundle Wrapper
 *
 * This module exposes the same public API as the old inline generator
 * (`getWorkerBlobUrl` / `releaseWorkerBlobUrl`), but sources the worker
 * script from a build-generated bundle to prevent logic drift.
 */

import { CSV_WORKER_SCRIPT } from "./worker-script.generated";

// =============================================================================
// Blob URL Management
// =============================================================================

let workerBlobUrl: string | null = null;
let workerBlobRefCount = 0;

/** Generate the complete worker script code */
export function generateWorkerScript(): string {
  return CSV_WORKER_SCRIPT;
}

/** Get or create the worker blob URL */
export function getWorkerBlobUrl(): string {
  if (!workerBlobUrl) {
    const script = generateWorkerScript();
    const blob = new Blob([script], { type: "application/javascript" });
    workerBlobUrl = URL.createObjectURL(blob);
  }
  workerBlobRefCount++;
  return workerBlobUrl;
}

/** Release the worker blob URL reference */
export function releaseWorkerBlobUrl(): void {
  workerBlobRefCount--;
  if (workerBlobRefCount <= 0 && workerBlobUrl) {
    URL.revokeObjectURL(workerBlobUrl);
    workerBlobUrl = null;
    workerBlobRefCount = 0;
  }
}
