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

// Random Access / HTTP Range reading
export {
  HttpRangeReader,
  BufferReader,
  RangeNotSupportedError,
  HttpRangeError,
  type RandomAccessReader,
  type HttpRangeReaderOptions,
  type HttpRangeReaderStats
} from "@archive/io/random-access";

export {
  RemoteZipReader,
  Crc32MismatchError,
  type RemoteZipReaderOptions,
  type RemoteZipOpenOptions,
  type RemoteZipStats,
  type ExtractOptions
} from "@archive/io/remote-zip-reader";

// Abort
export { ArchiveAbortError, createAbortError, isAbortError } from "@archive/utils/abort";

// High-level APIs
export {
  zip,
  ZipArchive,
  type ZipOptions,
  type ZipEntryOptions,
  type ArchiveFormat
} from "@archive/zip";
export { unzip, ZipReader, UnzipEntry, type UnzipOptions } from "@archive/unzip";

export type { ZipOperation, ZipProgress, ZipStreamOptions } from "@archive/zip";
export type { UnzipOperation, UnzipProgress, UnzipStreamOptions } from "@archive/unzip";

// TAR archive support (unified API compatible with ZIP)
// Note: Gzip support exported separately in index.ts (Node.js only)
export {
  TAR_BLOCK_SIZE,
  TAR_TYPE,
  // Unified API classes (same interface as ZipArchive/ZipReader)
  TarArchive,
  TarReader,
  TarReaderEntry,
  createTarArchive,
  createTarReader,
  // Convenience functions
  tar,
  tarSync,
  // Low-level parser functions
  parseTar,
  parseTarStream,
  untar,
  // Type helpers
  isTarFile,
  isTarDirectory,
  isTarSymlink,
  isTarHardLink,
  isTarDataEntry,
  // Types
  type TarType,
  type TarEntryInfo,
  type TarEntry,
  type TarHeaderOptions,
  type TarParseOptions,
  type TarArchiveOptions,
  type TarArchiveEntryOptions,
  type TarArchiveProgress,
  type TarArchiveStreamOptions,
  type TarArchiveOperation,
  type TarReaderOptions,
  type TarReaderProgress,
  type TarReaderStreamOptions,
  type TarReaderOperation
} from "@archive/tar/index.browser";

// Encryption
export {
  ZIP_CRYPTO_HEADER_SIZE,
  zipCryptoInitKeys,
  zipCryptoDecrypt,
  zipCryptoEncrypt,
  AES_VENDOR_ID,
  AES_VERSION_AE1,
  AES_VERSION_AE2,
  AES_EXTRA_FIELD_ID,
  AES_SALT_LENGTH,
  AES_KEY_LENGTH,
  AES_AUTH_CODE_LENGTH,
  AES_PASSWORD_VERIFY_LENGTH,
  COMPRESSION_METHOD_AES,
  aesDecrypt,
  aesEncrypt,
  aesEncryptedSize,
  buildAesExtraField,
  randomBytes,
  type AesKeyStrength,
  type AesExtraFieldInfo,
  type ZipEncryptionMethod,
  type ZipEncryptionInfo,
  type ZipPasswordOptions,
  type ZipEncryptionOptions,
  getEncryptionMethodName,
  isAesEncryption,
  getAesKeyStrength,
  encryptionMethodFromAesKeyStrength
} from "@archive/crypto";
