import { describe } from "vitest";
import {
  createZip,
  createZipSync,
  crc32,
  Zip,
  ZipDeflate,
  extractAll,
  listFiles,
  ZipParser
} from "@archive";
import { runZipE2ETests, type ZipE2EModuleImports } from "@archive/__tests__/zip/zip-e2e.shared";

describe("Archive - ZIP E2E (Browser)", () => {
  const imports: ZipE2EModuleImports = {
    createZip,
    createZipSync,
    crc32,
    Zip,
    ZipDeflate,
    extractAll,
    listFiles,
    ZipParser
  };

  runZipE2ETests(imports);
});
