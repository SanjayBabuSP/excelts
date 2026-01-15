export const ARCHIVE_RUNTIME_EXPORTS = [
  // CRC32
  "crc32",
  "crc32Update",
  "crc32Finalize",

  // Compression
  "compress",
  "compressSync",
  "decompress",
  "decompressSync",
  "hasCompressionStream",

  // Streaming compression
  "createDeflateStream",
  "createInflateStream",
  "hasDeflateRaw",

  // High-level archive API
  "zip",
  "unzip",
  "ZipArchive",
  "ZipReader",
  "UnzipEntry",

  // Abort
  "ArchiveAbortError",
  "createAbortError",
  "isAbortError",

  // Crypto - ZipCrypto
  "zipCryptoInitKeys",
  "zipCryptoDecrypt",
  "zipCryptoEncrypt",
  "ZIP_CRYPTO_HEADER_SIZE",

  // Crypto - AES
  "aesDecrypt",
  "aesEncrypt",
  "aesEncryptedSize",
  "buildAesExtraField",
  "randomBytes",
  "getAesKeyStrength",
  "encryptionMethodFromAesKeyStrength",
  "getEncryptionMethodName",
  "isAesEncryption",

  // AES constants
  "AES_AUTH_CODE_LENGTH",
  "AES_EXTRA_FIELD_ID",
  "AES_KEY_LENGTH",
  "AES_PASSWORD_VERIFY_LENGTH",
  "AES_SALT_LENGTH",
  "AES_VENDOR_ID",
  "AES_VERSION_AE1",
  "AES_VERSION_AE2",
  "COMPRESSION_METHOD_AES"
] as const;

export type ArchiveRuntimeExport = (typeof ARCHIVE_RUNTIME_EXPORTS)[number];

export function getRuntimeExportKeys(moduleNamespace: object): string[] {
  return Object.keys(moduleNamespace).sort();
}
