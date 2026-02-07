/**
 * CSV module error types.
 */

import { BaseError } from "@utils/errors";

/**
 * Base class for all CSV-related errors.
 */
export class CsvError extends BaseError {
  override name = "CsvError";
}

/**
 * Error thrown when CSV worker operations fail.
 */
export class CsvWorkerError extends CsvError {
  override name = "CsvWorkerError";
}
