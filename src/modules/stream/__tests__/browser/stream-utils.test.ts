/**
 * Stream Utils Browser Tests
 *
 * Runs the shared stream utils test suite against the Browser implementation.
 */

import { describe } from "vitest";
import { runStreamUtilsTests } from "@stream/__tests__/stream-utils.shared";

describe("stream/utils (Browser)", () => {
  runStreamUtilsTests();
});
