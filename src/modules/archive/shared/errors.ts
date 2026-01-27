/**
 * Unified error types for the archive module.
 *
 * All archive-related errors extend ArchiveError.
 */

/**
 * Base class for all archive-related errors.
 */
export class ArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveError";
  }
}

// -----------------------------------------------------------------------------
// Abort / Cancellation
// -----------------------------------------------------------------------------

/**
 * Error thrown when an operation is aborted.
 */
export class ArchiveAbortError extends ArchiveError {
  override name = "AbortError";
  readonly reason: unknown;

  constructor(reason?: unknown) {
    const msg = reason instanceof Error ? reason.message : reason ? String(reason) : "Aborted";
    super(msg);
    this.reason = reason;
  }
}

// -----------------------------------------------------------------------------
// ZIP Parsing Errors
// -----------------------------------------------------------------------------

/**
 * Error thrown when ZIP parsing fails.
 */
export class ZipParseError extends ArchiveError {
  override name = "ZipParseError";
}

/**
 * Error thrown when an invalid ZIP signature is encountered.
 */
export class InvalidZipSignatureError extends ZipParseError {
  override name = "InvalidZipSignatureError";

  constructor(expected: string, actual: number, context?: string) {
    const msg = context
      ? `Invalid ${context}: expected ${expected}, got 0x${actual.toString(16).padStart(8, "0")}`
      : `Invalid signature: expected ${expected}, got 0x${actual.toString(16).padStart(8, "0")}`;
    super(msg);
  }
}

/**
 * Error thrown when End of Central Directory is not found.
 */
export class EocdNotFoundError extends ZipParseError {
  override name = "EocdNotFoundError";

  constructor() {
    super("Invalid ZIP file: End of Central Directory not found");
  }
}

// -----------------------------------------------------------------------------
// CRC32 Validation Errors
// -----------------------------------------------------------------------------

/**
 * Error thrown when CRC32 validation fails.
 */
export class Crc32MismatchError extends ArchiveError {
  override name = "Crc32MismatchError";

  constructor(
    public readonly path: string,
    public readonly expected: number,
    public readonly actual: number
  ) {
    super(
      `CRC32 mismatch for "${path}": expected 0x${expected.toString(16).padStart(8, "0")}, got 0x${actual.toString(16).padStart(8, "0")}`
    );
  }
}

// -----------------------------------------------------------------------------
// Entry Size Validation Errors
// -----------------------------------------------------------------------------

/**
 * Reason for entry size mismatch.
 * - `too-many-bytes`: ZIP bomb detected - actual size exceeds declared size
 * - `too-few-bytes`: Corruption detected - actual size is less than declared size
 */
export type EntrySizeMismatchReason = "too-many-bytes" | "too-few-bytes";

/**
 * Error thrown when the actual decompressed size doesn't match the declared size.
 * This is a security feature to detect ZIP bombs and corrupted archives.
 */
export class EntrySizeMismatchError extends ArchiveError {
  override name = "EntrySizeMismatchError";

  constructor(
    public readonly path: string,
    public readonly expected: number,
    public readonly actual: number,
    public readonly reason: EntrySizeMismatchReason
  ) {
    const msg =
      reason === "too-many-bytes"
        ? `Entry "${path}" produced more bytes than declared: expected ${expected}, got at least ${actual}`
        : `Entry "${path}" produced fewer bytes than declared: expected ${expected}, got ${actual}`;
    super(msg);
  }

  /**
   * Check if this error indicates a potential ZIP bomb (too many bytes).
   */
  isZipBomb(): boolean {
    return this.reason === "too-many-bytes";
  }

  /**
   * Check if this error indicates data corruption (too few bytes).
   */
  isCorruption(): boolean {
    return this.reason === "too-few-bytes";
  }
}

// -----------------------------------------------------------------------------
// Encryption Errors
// -----------------------------------------------------------------------------

/**
 * Error thrown when decryption fails (wrong password or corrupted data).
 */
export class DecryptionError extends ArchiveError {
  override name = "DecryptionError";

  constructor(path: string, details?: string) {
    super(
      details
        ? `Failed to decrypt "${path}": ${details}`
        : `Failed to decrypt "${path}": incorrect password or corrupted data`
    );
  }
}

/**
 * Error thrown when a password is required but not provided.
 */
export class PasswordRequiredError extends ArchiveError {
  override name = "PasswordRequiredError";

  constructor(path: string) {
    super(`File "${path}" is encrypted. Please provide a password to extract.`);
  }
}

// -----------------------------------------------------------------------------
// HTTP / Network Errors
// -----------------------------------------------------------------------------

/**
 * Error thrown when the server doesn't support Range requests.
 */
export class RangeNotSupportedError extends ArchiveError {
  override name = "RangeNotSupportedError";

  constructor(url: string) {
    super(`Server does not support Range requests for: ${url}`);
  }
}

/**
 * Error thrown when an HTTP request fails.
 */
export class HttpRangeError extends ArchiveError {
  override name = "HttpRangeError";

  constructor(
    public readonly url: string,
    public readonly status: number,
    public readonly statusText: string
  ) {
    super(`HTTP ${status} ${statusText} for: ${url}`);
  }
}

// -----------------------------------------------------------------------------
// ZIP64 / Size Errors
// -----------------------------------------------------------------------------

/**
 * Error thrown when a file is too large for in-memory extraction.
 */
export class FileTooLargeError extends ArchiveError {
  override name = "FileTooLargeError";

  constructor(path: string, reason: string) {
    super(`File "${path}" is too large to extract into memory (${reason})`);
  }
}

// -----------------------------------------------------------------------------
// Unsupported Feature Errors
// -----------------------------------------------------------------------------

/**
 * Error thrown when an unsupported compression method is encountered.
 */
export class UnsupportedCompressionError extends ArchiveError {
  override name = "UnsupportedCompressionError";

  constructor(method: number) {
    super(`Unsupported compression method: ${method}`);
  }
}

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/**
 * Create an abort error from a reason.
 */
export function createAbortError(reason?: unknown): ArchiveAbortError {
  return reason instanceof ArchiveAbortError ? reason : new ArchiveAbortError(reason);
}

/**
 * Check if an error is an abort error.
 */
export function isAbortError(err: unknown): err is { name: string } {
  return !!err && typeof err === "object" && (err as any).name === "AbortError";
}

/**
 * Throw if the signal is aborted.
 */
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

/**
 * Create a linked AbortController that aborts when the parent signal aborts.
 *
 * @param parentSignal - Optional parent signal to link to
 * @returns Controller and cleanup function
 */
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

// -----------------------------------------------------------------------------
// Error Normalization
// -----------------------------------------------------------------------------

/**
 * Convert an unknown value to an Error.
 *
 * If the value is already an Error, it's returned as-is.
 * Otherwise, it's converted to a string and wrapped in an Error.
 *
 * Also exported as `asError` for semantic clarity.
 */
export function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * Alias for `toError` - used when the semantic intent is converting a catch value to Error.
 */
export const asError = toError;

// -----------------------------------------------------------------------------
// Promise Utilities
// -----------------------------------------------------------------------------

/**
 * Suppress unhandled rejection warnings for a promise.
 *
 * Use this when you intentionally want to ignore a promise's rejection,
 * typically for fire-and-forget cleanup operations.
 */
export function suppressUnhandledRejection(promise: Promise<unknown>): void {
  promise.catch(() => {});
}
