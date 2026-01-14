/**
 * Shared ZIP entry metadata used by unzip parsers and higher-level extract APIs.
 *
 * This is intentionally platform-agnostic and does not depend on Node.js streams.
 */

export interface ZipEntryInfo {
  /** File path within the ZIP */
  path: string;
  /** Whether this is a directory */
  isDirectory: boolean;
  /** Compressed size */
  compressedSize: number;
  /** ZIP64 exact compressed size (when present in the ZIP64 extra field). */
  compressedSize64?: bigint;
  /** Uncompressed size */
  uncompressedSize: number;
  /** ZIP64 exact uncompressed size (when present in the ZIP64 extra field). */
  uncompressedSize64?: bigint;
  /** Compression method (0 = stored, 8 = deflate) */
  compressionMethod: number;
  /** CRC-32 checksum */
  crc32: number;
  /** Last modified date */
  lastModified: Date;
  /** Offset to local file header */
  localHeaderOffset: number;
  /** ZIP64 exact local header offset (when present in the ZIP64 extra field). */
  localHeaderOffset64?: bigint;
  /** File comment */
  comment: string;
  /** External file attributes */
  externalAttributes: number;
  /** Is encrypted */
  isEncrypted: boolean;
}
