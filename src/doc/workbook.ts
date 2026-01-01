/**
 * Workbook - Cross-platform Excel Workbook
 *
 * Full functionality:
 * - xlsx: File/stream/buffer support (file operations Node.js only)
 * - csv: CSV read/write support (file operations Node.js only)
 * - streaming: createStreamWriter/createStreamReader for large files
 *
 * Note: Browser build uses rolldown aliases to swap in browser-specific
 * implementations for xlsx, csv, and stream modules.
 */

import { Worksheet, type WorksheetModel } from "./worksheet";
import { DefinedNames, type DefinedNameModel } from "./defined-names";
import { XLSX } from "../xlsx/xlsx";
import { CSV } from "../modules/csv/csv";
import { WorkbookWriter, type WorkbookWriterOptions } from "../stream/workbook-writer";
import { WorkbookReader, type WorkbookReaderOptions } from "../stream/workbook-reader";
import type { Readable } from "../modules/stream";
import type { PivotTable } from "./pivot-table";
import type {
  AddWorksheetOptions,
  CalculationProperties,
  Image,
  WorkbookProperties,
  WorkbookView,
  Buffer as ExcelBuffer
} from "../types";

// =============================================================================
// Internal Types
// =============================================================================

/** Internal media type - more flexible than public Media type */
export interface WorkbookMedia {
  type: string;
  extension: string;
  filename?: string;
  buffer?: ExcelBuffer | Uint8Array;
  base64?: string;
  name?: string;
}

/** Internal model type for serialization */
export interface WorkbookModel {
  creator?: string;
  lastModifiedBy?: string;
  lastPrinted?: Date;
  created: Date;
  modified: Date;
  properties: Partial<WorkbookProperties>;
  worksheets: WorksheetModel[];
  sheets?: WorksheetModel[];
  definedNames: DefinedNameModel[];
  views: WorkbookView[];
  company: string;
  manager: string;
  title: string;
  subject: string;
  keywords: string;
  category: string;
  description: string;
  language?: string;
  revision?: number;
  contentStatus?: string;
  themes?: unknown;
  media: WorkbookMedia[];
  pivotTables: PivotTable[];
  /** Loaded pivot tables from file - used during reconciliation */
  loadedPivotTables?: any[];
  calcProperties: Partial<CalculationProperties>;
}

// =============================================================================
// Workbook Class
// =============================================================================

class Workbook {
  // ===========================================================================
  // Static Properties
  // ===========================================================================

  /**
   * Streaming workbook writer class for large files.
   * @example
   * // Node.js: new Workbook.Writer({ filename: "large.xlsx" })
   * // Browser: new Workbook.Writer({ stream: writableStream })
   */
  static Writer = WorkbookWriter;

  /**
   * Streaming workbook reader class for large files.
   * @example
   * // Node.js: new Workbook.Reader("large.xlsx")
   * // Browser: new Workbook.Reader(readableStream)
   */
  static Reader = WorkbookReader;

  // ===========================================================================
  // Instance Properties - Metadata
  // ===========================================================================

  declare public category: string;
  declare public company: string;
  declare public created: Date;
  declare public description: string;
  declare public keywords: string;
  declare public manager: string;
  declare public modified: Date;
  declare public subject: string;
  declare public title: string;
  declare public creator?: string;
  declare public lastModifiedBy?: string;
  declare public lastPrinted?: Date;
  declare public language?: string;
  declare public revision?: number;
  declare public contentStatus?: string;

  // ===========================================================================
  // Instance Properties - Data
  // ===========================================================================

  declare public properties: Partial<WorkbookProperties>;
  declare public calcProperties: Partial<CalculationProperties>;
  declare public views: WorkbookView[];
  declare public media: WorkbookMedia[];
  declare public pivotTables: PivotTable[];

  // ===========================================================================
  // Private Properties
  // ===========================================================================

  declare private _worksheets: Worksheet[];
  declare private _definedNames: DefinedNames;
  declare private _themes?: unknown;
  private _xlsx?: XLSX;
  private _csv?: CSV;

  // ===========================================================================
  // Constructor
  // ===========================================================================

  constructor() {
    this.category = "";
    this.company = "";
    this.created = new Date();
    this.description = "";
    this.keywords = "";
    this.manager = "";
    this.modified = this.created;
    this.properties = {};
    this.calcProperties = {};
    this._worksheets = [];
    this.subject = "";
    this.title = "";
    this.views = [];
    this.media = [];
    this.pivotTables = [];
    this._definedNames = new DefinedNames();
  }

  // ===========================================================================
  // Format Operations (xlsx, csv)
  // ===========================================================================

  /**
   * xlsx file format operations
   * Node.js: readFile, writeFile, read (stream), write (stream), load (buffer), writeBuffer
   * Browser: load (buffer), writeBuffer
   */
  get xlsx(): XLSX {
    if (!this._xlsx) {
      this._xlsx = new XLSX(this);
    }
    return this._xlsx;
  }

  /**
   * csv file format operations
   * Node.js: readFile, writeFile, read (stream), write (stream)
   * Browser: load (string/buffer), writeString, writeBuffer
   */
  get csv(): CSV {
    if (!this._csv) {
      this._csv = new CSV(this as any);
    }
    return this._csv;
  }

  // ===========================================================================
  // Static Factory Methods for Streaming
  // ===========================================================================

  /**
   * Create a streaming workbook writer for large files.
   * This is more memory-efficient than using Workbook for large datasets.
   *
   * @param options - Options for the workbook writer
   *   - Node.js: can use { filename } or { stream }
   *   - Browser: must use { stream }
   * @returns A new WorkbookWriter instance
   *
   * @example
   * ```ts
   * // Node.js with filename
   * const writer = Workbook.createStreamWriter({ filename: "large-file.xlsx" });
   *
   * // Browser or Node.js with stream
   * const writer = Workbook.createStreamWriter({ stream: writableStream });
   *
   * const sheet = writer.addWorksheet("Sheet1");
   * for (let i = 0; i < 1000000; i++) {
   *   sheet.addRow([i, `Row ${i}`]).commit();
   * }
   * await writer.commit();
   * ```
   */
  static createStreamWriter(options?: WorkbookWriterOptions): WorkbookWriter {
    return new WorkbookWriter(options);
  }

  /**
   * Create a streaming workbook reader for large files.
   * This is more memory-efficient than using Workbook.xlsx.readFile for large datasets.
   *
   * @param input - File path (Node.js only) or readable stream
   * @param options - Options for the workbook reader
   * @returns A new WorkbookReader instance
   *
   * @example
   * ```ts
   * // Node.js with file path
   * const reader = Workbook.createStreamReader("large-file.xlsx");
   *
   * // Browser or Node.js with stream
   * const reader = Workbook.createStreamReader(readableStream);
   *
   * for await (const event of reader) {
   *   if (event.eventType === "worksheet") {
   *     const worksheet = event.value;
   *     for await (const row of worksheet) {
   *       console.log(row.values);
   *     }
   *   }
   * }
   * ```
   */
  static createStreamReader(
    input: string | Readable,
    options?: WorkbookReaderOptions
  ): WorkbookReader {
    return new WorkbookReader(input, options);
  }

  // ===========================================================================
  // Worksheet Management
  // ===========================================================================

  get nextId(): number {
    // Find the next unique spot to add worksheet
    for (let i = 1; i < this._worksheets.length; i++) {
      if (!this._worksheets[i]) {
        return i;
      }
    }
    return this._worksheets.length || 1;
  }

  /**
   * Add a new worksheet and return a reference to it
   */
  addWorksheet(name?: string, options?: AddWorksheetOptions): Worksheet {
    const id = this.nextId;

    const lastOrderNo = this._worksheets.reduce(
      (acc, ws) => ((ws && ws.orderNo) > acc ? ws.orderNo : acc),
      0
    );
    const worksheetOptions = {
      ...options,
      id,
      name,
      orderNo: lastOrderNo + 1,
      workbook: this as any
    };

    const worksheet = new Worksheet(worksheetOptions);

    this._worksheets[id] = worksheet;
    return worksheet;
  }

  removeWorksheetEx(worksheet: Worksheet): void {
    delete this._worksheets[worksheet.id];
  }

  removeWorksheet(id: number | string): void {
    const worksheet = this.getWorksheet(id);
    if (worksheet) {
      worksheet.destroy();
    }
  }

  /**
   * Fetch sheet by name or id
   */
  getWorksheet(id?: number | string): Worksheet | undefined {
    if (id === undefined) {
      return this._worksheets.find(Boolean);
    }
    if (typeof id === "number") {
      return this._worksheets[id];
    }
    if (typeof id === "string") {
      return this._worksheets.find(worksheet => worksheet && worksheet.name === id);
    }
    return undefined;
  }

  /**
   * Return a clone of worksheets in order
   */
  get worksheets(): Worksheet[] {
    return this._worksheets
      .slice(1)
      .sort((a, b) => a.orderNo - b.orderNo)
      .filter(Boolean);
  }

  /**
   * Iterate over all sheets.
   *
   * Note: `workbook.worksheets.forEach` will still work but this is better.
   */
  eachSheet(callback: (sheet: Worksheet, id: number) => void): void {
    this.worksheets.forEach(sheet => {
      callback(sheet, sheet.id);
    });
  }

  // ===========================================================================
  // Defined Names
  // ===========================================================================

  get definedNames(): DefinedNames {
    return this._definedNames;
  }

  // ===========================================================================
  // Themes
  // ===========================================================================

  clearThemes(): void {
    // Note: themes are not an exposed feature, meddle at your peril!
    this._themes = undefined;
  }

  // ===========================================================================
  // Images
  // ===========================================================================

  /**
   * Add Image to Workbook and return the id
   */
  addImage(image: Image): number {
    const id = this.media.length;
    this.media.push({ ...image, type: "image" });
    return id;
  }

  getImage(id: number | string): WorkbookMedia | undefined {
    return this.media[Number(id)];
  }

  // ===========================================================================
  // Model (Serialization)
  // ===========================================================================

  get model(): WorkbookModel {
    return {
      creator: this.creator || "Unknown",
      lastModifiedBy: this.lastModifiedBy || "Unknown",
      lastPrinted: this.lastPrinted,
      created: this.created,
      modified: this.modified,
      properties: this.properties,
      worksheets: this.worksheets.map(worksheet => worksheet.model),
      sheets: this.worksheets.map(ws => ws.model).filter(Boolean),
      definedNames: this._definedNames.model,
      views: this.views,
      company: this.company,
      manager: this.manager,
      title: this.title,
      subject: this.subject,
      keywords: this.keywords,
      category: this.category,
      description: this.description,
      language: this.language,
      revision: this.revision,
      contentStatus: this.contentStatus,
      themes: this._themes,
      media: this.media,
      pivotTables: this.pivotTables,
      calcProperties: this.calcProperties
    };
  }

  set model(value: WorkbookModel) {
    this.creator = value.creator;
    this.lastModifiedBy = value.lastModifiedBy;
    this.lastPrinted = value.lastPrinted;
    this.created = value.created;
    this.modified = value.modified;
    this.company = value.company;
    this.manager = value.manager;
    this.title = value.title;
    this.subject = value.subject;
    this.keywords = value.keywords;
    this.category = value.category;
    this.description = value.description;
    this.language = value.language;
    this.revision = value.revision;
    this.contentStatus = value.contentStatus;

    this.properties = value.properties;
    this.calcProperties = value.calcProperties;
    this._worksheets = [];
    value.worksheets.forEach(worksheetModel => {
      const { id, name, state } = worksheetModel;
      const orderNo = value.sheets && value.sheets.findIndex(ws => ws.id === id);
      const worksheet = (this._worksheets[id] = new Worksheet({
        id,
        name,
        orderNo: orderNo !== -1 ? orderNo : undefined,
        state,
        workbook: this as any
      }));
      worksheet.model = worksheetModel;
    });

    this._definedNames.model = value.definedNames;
    this.views = value.views;
    this._themes = value.themes;
    this.media = value.media || [];

    // Handle pivot tables - either newly created or loaded from file
    // Loaded pivot tables come from loadedPivotTables after reconciliation
    this.pivotTables = value.pivotTables || value.loadedPivotTables || [];
  }
}

export { Workbook };
