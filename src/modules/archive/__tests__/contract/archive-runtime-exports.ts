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

  // ZIP builders
  "createZip",
  "createZipSync",
  "ZipBuilder",

  // Streaming ZIP
  "StreamingZip",
  "ZipDeflateFile",
  "Zip",
  "ZipDeflate",

  // Stream-based unzip
  "Parse",
  "createParse",

  // Buffer-based unzip
  "extractAll",
  "extractFile",
  "listFiles",
  "forEachEntry",
  "ZipParser"
] as const;

export type ArchiveRuntimeExport = (typeof ARCHIVE_RUNTIME_EXPORTS)[number];

export function getRuntimeExportKeys(moduleNamespace: object): string[] {
  return Object.keys(moduleNamespace).sort();
}
