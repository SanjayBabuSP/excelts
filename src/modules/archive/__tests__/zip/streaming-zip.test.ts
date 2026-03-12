/**
 * ZIP Streaming Module Tests - Node.js
 *
 * Runs shared streaming ZIP tests in Node.js environment.
 */

import { describe } from "vitest";
import { createDeflateStream } from "@archive";
import { Zip, ZipDeflate } from "@archive/zip/stream";
import { ZipParser } from "@archive/unzip/zip-parser";
import {
  runStreamingZipTests,
  type StreamingZipModuleImports
} from "@archive/__tests__/zip/streaming-zip.shared";

// =============================================================================
// Run Shared Tests
// =============================================================================
describe("ZIP Streaming - Node.js", () => {
  const imports = {
    Zip,
    ZipDeflate,
    createDeflateStream,
    ZipParser
  } as StreamingZipModuleImports;

  runStreamingZipTests(imports);
});
