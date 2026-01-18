/**
 * Core archive exports available in all environments (Node.js + browser)
 */
export const ARCHIVE_BROWSER_EXPORTS = [
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
  "hasWorkerSupport",

  // Streaming compression
  "createDeflateStream",
  "createInflateStream",
  "hasDeflateRaw",

  // Worker Pool (browser-only functionality, stub in Node)
  "WorkerPool",
  "getDefaultWorkerPool",
  "terminateDefaultWorkerPool",
  "deflateWithPool",
  "inflateWithPool",
  "deflateBatchWithPool",
  "inflateBatchWithPool",

  // High-level archive API
  "zip",
  "unzip",
  "ZipArchive",
  "ZipReader",
  "UnzipEntry",

  // Random access / HTTP Range reading
  "HttpRangeReader",
  "BufferReader",
  "RangeNotSupportedError",
  "HttpRangeError",
  "RemoteZipReader",
  "Crc32MismatchError",

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

/**
 * File system convenience layer exports (Node.js only)
 */
export const ARCHIVE_NODE_EXPORTS = [
  "ZipFile",
  "traverseDirectory",
  "traverseDirectorySync",
  "glob",
  "globSync",
  "globToRegex",
  "matchGlob",
  "matchGlobAny",
  "ensureDir",
  "ensureDirSync",
  "fileExists",
  "fileExistsSync",
  "readFileBytes",
  "readFileBytesSync",
  "writeFileBytes",
  "writeFileBytesSync",
  "setFileTime",
  "setFileTimeSync",
  "safeStats",
  "safeStatsSync",
  "readFileText",
  "readFileTextSync",
  "writeFileText",
  "writeFileTextSync",
  "remove",
  "removeSync",
  "copyFile",
  "copyFileSync",
  "createReadStream",
  "createWriteStream",
  "createTempDir",
  "createTempDirSync"
] as const;

/**
 * All archive exports (Node.js environment)
 */
export const ARCHIVE_RUNTIME_EXPORTS = [
  ...ARCHIVE_BROWSER_EXPORTS,
  ...ARCHIVE_NODE_EXPORTS
] as const;

export type ArchiveBrowserExport = (typeof ARCHIVE_BROWSER_EXPORTS)[number];
export type ArchiveNodeExport = (typeof ARCHIVE_NODE_EXPORTS)[number];
export type ArchiveRuntimeExport = (typeof ARCHIVE_RUNTIME_EXPORTS)[number];

export function getRuntimeExportKeys(moduleNamespace: object): string[] {
  return Object.keys(moduleNamespace).sort();
}
