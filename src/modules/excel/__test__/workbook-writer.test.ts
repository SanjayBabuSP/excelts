import { describe, it, expect } from "vitest";
import { Writable } from "../../../modules/stream";
import { WorkbookWriter } from "../../../index";

describe("Workbook Writer", () => {
  it("returns undefined for non-existant sheet", () => {
    const stream = new Writable({
      write: function noop() {}
    });
    const wb = new WorkbookWriter({
      stream
    });
    wb.addWorksheet("first");
    expect(wb.getWorksheet("w00t")).toBeUndefined();
  });
});
