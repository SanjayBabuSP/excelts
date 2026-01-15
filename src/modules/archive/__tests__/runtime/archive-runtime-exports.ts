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
  "isAbortError"
] as const;

export type ArchiveRuntimeExport = (typeof ARCHIVE_RUNTIME_EXPORTS)[number];

export function getRuntimeExportKeys(moduleNamespace: object): string[] {
  return Object.keys(moduleNamespace).sort();
}
