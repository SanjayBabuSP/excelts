/**
 * File system utilities - Browser stubs.
 *
 * In browser environment, file system operations are not available.
 * This module provides stub implementations that throw helpful errors.
 *
 * @module
 */

// Re-export glob utilities from shared module (these work in browser)
export {
  globToRegex,
  matchGlob,
  matchGlobAny,
  createGlobMatcher,
  clearGlobCache,
  normalizePath
} from "./glob";

// =============================================================================
// Types (same as Node.js version for type compatibility)
// =============================================================================

/**
 * Information about a file system entry.
 */
export interface FileEntry {
  absolutePath: string;
  relativePath: string;
  isDirectory: boolean;
  size: number;
  mtime: Date;
}

export interface TraverseOptions {
  recursive?: boolean;
  followSymlinks?: boolean;
  filter?: (entry: FileEntry) => boolean;
}

export interface GlobOptions {
  cwd?: string;
  ignore?: string | string[];
  dot?: boolean;
  followSymlinks?: boolean;
  filter?: (entry: FileEntry) => boolean;
}

// =============================================================================
// Stub implementations
// =============================================================================

const NOT_AVAILABLE = "File system operations are not available in browser environment.";

export async function* traverseDirectory(
  _dirPath: string,
  _options?: TraverseOptions
): AsyncGenerator<FileEntry> {
  throw new Error(NOT_AVAILABLE);
  // Unreachable but required for generator typing
  yield undefined!;
}

export function traverseDirectorySync(_dirPath: string, _options?: TraverseOptions): FileEntry[] {
  throw new Error(NOT_AVAILABLE);
}

export async function* glob(_pattern: string, _options?: GlobOptions): AsyncGenerator<FileEntry> {
  throw new Error(NOT_AVAILABLE);
  // Unreachable but required for generator typing
  yield undefined!;
}

export function globSync(_pattern: string, _options?: GlobOptions): FileEntry[] {
  throw new Error(NOT_AVAILABLE);
}

export function fileExists(_filePath: string): Promise<boolean> {
  return Promise.resolve(false);
}

export function fileExistsSync(_filePath: string): boolean {
  return false;
}

export async function ensureDir(_dirPath: string): Promise<void> {
  throw new Error(NOT_AVAILABLE);
}

export function ensureDirSync(_dirPath: string): void {
  throw new Error(NOT_AVAILABLE);
}

export async function safeStats(_filePath: string): Promise<null> {
  return null;
}

export function safeStatsSync(_filePath: string): null {
  return null;
}

export async function readFileBytes(_filePath: string): Promise<Uint8Array> {
  throw new Error(NOT_AVAILABLE);
}

export function readFileBytesSync(_filePath: string): Uint8Array {
  throw new Error(NOT_AVAILABLE);
}

export async function writeFileBytes(_filePath: string, _data: Uint8Array): Promise<void> {
  throw new Error(NOT_AVAILABLE);
}

export function writeFileBytesSync(_filePath: string, _data: Uint8Array): void {
  throw new Error(NOT_AVAILABLE);
}

export async function setFileTime(_filePath: string, _mtime: Date): Promise<void> {
  throw new Error(NOT_AVAILABLE);
}

export function setFileTimeSync(_filePath: string, _mtime: Date): void {
  throw new Error(NOT_AVAILABLE);
}

export async function readFileText(_filePath: string, _encoding?: string): Promise<string> {
  throw new Error(NOT_AVAILABLE);
}

export function readFileTextSync(_filePath: string, _encoding?: string): string {
  throw new Error(NOT_AVAILABLE);
}

export async function writeFileText(
  _filePath: string,
  _content: string,
  _encoding?: string
): Promise<void> {
  throw new Error(NOT_AVAILABLE);
}

export function writeFileTextSync(_filePath: string, _content: string, _encoding?: string): void {
  throw new Error(NOT_AVAILABLE);
}

export async function remove(_targetPath: string): Promise<void> {
  throw new Error(NOT_AVAILABLE);
}

export function removeSync(_targetPath: string): void {
  throw new Error(NOT_AVAILABLE);
}

export async function copyFile(_src: string, _dest: string): Promise<void> {
  throw new Error(NOT_AVAILABLE);
}

export function copyFileSync(_src: string, _dest: string): void {
  throw new Error(NOT_AVAILABLE);
}

// =============================================================================
// File Streams (Browser stubs)
// =============================================================================

export interface ReadStreamOptions {
  encoding?: BufferEncoding | null;
  highWaterMark?: number;
  start?: number;
  end?: number;
  autoClose?: boolean;
}

export interface WriteStreamOptions {
  encoding?: BufferEncoding;
  highWaterMark?: number;
  flags?: string;
  mode?: number;
  autoClose?: boolean;
}

export function createReadStream(_filePath: string, _options?: ReadStreamOptions): never {
  throw new Error(NOT_AVAILABLE);
}

export function createWriteStream(_filePath: string, _options?: WriteStreamOptions): never {
  throw new Error(NOT_AVAILABLE);
}

export async function createTempDir(_prefix?: string): Promise<string> {
  throw new Error(NOT_AVAILABLE);
}

export function createTempDirSync(_prefix?: string): string {
  throw new Error(NOT_AVAILABLE);
}
