/**
 * ZIP Streaming Module Browser Tests
 *
 * Runs shared streaming ZIP tests in browser environment,
 * plus browser-specific tests for CompressionStream.
 */

import { describe, it, expect } from "vitest";
import { Zip, ZipDeflate, createDeflateStream } from "@archive";
import { ZipParser } from "@archive/zip-parser";
import { runStreamingZipTests, type StreamingZipModuleImports } from "@archive/__tests__/zip/streaming-zip.shared";

// =============================================================================
// Run Shared Tests
// =============================================================================
describe("ZIP Streaming - Browser", () => {
  const imports: StreamingZipModuleImports = {
    Zip,
    ZipDeflate,
    createDeflateStream,
    ZipParser
  };

  runStreamingZipTests(imports);

  // ===========================================================================
  // Browser-Specific Tests
  // ===========================================================================
  describe("Browser-Specific: CompressionStream", () => {
    it("should check CompressionStream availability", () => {
      // Check if browser supports CompressionStream deflate-raw
      const hasNativeStream =
        typeof CompressionStream !== "undefined" &&
        (() => {
          try {
            new CompressionStream("deflate-raw");
            return true;
          } catch {
            return false;
          }
        })();

      // Log for debugging
      console.log("Browser supports CompressionStream deflate-raw:", hasNativeStream);

      // This test just verifies the check works
      expect(typeof hasNativeStream).toBe("boolean");
    });
  });
});
