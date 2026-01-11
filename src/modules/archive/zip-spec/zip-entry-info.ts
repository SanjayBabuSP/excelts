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
  /** Uncompressed size */
  uncompressedSize: number;
  /** Compression method (0 = stored, 8 = deflate) */
  compressionMethod: number;
  /** CRC-32 checksum */
  crc32: number;
  /** Last modified date */
  lastModified: Date;
  /** Offset to local file header */
  localHeaderOffset: number;
  /** File comment */
  comment: string;
  /** External file attributes */
  externalAttributes: number;
  /** Is encrypted */
  isEncrypted: boolean;
}
