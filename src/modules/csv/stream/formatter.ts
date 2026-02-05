/**
 * CSV Formatter Stream
 *
 * True streaming CSV formatter using cross-platform stream module.
 * Works identically in both Node.js and Browser environments.
 */

import { Transform } from "@stream";
import type { CsvFormatOptions, Row } from "../types";
import { createFormatConfig, formatRowWithLookup, type FormatConfig } from "../format";
import { extractRowValues, detectRowKeys, processColumns } from "../utils/row";

/**
 * Transform stream that formats rows to CSV
 *
 * @example
 * ```ts
 * const formatter = new CsvFormatterStream({ headers: ['name', 'age'] });
 * formatter.pipe(writable);
 * formatter.write(['Alice', 30]);
 * formatter.write(['Bob', 25]);
 * formatter.end();
 * ```
 */
export class CsvFormatterStream extends Transform {
  private options: CsvFormatOptions;
  /** Unified format configuration (shared with batch formatter) */
  private formatConfig: FormatConfig;
  private headerWritten: boolean = false;
  /** Keys to access data from source objects */
  private keys: string[] | null = null;
  /** Headers to write to output (may differ from keys) */
  private displayHeaders: string[] | null = null;
  /** Index of source row (before filtering), passed to transform.row */
  private sourceRowIndex: number = 0;
  /** Index of output data row (after filtering, excludes header), used for ctx.index */
  private outputRowIndex: number = 0;

  constructor(options: CsvFormatOptions = {}) {
    super({
      objectMode: options.objectMode !== false,
      writableObjectMode: options.objectMode !== false
    });
    this.options = options;

    // Use shared config factory (same as batch formatter)
    this.formatConfig = createFormatConfig(options);

    // Process columns config (takes precedence over headers)
    const columnsConfig = processColumns(options.columns);
    if (columnsConfig) {
      this.keys = columnsConfig.keys;
      this.displayHeaders = columnsConfig.headers;
    } else if (Array.isArray(options.headers)) {
      this.keys = options.headers;
      this.displayHeaders = options.headers;
    }
  }

  /**
   * Auto-detect keys/headers from a row (object or RowHashArray)
   */
  private detectHeadersFromRow(chunk: Row): void {
    const detectedKeys = detectRowKeys(chunk);
    if (detectedKeys.length > 0) {
      this.keys = detectedKeys;
      this.displayHeaders = detectedKeys;
    }
  }

  override _transform(
    chunk: Row,
    _encoding: string,
    callback: (error?: Error | null, data?: string) => void
  ): void {
    try {
      // Write BOM if first chunk
      if (!this.headerWritten && this.formatConfig.bom) {
        this.push("\uFEFF");
      }

      // Handle header writing on first row
      if (!this.headerWritten) {
        // Auto-detect headers from first row if needed
        if (this.options.headers === true && !this.keys) {
          this.detectHeadersFromRow(chunk);
        }

        // Write headers if we should and have them
        if (this.formatConfig.writeHeaders && this.displayHeaders) {
          this.push(this.formatRow(this.displayHeaders, true));
        }
        this.headerWritten = true;
      }

      // Apply row-level transform if provided
      let processedChunk: Row | null = chunk;
      const sourceIndex = this.sourceRowIndex++;
      if (this.formatConfig.typeTransform?.row) {
        processedChunk = this.formatConfig.typeTransform.row(chunk, sourceIndex);
        if (processedChunk === null) {
          callback();
          return;
        }
      }

      this.formatAndPush(processedChunk);
      this.outputRowIndex++;
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  override _flush(callback: (error?: Error | null) => void): void {
    // Handle writeHeaders: true with no data - still write headers
    if (!this.headerWritten && this.displayHeaders && this.formatConfig.writeHeaders) {
      if (this.formatConfig.bom) {
        this.push("\uFEFF");
      }
      this.push(this.formatRow(this.displayHeaders, true));
      this.headerWritten = true;
    }

    // Add trailing newline if trailingNewline is true
    // hasOutput = wrote header OR wrote any data row
    const hasOutput =
      (this.formatConfig.writeHeaders && this.displayHeaders) || this.outputRowIndex > 0;
    if (this.formatConfig.trailingNewline && hasOutput) {
      this.push(this.formatConfig.lineEnding);
    }

    callback();
  }

  private formatAndPush(chunk: Row): void {
    const row = extractRowValues(chunk, this.keys);
    this.push(this.formatRow(row, false));
  }

  private formatRow(row: unknown[], isHeader: boolean = false): string {
    const cfg = this.formatConfig;
    // Use pre-computed quote lookup for performance
    const quoteLookup = isHeader ? cfg.shouldQuoteHeader : cfg.shouldQuoteColumn;

    const formattedRow = formatRowWithLookup(row, cfg.regex, {
      quoteLookup,
      delimiter: cfg.delimiter,
      headers: this.displayHeaders ?? undefined,
      isHeader,
      outputRowIndex: this.outputRowIndex,
      quoteAll: cfg.quoteAll,
      escapeFormulae: cfg.escapeFormulae,
      decimalSeparator: cfg.decimalSeparator,
      transform: cfg.typeTransform
    });

    // Use row delimiter as prefix (except for first output)
    // First output = header row OR (no header AND first data row)
    const isFirstLine =
      isHeader || (!(cfg.writeHeaders && this.displayHeaders) && this.outputRowIndex === 0);
    return isFirstLine ? formattedRow : cfg.lineEnding + formattedRow;
  }
}

/**
 * Create formatter stream factory
 */
export function createCsvFormatterStream(options: CsvFormatOptions = {}): CsvFormatterStream {
  return new CsvFormatterStream(options);
}
