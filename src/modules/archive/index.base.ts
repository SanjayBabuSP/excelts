/**
 * Archive (ZIP) module - shared exports.
 *
 * This module contains exports that are identical across Node.js and browser.
 * Platform-specific entrypoints (index.ts / index.browser.ts) should re-export
 * from this file and then layer their platform-specific bindings.
 */

// ZIP builders
export {
  createZip,
  createZipSync,
  ZipBuilder,
  type ZipEntry,
  type ZipOptions
} from "@archive/zip-builder";

// Streaming ZIP (fflate-like API)
export { StreamingZip, ZipDeflateFile, Zip, ZipDeflate } from "@archive/streaming-zip";

// Buffer-based unzip API (cross-platform)
export {
  extractAll,
  extractFile,
  listFiles,
  forEachEntry,
  ZipParser,
  type ExtractedFile,
  type ZipParseOptions
} from "@archive/extract";

export type { ZipEntryInfo } from "@archive/zip-entry-info";
