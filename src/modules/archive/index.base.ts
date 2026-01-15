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

// Abort
export { ArchiveAbortError, createAbortError, isAbortError } from "@archive/utils/abort";

// High-level APIs
export { zip, ZipArchive, type ZipOptions, type ZipEntryOptions } from "@archive/zip";
export { unzip, ZipReader, UnzipEntry, type UnzipOptions } from "@archive/unzip";

export type { ZipOperation, ZipProgress, ZipStreamOptions } from "@archive/zip";
export type { UnzipOperation, UnzipProgress, UnzipStreamOptions } from "@archive/unzip";
