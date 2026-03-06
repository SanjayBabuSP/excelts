/**
 * Internal Type Guards Browser Tests
 *
 * Runs the shared internal type guards test suite against the Browser implementation.
 */

import { describe } from "vitest";
import { runInternalTypeGuardsTests } from "@stream/__tests__/internal-type-guards.shared";

describe("internal/type-guards (Browser)", () => {
  runInternalTypeGuardsTests();
});
