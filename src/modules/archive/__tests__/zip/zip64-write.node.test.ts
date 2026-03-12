import { describe } from "vitest";
import { runZip64WriteTests } from "@archive/__tests__/zip/zip64-write.shared";

describe("ZIP64 write - Node.js", () => {
  runZip64WriteTests();
});
