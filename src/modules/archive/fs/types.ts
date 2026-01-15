/**
 * Type definitions for Node.js file system ZIP operations.
 *
 * @module
 */

import type { ZipTimestampMode } from "@archive/utils/timestamps";
import type { Zip64Mode } from "@archive/zip/zip64-mode";
import type { ZipEncryptionMethod } from "@archive/crypto";

// =============================================================================
// Overwrite Strategies
// =============================================================================

/**
 * Strategy for handling existing files during extraction.
 *
 * - `'skip'`: Skip extraction if file already exists
 * - `'overwrite'`: Always overwrite existing files
 * - `'error'`: Throw an error if file exists
 * - `'newer'`: Only overwrite if archive entry is newer (by lastModified)
 */
export type OverwriteStrategy = "skip" | "overwrite" | "error" | "newer";

// =============================================================================
// Add File Options
// =============================================================================

/**
 * Options for adding a single file to an archive.
 */
export interface AddFileOptions {
  /** Custom name in the archive (defaults to basename of source path) */
  name?: string;

  /** Prefix path in the archive */
  prefix?: string;

  /** Compression level (0-9, 0 = store, 6 = default) */
  level?: number;

  /** Custom modification time (defaults to file's mtime) */
  modTime?: Date;

  /** File comment */
  comment?: string;

  /** Encryption method for this file */
  encryptionMethod?: ZipEncryptionMethod;

  /** Password for encryption */
  password?: string | Uint8Array;
}

// =============================================================================
// Add Directory Options
// =============================================================================

/**
 * Options for adding a directory to an archive.
 */
export interface AddDirectoryOptions {
  /** Prefix path in the archive (defaults to directory name) */
  prefix?: string;

  /** Include the root directory itself (default: true) */
  includeRoot?: boolean;

  /** Recursively include subdirectories (default: true) */
  recursive?: boolean;

  /** Compression level (0-9, 0 = store, 6 = default) */
  level?: number;

  /** Filter function to include/exclude files */
  filter?: (path: string, stats: { isDirectory: boolean; size: number }) => boolean;

  /** Follow symbolic links (default: false) */
  followSymlinks?: boolean;

  /** Encryption method for files in this directory */
  encryptionMethod?: ZipEncryptionMethod;

  /** Password for encryption */
  password?: string | Uint8Array;
}

// =============================================================================
// Glob Options
// =============================================================================

/**
 * Options for adding files matching a glob pattern.
 */
export interface AddGlobOptions {
  /** Current working directory for glob matching (default: process.cwd()) */
  cwd?: string;

  /** Prefix path in the archive */
  prefix?: string;

  /** Patterns to ignore */
  ignore?: string | string[];

  /** Include dot files (default: false) */
  dot?: boolean;

  /** Follow symbolic links (default: false) */
  followSymlinks?: boolean;

  /** Compression level (0-9, 0 = store, 6 = default) */
  level?: number;

  /** Filter function to include/exclude files */
  filter?: (path: string, stats: { isDirectory: boolean; size: number }) => boolean;

  /** Encryption method */
  encryptionMethod?: ZipEncryptionMethod;

  /** Password for encryption */
  password?: string | Uint8Array;
}

// =============================================================================
// Extract Options
// =============================================================================

/**
 * Options for extracting files from an archive.
 */
export interface ExtractOptions {
  /** How to handle existing files (default: 'error') */
  overwrite?: OverwriteStrategy;

  /** Filter function to include/exclude entries */
  filter?: (path: string, isDirectory: boolean) => boolean;

  /** Preserve file modification times (default: true) */
  preserveTimestamps?: boolean;

  /** Password for encrypted entries */
  password?: string | Uint8Array;

  /** Abort signal */
  signal?: AbortSignal;

  /** Progress callback */
  onProgress?: (info: ExtractProgress) => void;
}

/**
 * Progress information during extraction.
 */
export interface ExtractProgress {
  /** Current entry being extracted */
  currentEntry: string;

  /** Total number of entries */
  totalEntries: number;

  /** Number of entries extracted so far */
  extractedEntries: number;

  /** Total bytes written so far */
  bytesWritten: number;
}

// =============================================================================
// ZipFile Options
// =============================================================================

/**
 * Options for creating a new ZipFile.
 */
export interface ZipFileOptions {
  /** Compression level (0-9, 0 = store, 6 = default) */
  level?: number;

  /** Timestamp mode */
  timestamps?: ZipTimestampMode;

  /** Archive comment */
  comment?: string;

  /** ZIP64 mode */
  zip64?: Zip64Mode;

  /** Default modification time for entries */
  modTime?: Date;

  /** Generate reproducible output */
  reproducible?: boolean;

  /** Smart store for incompressible data */
  smartStore?: boolean;

  /** Default encryption method */
  encryptionMethod?: ZipEncryptionMethod;

  /** Default password */
  password?: string | Uint8Array;
}

/**
 * Options for opening an existing ZIP file.
 */
export interface OpenZipOptions {
  /** Password for encrypted entries */
  password?: string | Uint8Array;
}

/**
 * Options for writing a ZIP file to disk.
 */
export interface WriteZipOptions {
  /** How to handle existing file (default: 'error') */
  overwrite?: OverwriteStrategy;
}

// =============================================================================
// Entry Information
// =============================================================================

/**
 * Information about an entry in a ZIP file.
 */
export interface ZipEntryInfo {
  /** Path within the archive */
  path: string;

  /** Whether this is a directory */
  isDirectory: boolean;

  /** Uncompressed size in bytes */
  size: number;

  /** Compressed size in bytes */
  compressedSize: number;

  /** Last modified date */
  lastModified: Date;

  /** CRC-32 checksum */
  crc32: number;

  /** Whether the entry is encrypted */
  isEncrypted: boolean;

  /** Encryption method if encrypted */
  encryptionMethod?: "zipcrypto" | "aes";

  /** AES key strength if AES encrypted */
  aesKeyStrength?: 128 | 192 | 256;

  /** File comment */
  comment: string;
}
