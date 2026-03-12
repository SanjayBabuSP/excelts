import type { ArchiveSource } from "@archive/io/archive-source";
import {
  createZipArchive,
  type ZipArchive,
  type ZipOptions,
  type ZipOptionsTar,
  type ZipOptionsZip
} from "@archive/zip/zip-archive";
import {
  createZipReader,
  type ZipReader,
  type UnzipOptions,
  type UnzipOptionsTar,
  type UnzipOptionsZip
} from "@archive/unzip/zip-reader";
import { TarArchive, TarReader } from "@archive/tar/tar-archive";

export type { ArchiveFormat } from "./types";

export function createArchive(options: ZipOptionsTar): TarArchive;
export function createArchive(options?: ZipOptionsZip): ZipArchive;
export function createArchive(options: ZipOptions = {}): ZipArchive | TarArchive {
  if (options.format === "tar") {
    return new TarArchive({
      modTime: options.modTime,
      signal: options.signal,
      onProgress: options.onProgress as any,
      progressIntervalMs: options.progressIntervalMs
    });
  }

  // Narrow for ZIP implementation.
  const zipOptions: ZipOptionsZip = { ...options, format: "zip" };
  return createZipArchive(zipOptions);
}

export function createReader(source: ArchiveSource, options: UnzipOptionsTar): TarReader;
export function createReader(source: ArchiveSource, options?: UnzipOptionsZip): ZipReader;
export function createReader(
  source: ArchiveSource,
  options: UnzipOptions = {}
): ZipReader | TarReader {
  if (options.format === "tar") {
    return new TarReader(source, {
      signal: options.signal,
      onProgress: options.onProgress as any,
      progressIntervalMs: options.progressIntervalMs
    });
  }

  // Narrow for ZIP implementation.
  const zipOptions: UnzipOptionsZip = { ...options, format: "zip" };
  return createZipReader(source, zipOptions);
}
