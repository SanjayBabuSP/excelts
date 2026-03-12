import { createArchive } from "@archive/formats";
import type { TarArchive } from "@archive/tar/tar-archive";
import type { ZipArchive, ZipOptions, ZipOptionsTar, ZipOptionsZip } from "./zip-archive";
export {
  ZipEditor,
  editZip,
  editZipUrl,
  type ZipEditOptions,
  type ZipEditUrlOptions,
  type ZipEditWarning
} from "./zip-editor";
export {
  ZipEditPlan,
  type ZipEditOp,
  type SerializedZipEditOp,
  type SerializedZipEditPlan
} from "./zip-edit-plan";

export type { ArchiveFormat } from "@archive/formats";

export {
  ZipArchive,
  type ZipOptions,
  type ZipEntryOptions,
  type ZipOptionsTar,
  type ZipOptionsZip,
  type ZipOperation,
  type ZipProgress,
  type ZipStreamOptions
} from "./zip-archive";

/**
 * Create a new archive
 *
 * @param options - Archive options including format
 * @returns ZipArchive or TarArchive depending on format option
 *
 * @example
 * ```ts
 * // Create ZIP archive (default)
 * const zipArchive = zip();
 * zipArchive.add("file.txt", "content");
 * const zipBytes = await zipArchive.bytes();
 *
 * // Create TAR archive
 * const tarArchive = zip({ format: "tar" });
 * tarArchive.add("file.txt", "content");
 * const tarBytes = await tarArchive.bytes();
 * ```
 */
export function zip(options: ZipOptionsTar): TarArchive;
export function zip(options?: ZipOptionsZip): ZipArchive;
export function zip(options?: ZipOptions): ZipArchive | TarArchive {
  return createArchive(options as any);
}
