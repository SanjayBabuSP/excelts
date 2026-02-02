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
    const isAppend = options?.append && (await fileExists(filename));

    const writeStream = createWriteStream(filename, {
      encoding: (options?.encoding || "utf8") as BufferEncoding,
      highWaterMark: options?.highWaterMark ?? 64 * 1024,
      flags: options?.append ? "a" : "w"
    });

    // Append mode to existing file: write leading newline and skip headers
    if (isAppend) {
      const rowDelimiter = options?.rowDelimiter ?? "\n";
      writeStream.write(rowDelimiter);
      return this.write(writeStream, {
        ...options,
        writeHeaders: false
      });
    }

    return this.write(writeStream, options);
  }
}

export { CSV };
export type { CsvOptions, CsvInput } from "./csv.browser";
export { CsvParserStream, CsvFormatterStream } from "./csv-stream";
export { parseCsv } from "./parse";
export {
  parseCsvAsync,
  parseCsvStream,
  parseCsvWithProgress,
  type StreamParseMeta
} from "./parse-async";
export { formatCsv } from "./format";
export {
  detectDelimiter,
  detectLinebreak,
  stripBom,
  startsWithFormulaChar,
  escapeRegex,
  normalizeQuoteOption,
  normalizeEscapeOption
} from "./utils/detect";
export {
  deduplicateHeaders,
  deduplicateHeadersWithRenames,
  detectRowKeys,
  extractRowValues,
  isRowHashArray,
  rowHashArrayGet,
  rowHashArrayMapByHeaders,
  rowHashArrayToHeaders,
  rowHashArrayToMap,
  rowHashArrayToValues,
  processColumns
} from "./utils/row";
export { isFormattedValue, quoted, unquoted, type FormattedValue } from "./types";
export type {
  CsvParseOptions,
  CsvFormatOptions,
  CsvParseMeta,
  CsvParseResult,
  CsvParseError,
  CsvParseErrorCode,
  DynamicTypingConfig,
  ChunkMeta,
  TransformContext,
  TypeTransformMap,
  TransformResult,
  ColumnConfig
} from "./types";
