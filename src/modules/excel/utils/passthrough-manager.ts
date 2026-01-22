/**
 * PassthroughManager - Manages passthrough files for round-trip preservation
 *
 * This module handles files that are not fully parsed by the library but need to be
 * preserved during read/write cycles (e.g., charts, sparklines, slicers).
 */

// Pre-compiled regex patterns for content type detection (performance optimization)
const chartXmlRegex = /^xl\/charts\/chart\d+\.xml$/;
const chartStyleXmlRegex = /^xl\/charts\/style\d+\.xml$/;
const chartColorsXmlRegex = /^xl\/charts\/colors\d+\.xml$/;

/**
 * Content type definitions for passthrough files
 */
const PASSTHROUGH_CONTENT_TYPES: ReadonlyMap<RegExp, string> = new Map([
  [chartXmlRegex, "application/vnd.openxmlformats-officedocument.drawingml.chart+xml"],
  [chartStyleXmlRegex, "application/vnd.ms-office.chartstyle+xml"],
  [chartColorsXmlRegex, "application/vnd.ms-office.chartcolorstyle+xml"]
]);

/**
 * Passthrough path prefixes that should be preserved
 */
const PASSTHROUGH_PREFIXES = ["xl/charts/"] as const;

/**
 * Content type entry for ZIP content types
 */
export interface PassthroughContentType {
  partName: string;
  contentType: string;
}

/**
 * ZIP writer interface for passthrough files
 */
export interface IPassthroughZipWriter {
  append(data: Uint8Array, options: { name: string }): void;
}

/**
 * PassthroughManager handles storage and retrieval of passthrough files
 * that need to be preserved during Excel read/write cycles.
 */
export class PassthroughManager {
  private files: Map<string, Uint8Array> = new Map();

  /**
   * Check if a path should be treated as passthrough
   */
  static isPassthroughPath(path: string): boolean {
    return PASSTHROUGH_PREFIXES.some(prefix => path.startsWith(prefix));
  }

  /**
   * Get the content type for a passthrough file path
   * @returns Content type string or undefined if unknown
   */
  static getContentType(path: string): string | undefined {
    // Chart relationships are handled by Default extension="rels"
    if (path.startsWith("xl/charts/_rels/")) {
      return undefined;
    }

    for (const [regex, contentType] of PASSTHROUGH_CONTENT_TYPES) {
      if (regex.test(path)) {
        return contentType;
      }
    }

    return undefined;
  }

  /**
   * Add a file to passthrough storage
   */
  add(path: string, data: Uint8Array): void {
    this.files.set(path, data);
  }

  /**
   * Get a file from passthrough storage
   */
  get(path: string): Uint8Array | undefined {
    return this.files.get(path);
  }

  /**
   * Check if a file exists in passthrough storage
   */
  has(path: string): boolean {
    return this.files.has(path);
  }

  /**
   * Get all stored paths
   */
  getPaths(): string[] {
    return [...this.files.keys()];
  }

  /**
   * Get all files as a record (for serialization)
   */
  toRecord(): Record<string, Uint8Array> {
    const record: Record<string, Uint8Array> = {};
    for (const [path, data] of this.files) {
      record[path] = data;
    }
    return record;
  }

  /**
   * Load files from a record (for deserialization)
   */
  fromRecord(record: Record<string, Uint8Array>): void {
    this.files.clear();
    for (const [path, data] of Object.entries(record)) {
      this.files.set(path, data);
    }
  }

  /**
   * Get content types for all stored files that have known types
   */
  getContentTypes(): PassthroughContentType[] {
    const contentTypes: PassthroughContentType[] = [];

    for (const path of this.files.keys()) {
      const contentType = PassthroughManager.getContentType(path);
      if (contentType) {
        contentTypes.push({ partName: path, contentType });
      }
    }

    return contentTypes;
  }

  /**
   * Write all passthrough files to a ZIP writer
   */
  writeToZip(zip: IPassthroughZipWriter): void {
    for (const [path, data] of this.files) {
      zip.append(data, { name: path });
    }
  }

  /**
   * Clear all stored files
   */
  clear(): void {
    this.files.clear();
  }

  /**
   * Get the number of stored files
   */
  get size(): number {
    return this.files.size;
  }
}
