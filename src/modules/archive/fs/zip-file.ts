/**
 * Node.js file system convenience layer for ZIP operations.
 *
 * Provides a unified API similar to archiver and adm-zip for:
 * - Adding files/directories/globs to ZIP archives
 * - Extracting ZIP archives to disk
 * - Reading/writing ZIP files
 *
 * @module
 */

import * as path from "node:path";

import { ZipParser } from "@archive/unzip/zip-parser";
import { createZip, createZipSync, type ZipEntry } from "@archive/zip/zip-bytes";
import { concatUint8Arrays } from "@archive/utils/bytes";
import { joinZipPath, normalizeZipPath, type ZipPathOptions } from "@archive/zip/zip-path";

// Shared TextEncoder instance to avoid repeated instantiation
const textEncoder = new TextEncoder();

import type {
  AddFileOptions,
  AddDirectoryOptions,
  AddGlobOptions,
  ExtractOptions,
  ZipFileOptions,
  OpenZipOptions,
  WriteZipOptions,
  ZipEntryInfo,
  OverwriteStrategy
} from "./types";

import {
  type FileEntry,
  traverseDirectory,
  traverseDirectorySync,
  glob as globFiles,
  globSync as globFilesSync,
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
  safeStatsSync
} from "@utils/fs";

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Resolve effective ZIP path options for an operation.
 */
function resolveZipPathOptions(globalOptions: ZipFileOptions): ZipPathOptions {
  return {
    mode: "legacy",
    ...(globalOptions.path ?? {})
  };
}

type ZipModeOptions = { mode?: number };

function resolveEntryMode(
  kind: "file" | "directory",
  globalOptions: ZipFileOptions,
  localOptions?: ZipModeOptions,
  fsMode?: number
): number | undefined {
  if (!(globalOptions.writePermissions ?? false)) {
    return undefined;
  }

  if (localOptions?.mode !== undefined) {
    return localOptions.mode;
  }

  if ((globalOptions.preservePermissions ?? false) && fsMode !== undefined) {
    return fsMode;
  }

  if (kind === "directory") {
    return 0o040755;
  }
  return 0o100644;
}

function buildDirectoryEntry(
  zipPath: string,
  fsEntry: FileEntry,
  globalOptions: ZipFileOptions,
  localOptions: AddDirectoryOptions
): ZipEntry {
  return {
    name: zipPath + "/",
    data: new Uint8Array(0),
    level: 0,
    modTime: fsEntry.mtime,
    atime: fsEntry.atime,
    ctime: fsEntry.ctime,
    birthTime: fsEntry.birthTime,
    mode: resolveEntryMode("directory", globalOptions, localOptions, fsEntry.mode),
    msDosAttributes: localOptions.msDosAttributes
  };
}

/**
 * Check for path traversal attack and throw if detected.
 */
function assertNoPathTraversal(targetPath: string, baseDir: string, entryPath: string): void {
  if (!targetPath.startsWith(baseDir + path.sep) && targetPath !== baseDir) {
    throw new Error(`Path traversal detected: ${entryPath}`);
  }
}

/**
 * Core logic for shouldExtract - shared between async and sync versions.
 */
function shouldExtractCore(
  exists: boolean,
  entryMtime: Date,
  strategy: OverwriteStrategy,
  targetPath: string,
  getStats: () => { mtime: Date } | null
): boolean {
  if (!exists) {
    return true;
  }

  switch (strategy) {
    case "skip":
      return false;

    case "overwrite":
      return true;

    case "error":
      throw new Error(`File already exists: ${targetPath}`);

    case "newer": {
      const stats = getStats();
      if (!stats) {
        return true;
      }
      return entryMtime > stats.mtime;
    }

    default:
      throw new Error(`Unknown overwrite strategy: ${strategy}`);
  }
}

/**
 * Check if extraction should proceed based on overwrite strategy.
 */
async function shouldExtract(
  targetPath: string,
  entryMtime: Date,
  strategy: OverwriteStrategy
): Promise<boolean> {
  const exists = await fileExists(targetPath);
  // For "newer" strategy we need to fetch stats lazily
  if (strategy === "newer" && exists) {
    const stats = await safeStats(targetPath);
    return shouldExtractCore(exists, entryMtime, strategy, targetPath, () => stats);
  }
  return shouldExtractCore(exists, entryMtime, strategy, targetPath, () => null);
}

/**
 * Synchronous version of shouldExtract.
 */
function shouldExtractSync(
  targetPath: string,
  entryMtime: Date,
  strategy: OverwriteStrategy
): boolean {
  const exists = fileExistsSync(targetPath);
  return shouldExtractCore(exists, entryMtime, strategy, targetPath, () =>
    safeStatsSync(targetPath)
  );
}

/**
 * Collect all chunks from an async iterable or ReadableStream.
 */
async function collectStream(
  stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];

  // Handle ReadableStream
  if ("getReader" in stream) {
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  } else {
    // Handle AsyncIterable
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
  }

  return concatUint8Arrays(chunks);
}

/**
 * Convert AddDirectoryOptions/AddGlobOptions filter to FileEntry filter.
 * The public API uses (path, {isDirectory, size}) but internal traversal uses FileEntry.
 */
type TraverseFilter = (entry: {
  relativePath: string;
  isDirectory: boolean;
  size: number;
}) => boolean;

function wrapFilter(
  filter: ((path: string, stats: { isDirectory: boolean; size: number }) => boolean) | undefined
): TraverseFilter | undefined {
  return filter
    ? e => filter(e.relativePath, { isDirectory: e.isDirectory, size: e.size })
    : undefined;
}

/**
 * Build a ZipEntry from common parameters.
 * This helper is used by toBuffer/toBufferSync to reduce code duplication.
 */
function buildZipEntry(
  name: string,
  data: Uint8Array,
  entryOptions: AddFileOptions,
  globalOptions: ZipFileOptions,
  globalPassword: string | Uint8Array | undefined,
  fsMetadata?: {
    modTime?: Date;
    mode?: number;
    atime?: Date;
    ctime?: Date;
    birthTime?: Date;
  }
): ZipEntry {
  const mode = resolveEntryMode("file", globalOptions, entryOptions, fsMetadata?.mode);

  const externalAttributes = entryOptions.externalAttributes;

  return {
    name,
    data,
    level: entryOptions.level ?? globalOptions.level,
    modTime: entryOptions.modTime ?? fsMetadata?.modTime ?? new Date(),
    atime: entryOptions.atime ?? fsMetadata?.atime,
    ctime: entryOptions.ctime ?? fsMetadata?.ctime,
    birthTime: entryOptions.birthTime ?? fsMetadata?.birthTime,
    comment: entryOptions.comment,
    encryptionMethod: entryOptions.encryptionMethod ?? globalOptions.encryptionMethod,
    password: entryOptions.password ?? globalPassword,
    mode,
    msDosAttributes: entryOptions.msDosAttributes,
    externalAttributes
  };
}

/**
 * Build a ZipEntry for an updated existing entry.
 */
function buildUpdatedEntry(
  existingEntry: { path: string; comment: string; externalAttributes: number },
  updated: { data: Uint8Array; options?: AddFileOptions },
  globalOptions: ZipFileOptions,
  globalPassword: string | Uint8Array | undefined
): ZipEntry {
  const externalAttributes =
    updated.options?.externalAttributes ??
    (updated.options?.mode !== undefined ? undefined : existingEntry.externalAttributes);

  return {
    name: existingEntry.path,
    data: updated.data,
    level: updated.options?.level ?? globalOptions.level,
    modTime: updated.options?.modTime ?? new Date(),
    comment: updated.options?.comment ?? existingEntry.comment,
    encryptionMethod: updated.options?.encryptionMethod ?? globalOptions.encryptionMethod,
    password: updated.options?.password ?? globalPassword,
    mode: updated.options?.mode,
    msDosAttributes: updated.options?.msDosAttributes,
    externalAttributes
  };
}

/**
 * Build a ZipEntry for preserving an existing entry (no update).
 */
function buildPreservedEntry(
  existingEntry: { path: string; lastModified: Date; comment: string; externalAttributes: number },
  data: Uint8Array,
  globalOptions: ZipFileOptions,
  globalPassword: string | Uint8Array | undefined
): ZipEntry {
  return {
    name: existingEntry.path,
    data,
    level: globalOptions.level,
    modTime: existingEntry.lastModified,
    comment: existingEntry.comment,
    encryptionMethod: globalOptions.encryptionMethod,
    password: globalPassword,
    externalAttributes: existingEntry.externalAttributes
  };
}

/**
 * Build a symlink ZipEntry.
 */
function buildSymlinkEntry(zipPath: string, target: string, mode?: number): ZipEntry {
  return {
    name: zipPath,
    data: textEncoder.encode(target),
    level: 0,
    modTime: new Date(),
    mode: mode ?? 0o120777
  };
}

/**
 * Check overwrite strategy and return whether to proceed.
 * Also resolves the target path.
 */
function checkOverwriteStrategy(
  exists: boolean,
  targetPath: string,
  overwrite: OverwriteStrategy
): boolean {
  if (!exists) {
    return true;
  }

  switch (overwrite) {
    case "skip":
      return false;
    case "error":
      throw new Error(`File already exists: ${targetPath}`);
    case "overwrite":
    case "newer":
      return true;
    default:
      throw new Error(`Unknown overwrite strategy: ${overwrite}`);
  }
}

// =============================================================================
// Pending Entry Types
// =============================================================================

interface PendingFileEntry {
  type: "file";
  localPath: string;
  zipPath: string;
  options: AddFileOptions;
}

interface PendingBufferEntry {
  type: "buffer";
  data: Uint8Array;
  zipPath: string;
  options: AddFileOptions;
}

interface PendingStreamEntry {
  type: "stream";
  stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>;
  zipPath: string;
  options: AddFileOptions;
}

interface PendingDirectoryEntry {
  type: "directory";
  localPath: string;
  options: AddDirectoryOptions;
}

interface PendingGlobEntry {
  type: "glob";
  pattern: string;
  options: AddGlobOptions;
}

interface PendingSymlinkEntry {
  type: "symlink";
  zipPath: string;
  target: string;
  mode?: number;
}

type PendingEntry =
  | PendingFileEntry
  | PendingBufferEntry
  | PendingStreamEntry
  | PendingDirectoryEntry
  | PendingGlobEntry
  | PendingSymlinkEntry;

// =============================================================================
// ZipFile Class
// =============================================================================

/**
 * High-level ZIP file operations for Node.js.
 *
 * Provides a convenient API for creating, reading, and modifying ZIP archives
 * with direct file system integration.
 *
 * @example Create a ZIP from files
 * ```ts
 * const zip = new ZipFile();
 * zip.addFile("./src/index.ts");
 * zip.addDirectory("./lib");
 * zip.addGlob("**\/*.json", { cwd: "./config" });
 * await zip.writeToFile("./output.zip");
 * ```
 *
 * @example Extract a ZIP to disk
 * ```ts
 * const zip = await ZipFile.fromFile("./archive.zip");
 * await zip.extractTo("./output", { overwrite: "newer" });
 * ```
 *
 * @example Read ZIP contents
 * ```ts
 * const zip = await ZipFile.fromFile("./archive.zip");
 * for (const entry of zip.getEntries()) {
 *   console.log(entry.path, entry.size);
 * }
 * const content = await zip.readAsText("readme.txt");
 * ```
 */
export class ZipFile {
  private _options: ZipFileOptions;
  private _pendingEntries: PendingEntry[] = [];
  private _zipData: Uint8Array | null = null;
  private _parser: ZipParser | null = null;
  private _sourcePath: string | null = null;
  private _password: string | Uint8Array | undefined;
  // Track deleted entries (by path)
  private _deletedEntries: Set<string> = new Set();
  // Track updated entries (path -> new data)
  private _updatedEntries: Map<string, { data: Uint8Array; options?: AddFileOptions }> = new Map();
  // AbortController for cancellation
  private _abortController: AbortController | null = null;
  // Track bytes written (for pointer())
  private _bytesWritten: number = 0;

  /**
   * Create a new ZipFile for building an archive.
   */
  constructor(options: ZipFileOptions = {}) {
    this._options = options;
    this._password = options.password;
  }

  /**
   * Get the ZIP creation options for createZip/createZipSync.
   */
  private _getCreateZipOptions() {
    return {
      level: this._options.level,
      timestamps: this._options.timestamps,
      comment: this._options.comment,
      zip64: this._options.zip64,
      modTime: this._options.modTime,
      reproducible: this._options.reproducible,
      smartStore: this._options.smartStore,
      encryptionMethod: this._options.encryptionMethod,
      password: this._password
    };
  }

  /**
   * Initialize a ZipFile from existing ZIP data.
   * Internal helper for fromFile/fromFileSync/fromBuffer.
   */
  private _initFromData(
    data: Uint8Array,
    password?: string | Uint8Array,
    sourcePath?: string
  ): void {
    this._zipData = data;
    this._parser = new ZipParser(data, { password });
    this._password = password;
    if (sourcePath) {
      this._sourcePath = sourcePath;
    }
  }

  // ===========================================================================
  // Static Factory Methods
  // ===========================================================================

  /**
   * Open an existing ZIP file from disk.
   *
   * @param filePath - Path to the ZIP file
   * @param options - Options for opening the ZIP
   * @returns ZipFile instance for reading
   */
  static async fromFile(filePath: string, options: OpenZipOptions = {}): Promise<ZipFile> {
    const data = await readFileBytes(filePath);
    const zip = new ZipFile();
    zip._initFromData(data, options.password, path.resolve(filePath));
    return zip;
  }

  /**
   * Synchronously open an existing ZIP file from disk.
   */
  static fromFileSync(filePath: string, options: OpenZipOptions = {}): ZipFile {
    const data = readFileBytesSync(filePath);
    const zip = new ZipFile();
    zip._initFromData(data, options.password, path.resolve(filePath));
    return zip;
  }

  /**
   * Create a ZipFile from an existing buffer.
   *
   * @param data - ZIP file data
   * @param options - Options for opening the ZIP
   * @returns ZipFile instance for reading
   */
  static fromBuffer(data: Uint8Array | ArrayBuffer, options: OpenZipOptions = {}): ZipFile {
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    const zip = new ZipFile();
    zip._initFromData(bytes, options.password);
    return zip;
  }

  // ===========================================================================
  // Add Files
  // ===========================================================================

  /**
   * Add a single file to the archive.
   *
   * @param localPath - Path to the file on disk
   * @param options - Options for adding the file
   * @returns this for chaining
   *
   * @example
   * ```ts
   * zip.addFile("./src/index.ts");
   * zip.addFile("./readme.md", { name: "README.md", level: 9 });
   * ```
   */
  addFile(localPath: string, options: AddFileOptions = {}): this {
    const resolvedPath = path.resolve(localPath);
    const pathOptions = resolveZipPathOptions(this._options);
    const zipPath = joinZipPath(
      pathOptions,
      options.prefix ?? "",
      options.name ?? path.basename(localPath)
    );

    this._pendingEntries.push({
      type: "file",
      localPath: resolvedPath,
      zipPath,
      options
    });

    return this;
  }

  /**
   * Add a file from a local path with a custom archive path.
   *
   * Similar to adm-zip's addLocalFile().
   *
   * @param localPath - Path to the file on disk
   * @param zipPath - Path within the archive (defaults to file basename)
   * @param comment - Optional file comment
   * @returns this for chaining
   */
  addLocalFile(localPath: string, zipPath?: string, comment?: string): this {
    return this.addFile(localPath, {
      name: zipPath ?? path.basename(localPath),
      comment
    });
  }

  /**
   * Add data from a buffer.
   *
   * @param data - File data
   * @param zipPath - Path within the archive
   * @param options - Options for the entry
   * @returns this for chaining
   */
  addBuffer(data: Uint8Array, zipPath: string, options: AddFileOptions = {}): this {
    const pathOptions = resolveZipPathOptions(this._options);
    this._pendingEntries.push({
      type: "buffer",
      data,
      zipPath: normalizeZipPath(zipPath, pathOptions),
      options
    });
    return this;
  }

  /**
   * Add a text file from a string.
   *
   * @param content - Text content
   * @param zipPath - Path within the archive
   * @param options - Options for the entry
   * @returns this for chaining
   */
  addText(content: string, zipPath: string, options: AddFileOptions = {}): this {
    return this.addBuffer(textEncoder.encode(content), zipPath, options);
  }

  /**
   * Add data from an async iterable or ReadableStream.
   *
   * Similar to archiver's append() with a stream.
   *
   * @param stream - Async iterable or ReadableStream
   * @param zipPath - Path within the archive
   * @param options - Options for the entry
   * @returns this for chaining
   *
   * @example
   * ```ts
   * import { createReadStream } from "node:fs";
   * import { Readable } from "node:stream";
   *
   * const nodeStream = createReadStream("./large-file.bin");
   * zip.appendStream(Readable.toWeb(nodeStream), "data/file.bin");
   * ```
   */
  appendStream(
    stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>,
    zipPath: string,
    options: AddFileOptions = {}
  ): this {
    const pathOptions = resolveZipPathOptions(this._options);
    this._pendingEntries.push({
      type: "stream",
      stream,
      zipPath: normalizeZipPath(zipPath, pathOptions),
      options
    });
    return this;
  }

  /**
   * Add a symbolic link entry.
   *
   * Similar to archiver's symlink().
   *
   * @param filepath - Path in the archive
   * @param target - Target path the symlink points to
   * @param mode - Optional Unix mode (default: 0o120777)
   * @returns this for chaining
   *
   * @example
   * ```ts
   * zip.symlink("lib/current", "lib/v2.0.0");
   * ```
   */
  symlink(filepath: string, target: string, mode?: number): this {
    const pathOptions = resolveZipPathOptions(this._options);
    this._pendingEntries.push({
      type: "symlink",
      zipPath: normalizeZipPath(filepath, pathOptions),
      target,
      mode
    });
    return this;
  }

  // ===========================================================================
  // Add Directories
  // ===========================================================================

  /**
   * Add an entire directory to the archive.
   *
   * @param localPath - Path to the directory on disk
   * @param options - Options for adding the directory
   * @returns this for chaining
   *
   * @example
   * ```ts
   * zip.addDirectory("./src");
   * zip.addDirectory("./lib", { prefix: "vendor", recursive: false });
   * ```
   */
  addDirectory(localPath: string, options: AddDirectoryOptions = {}): this {
    this._pendingEntries.push({
      type: "directory",
      localPath: path.resolve(localPath),
      options
    });
    return this;
  }

  /**
   * Add a local folder to the archive.
   *
   * Similar to adm-zip's addLocalFolder().
   *
   * @param localPath - Path to the folder on disk
   * @param zipPath - Prefix path in the archive (defaults to folder name)
   * @param filter - Optional filter function
   * @returns this for chaining
   */
  addLocalFolder(localPath: string, zipPath?: string, filter?: (path: string) => boolean): this {
    return this.addDirectory(localPath, {
      prefix: zipPath ?? path.basename(localPath),
      includeRoot: false,
      filter
    });
  }

  /**
   * Add a local folder recursively with custom filter.
   *
   * Similar to adm-zip's addLocalFolderAsync().
   *
   * @param localPath - Path to the folder on disk
   * @param zipPath - Prefix path in the archive
   * @param filter - Optional filter regex or function
   * @returns this for chaining
   */
  addLocalFolderPromise(
    localPath: string,
    options?: {
      zipPath?: string;
      filter?: RegExp | ((path: string) => boolean);
    }
  ): this {
    const filter = options?.filter;
    const filterFn = filter
      ? typeof filter === "function"
        ? filter
        : (p: string) => filter.test(p)
      : undefined;

    return this.addDirectory(localPath, {
      prefix: options?.zipPath ?? path.basename(localPath),
      includeRoot: false,
      filter: filterFn
    });
  }

  // ===========================================================================
  // Add Glob Patterns
  // ===========================================================================

  /**
   * Add files matching a glob pattern.
   *
   * @param pattern - Glob pattern to match
   * @param options - Options for glob matching
   * @returns this for chaining
   *
   * @example
   * ```ts
   * zip.addGlob("**\/*.ts", { cwd: "./src" });
   * zip.addGlob("*.json", { cwd: "./config", ignore: "secret.json" });
   * ```
   */
  addGlob(pattern: string, options: AddGlobOptions = {}): this {
    this._pendingEntries.push({
      type: "glob",
      pattern,
      options
    });
    return this;
  }

  /**
   * Add files matching a glob pattern.
   *
   * Similar to archiver's glob() method.
   *
   * @param pattern - Glob pattern
   * @param options - Glob options
   * @returns this for chaining
   */
  glob(
    pattern: string,
    options?: {
      cwd?: string;
      ignore?: string | string[];
      prefix?: string;
      dot?: boolean;
    }
  ): this {
    return this.addGlob(pattern, options);
  }

  // ===========================================================================
  // Modify Archive (Delete/Update Entries)
  // ===========================================================================

  /**
   * Delete an entry from the archive.
   *
   * Similar to adm-zip's deleteFile().
   *
   * @param entryPath - Path of the entry to delete
   * @returns true if entry was found and marked for deletion
   *
   * @example
   * ```ts
   * const zip = await ZipFile.fromFile("./archive.zip");
   * zip.deleteEntry("old-file.txt");
   * await zip.writeToFile("./archive.zip", { overwrite: "overwrite" });
   * ```
   */
  deleteEntry(entryPath: string): boolean {
    const normalizedPath = normalizeZipPath(entryPath, resolveZipPathOptions(this._options));

    // Check if entry exists in original archive
    if (this._parser?.hasEntry(normalizedPath)) {
      this._deletedEntries.add(normalizedPath);
      // Also remove from updated entries if present
      this._updatedEntries.delete(normalizedPath);
      return true;
    }

    // Check if entry exists in pending entries
    const index = this._pendingEntries.findIndex(
      e => "zipPath" in e && e.zipPath === normalizedPath
    );

    if (index >= 0) {
      this._pendingEntries.splice(index, 1);
      return true;
    }

    return false;
  }

  /**
   * Delete a file from the archive (adm-zip compatible alias).
   *
   * @param entry - Entry path or entry object
   * @returns true if entry was deleted
   */
  deleteFile(entry: string | ZipEntryInfo): boolean {
    const entryPath = typeof entry === "string" ? entry : entry.path;
    return this.deleteEntry(entryPath);
  }

  /**
   * Update the content of an existing entry.
   *
   * Similar to adm-zip's updateFile().
   *
   * @param entryPath - Path of the entry to update
   * @param data - New content (Uint8Array or string)
   * @param options - Options for the updated entry
   * @returns true if entry was found and marked for update
   *
   * @example
   * ```ts
   * const zip = await ZipFile.fromFile("./archive.zip");
   * zip.updateEntry("config.json", JSON.stringify(newConfig));
   * await zip.writeToFile("./archive.zip", { overwrite: "overwrite" });
   * ```
   */
  updateEntry(entryPath: string, data: Uint8Array | string, options: AddFileOptions = {}): boolean {
    const normalizedPath = normalizeZipPath(entryPath, resolveZipPathOptions(this._options));
    const bytes = typeof data === "string" ? textEncoder.encode(data) : data;

    // Check if entry exists in original archive
    if (this._parser?.hasEntry(normalizedPath)) {
      // Remove from deleted entries if present
      this._deletedEntries.delete(normalizedPath);
      this._updatedEntries.set(normalizedPath, { data: bytes, options });
      return true;
    }

    // Check if entry exists in pending entries
    const index = this._pendingEntries.findIndex(
      e => "zipPath" in e && e.zipPath === normalizedPath
    );

    if (index >= 0) {
      // Replace with updated buffer entry
      this._pendingEntries[index] = {
        type: "buffer",
        data: bytes,
        zipPath: normalizedPath,
        options
      };
      return true;
    }

    return false;
  }

  /**
   * Update a file in the archive (adm-zip compatible alias).
   *
   * @param entry - Entry path or entry object
   * @param content - New content (Uint8Array)
   * @returns true if entry was updated
   */
  updateFile(entry: string | ZipEntryInfo, content: Uint8Array): boolean {
    const entryPath = typeof entry === "string" ? entry : entry.path;
    return this.updateEntry(entryPath, content);
  }

  // ===========================================================================
  // Build Archive
  // ===========================================================================

  /**
   * Build the ZIP archive and return as a buffer.
   *
   * @returns ZIP file data
   * @throws Error if the operation is aborted
   */
  async toBuffer(): Promise<Uint8Array> {
    // Create abort controller for this operation
    this._abortController = new AbortController();
    const signal = this._abortController.signal;

    // Reset bytes counter
    this._bytesWritten = 0;

    // Check if we can return cached data
    if (this._zipData && !this.hasPendingChanges()) {
      this._abortController = null;
      return this._zipData;
    }

    // Helper to check abort status
    const checkAbort = () => {
      if (signal.aborted) {
        throw new Error("Operation aborted");
      }
    };

    // Collect all entries
    const entries: ZipEntry[] = [];

    // If we have an existing archive, include its entries (with modifications applied)
    if (this._parser) {
      for (const existingEntry of this._parser.getEntries()) {
        checkAbort();

        // Skip deleted entries
        if (this._deletedEntries.has(existingEntry.path)) {
          continue;
        }

        // Check for updated content
        const updated = this._updatedEntries.get(existingEntry.path);
        if (updated) {
          entries.push(buildUpdatedEntry(existingEntry, updated, this._options, this._password));
          this._bytesWritten += updated.data.length;
        } else {
          // Extract original data
          const data = await this._parser.extract(existingEntry.path, this._password);
          if (data) {
            entries.push(buildPreservedEntry(existingEntry, data, this._options, this._password));
            this._bytesWritten += data.length;
          }
        }
      }
    }

    // Process pending entries
    for (const pending of this._pendingEntries) {
      checkAbort();

      switch (pending.type) {
        case "file": {
          const data = await readFileBytes(pending.localPath);
          const stats = await safeStats(pending.localPath);
          entries.push(
            buildZipEntry(pending.zipPath, data, pending.options, this._options, this._password, {
              modTime: stats?.mtime,
              mode: stats?.mode,
              atime: stats?.atime,
              ctime: stats?.ctime,
              birthTime: stats?.birthtime
            })
          );
          this._bytesWritten += data.length;
          break;
        }

        case "buffer": {
          entries.push(
            buildZipEntry(
              pending.zipPath,
              pending.data,
              pending.options,
              this._options,
              this._password
            )
          );
          this._bytesWritten += pending.data.length;
          break;
        }

        case "stream": {
          const data = await collectStream(pending.stream);
          entries.push(
            buildZipEntry(pending.zipPath, data, pending.options, this._options, this._password)
          );
          this._bytesWritten += data.length;
          break;
        }

        case "symlink": {
          const symlinkEntry = buildSymlinkEntry(pending.zipPath, pending.target, pending.mode);
          entries.push(symlinkEntry);
          this._bytesWritten += symlinkEntry.data.length;
          break;
        }

        case "directory": {
          const { prefix, includeRoot = true, recursive = true, filter } = pending.options;
          const dirName = path.basename(pending.localPath);
          const basePrefix = prefix ?? (includeRoot ? dirName : "");
          const pathOptions = resolveZipPathOptions(this._options);

          for await (const entry of traverseDirectory(pending.localPath, {
            recursive,
            followSymlinks: pending.options.followSymlinks,
            filter: wrapFilter(filter)
          })) {
            checkAbort();

            const zipPath = joinZipPath(pathOptions, basePrefix, entry.relativePath);

            if (entry.isDirectory) {
              entries.push(buildDirectoryEntry(zipPath, entry, this._options, pending.options));
            } else {
              const data = await readFileBytes(entry.absolutePath);
              entries.push(
                buildZipEntry(zipPath, data, pending.options, this._options, this._password, {
                  modTime: entry.mtime,
                  mode: entry.mode,
                  atime: entry.atime,
                  ctime: entry.ctime,
                  birthTime: entry.birthTime
                })
              );
              this._bytesWritten += data.length;
            }
          }
          break;
        }

        case "glob": {
          const { cwd, prefix, ignore, dot, followSymlinks, filter } = pending.options;
          const pathOptions = resolveZipPathOptions(this._options);

          for await (const entry of globFiles(pending.pattern, {
            cwd,
            ignore,
            dot,
            followSymlinks,
            filter: wrapFilter(filter)
          })) {
            checkAbort();

            const zipPath = joinZipPath(pathOptions, prefix ?? "", entry.relativePath);
            const data = await readFileBytes(entry.absolutePath);
            entries.push(
              buildZipEntry(zipPath, data, pending.options, this._options, this._password, {
                modTime: entry.mtime,
                mode: entry.mode,
                atime: entry.atime,
                ctime: entry.ctime,
                birthTime: entry.birthTime
              })
            );
            this._bytesWritten += data.length;
          }
          break;
        }
      }
    }

    checkAbort();

    // Build ZIP
    this._zipData = await createZip(entries, this._getCreateZipOptions());

    // Update bytes written to final ZIP size
    this._bytesWritten = this._zipData.length;

    // Clear pending changes after building
    this._pendingEntries = [];
    this._deletedEntries.clear();
    this._updatedEntries.clear();
    this._abortController = null;

    return this._zipData;
  }

  /**
   * Synchronously build the ZIP archive.
   *
   * Note: This method doesn't support async encryption (AES) or stream entries.
   * Use toBuffer() for AES-encrypted archives or stream entries.
   */
  toBufferSync(): Uint8Array {
    // Check if we can return cached data
    if (this._zipData && !this.hasPendingChanges()) {
      return this._zipData;
    }

    // Check for stream entries which can't be processed synchronously
    const hasStreamEntry = this._pendingEntries.some(e => e.type === "stream");
    if (hasStreamEntry) {
      throw new Error("Stream entries cannot be processed synchronously. Use toBuffer() instead.");
    }

    const entries: ZipEntry[] = [];

    // If we have an existing archive, include its entries (with modifications applied)
    if (this._parser) {
      for (const existingEntry of this._parser.getEntries()) {
        // Skip deleted entries
        if (this._deletedEntries.has(existingEntry.path)) {
          continue;
        }

        // Check for updated content
        const updated = this._updatedEntries.get(existingEntry.path);
        if (updated) {
          entries.push(buildUpdatedEntry(existingEntry, updated, this._options, this._password));
        } else {
          // Extract original data synchronously
          const data = this._parser.extractSync(existingEntry.path, this._password);
          if (data) {
            entries.push(buildPreservedEntry(existingEntry, data, this._options, this._password));
          }
        }
      }
    }

    // Process pending entries
    for (const pending of this._pendingEntries) {
      switch (pending.type) {
        case "file": {
          const data = readFileBytesSync(pending.localPath);
          const stats = safeStatsSync(pending.localPath);
          entries.push(
            buildZipEntry(pending.zipPath, data, pending.options, this._options, this._password, {
              modTime: stats?.mtime,
              mode: stats?.mode,
              atime: stats?.atime,
              ctime: stats?.ctime,
              birthTime: stats?.birthtime
            })
          );
          break;
        }

        case "buffer": {
          entries.push(
            buildZipEntry(
              pending.zipPath,
              pending.data,
              pending.options,
              this._options,
              this._password
            )
          );
          break;
        }

        case "symlink": {
          entries.push(buildSymlinkEntry(pending.zipPath, pending.target, pending.mode));
          break;
        }

        case "directory": {
          const { prefix, includeRoot = true, recursive = true, filter } = pending.options;
          const dirName = path.basename(pending.localPath);
          const basePrefix = prefix ?? (includeRoot ? dirName : "");
          const pathOptions = resolveZipPathOptions(this._options);

          for (const entry of traverseDirectorySync(pending.localPath, {
            recursive,
            followSymlinks: pending.options.followSymlinks,
            filter: wrapFilter(filter)
          })) {
            const zipPath = joinZipPath(pathOptions, basePrefix, entry.relativePath);

            if (entry.isDirectory) {
              entries.push(buildDirectoryEntry(zipPath, entry, this._options, pending.options));
            } else {
              const data = readFileBytesSync(entry.absolutePath);
              entries.push(
                buildZipEntry(zipPath, data, pending.options, this._options, this._password, {
                  modTime: entry.mtime,
                  mode: entry.mode,
                  atime: entry.atime,
                  ctime: entry.ctime,
                  birthTime: entry.birthTime
                })
              );
            }
          }
          break;
        }

        case "glob": {
          const { cwd, prefix, ignore, dot, followSymlinks, filter } = pending.options;
          const pathOptions = resolveZipPathOptions(this._options);

          for (const entry of globFilesSync(pending.pattern, {
            cwd,
            ignore,
            dot,
            followSymlinks,
            filter: wrapFilter(filter)
          })) {
            const zipPath = joinZipPath(pathOptions, prefix ?? "", entry.relativePath);
            const data = readFileBytesSync(entry.absolutePath);
            entries.push(
              buildZipEntry(zipPath, data, pending.options, this._options, this._password, {
                modTime: entry.mtime,
                mode: entry.mode,
                atime: entry.atime,
                ctime: entry.ctime,
                birthTime: entry.birthTime
              })
            );
          }
          break;
        }

        case "stream":
          // Already checked above, but TypeScript needs this
          throw new Error("Stream entries cannot be processed synchronously.");
      }
    }

    this._zipData = createZipSync(entries, this._getCreateZipOptions());

    // Clear pending changes after building
    this._pendingEntries = [];
    this._deletedEntries.clear();
    this._updatedEntries.clear();

    return this._zipData;
  }

  // ===========================================================================
  // Write to File
  // ===========================================================================

  /**
   * Write the ZIP archive to a file.
   *
   * @param filePath - Target file path
   * @param options - Write options
   */
  async writeToFile(filePath: string, options: WriteZipOptions = {}): Promise<void> {
    const { overwrite = "error" } = options;
    const targetPath = path.resolve(filePath);

    const exists = await fileExists(targetPath);
    if (!checkOverwriteStrategy(exists, targetPath, overwrite)) {
      return; // skip
    }

    const data = await this.toBuffer();
    await ensureDir(path.dirname(targetPath));
    await writeFileBytes(targetPath, data);
  }

  /**
   * Synchronously write the ZIP archive to a file.
   *
   * Similar to adm-zip's writeZip().
   */
  writeToFileSync(filePath: string, options: WriteZipOptions = {}): void {
    const { overwrite = "error" } = options;
    const targetPath = path.resolve(filePath);

    const exists = fileExistsSync(targetPath);
    if (!checkOverwriteStrategy(exists, targetPath, overwrite)) {
      return; // skip
    }

    const data = this.toBufferSync();
    ensureDirSync(path.dirname(targetPath));
    writeFileBytesSync(targetPath, data);
  }

  /**
   * Write ZIP to file (adm-zip compatible alias).
   */
  writeZip(targetFileName?: string): void {
    if (targetFileName) {
      this.writeToFileSync(targetFileName, { overwrite: "overwrite" });
    } else if (this._sourcePath) {
      this.writeToFileSync(this._sourcePath, { overwrite: "overwrite" });
    } else {
      throw new Error("No target file specified");
    }
  }

  // ===========================================================================
  // Read Archive Contents
  // ===========================================================================

  /**
   * Get list of entries in the archive.
   */
  getEntries(): ZipEntryInfo[] {
    if (!this._parser) {
      throw new Error("Cannot read entries: archive not loaded. Use fromFile() or fromBuffer().");
    }

    return this._parser.getEntries().map(e => ({
      path: e.path,
      isDirectory: e.isDirectory,
      size: e.uncompressedSize,
      compressedSize: e.compressedSize,
      lastModified: e.lastModified,
      crc32: e.crc32,
      isEncrypted: e.isEncrypted,
      encryptionMethod:
        e.encryptionMethod === "aes"
          ? "aes"
          : e.encryptionMethod === "zipcrypto"
            ? "zipcrypto"
            : undefined,
      aesKeyStrength: e.aesKeyStrength,
      comment: e.comment
    }));
  }

  /**
   * Get entry names (file paths).
   */
  getEntryNames(): string[] {
    return this.getEntries().map(e => e.path);
  }

  /**
   * Check if an entry exists.
   */
  hasEntry(entryPath: string): boolean {
    if (!this._parser) {
      return false;
    }
    return this._parser.hasEntry(entryPath);
  }

  /**
   * Get a specific entry's info.
   */
  getEntry(entryPath: string): ZipEntryInfo | null {
    const entries = this.getEntries();
    return entries.find(e => e.path === entryPath) ?? null;
  }

  /**
   * Read an entry as a buffer.
   *
   * @param entryPath - Path within the archive
   * @param password - Optional password override
   */
  async readEntry(entryPath: string, password?: string | Uint8Array): Promise<Uint8Array | null> {
    if (!this._parser) {
      throw new Error("Cannot read entry: archive not loaded.");
    }
    return this._parser.extract(entryPath, password ?? this._password);
  }

  /**
   * Synchronously read an entry.
   *
   * Note: AES-encrypted entries cannot be read synchronously.
   */
  readEntrySync(entryPath: string, password?: string | Uint8Array): Uint8Array | null {
    if (!this._parser) {
      throw new Error("Cannot read entry: archive not loaded.");
    }
    return this._parser.extractSync(entryPath, password ?? this._password);
  }

  /**
   * Read an entry as text.
   */
  async readAsText(entryPath: string, encoding?: string): Promise<string | null> {
    const data = await this.readEntry(entryPath);
    if (!data) {
      return null;
    }
    return new TextDecoder(encoding).decode(data);
  }

  /**
   * Synchronously read an entry as text.
   */
  readAsTextSync(entryPath: string, encoding?: string): string | null {
    const data = this.readEntrySync(entryPath);
    if (!data) {
      return null;
    }
    return new TextDecoder(encoding).decode(data);
  }

  // ===========================================================================
  // Extract Archive
  // ===========================================================================

  /**
   * Extract all entries to a directory.
   *
   * @param targetDir - Target directory path
   * @param options - Extract options
   */
  async extractTo(targetDir: string, options: ExtractOptions = {}): Promise<void> {
    if (!this._parser) {
      throw new Error("Cannot extract: archive not loaded. Use fromFile() or fromBuffer().");
    }

    const {
      overwrite = "error",
      filter,
      preserveTimestamps = true,
      password,
      signal,
      onProgress
    } = options;

    const resolvedTarget = path.resolve(targetDir);
    const entries = this._parser.getEntries();
    const totalEntries = entries.length;
    let extractedEntries = 0;
    let bytesWritten = 0;

    for (const entry of entries) {
      // Check abort signal
      if (signal?.aborted) {
        throw new Error("Extraction aborted");
      }

      // Apply filter
      if (filter && !filter(entry.path, entry.isDirectory)) {
        continue;
      }

      const targetPath = path.join(resolvedTarget, entry.path);
      assertNoPathTraversal(targetPath, resolvedTarget, entry.path);

      if (entry.isDirectory) {
        await ensureDir(targetPath);
      } else {
        // Check overwrite strategy
        if (!(await shouldExtract(targetPath, entry.lastModified, overwrite))) {
          continue;
        }

        // Ensure parent directory exists
        await ensureDir(path.dirname(targetPath));

        // Extract
        const data = await this._parser.extract(entry.path, password ?? this._password);
        if (data) {
          await writeFileBytes(targetPath, data);
          bytesWritten += data.length;

          // Preserve timestamps
          if (preserveTimestamps) {
            await setFileTime(targetPath, entry.lastModified);
          }
        }
      }

      extractedEntries++;

      // Report progress
      if (onProgress) {
        onProgress({
          currentEntry: entry.path,
          totalEntries,
          extractedEntries,
          bytesWritten
        });
      }
    }
  }

  /**
   * Synchronously extract all entries to a directory.
   *
   * Note: AES-encrypted archives cannot be extracted synchronously.
   *
   * Similar to adm-zip's extractAllTo().
   */
  extractToSync(targetDir: string, options: ExtractOptions = {}): void {
    if (!this._parser) {
      throw new Error("Cannot extract: archive not loaded.");
    }

    const { overwrite = "error", filter, preserveTimestamps = true, password } = options;

    const resolvedTarget = path.resolve(targetDir);
    const entries = this._parser.getEntries();

    for (const entry of entries) {
      if (filter && !filter(entry.path, entry.isDirectory)) {
        continue;
      }

      const targetPath = path.join(resolvedTarget, entry.path);
      assertNoPathTraversal(targetPath, resolvedTarget, entry.path);

      if (entry.isDirectory) {
        ensureDirSync(targetPath);
      } else {
        if (!shouldExtractSync(targetPath, entry.lastModified, overwrite)) {
          continue;
        }

        ensureDirSync(path.dirname(targetPath));

        const data = this._parser.extractSync(entry.path, password ?? this._password);
        if (data) {
          writeFileBytesSync(targetPath, data);

          if (preserveTimestamps) {
            setFileTimeSync(targetPath, entry.lastModified);
          }
        }
      }
    }
  }

  /**
   * Extract all to directory (adm-zip compatible alias).
   *
   * @param targetPath - Target directory
   * @param overwrite - Whether to overwrite existing files
   */
  extractAllTo(targetPath: string, overwrite = false): void {
    this.extractToSync(targetPath, {
      overwrite: overwrite ? "overwrite" : "error"
    });
  }

  /**
   * Extract all entries asynchronously (adm-zip compatible alias).
   */
  extractAllToAsync(targetPath: string, overwrite = false): Promise<void> {
    return this.extractTo(targetPath, {
      overwrite: overwrite ? "overwrite" : "error"
    });
  }

  /**
   * Extract a single entry to a file.
   *
   * @param entryPath - Path within the archive
   * @param targetPath - Target file path
   * @param options - Extract options
   */
  async extractEntryTo(
    entryPath: string,
    targetPath: string,
    options: ExtractOptions = {}
  ): Promise<boolean> {
    if (!this._parser) {
      throw new Error("Cannot extract: archive not loaded.");
    }

    const entry = this._parser.getEntry(entryPath);
    if (!entry) {
      return false;
    }

    const { overwrite = "error", preserveTimestamps = true, password } = options;
    const resolvedTarget = path.resolve(targetPath);

    if (entry.isDirectory) {
      await ensureDir(resolvedTarget);
      return true;
    }

    if (!(await shouldExtract(resolvedTarget, entry.lastModified, overwrite))) {
      return false;
    }

    await ensureDir(path.dirname(resolvedTarget));

    const data = await this._parser.extract(entryPath, password ?? this._password);
    if (data) {
      await writeFileBytes(resolvedTarget, data);

      if (preserveTimestamps) {
        await setFileTime(resolvedTarget, entry.lastModified);
      }
    }

    return true;
  }

  /**
   * Synchronously extract a single entry to a file.
   */
  extractEntryToSync(entryPath: string, targetPath: string, options: ExtractOptions = {}): boolean {
    if (!this._parser) {
      throw new Error("Cannot extract: archive not loaded.");
    }

    const entry = this._parser.getEntry(entryPath);
    if (!entry) {
      return false;
    }

    const { overwrite = "error", preserveTimestamps = true, password } = options;
    const resolvedTarget = path.resolve(targetPath);

    if (entry.isDirectory) {
      ensureDirSync(resolvedTarget);
      return true;
    }

    if (!shouldExtractSync(resolvedTarget, entry.lastModified, overwrite)) {
      return false;
    }

    ensureDirSync(path.dirname(resolvedTarget));

    const data = this._parser.extractSync(entryPath, password ?? this._password);
    if (data) {
      writeFileBytesSync(resolvedTarget, data);

      if (preserveTimestamps) {
        setFileTimeSync(resolvedTarget, entry.lastModified);
      }
    }

    return true;
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Set the password for encrypted entries.
   */
  setPassword(password: string | Uint8Array | undefined): void {
    this._password = password;
    if (this._parser) {
      this._parser.setPassword(password);
    }
  }

  /**
   * Check if the archive contains encrypted entries.
   */
  hasEncryptedEntries(): boolean {
    if (!this._parser) {
      return false;
    }
    return this._parser.hasEncryptedEntries();
  }

  /**
   * Get the number of entries in the archive.
   */
  get entryCount(): number {
    if (this._parser) {
      return this._parser.getEntries().length;
    }
    return this._pendingEntries.length;
  }

  /**
   * Get the archive comment.
   *
   * Similar to adm-zip's getZipComment().
   *
   * @returns Archive comment string (empty if none)
   */
  getZipComment(): string {
    if (this._parser) {
      return this._parser.getZipComment();
    }
    return this._options.comment ?? "";
  }

  /**
   * Set or update the archive comment.
   *
   * Similar to adm-zip's addZipComment().
   *
   * @param comment - Comment string
   */
  addZipComment(comment: string): this {
    this._options.comment = comment;
    return this;
  }

  /**
   * Get the comment for a specific entry.
   *
   * Similar to adm-zip's getZipEntryComment().
   *
   * @param entryPath - Path of the entry
   * @returns Entry comment or null if entry not found
   */
  getZipEntryComment(entryPath: string): string | null {
    const entry = this.getEntry(entryPath);
    return entry?.comment ?? null;
  }

  /**
   * Check if there are pending modifications (adds/deletes/updates).
   */
  hasPendingChanges(): boolean {
    return (
      this._pendingEntries.length > 0 ||
      this._deletedEntries.size > 0 ||
      this._updatedEntries.size > 0
    );
  }

  /**
   * Get the source file path if the archive was loaded from disk.
   */
  get sourcePath(): string | null {
    return this._sourcePath;
  }

  /**
   * Abort the current operation.
   *
   * Similar to archiver's abort() method. This will cancel any in-progress
   * build or extraction operation.
   *
   * @returns this for chaining
   *
   * @example
   * ```ts
   * const zip = new ZipFile();
   * zip.addDirectory("./large-folder");
   *
   * // Start building in background
   * const buildPromise = zip.toBuffer();
   *
   * // Abort after 5 seconds
   * setTimeout(() => zip.abort(), 5000);
   *
   * try {
   *   await buildPromise;
   * } catch (e) {
   *   console.log("Build was aborted");
   * }
   * ```
   */
  abort(): this {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    return this;
  }

  /**
   * Check if the current operation has been aborted.
   */
  get aborted(): boolean {
    return this._abortController?.signal.aborted ?? false;
  }

  /**
   * Get the number of bytes written so far.
   *
   * Similar to archiver's pointer() method. This is useful for
   * tracking progress during archive creation.
   *
   * @returns Number of bytes in the current archive data
   *
   * @example
   * ```ts
   * const zip = new ZipFile();
   * zip.addFile("./large-file.bin");
   * await zip.toBuffer();
   * console.log(`Archive size: ${zip.pointer()} bytes`);
   * ```
   */
  pointer(): number {
    // If we have built ZIP data, return its length
    if (this._zipData) {
      return this._zipData.length;
    }
    // Otherwise return tracked bytes
    return this._bytesWritten;
  }

  /**
   * Get the AbortSignal for the current operation.
   * This is used internally but can also be accessed for advanced use cases.
   */
  getAbortSignal(): AbortSignal | undefined {
    return this._abortController?.signal;
  }
}
