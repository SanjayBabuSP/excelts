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
  "createGzipStream",
  "createGunzipStream",
  "createZlibStream",
  "createUnzlibStream",
  "hasDeflateRaw",
  "hasGzipCompressionStream",
  "hasGzipDecompressionStream",
  "isGzipData",

  // GZIP compression (available in both Node.js and browser)
  "gzip",
  "gunzip",
  "gzipSync",
  "gunzipSync",
  "GZIP_ID1",
  "GZIP_ID2",

  // Zlib compression (RFC 1950)
  "zlib",
  "unzlib",
  "zlibSync",
  "unzlibSync",
  "isZlibData",
  "ZLIB_CM_DEFLATE",
  "ZLIB_CINFO_MAX",
  "ZLIB_MIN_SIZE",

  // Auto-detect decompression
  "decompressAuto",
  "decompressAutoSync",
  "detectCompressionFormat",

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
  "editZip",
  "editZipUrl",
  "unzip",
  "ZipArchive",
  "ZipEditor",
  "ZipEditPlan",
  "ZipReader",
  "UnzipEntry",

  // Format registry (ZIP/TAR dispatch)
  "createArchive",
  "createReader",

  // TAR archive support (basic - no gzip)
  "TAR_BLOCK_SIZE",
  "TAR_TYPE",
  "TarArchive",
  "TarReader",
  "TarReaderEntry",
  "createTarArchive",
  "createTarReader",
  "tar",
  "tarSync",
  "parseTar",
  "parseTarStream",
  "untar",
  "isTarFile",
  "isTarDirectory",
  "isTarSymlink",
  "isTarHardLink",
  "isTarDataEntry",

  // Random access / HTTP Range reading
  "HttpRangeReader",
  "BufferReader",
  "RemoteZipReader",

  // Error types
  "ArchiveError",
  "ArchiveAbortError",
  "ZipParseError",
  "InvalidZipSignatureError",
  "EocdNotFoundError",
  "Crc32MismatchError",
  "DecryptionError",
  "PasswordRequiredError",
  "RangeNotSupportedError",
  "HttpRangeError",
  "FileTooLargeError",
  "UnsupportedCompressionError",

  // Abort utilities
  "createAbortError",
  "isAbortError",
  "throwIfAborted",

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
  "createTempDirSync",

  // TAR + Gzip support (Node.js only - requires zlib for streaming)
  "TarGzArchive",
  "targz",
  "parseTarGz",
  "parseTarGzStream",
  "untargz"
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
