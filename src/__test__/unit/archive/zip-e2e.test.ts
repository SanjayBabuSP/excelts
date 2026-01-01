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
} from "../../../modules/archive/index";
import {
  runZipE2ETests,
  type ZipE2EModuleImports
} from "../../../modules/archive/__test__/zip/zip-e2e.shared";

describe("Archive - ZIP E2E (Node)", () => {
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
