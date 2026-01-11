/**
 * Archive (ZIP) module - shared exports.
 *
 * This module contains exports that are identical across Node.js and browser.
 * Platform-specific entrypoints (index.ts / index.browser.ts) should re-export
 * from this file and then layer their platform-specific bindings.
 */

// Unified archive I/O
export type { ArchiveSource } from "@archive/io/archive-source";
export type { ArchiveSink } from "@archive/io/archive-sink";

// High-level APIs
export { zip, ZipArchive, type ZipOptions, type ZipEntryOptions } from "@archive/zip";
export { unzip, ZipReader, UnzipEntry, type UnzipOptions } from "@archive/unzip";
