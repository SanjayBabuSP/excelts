/**
 * CSV class - Node.js Version
 *
 * Extends browser CSV class with file system support.
 */

import { fileExists, createReadStream, createWriteStream } from "@utils/fs";
import { CSV as CSVBrowser, type CsvOptions } from "@csv/csv.browser";
import { CsvFileError } from "@csv/errors";
import type { Worksheet } from "@excel/worksheet";

class CSV extends CSVBrowser {
  override async readFile(filename: string, options?: CsvOptions): Promise<Worksheet> {
    if (!(await fileExists(filename))) {
      throw new CsvFileError(filename, "read", "file not found");
    }

    const readStream = createReadStream(filename, {
      encoding: "utf8",
      highWaterMark: options?.highWaterMark ?? 64 * 1024
    });

    return this.read(readStream, options);
  }

  override async writeFile(filename: string, options?: CsvOptions): Promise<void> {
    const writeStream = createWriteStream(filename, {
      encoding: (options?.encoding || "utf8") as BufferEncoding,
      highWaterMark: options?.highWaterMark ?? 64 * 1024
    });

    return this.write(writeStream, options);
  }
}

export { CSV };
export type { CsvOptions, CsvInput } from "@csv/csv.browser";
export { CsvParserStream, CsvFormatterStream } from "@csv/csv-stream";
export { detectDelimiter, detectLinebreak, stripBom, deduplicateHeaders } from "@csv/csv-core";
export type {
  CsvParseMeta,
  CsvParseResult,
  CsvParseError,
  CsvParseErrorCode,
  DynamicTypingConfig,
  ChunkMeta
} from "@csv/csv-core";
