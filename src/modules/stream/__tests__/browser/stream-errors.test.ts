/**
 * Stream Errors Browser Tests
 *
 * Runs the shared stream errors test suite against the Browser implementation.
 */

import { describe } from "vitest";
import { runStreamErrorsTests } from "@stream/__tests__/stream-errors.shared";

describe("stream/errors (Browser)", () => {
  runStreamErrorsTests();
});
