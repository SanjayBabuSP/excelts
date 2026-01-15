export class ArchiveAbortError extends Error {
  override name = "AbortError";
  readonly reason: unknown;

  constructor(reason?: unknown) {
    const msg = reason instanceof Error ? reason.message : reason ? String(reason) : "Aborted";
    super(msg);
    this.reason = reason;
  }
}

export function createAbortError(reason?: unknown): ArchiveAbortError {
  return reason instanceof ArchiveAbortError ? reason : new ArchiveAbortError(reason);
}

export function isAbortError(err: unknown): err is { name: string } {
  return !!err && typeof err === "object" && (err as any).name === "AbortError";
}

export function throwIfAborted(signal?: AbortSignal, reason?: unknown): void {
  if (!signal) {
    return;
  }
  if (!signal.aborted) {
    return;
  }
  const r = reason ?? (signal as any).reason;
  throw createAbortError(r);
}

export function createLinkedAbortController(parentSignal?: AbortSignal): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();

  if (!parentSignal) {
    return { controller, cleanup: () => {} };
  }

  if (parentSignal.aborted) {
    controller.abort((parentSignal as any).reason);
    return { controller, cleanup: () => {} };
  }

  const onAbort = (): void => {
    try {
      controller.abort((parentSignal as any).reason);
    } catch {
      controller.abort();
    }
  };

  parentSignal.addEventListener("abort", onAbort, { once: true });

  const cleanup = (): void => {
    try {
      parentSignal.removeEventListener("abort", onAbort);
    } catch {
      // ignore
    }
  };

  return { controller, cleanup };
}
