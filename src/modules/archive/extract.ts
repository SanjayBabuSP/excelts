/**
 * Simple ZIP extraction utilities
 * Provides easy-to-use Promise-based API for extracting ZIP files
 * Works in both Node.js and browser environments
 */

import { ZipParser, type ZipEntryInfo } from "./zip-parser";

/**
 * Extracted file entry
 */
export interface ExtractedFile {
  /** File path within the ZIP */
  path: string;
  /** File content as Uint8Array */
  data: Uint8Array;
  /** Whether this is a directory */
  isDirectory: boolean;
  /** Uncompressed size */
  size: number;
}

/**
 * Extract all files from a ZIP buffer
 *
 * @param zipData - ZIP file data as Buffer, Uint8Array, or ArrayBuffer
 * @returns Map of file paths to their content
 *
 * @example
 * ```ts
 * import { extractAll } from "./utils/unzip/extract";
 *
 * const zipData = fs.readFileSync("archive.zip");
 * const files = await extractAll(zipData);
 *
 * for (const [path, file] of files) {
 *   console.log(`${path}: ${file.data.length} bytes`);
 * }
 * ```
 */
export async function extractAll(
  zipData: Uint8Array | ArrayBuffer
): Promise<Map<string, ExtractedFile>> {
  const files = new Map<string, ExtractedFile>();
  const parser = new ZipParser(zipData);

  for (const entry of parser.getEntries()) {
    const data = await parser.extract(entry.path);
    files.set(entry.path, {
      path: entry.path,
      data: data || new Uint8Array(0),
      isDirectory: entry.isDirectory,
      size: entry.uncompressedSize
    });
  }

  return files;
}

/**
 * Extract a single file from a ZIP buffer
 *
 * @param zipData - ZIP file data as Buffer, Uint8Array, or ArrayBuffer
 * @param filePath - Path of the file to extract
 * @returns File content as Uint8Array, or null if not found
 *
 * @example
 * ```ts
 * import { extractFile } from "./utils/unzip/extract";
 *
 * const zipData = fs.readFileSync("archive.zip");
 * const content = await extractFile(zipData, "readme.txt");
 * if (content) {
 *   console.log(new TextDecoder().decode(content));
 * }
 * ```
 */
export async function extractFile(
  zipData: Uint8Array | ArrayBuffer,
  filePath: string
): Promise<Uint8Array | null> {
  const parser = new ZipParser(zipData);
  return parser.extract(filePath);
}

/**
 * List all file paths in a ZIP buffer (without extracting content)
 *
 * @param zipData - ZIP file data as Buffer, Uint8Array, or ArrayBuffer
 * @returns Array of file paths
 *
 * @example
 * ```ts
 * import { listFiles } from "./utils/unzip/extract";
 *
 * const zipData = fs.readFileSync("archive.zip");
 * const paths = await listFiles(zipData);
 * console.log(paths); // ["file1.txt", "folder/file2.txt", ...]
 * ```
 */
export async function listFiles(zipData: Uint8Array | ArrayBuffer): Promise<string[]> {
  const parser = new ZipParser(zipData);
  return parser.listFiles();
}

/**
 * Iterate over ZIP entries with a callback (memory efficient for large ZIPs)
 *
 * @param zipData - ZIP file data as Buffer, Uint8Array, or ArrayBuffer
 * @param callback - Async callback for each entry, return false to stop iteration
 *
 * @example
 * ```ts
 * import { forEachEntry } from "./utils/unzip/extract";
 *
 * await forEachEntry(zipData, async (path, getData) => {
 *   if (path.endsWith(".xml")) {
 *     const content = await getData();
 *     console.log(new TextDecoder().decode(content));
 *   }
 *   return true; // continue iteration
 * });
 * ```
 */
export async function forEachEntry(
  zipData: Uint8Array | ArrayBuffer,
  callback: (
    path: string,
    getData: () => Promise<Uint8Array>,
    entry: ZipEntryInfo
  ) => Promise<boolean | void>
): Promise<void> {
  const parser = new ZipParser(zipData);
  await parser.forEach(async (entry, getData) => {
    return callback(entry.path, getData, entry);
  });
}

// Re-export ZipParser for advanced usage
export { ZipParser, type ZipEntryInfo, type ZipParseOptions } from "./zip-parser";
