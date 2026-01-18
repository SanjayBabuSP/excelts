/**
 * TAR Archive Module
 *
 * Complete TAR archive support including:
 * - Reading/parsing TAR archives (POSIX ustar, GNU, PAX)
 * - Creating TAR archives with streaming support
 * - Long filename support (GNU extensions)
 * - Symlink and directory support
 * - Gzip compression (tar.gz / tgz)
 * - Unified API compatible with ZIP (TarArchive/TarReader)
 */

// Re-export all browser-compatible exports
export * from "./index.browser";

// Gzip support (Node.js only - requires zlib)
export {
  TarGzArchive,
  targz,
  parseTarGz,
  parseTarGzStream,
  untargz,
  gzipTar,
  gunzip,
  gzip,
  gzipSync,
  gunzipSync,
  type TarGzOptions,
  type ParseTarGzOptions
} from "./tar-gzip";
