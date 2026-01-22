/**
 * Type definitions for Node.js file system archive operations.
 *
 * Supports both ZIP and TAR formats through a unified API with
 * format-specific options controlled via TypeScript types.
 *
 * @module
 */

import type { ZipTimestampMode } from "@archive/zip-spec/timestamps";
import type { Zip64Mode } from "@archive/zip-spec/zip-records";
import type { ZipEncryptionMethod } from "@archive/crypto";
import type { ZipPathOptions } from "@archive/zip-spec/zip-path";
import type { ZipStringEncoding } from "@archive/shared/text";
import type { ArchiveFormat } from "@archive/formats/types";

export type { ArchiveFormat };

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

  /** Optional access time (used only when timestamps mode supports it). */
  atime?: Date;

  /** Optional metadata change time (used only when timestamps mode supports it). */
  ctime?: Date;

  /** Optional creation time (used by NTFS timestamps mode). */
  birthTime?: Date;

  /** File comment */
  comment?: string;

  /** Encryption method for this file */
  encryptionMethod?: ZipEncryptionMethod;

  /** Password for encryption */
  password?: string | Uint8Array;

  /** Optional Unix mode/permissions (may include type bits). */
  mode?: number;

  /** Optional MS-DOS attributes (low 8 bits). */
  msDosAttributes?: number;

  /** Advanced override for the ZIP central directory external attributes field. */
  externalAttributes?: number;

  /** Optional string encoding for this entry name/comment. */
  encoding?: ZipStringEncoding;
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

  /** Optional override mode for directory entries (may include type bits). */
  mode?: number;

  /** Optional MS-DOS attributes for directory entries (low 8 bits). */
  msDosAttributes?: number;

  /** Optional string encoding for entries added from this directory. */
  encoding?: ZipStringEncoding;
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

  /** Optional Unix mode override for files matched by the glob. */
  mode?: number;

  /** Optional MS-DOS attributes override for files matched by the glob. */
  msDosAttributes?: number;

  /** Optional string encoding for entries added from this glob. */
  encoding?: ZipStringEncoding;
}

// =============================================================================
// Extract Options
// =============================================================================

/**
 * Options for extracting files from an archive to disk.
 */
export interface ExtractToOptions {
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

  /** Warning callback (non-fatal errors / skips). */
  onWarning?: (warning: ArchiveWarning) => void;
}

export interface ArchiveWarning {
  /** Operation that emitted the warning. */
  operation: "extract";

  /** Entry path within the archive, if applicable. */
  entryPath?: string;

  /** Resolved target path on disk, if applicable. */
  targetPath?: string;

  /** Human-readable message. */
  message: string;

  /** Original error object (if any). */
  error?: unknown;
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

  /**
   * Entry name normalization options.
   * Defaults to legacy behavior (backslashes -> '/', strip leading '/').
   */
  path?: ZipPathOptions;

  /** If true, write Unix permissions (mode) into external attributes. */
  writePermissions?: boolean;

  /** If true, preserve `stat.mode` when adding local files/dirs/globs (requires writePermissions). */
  preservePermissions?: boolean;

  /** Optional string encoding for entry names/comments. */
  encoding?: ZipStringEncoding;
}

/**
 * Options for opening an existing ZIP file.
 */
export interface OpenZipOptions {
  /** Password for encrypted entries */
  password?: string | Uint8Array;

  /** Optional string encoding for legacy (non-UTF8) names/comments. */
  encoding?: ZipStringEncoding;
}

/**
 * Options for writing an archive file to disk.
 */
export interface WriteZipOptions {
  /** How to handle existing file (default: 'error') */
  overwrite?: OverwriteStrategy;
}

/** Alias for backward compatibility */
export type WriteArchiveOptions = WriteZipOptions;

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

/**
 * Unified entry info type (format-agnostic properties only)
 */
export interface ArchiveEntryInfo {
  /** Path within the archive */
  path: string;

  /** Whether this is a directory */
  isDirectory: boolean;

  /** Uncompressed file size in bytes */
  size: number;

  /** Last modified date */
  lastModified?: Date;

  /** Modification time (alias for lastModified) */
  mtime?: Date;

  /** File mode (Unix permissions) */
  mode?: number;

  /** User ID */
  uid?: number;

  /** Group ID */
  gid?: number;

  /** User name */
  uname?: string;

  /** Group name */
  gname?: string;

  /** Link target (for symlinks) */
  linkname?: string;

  /** Entry type (TAR-specific) */
  type?: string;
}

// =============================================================================
// TAR-specific Options
// =============================================================================

/**
 * Options for creating a TAR archive via ArchiveFile.
 */
export interface TarFileOptions {
  /** Archive format */
  format: "tar";

  /** Default modification time for entries */
  modTime?: Date;

  /** If true, compress with gzip (creates .tar.gz / .tgz) */
  gzip?: boolean;

  /** Gzip compression level (1-9, default: 6) */
  gzipLevel?: number;
}

/**
 * Options for opening an existing TAR file.
 */
export interface OpenTarOptions {
  /** Archive format */
  format: "tar";

  /** If true, decompress gzip before parsing */
  gzip?: boolean;
}

// =============================================================================
// Unified ArchiveFile Options (with format discrimination)
// =============================================================================

/**
 * ZIP format options for ArchiveFile.
 */
export interface ArchiveFileOptionsZip extends ZipFileOptions {
  /** Archive format (default: 'zip') */
  format?: "zip";
}

/**
 * TAR format options for ArchiveFile.
 */
export interface ArchiveFileOptionsTar extends Omit<TarFileOptions, "format"> {
  /** Archive format */
  format: "tar";
}

/**
 * Union type for ArchiveFile options.
 */
export type ArchiveFileOptions = ArchiveFileOptionsZip | ArchiveFileOptionsTar;

/**
 * ZIP format options for opening an archive.
 */
export interface OpenArchiveOptionsZip extends OpenZipOptions {
  /** Archive format (default: 'zip') */
  format?: "zip";
}

/**
 * TAR format options for opening an archive.
 */
export interface OpenArchiveOptionsTar extends Omit<OpenTarOptions, "format"> {
  /** Archive format */
  format: "tar";
}

/**
 * Union type for opening archives.
 */
export type OpenArchiveOptions = OpenArchiveOptionsZip | OpenArchiveOptionsTar;

// =============================================================================
// TAR Entry Options
// =============================================================================

/**
 * Options for adding a file entry to a TAR archive.
 */
export interface AddTarFileOptions {
  /** Custom name in the archive (defaults to basename of source path) */
  name?: string;

  /** Prefix path in the archive */
  prefix?: string;

  /** Custom modification time (defaults to file's mtime) */
  modTime?: Date;

  /** File mode/permissions (default: 0644 for files, 0755 for directories) */
  mode?: number;

  /** User ID (default: 0) */
  uid?: number;

  /** Group ID (default: 0) */
  gid?: number;

  /** User name */
  uname?: string;

  /** Group name */
  gname?: string;
}

/**
 * Options for adding a directory to a TAR archive.
 */
export interface AddTarDirectoryOptions extends AddTarFileOptions {
  /** Include the root directory itself (default: true) */
  includeRoot?: boolean;

  /** Recursively include subdirectories (default: true) */
  recursive?: boolean;

  /** Filter function to include/exclude files */
  filter?: (path: string, stats: { isDirectory: boolean; size: number }) => boolean;

  /** Follow symbolic links (default: false) */
  followSymlinks?: boolean;
}

/**
 * Options for adding files matching a glob pattern to a TAR archive.
 */
export interface AddTarGlobOptions extends AddTarFileOptions {
  /** Current working directory for glob matching (default: process.cwd()) */
  cwd?: string;

  /** Patterns to ignore */
  ignore?: string | string[];

  /** Include dot files (default: false) */
  dot?: boolean;

  /** Follow symbolic links (default: false) */
  followSymlinks?: boolean;

  /** Filter function to include/exclude files */
  filter?: (path: string, stats: { isDirectory: boolean; size: number }) => boolean;
}
