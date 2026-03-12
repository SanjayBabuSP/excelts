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

export { toAsyncIterable, toReadableStream } from "@archive/io/archive-source";

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

// Abort and Error types - all from centralized errors module
export {
  // Abort helpers
  AbortError,
  createAbortError,
  isAbortError,
  throwIfAborted,
  // Error classes
  ArchiveError,
  ZipParseError,
  InvalidZipSignatureError,
  EocdNotFoundError,
  DecryptionError,
  PasswordRequiredError,
  FileTooLargeError,
  UnsupportedCompressionError,
  EntrySizeMismatchError,
  // Error types
  type EntrySizeMismatchReason
} from "@archive/shared/errors";

// High-level APIs
export {
  zip,
  ZipArchive,
  ZipEditor,
  editZip,
  editZipUrl,
  ZipEditPlan,
  type ZipOptions,
  type ZipEntryOptions,
  type ZipEditOptions,
  type ZipEditUrlOptions,
  type ZipEditWarning,
  type ZipEditOp,
  type ArchiveFormat
} from "@archive/zip";
export { unzip, ZipReader, UnzipEntry, type UnzipOptions } from "@archive/unzip";

export type { ZipOperation, ZipProgress, ZipStreamOptions } from "@archive/zip";
export type { UnzipOperation, UnzipProgress, UnzipStreamOptions } from "@archive/unzip";

// Format registry (ZIP/TAR dispatch)
export { createArchive, createReader } from "@archive/formats";

// TAR archive support (unified API compatible with ZIP)
// Note: Gzip helpers are exported separately in index.ts / index.browser.ts
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
