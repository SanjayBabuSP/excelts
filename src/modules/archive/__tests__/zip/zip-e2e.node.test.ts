import { describe } from "vitest";
import { zip, unzip } from "@archive";
import { runZipE2ETests, type ZipE2EModuleImports } from "@archive/__tests__/zip/zip-e2e.v2.shared";

describe("Archive - ZIP E2E (Node)", () => {
  const imports: ZipE2EModuleImports = {
    zip,
    unzip
  };

  runZipE2ETests(imports);
});
