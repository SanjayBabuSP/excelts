import { describe, expect, it } from "vitest";

import * as archive from "../../modules/archive/index";
import {
  ARCHIVE_RUNTIME_EXPORTS,
  getRuntimeExportKeys
} from "../../modules/archive/__test__/contract/archive-runtime-exports";

describe("archive/index runtime exports (browser)", () => {
  it("should match the export contract", () => {
    const actual = getRuntimeExportKeys(archive);
    const expected = [...ARCHIVE_RUNTIME_EXPORTS].sort();
    expect(actual).toEqual(expected);
  });
});
