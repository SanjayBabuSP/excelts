/**
 * Node.js file system convenience layer for ZIP operations.
 *
 * This module provides a high-level API for working with ZIP files
 * on the file system.
 *
 * @example Create a ZIP from files and directories
 * ```ts
 * import { ZipFile } from "@archive/fs";
 *
 * const zip = new ZipFile();
 * zip.addFile("./readme.md");
 * zip.addDirectory("./src");
 * zip.addGlob("**\/*.json", { cwd: "./config" });
 * await zip.writeToFile("./output.zip");
 * ```
 *
 * @example Extract a ZIP file
 * ```ts
 * import { ZipFile } from "@archive/fs";
 *
 * const zip = await ZipFile.fromFile("./archive.zip");
 * await zip.extractTo("./output", { overwrite: "newer" });
 * ```
 *
 * @example Read ZIP contents
 * ```ts
 * import { ZipFile } from "@archive/fs";
 *
 * const zip = await ZipFile.fromFile("./archive.zip");
 * for (const entry of zip.getEntries()) {
 *   console.log(entry.path, entry.size);
 * }
 * const content = await zip.readAsText("readme.txt");
 * ```
 *
 * @module
 */

// Main class
export { ZipFile } from "./zip-file";

// Types
export type {
  OverwriteStrategy,
  AddFileOptions,
  AddDirectoryOptions,
  AddGlobOptions,
  ExtractOptions,
  ExtractProgress,
  ZipFileOptions,
  OpenZipOptions,
  WriteZipOptions,
  ZipEntryInfo
} from "./types";

// File system utilities (for advanced users)
export {
  traverseDirectory,
  traverseDirectorySync,
  glob,
  globSync,
  globToRegex,
  matchGlob,
  matchGlobAny,
  ensureDir,
  ensureDirSync,
  fileExists,
  fileExistsSync,
  readFileBytes,
  readFileBytesSync,
  writeFileBytes,
  writeFileBytesSync,
  setFileTime,
  setFileTimeSync,
  safeStats,
  safeStatsSync,
  readFileText,
  readFileTextSync,
  writeFileText,
  writeFileTextSync,
  remove,
  removeSync,
  copyFile,
  copyFileSync,
  createReadStream,
  createWriteStream,
  createTempDir,
  createTempDirSync,
  type FileEntry,
  type TraverseOptions,
  type GlobOptions,
  type ReadStreamOptions,
  type WriteStreamOptions
} from "@utils/fs";
