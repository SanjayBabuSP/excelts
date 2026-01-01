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
} from "./zip-builder";

// Streaming ZIP (fflate-like API)
export { StreamingZip, ZipDeflateFile, Zip, ZipDeflate } from "./streaming-zip";

// Buffer-based unzip API (cross-platform)
export {
  extractAll,
  extractFile,
  listFiles,
  forEachEntry,
  ZipParser,
  type ExtractedFile,
  type ZipParseOptions
} from "./extract";

export type { ZipEntryInfo } from "./zip-entry-info";
