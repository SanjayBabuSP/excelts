/**
 * Internal Evented Readable Browser Tests
 *
 * Runs the shared internal evented readable test suite against the Browser implementation.
 */

import { describe } from "vitest";
import { runInternalEventedReadableTests } from "@stream/__tests__/internal-evented-readable.shared";

describe("internal/evented-readable-to-async-iterable (Browser)", () => {
  runInternalEventedReadableTests();
});
