import { describe, expect, it } from "vitest";

import * as archive from "@archive";
import {
  ARCHIVE_RUNTIME_EXPORTS,
  getRuntimeExportKeys
} from "@archive/__tests__/runtime/archive-runtime-exports";

describe("archive/index runtime exports (node)", () => {
  it("should match the export contract", () => {
    const actual = getRuntimeExportKeys(archive);
    const expected = [...ARCHIVE_RUNTIME_EXPORTS].sort();
    expect(actual).toEqual(expected);
  });
});
