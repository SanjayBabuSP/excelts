/**
 * CSV module error types.
 *
 * All CSV-related errors extend CsvError.
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
  errorToJSON,
  getErrorChain,
  getRootCause,
  type BaseErrorOptions
} from "@utils/errors";

/**
 * Base class for all CSV-related errors.
 */
export class CsvError extends BaseError {
  constructor(message: string, options?: BaseErrorOptions) {
    super(message, options);
    this.name = "CsvError";
  }
}

/**
 * Check if an error is a CSV error.
 */
export function isCsvError(err: unknown): err is CsvError {
  return err instanceof CsvError;
}

/**
 * Error thrown when an HTTP download fails.
 */
export class CsvDownloadError extends CsvError {
  override name = "CsvDownloadError";

  constructor(
    public readonly url: string,
    public readonly status: number,
    public readonly statusText: string,
    options?: BaseErrorOptions
  ) {
    super(`Failed to download CSV from "${url}": HTTP ${status} ${statusText}`, options);
  }
}

/**
 * Error thrown when a file operation fails.
 */
export class CsvFileError extends CsvError {
  override name = "CsvFileError";

  constructor(
    public readonly path: string,
    public readonly operation: "read" | "write",
    details?: string,
    options?: BaseErrorOptions
  ) {
    super(
      details
        ? `Failed to ${operation} CSV file "${path}": ${details}`
        : `Failed to ${operation} CSV file "${path}"`,
      options
    );
  }
}

/**
 * Error thrown when a feature is not supported in the current environment.
 */
export class CsvNotSupportedError extends CsvError {
  override name = "CsvNotSupportedError";

  constructor(
    public readonly operation: string,
    public readonly reason: string,
    options?: BaseErrorOptions
  ) {
    super(`${operation} is not supported: ${reason}`, options);
  }
}

/**
 * Error thrown when CSV worker operations fail.
 */
export class CsvWorkerError extends CsvError {
  override name = "CsvWorkerError";
}
