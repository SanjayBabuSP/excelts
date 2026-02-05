/**
 * CSV module error types.
 */

import { BaseError, type BaseErrorOptions } from "@utils/errors";

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
 * Error thrown when CSV worker operations fail.
 */
export class CsvWorkerError extends CsvError {
  override name = "CsvWorkerError";
}
