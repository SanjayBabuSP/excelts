/**
 * CSV class - Node.js Version
 *
 * Extends browser CSV class with file system support.
 */

import { fileExists, createReadStream, createWriteStream } from "@utils/fs";
import {
  CSV as CSVBrowser,
  type CsvStreamReadOptions,
  type CsvStreamWriteOptions
} from "@csv/csv.browser";
import type { Worksheet } from "@excel/worksheet";

class CSV extends CSVBrowser {
  override async readFile(filename: string, options?: CsvStreamReadOptions): Promise<Worksheet> {
    if (!(await fileExists(filename))) {
      throw new Error(`File not found: ${filename}`);
    }

    const readStream = createReadStream(filename, {
      encoding: "utf8",
      highWaterMark: options?.highWaterMark ?? 64 * 1024
    });

    return this.read(readStream, options);
  }

  override async writeFile(filename: string, options?: CsvStreamWriteOptions): Promise<void> {
    const writeStream = createWriteStream(filename, {
      encoding: (options?.encoding || "utf8") as BufferEncoding,
      highWaterMark: options?.highWaterMark ?? 64 * 1024
    });

    return this.write(writeStream, options);
  }
}

export { CSV };
export type {
  CsvReadOptions,
  CsvWriteOptions,
  CsvStreamReadOptions,
  CsvStreamWriteOptions
} from "@csv/csv.browser";
export { CsvParserStream, CsvFormatterStream } from "@csv/csv-stream";
