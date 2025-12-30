/**
 * CSV class for Node.js - Full streaming and file system support
 *
 * Features:
 * - readFile: Read from file path (streaming)
 * - writeFile: Write to file path (streaming)
 * - read: Read from Node.js stream
 * - write: Write to Node.js stream
 * - createReadStream: Create a readable stream from worksheet
 * - createWriteStream: Create a writable stream that writes to worksheet
 */

import fs from "fs";
import { type Readable, type Writable } from "stream";
import { fileExists } from "../utils/utils";
import {
  createDefaultValueMapper,
  createDefaultWriteMapper,
  type CsvReadOptions,
  type CsvWriteOptions
} from "./csv.base";
import { CsvParserStream, CsvFormatterStream, type CsvFormatterStreamOptions } from "./csv-stream";
import type { Workbook } from "../doc/workbook";
import type { Worksheet } from "../doc/worksheet";

/**
 * Extended read options for streaming
 */
export interface CsvStreamReadOptions extends CsvReadOptions {
  /** High water mark for stream (default: 64KB) */
  highWaterMark?: number;
}

/**
 * Extended write options for streaming
 */
export interface CsvStreamWriteOptions extends CsvWriteOptions {
  /** High water mark for stream (default: 64KB) */
  highWaterMark?: number;
}

class CSV {
  public workbook: Workbook;

  constructor(workbook: Workbook) {
    this.workbook = workbook;
  }

  /**
   * Read CSV from file using streaming
   *
   * @example
   * ```ts
   * const worksheet = await workbook.csv.readFile('data.csv');
   * ```
   */
  async readFile(filename: string, options?: CsvStreamReadOptions): Promise<Worksheet> {
    if (!(await fileExists(filename))) {
      throw new Error(`File not found: ${filename}`);
    }

    const readStream = fs.createReadStream(filename, {
      encoding: "utf8",
      highWaterMark: options?.highWaterMark ?? 64 * 1024
    });

    return this.read(readStream, options);
  }

  /**
   * Read CSV from Node.js readable stream
   *
   * Uses true streaming - processes data row by row without loading entire file into memory.
   *
   * @example
   * ```ts
   * const stream = fs.createReadStream('data.csv');
   * const worksheet = await workbook.csv.read(stream);
   * ```
   */
  async read(stream: Readable, options?: CsvReadOptions): Promise<Worksheet> {
    const worksheet = this.workbook.addWorksheet(options?.sheetName);

    const dateFormats =
      options?.dateFormats ??
      (["YYYY-MM-DD[T]HH:mm:ssZ", "YYYY-MM-DD[T]HH:mm:ss", "MM-DD-YYYY", "YYYY-MM-DD"] as const);

    const map = options?.map || createDefaultValueMapper(dateFormats, options?.parserOptions);

    const parser = new CsvParserStream(options?.parserOptions);

    return new Promise((resolve, reject) => {
      stream.pipe(parser);

      parser.on("data", (row: string[]) => {
        worksheet.addRow(row.map(map));
      });

      parser.on("end", () => {
        resolve(worksheet);
      });

      parser.on("error", reject);
      stream.on("error", reject);
    });
  }

  /**
   * Write CSV to file using streaming
   *
   * @example
   * ```ts
   * await workbook.csv.writeFile('output.csv');
   * ```
   */
  async writeFile(filename: string, options?: CsvStreamWriteOptions): Promise<void> {
    const writeStream = fs.createWriteStream(filename, {
      encoding: (options?.encoding || "utf8") as BufferEncoding,
      highWaterMark: options?.highWaterMark ?? 64 * 1024
    });

    return this.write(writeStream, options);
  }

  /**
   * Write CSV to Node.js writable stream
   *
   * Uses true streaming - writes data row by row.
   *
   * @example
   * ```ts
   * const stream = fs.createWriteStream('output.csv');
   * await workbook.csv.write(stream);
   * ```
   */
  async write(stream: Writable, options?: CsvWriteOptions): Promise<void> {
    const worksheet = this.workbook.getWorksheet(options?.sheetName || options?.sheetId);

    if (!worksheet) {
      stream.end();
      return;
    }

    const { dateFormat, dateUTC } = options || {};
    const map = options?.map || createDefaultWriteMapper(dateFormat, dateUTC);
    const includeEmptyRows = options?.includeEmptyRows !== false;

    const formatterOptions: CsvFormatterStreamOptions = {
      ...options?.formatterOptions
    };

    const formatter = new CsvFormatterStream(formatterOptions);
    formatter.pipe(stream);

    let lastRow = 1;

    worksheet.eachRow((row: any, rowNumber: number) => {
      // Add empty rows if needed
      if (includeEmptyRows) {
        while (lastRow++ < rowNumber - 1) {
          formatter.write([]);
        }
      }

      const { values } = row;
      values.shift(); // Remove first empty element (1-indexed)
      formatter.write(values.map(map));
      lastRow = rowNumber;
    });

    return new Promise((resolve, reject) => {
      formatter.on("error", reject);
      stream.on("error", reject);
      stream.on("finish", () => resolve());
      formatter.end();
    });
  }

  /**
   * Write CSV to buffer
   *
   * Note: This loads the entire CSV into memory. For large files, use write() with a stream.
   */
  async writeBuffer(options?: CsvWriteOptions): Promise<Buffer> {
    const chunks: Buffer[] = [];

    const { Writable } = await import("stream");

    const bufferStream = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding as BufferEncoding)
        );
        callback();
      }
    });

    await this.write(bufferStream, options);

    return Buffer.concat(chunks);
  }

  /**
   * Create a readable stream that outputs CSV rows from the worksheet
   *
   * @example
   * ```ts
   * const csvStream = workbook.csv.createReadStream();
   * csvStream.pipe(fs.createWriteStream('output.csv'));
   * ```
   */
  createReadStream(options?: CsvWriteOptions): Readable {
    const worksheet = this.workbook.getWorksheet(options?.sheetName || options?.sheetId);

    const { dateFormat, dateUTC } = options || {};
    const map = options?.map || createDefaultWriteMapper(dateFormat, dateUTC);
    const includeEmptyRows = options?.includeEmptyRows !== false;

    const formatterOptions: CsvFormatterStreamOptions = {
      ...options?.formatterOptions
    };

    const formatter = new CsvFormatterStream(formatterOptions);

    if (worksheet) {
      // Use setImmediate to allow piping before data flows
      setImmediate(() => {
        let lastRow = 1;

        worksheet.eachRow((row: any, rowNumber: number) => {
          if (includeEmptyRows) {
            while (lastRow++ < rowNumber - 1) {
              formatter.write([]);
            }
          }

          const { values } = row;
          values.shift();
          formatter.write(values.map(map));
          lastRow = rowNumber;
        });

        formatter.end();
      });
    } else {
      setImmediate(() => formatter.end());
    }

    return formatter;
  }

  /**
   * Create a writable stream that parses CSV and adds rows to a worksheet
   *
   * @example
   * ```ts
   * const csvWriter = workbook.csv.createWriteStream({ sheetName: 'Data' });
   * fs.createReadStream('input.csv').pipe(csvWriter);
   * await new Promise(resolve => csvWriter.on('finish', resolve));
   * ```
   */
  createWriteStream(options?: CsvReadOptions): Writable {
    const worksheet = this.workbook.addWorksheet(options?.sheetName);

    const dateFormats =
      options?.dateFormats ??
      (["YYYY-MM-DD[T]HH:mm:ssZ", "YYYY-MM-DD[T]HH:mm:ss", "MM-DD-YYYY", "YYYY-MM-DD"] as const);

    const map = options?.map || createDefaultValueMapper(dateFormats, options?.parserOptions);

    const parser = new CsvParserStream(options?.parserOptions);

    parser.on("data", (row: string[]) => {
      worksheet.addRow(row.map(map));
    });

    return parser;
  }
}

export { CSV };
export type { CsvReadOptions, CsvWriteOptions } from "./csv.base";
export { CsvParserStream, CsvFormatterStream } from "./csv-stream";
