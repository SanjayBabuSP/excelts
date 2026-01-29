/**
 * Archive module error types.
 *
 * All archive-related errors extend ArchiveError.
 */

import { BaseError, type BaseErrorOptions } from "@utils/errors";

// Re-export common utilities from base
export {
  AbortError,
  createAbortError,
  isAbortError,
  throwIfAborted,
  createLinkedAbortController,
  toError,
  asError,
  suppressUnhandledRejection,
  errorToJSON,
  getErrorChain,
  getRootCause,
  type BaseErrorOptions
} from "@utils/errors";

/**
 * Base class for all archive-related errors.
 */
export class ArchiveError extends BaseError {
  constructor(message: string, options?: BaseErrorOptions) {
    super(message, options);
    this.name = "ArchiveError";
  }
}

/**
 * Check if an error is an archive error.
 */
export function isArchiveError(err: unknown): err is ArchiveError {
  return err instanceof ArchiveError;
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
