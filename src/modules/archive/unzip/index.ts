import type { ArchiveSource } from "@archive/io/archive-source";
import { createReader } from "@archive/formats";
import type { TarReader } from "@archive/tar/tar-archive";
import type { UnzipOptions, UnzipOptionsTar, UnzipOptionsZip, ZipReader } from "./zip-reader";

export {
  UnzipEntry,
  ZipReader,
  type UnzipOptions,
  type UnzipOptionsTar,
  type UnzipOptionsZip,
  type UnzipOperation,
  type UnzipProgress,
  type UnzipStreamOptions
} from "./zip-reader";

/**
 * Open an archive for reading
 *
 * @param source - Archive data source
 * @param options - Options including format
 * @returns ZipReader or TarReader depending on format option
 *
 * @example
 * ```ts
 * // Read ZIP archive (default)
 * const zipReader = unzip(zipBytes);
 * for await (const entry of zipReader.entries()) {
 *   console.log(entry.path);
 * }
 *
 * // Read TAR archive
 * const tarReader = unzip(tarBytes, { format: "tar" });
 * for await (const entry of tarReader.entries()) {
 *   console.log(entry.path);
 * }
 * ```
 */
export function unzip(source: ArchiveSource, options: UnzipOptionsTar): TarReader;
export function unzip(source: ArchiveSource, options?: UnzipOptionsZip): ZipReader;
export function unzip(source: ArchiveSource, options?: UnzipOptions): ZipReader | TarReader {
  return createReader(source, options as any);
}
