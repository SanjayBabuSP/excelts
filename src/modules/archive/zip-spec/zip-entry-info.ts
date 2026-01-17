/**
 * Shared ZIP entry metadata used by unzip parsers and higher-level extract APIs.
 *
 * This is intentionally platform-agnostic and does not depend on Node.js streams.
 */

import type { AesKeyStrength } from "@archive/crypto/aes";

/**
 * Encryption method used for a ZIP entry.
 */
export type ZipEntryEncryptionMethod = "none" | "zipcrypto" | "aes";

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
  /** Compression method (0 = stored, 8 = deflate, 99 = AES-encrypted) */
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

  /** Central directory "version made by" field (when available). */
  versionMadeBy?: number;

  /** Raw central directory extra field (when available). */
  extraField?: Uint8Array;
  /** Is encrypted */
  isEncrypted: boolean;

  // Encryption-specific fields

  /** Encryption method (none, zipcrypto, or aes) */
  encryptionMethod?: ZipEntryEncryptionMethod;

  /** For AES: the AE version (1 or 2) */
  aesVersion?: 1 | 2;

  /** For AES: the key strength (128, 192, or 256) */
  aesKeyStrength?: AesKeyStrength;

  /** For AES: the original compression method before encryption */
  originalCompressionMethod?: number;

  /** DOS time field (used for ZipCrypto verification fallback) */
  dosTime?: number;
}
