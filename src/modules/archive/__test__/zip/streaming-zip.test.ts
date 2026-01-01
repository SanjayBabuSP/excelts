/**
 * ZIP Streaming Module Tests - Node.js
 *
 * Runs shared streaming ZIP tests in Node.js environment.
 */

import { describe } from "vitest";
import { Zip, ZipDeflate, createDeflateStream } from "../../index";
import { ZipParser } from "../../zip-parser";
import { runStreamingZipTests, type StreamingZipModuleImports } from "./streaming-zip.shared";

// =============================================================================
// Run Shared Tests
// =============================================================================
describe("ZIP Streaming - Node.js", () => {
  const imports: StreamingZipModuleImports = {
    Zip,
    ZipDeflate,
    createDeflateStream,
    ZipParser
  };

  runStreamingZipTests(imports);
});
