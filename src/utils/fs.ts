/**
 * File system utilities for Node.js.
 *
 * This module provides common file system operations used across the library,
 * including directory traversal, glob matching, and file I/O helpers.
 *
 * @module
 */

import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

// Re-export glob utilities from shared module
export {
  globToRegex,
  matchGlob,
  matchGlobAny,
  createGlobMatcher,
  clearGlobCache,
  normalizePath
} from "./glob";

// =============================================================================
// Types
// =============================================================================

/**
 * Information about a file system entry.
 */
export interface FileEntry {
  /** Absolute path on disk */
  absolutePath: string;

  /** Relative path from the base directory */
  relativePath: string;

  /** Whether this is a directory */
  isDirectory: boolean;

  /** File size in bytes (0 for directories) */
  size: number;

  /** Last modified time */
  mtime: Date;
}

/**
 * Options for directory traversal.
 */
export interface TraverseOptions {
  /** Recursively traverse subdirectories (default: true) */
  recursive?: boolean;

  /** Follow symbolic links (default: false) */
  followSymlinks?: boolean;

  /** Filter function */
  filter?: (entry: FileEntry) => boolean;
}

/**
 * Options for glob file matching.
 */
export interface GlobOptions {
  /** Current working directory */
  cwd?: string;

  /** Patterns to ignore */
  ignore?: string | string[];

  /** Include dot files (default: false) */
  dot?: boolean;

  /** Follow symbolic links (default: false) */
  followSymlinks?: boolean;

  /** Filter function */
  filter?: (entry: FileEntry) => boolean;
}

// =============================================================================
// Directory Traversal
// =============================================================================

/**
 * Build a FileEntry from stats.
 */
function buildFileEntry(absolutePath: string, relativePath: string, stats: fs.Stats): FileEntry {
  const isDirectory = stats.isDirectory();
  return {
    absolutePath,
    relativePath,
    isDirectory,
    size: isDirectory ? 0 : stats.size,
    mtime: stats.mtime
  };
}

/**
 * Check if an error is ignorable (file not found or permission denied).
 */
function isIgnorableError(err: any): boolean {
  return err.code === "ENOENT" || err.code === "EACCES";
}

/**
 * Recursively traverse a directory and yield file entries.
 *
 * @param dirPath - Directory to traverse
 * @param options - Traversal options
 * @yields File entries
 */
export async function* traverseDirectory(
  dirPath: string,
  options: TraverseOptions = {}
): AsyncGenerator<FileEntry> {
  const { recursive = true, followSymlinks = false, filter } = options;
  const basePath = path.resolve(dirPath);

  async function* walk(currentPath: string, relativeTo: string): AsyncGenerator<FileEntry> {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(currentPath, { withFileTypes: true });
    } catch (err: any) {
      if (isIgnorableError(err)) {
        return;
      }
      throw err;
    }

    // Sort entries for deterministic order
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const dirent of entries) {
      const absolutePath = path.join(currentPath, dirent.name);
      const relativePath = path.relative(relativeTo, absolutePath);

      let stats: fs.Stats;
      try {
        stats = followSymlinks ? await fsp.stat(absolutePath) : await fsp.lstat(absolutePath);
      } catch (err: any) {
        if (isIgnorableError(err)) {
          continue;
        }
        throw err;
      }

      // Skip symbolic links if not following them
      if (stats.isSymbolicLink() && !followSymlinks) {
        continue;
      }

      const entry = buildFileEntry(absolutePath, relativePath, stats);
      if (filter && !filter(entry)) {
        continue;
      }

      yield entry;

      if (entry.isDirectory && recursive) {
        yield* walk(absolutePath, relativeTo);
      }
    }
  }

  yield* walk(basePath, basePath);
}

/**
 * Synchronously traverse a directory.
 */
export function traverseDirectorySync(dirPath: string, options: TraverseOptions = {}): FileEntry[] {
  const { recursive = true, followSymlinks = false, filter } = options;
  const basePath = path.resolve(dirPath);
  const results: FileEntry[] = [];

  function walk(currentPath: string, relativeTo: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch (err: any) {
      if (isIgnorableError(err)) {
        return;
      }
      throw err;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const dirent of entries) {
      const absolutePath = path.join(currentPath, dirent.name);
      const relativePath = path.relative(relativeTo, absolutePath);

      let stats: fs.Stats;
      try {
        stats = followSymlinks ? fs.statSync(absolutePath) : fs.lstatSync(absolutePath);
      } catch (err: any) {
        if (isIgnorableError(err)) {
          continue;
        }
        throw err;
      }

      if (stats.isSymbolicLink() && !followSymlinks) {
        continue;
      }

      const entry = buildFileEntry(absolutePath, relativePath, stats);
      if (filter && !filter(entry)) {
        continue;
      }

      results.push(entry);

      if (entry.isDirectory && recursive) {
        walk(absolutePath, relativeTo);
      }
    }
  }

  walk(basePath, basePath);
  return results;
}

// =============================================================================
// Glob File Search
// =============================================================================

// Import glob utilities from shared module
import { createGlobMatcher, normalizePath } from "./glob";

/**
 * Parsed glob options with pre-compiled matchers.
 */
interface ParsedGlobOptions {
  basePath: string;
  searchBase: string;
  followSymlinks: boolean;
  filter?: (entry: FileEntry) => boolean;
  ignoreMatcher: ((path: string) => boolean) | null;
  patternMatcher: (path: string) => boolean;
}

/**
 * Parse glob options and pre-compile matchers.
 * Shared between glob() and globSync().
 */
function parseGlobOptions(pattern: string, options: GlobOptions): ParsedGlobOptions {
  const { cwd = process.cwd(), ignore, dot = false, followSymlinks = false, filter } = options;
  const ignorePatterns = ignore ? (Array.isArray(ignore) ? ignore : [ignore]) : [];
  const basePath = path.resolve(cwd);

  // Pre-compile matchers
  const ignoreMatcher =
    ignorePatterns.length > 0 ? createGlobMatcher(ignorePatterns, { dot }) : null;
  const patternMatcher = createGlobMatcher([pattern], { dot });

  // Determine the base directory from the pattern (static prefix optimization)
  const patternParts = pattern.split(/[/\\]/);
  let staticPrefix = "";
  for (const part of patternParts) {
    if (part.includes("*") || part.includes("?") || part.includes("[") || part.includes("{")) {
      break;
    }
    staticPrefix = staticPrefix ? path.join(staticPrefix, part) : part;
  }

  const searchBase = staticPrefix ? path.join(basePath, staticPrefix) : basePath;

  return { basePath, searchBase, followSymlinks, filter, ignoreMatcher, patternMatcher };
}

/**
 * Filter a file entry against glob matchers.
 * Returns the entry with normalized relativePath if matched, null otherwise.
 */
function matchGlobEntry(
  entry: FileEntry,
  basePath: string,
  ignoreMatcher: ((path: string) => boolean) | null,
  patternMatcher: (path: string) => boolean,
  filter?: (entry: FileEntry) => boolean
): FileEntry | null {
  const relativeFromCwd = normalizePath(path.relative(basePath, entry.absolutePath));

  // Skip directories
  if (entry.isDirectory) {
    return null;
  }

  // Check ignore patterns
  if (ignoreMatcher && ignoreMatcher(relativeFromCwd)) {
    return null;
  }

  // Check pattern match
  if (!patternMatcher(relativeFromCwd)) {
    return null;
  }

  // Apply custom filter
  if (filter && !filter(entry)) {
    return null;
  }

  return { ...entry, relativePath: relativeFromCwd };
}

/**
 * Find files matching a glob pattern.
 *
 * @param pattern - Glob pattern to match
 * @param options - Glob options
 * @yields Matching file entries
 */
export async function* glob(pattern: string, options: GlobOptions = {}): AsyncGenerator<FileEntry> {
  const { basePath, searchBase, followSymlinks, filter, ignoreMatcher, patternMatcher } =
    parseGlobOptions(pattern, options);

  // Check if search base exists
  try {
    await fsp.access(searchBase);
  } catch {
    return;
  }

  // Traverse and filter
  for await (const entry of traverseDirectory(searchBase, { followSymlinks })) {
    const matched = matchGlobEntry(entry, basePath, ignoreMatcher, patternMatcher, filter);
    if (matched) {
      yield matched;
    }
  }
}

/**
 * Synchronously find files matching a glob pattern.
 */
export function globSync(pattern: string, options: GlobOptions = {}): FileEntry[] {
  const { basePath, searchBase, followSymlinks, filter, ignoreMatcher, patternMatcher } =
    parseGlobOptions(pattern, options);

  try {
    fs.accessSync(searchBase);
  } catch {
    return [];
  }

  const results: FileEntry[] = [];
  const entries = traverseDirectorySync(searchBase, { followSymlinks });

  for (const entry of entries) {
    const matched = matchGlobEntry(entry, basePath, ignoreMatcher, patternMatcher, filter);
    if (matched) {
      results.push(matched);
    }
  }

  return results;
}

// =============================================================================
// File I/O Helpers
// =============================================================================

/**
 * Check if a file exists.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Synchronously check if a file exists.
 */
export function fileExistsSync(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fsp.mkdir(dirPath, { recursive: true });
  } catch (err: any) {
    if (err.code !== "EEXIST") {
      throw err;
    }
  }
}

/**
 * Synchronously ensure a directory exists.
 */
export function ensureDirSync(dirPath: string): void {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch (err: any) {
    if (err.code !== "EEXIST") {
      throw err;
    }
  }
}

/**
 * Get file stats, or null if file doesn't exist.
 */
export async function safeStats(filePath: string): Promise<fs.Stats | null> {
  try {
    return await fsp.stat(filePath);
  } catch {
    return null;
  }
}

/**
 * Synchronously get file stats, or null if file doesn't exist.
 */
export function safeStatsSync(filePath: string): fs.Stats | null {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

/**
 * Read a file as Uint8Array.
 */
export async function readFileBytes(filePath: string): Promise<Uint8Array> {
  const buffer = await fsp.readFile(filePath);
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/**
 * Synchronously read a file as Uint8Array.
 */
export function readFileBytesSync(filePath: string): Uint8Array {
  const buffer = fs.readFileSync(filePath);
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/**
 * Write bytes to a file.
 */
export async function writeFileBytes(filePath: string, data: Uint8Array): Promise<void> {
  await fsp.writeFile(filePath, data);
}

/**
 * Synchronously write bytes to a file.
 */
export function writeFileBytesSync(filePath: string, data: Uint8Array): void {
  fs.writeFileSync(filePath, data);
}

/**
 * Set file modification time.
 */
export async function setFileTime(filePath: string, mtime: Date): Promise<void> {
  await fsp.utimes(filePath, mtime, mtime);
}

/**
 * Synchronously set file modification time.
 */
export function setFileTimeSync(filePath: string, mtime: Date): void {
  fs.utimesSync(filePath, mtime, mtime);
}

/**
 * Read file as text.
 */
export async function readFileText(
  filePath: string,
  encoding: BufferEncoding = "utf8"
): Promise<string> {
  return fsp.readFile(filePath, { encoding });
}

/**
 * Synchronously read file as text.
 */
export function readFileTextSync(filePath: string, encoding: BufferEncoding = "utf8"): string {
  return fs.readFileSync(filePath, { encoding });
}

/**
 * Write text to a file.
 */
export async function writeFileText(
  filePath: string,
  content: string,
  encoding: BufferEncoding = "utf8"
): Promise<void> {
  await fsp.writeFile(filePath, content, { encoding });
}

/**
 * Synchronously write text to a file.
 */
export function writeFileTextSync(
  filePath: string,
  content: string,
  encoding: BufferEncoding = "utf8"
): void {
  fs.writeFileSync(filePath, content, { encoding });
}

/**
 * Remove a file or directory.
 */
export async function remove(targetPath: string): Promise<void> {
  try {
    await fsp.rm(targetPath, { recursive: true, force: true });
  } catch {
    // Ignore errors (file may not exist)
  }
}

/**
 * Synchronously remove a file or directory.
 */
export function removeSync(targetPath: string): void {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch {
    // Ignore errors (file may not exist)
  }
}

/**
 * Copy a file.
 */
export async function copyFile(src: string, dest: string): Promise<void> {
  await ensureDir(path.dirname(dest));
  await fsp.copyFile(src, dest);
}

/**
 * Synchronously copy a file.
 */
export function copyFileSync(src: string, dest: string): void {
  ensureDirSync(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

// =============================================================================
// File Streams
// =============================================================================

/**
 * Options for creating a read stream.
 */
export interface ReadStreamOptions {
  /** File encoding (default: none, returns Buffer) */
  encoding?: BufferEncoding | null;
  /** High water mark for internal buffer (default: 64KB) */
  highWaterMark?: number;
  /** Start position in bytes */
  start?: number;
  /** End position in bytes */
  end?: number;
  /** Auto close on end or error (default: true) */
  autoClose?: boolean;
}

/**
 * Options for creating a write stream.
 */
export interface WriteStreamOptions {
  /** File encoding (default: 'utf8') */
  encoding?: BufferEncoding;
  /** High water mark for internal buffer (default: 64KB) */
  highWaterMark?: number;
  /** File flags (default: 'w') */
  flags?: string;
  /** File mode (default: 0o666) */
  mode?: number;
  /** Auto close on end or error (default: true) */
  autoClose?: boolean;
}

/**
 * Create a readable stream from a file.
 *
 * @param filePath - Path to the file
 * @param options - Stream options
 * @returns A readable stream
 */
export function createReadStream(filePath: string, options?: ReadStreamOptions): fs.ReadStream {
  return fs.createReadStream(filePath, options);
}

/**
 * Create a writable stream to a file.
 *
 * @param filePath - Path to the file
 * @param options - Stream options
 * @returns A writable stream
 */
export function createWriteStream(filePath: string, options?: WriteStreamOptions): fs.WriteStream {
  return fs.createWriteStream(filePath, options);
}

/**
 * Create a temporary directory.
 *
 * @param prefix - Prefix for the directory name
 * @returns Path to the created directory
 */
export async function createTempDir(prefix: string = "tmp-"): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), prefix));
}

/**
 * Synchronously create a temporary directory.
 *
 * @param prefix - Prefix for the directory name
 * @returns Path to the created directory
 */
export function createTempDirSync(prefix: string = "tmp-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
