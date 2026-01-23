/**
 * XLSX - Abstract base class for XLSX operations
 *
 * Contains all platform-agnostic logic shared between Node.js and Browser versions:
 * - reconcile: Reconcile model after parsing
 * - _process*Entry: Process individual ZIP entries
 * - add*: Add content to ZIP during writing
 * - prepareModel: Prepare model for writing
 * - loadFromFiles: Load from pre-extracted ZIP data
 */

import { XmlStream } from "@excel/utils/xml-stream";
import { StylesXform } from "@excel/xlsx/xform/style/styles-xform";
import { CoreXform } from "@excel/xlsx/xform/core/core-xform";
import { SharedStringsXform } from "@excel/xlsx/xform/strings/shared-strings-xform";
import { RelationshipsXform } from "@excel/xlsx/xform/core/relationships-xform";
import { ContentTypesXform } from "@excel/xlsx/xform/core/content-types-xform";
import { AppXform } from "@excel/xlsx/xform/core/app-xform";
import { WorkbookXform } from "@excel/xlsx/xform/book/workbook-xform";
import { WorkSheetXform } from "@excel/xlsx/xform/sheet/worksheet-xform";
import { FeaturePropertyBagXform } from "@excel/xlsx/xform/core/feature-property-bag-xform";
import { DrawingXform } from "@excel/xlsx/xform/drawing/drawing-xform";
import { TableXform } from "@excel/xlsx/xform/table/table-xform";
import { PivotCacheRecordsXform } from "@excel/xlsx/xform/pivot-table/pivot-cache-records-xform";
import {
  PivotCacheDefinitionXform,
  type ParsedCacheDefinitionModel
} from "@excel/xlsx/xform/pivot-table/pivot-cache-definition-xform";
import {
  PivotTableXform,
  type ParsedPivotTableModel
} from "@excel/xlsx/xform/pivot-table/pivot-table-xform";
import { CommentsXform } from "@excel/xlsx/xform/comment/comments-xform";
import { VmlDrawingXform } from "@excel/xlsx/xform/drawing/vml-drawing-xform";
import { CtrlPropXform } from "@excel/xlsx/xform/drawing/ctrl-prop-xform";
import type { FormCheckboxModel } from "@excel/form-control";
import { theme1Xml } from "@excel/xlsx/xml/theme1";
import { RelType } from "@excel/xlsx/rel-type";
import { StreamBuf } from "@excel/utils/stream-buf";
import { bufferToString, base64ToUint8Array } from "@utils/utils";
import { StreamingZip, ZipDeflateFile } from "@archive/zip/stream";
import { ZipParser } from "@archive/unzip/zip-parser";
import { PassThrough, concatUint8Arrays, type IEventEmitter } from "@stream";
import type { Workbook } from "@excel/workbook";
import {
  commentsPath,
  commentsRelTargetFromWorksheetName,
  ctrlPropPath,
  drawingPath,
  drawingRelsPath,
  OOXML_REL_TARGETS,
  pivotTableRelTargetFromWorksheetName,
  pivotCacheDefinitionRelTargetFromWorkbook,
  getCommentsIndexFromPath,
  getDrawingNameFromPath,
  getDrawingNameFromRelsPath,
  getMediaFilenameFromPath,
  mediaPath,
  getPivotCacheDefinitionNameFromPath,
  getPivotCacheDefinitionNameFromRelsPath,
  getPivotCacheRecordsNameFromPath,
  getPivotTableNameFromPath,
  getPivotTableNameFromRelsPath,
  pivotCacheDefinitionPath,
  pivotCacheDefinitionRelsPath,
  pivotCacheDefinitionRelTargetFromPivotTable,
  pivotCacheRecordsPath,
  pivotCacheRecordsRelTarget,
  pivotTablePath,
  pivotTableRelsPath,
  getTableNameFromPath,
  tablePath,
  tableRelTargetFromWorksheetName,
  themePath,
  getThemeNameFromPath,
  getVmlDrawingNameFromPath,
  getWorksheetNoFromWorksheetPath,
  getWorksheetNoFromWorksheetRelsPath,
  isBinaryEntryPath,
  normalizeZipPath,
  OOXML_PATHS,
  vmlDrawingRelTargetFromWorksheetName,
  vmlDrawingPath,
  worksheetPath,
  worksheetRelsPath
} from "@excel/utils/ooxml-paths";
import { PassthroughManager } from "@excel/utils/passthrough-manager";

import type { ZipTimestampMode } from "@archive/utils/timestamps";

type StreamListener = Parameters<IEventEmitter["on"]>[1];

interface EmitterLike {
  on(event: string, listener: StreamListener): this;
  once(event: string, listener: StreamListener): this;
  off(event: string, listener: StreamListener): this;
}

export interface IParseStream extends EmitterLike {
  pipe(dest: any): any;
  [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array | string>;
}

export interface IStreamBuf extends EmitterLike {
  write(data: any): void;
  end(): void;
  read(): any;
  toBuffer?(): any;
  pipe?(dest: any): any;
}

export interface IZipWriter extends EmitterLike {
  append(data: any, options: { name: string; base64?: boolean }): void;
  pipe(stream: any): void;
  finalize(): void;
}

class StreamingZipWriterAdapter implements IZipWriter {
  private static textEncoder = new TextEncoder();

  private readonly zip: StreamingZip;
  private readonly events: Map<string, Set<StreamListener>> = new Map();
  private pipedStream: Pick<IStreamBuf, "write" | "end"> | null = null;
  private level: number;
  private modTime: Date | undefined;
  private timestamps: ZipTimestampMode | undefined;
  private finalized = false;

  constructor(options?: ZipWriterOptions) {
    this.level = options?.level ?? 6;
    this.modTime = options?.modTime;
    this.timestamps = options?.timestamps;
    this.zip = new StreamingZip((err: Error | null, data: Uint8Array, final: boolean) => {
      if (err) {
        this._emit("error", err);
        return;
      }

      if (data && data.length > 0) {
        this._emit("data", data);
        if (this.pipedStream) {
          this.pipedStream.write(data);
        }
      }

      if (final) {
        if (this.pipedStream) {
          this.pipedStream.end();
        }
        this._emit("finish");
      }
    });
  }

  private _emit(event: string, ...args: any[]): void {
    const callbacks = this.events.get(event);
    if (!callbacks) {
      return;
    }
    for (const cb of callbacks) {
      cb(...args);
    }
  }

  on(event: string, callback: StreamListener): this {
    const callbacks = this.events.get(event) || new Set<StreamListener>();
    callbacks.add(callback);
    this.events.set(event, callbacks);
    return this;
  }

  once(event: string, callback: StreamListener): this {
    const wrapped: StreamListener = (...args: any[]) => {
      this.off(event, wrapped);
      callback(...args);
    };
    return this.on(event, wrapped);
  }

  off(event: string, callback: StreamListener): this {
    const callbacks = this.events.get(event);
    if (!callbacks) {
      return this;
    }
    callbacks.delete(callback);
    if (callbacks.size === 0) {
      this.events.delete(event);
    }
    return this;
  }

  pipe(stream: any): void {
    this.pipedStream = stream;
  }

  append(data: any, options: { name: string; base64?: boolean }): void {
    if (this.finalized) {
      throw new Error("Cannot append after finalize");
    }

    let buffer: Uint8Array;
    if (options.base64) {
      buffer = base64ToUint8Array(typeof data === "string" ? data : String(data));
    } else if (typeof data === "string") {
      buffer = StreamingZipWriterAdapter.textEncoder.encode(data);
    } else if (data instanceof Uint8Array) {
      buffer = data;
    } else if (ArrayBuffer.isView(data)) {
      buffer = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } else if (data instanceof ArrayBuffer) {
      buffer = new Uint8Array(data);
    } else {
      buffer = data;
    }

    const file = new ZipDeflateFile(options.name, {
      level: this.level,
      modTime: this.modTime,
      timestamps: this.timestamps
    });
    this.zip.add(file);

    file.push(buffer, true);
  }

  finalize(): void {
    if (this.finalized) {
      return;
    }
    this.finalized = true;
    this.zip.end();
  }
}

// =============================================================================
// Minimal shared types (keep internal model flexible)
// =============================================================================

export interface XlsxReadOptions {
  base64?: boolean;
  [key: string]: unknown;
}

export interface ZipWriterOptions {
  level?: number;
  /** ZIP entry modification time (optional). If omitted, defaults to current time. */
  modTime?: Date;
  /** Timestamp writing strategy for ZIP entry metadata (optional). */
  timestamps?: ZipTimestampMode;
}

export interface XlsxWriteOptions {
  zip?: ZipWriterOptions;
  [key: string]: unknown;
}

export type XlsxOptions = XlsxReadOptions & XlsxWriteOptions;

export interface WorkbookMediaLike {
  type: string;
  extension: string;
  name?: string;
  filename?: string;
  buffer?: Uint8Array;
  base64?: string;
}

export interface MediaModel {
  media: WorkbookMediaLike[];
}

interface ZipEntryLike {
  name: string;
  type: "Directory" | "File";
  stream: IParseStream;
  drain: () => Promise<void>;
}

/**
 * XLSX class - handles Excel file operations
 * Works in both Node.js and Browser environments
 */
class XLSX {
  declare public workbook: Workbook;

  static RelType = RelType;

  constructor(workbook: Workbook) {
    this.workbook = workbook;
  }

  // ===========================================================================
  // Stream creation - cross-platform implementation using modules/stream
  // ===========================================================================

  /**
   * Create a stream from binary data (for media/themes)
   */
  protected createBinaryStream(data: Uint8Array): IParseStream {
    const stream = new PassThrough();
    stream.end(data);
    return stream;
  }

  /**
   * Create a stream from string content (for XML parsing)
   */
  protected createTextStream(content: string): IParseStream {
    const stream = new PassThrough();
    stream.end(content);
    return stream;
  }

  // ===========================================================================
  // Shared implementations - used by all platforms
  // ===========================================================================

  /**
   * Create a StreamBuf instance for buffering data
   */
  protected createStreamBuf(): IStreamBuf {
    return new StreamBuf();
  }

  /**
   * Convert buffer/Uint8Array to string
   */
  protected bufferToString(data: string | ArrayBuffer | Uint8Array): string {
    return bufferToString(data);
  }

  /**
   * Create a ZIP writer adapter.
   * Can be overridden by subclasses for platform-specific implementations.
   */
  protected createZipWriter(options?: XlsxWriteOptions["zip"]): IZipWriter {
    return new StreamingZipWriterAdapter(options);
  }

  /**
   * Write all workbook content to a ZIP writer
   * Shared by both Node.js write() and browser writeBuffer()
   */
  protected async writeToZip(zip: IZipWriter, options?: XlsxWriteOptions): Promise<void> {
    const { model } = this.workbook;
    this.prepareModel(model, options);

    await this.addContentTypes(zip, model);
    await this.addOfficeRels(zip, model);
    await this.addWorkbookRels(zip, model);
    await this.addWorksheets(zip, model);
    await this.addSharedStrings(zip, model);
    this.addDrawings(zip, model);
    this.addTables(zip, model);
    this.addPivotTables(zip, model);
    this.addPassthrough(zip, model);
    await Promise.all([this.addThemes(zip, model), this.addStyles(zip, model)]);
    await this.addFeaturePropertyBag(zip, model);
    await this.addMedia(zip, model);
    await Promise.all([this.addApp(zip, model), this.addCore(zip, model)]);
    await this.addWorkbook(zip, model);
  }

  // ===========================================================================
  // Stream/Buffer operations - shared by all platforms
  // ===========================================================================

  /**
   * Read workbook from a stream
   */
  async read(stream: IParseStream, options?: XlsxReadOptions): Promise<any> {
    // Collect all stream data into a single buffer
    const chunks: Uint8Array[] = [];

    await new Promise<void>((resolve, reject) => {
      const onData = (chunk: Uint8Array) => {
        chunks.push(chunk);
      };

      const onEnd = () => {
        stream.off("data", onData);
        stream.off("end", onEnd);
        stream.off("error", onError);
        resolve();
      };

      const onError = (err: Error) => {
        stream.off("data", onData);
        stream.off("end", onEnd);
        stream.off("error", onError);
        reject(err);
      };

      stream.on("data", onData);
      stream.on("end", onEnd);
      stream.on("error", onError);
    });

    return this.loadBuffer(concatUint8Arrays(chunks), options);
  }

  /**
   * Write workbook to a stream
   */
  async write(stream: any, options?: XlsxWriteOptions): Promise<XLSX> {
    options = options || {};

    options.zip = options.zip || {};
    options.zip.modTime ??= this.workbook.modified ?? this.workbook.created;

    const zip = this.createZipWriter(options.zip);
    zip.pipe(stream);
    await this.writeToZip(zip, options);
    return this._finalize(zip) as Promise<XLSX>;
  }

  /**
   * Load workbook from buffer/ArrayBuffer/Uint8Array
   */
  async load(data: any, options?: XlsxReadOptions): Promise<any> {
    let buffer: Uint8Array;

    // Validate input
    const isBuffer = typeof Buffer !== "undefined" ? Buffer.isBuffer(data) : false;
    if (
      !data ||
      (typeof data === "object" &&
        !isBuffer &&
        !(data instanceof Uint8Array) &&
        !(data instanceof ArrayBuffer))
    ) {
      throw new Error(
        "Can't read the data of 'the loaded zip file'. Is it in a supported JavaScript type (String, Blob, ArrayBuffer, etc) ?"
      );
    }

    // Handle base64 input
    if (options && options.base64) {
      buffer = base64ToUint8Array(data.toString());
    } else if (data instanceof ArrayBuffer) {
      buffer = new Uint8Array(data);
    } else if (data instanceof Uint8Array) {
      buffer = data;
    } else {
      // Node.js Buffer or other array-like
      buffer = new Uint8Array(data);
    }

    return this.loadBuffer(buffer, options);
  }

  /**
   * Internal: Load from Uint8Array buffer
   */
  protected async loadBuffer(buffer: Uint8Array, options?: XlsxReadOptions): Promise<any> {
    const parser = new ZipParser(buffer);
    const filesMap = await parser.extractAll();

    // Convert Map to Record for loadFromFiles
    const allFiles: Record<string, Uint8Array> = {};
    for (const [path, content] of filesMap) {
      allFiles[path] = content;
    }

    return this.loadFromFiles(allFiles, options);
  }

  /**
   * Internal: Load workbook from an async stream of ZIP entries.
   *
   * This is the foundation for TRUE streaming reads on platforms that have a
   * streaming ZIP parser (e.g. Node.js `modules/archive` Parse).
   */
  /**
   * Create an empty model for parsing XLSX files.
   * Shared by loadFromZipEntries and loadFromFiles.
   */
  private createEmptyModel(): any {
    return {
      worksheets: [],
      worksheetHash: {},
      worksheetRels: [],
      themes: {},
      media: [],
      mediaIndex: {},
      drawings: {},
      drawingRels: {},
      // Raw drawing XML data for passthrough (when drawing contains chart references)
      rawDrawings: {} as Record<string, Uint8Array>,
      comments: {},
      tables: {},
      vmlDrawings: {},
      pivotTables: {},
      pivotTableRels: {},
      pivotCacheDefinitions: {},
      pivotCacheDefinitionRels: {},
      pivotCacheRecords: {},
      // Passthrough storage for unknown/unsupported files (charts, etc.)
      passthrough: {} as Record<string, Uint8Array>
    };
  }

  /**
   * Collect all data from a stream into a single Uint8Array.
   * Reusable helper for passthrough and drawing processing.
   */
  protected async collectStreamData(stream: IParseStream): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: any) => {
        if (typeof chunk === "string") {
          chunks.push(new TextEncoder().encode(chunk));
        } else if (chunk instanceof Uint8Array) {
          chunks.push(chunk);
        } else {
          chunks.push(new Uint8Array(chunk));
        }
      });
      stream.on("end", () => resolve());
      stream.on("error", reject);
    });
    return concatUint8Arrays(chunks);
  }

  /**
   * Check if a drawing has chart references in its relationships
   */
  private drawingHasChartReference(drawing: any): boolean {
    return (
      drawing.rels && drawing.rels.some((rel: any) => rel.Target && rel.Target.includes("/charts/"))
    );
  }

  /**
   * Check if a drawing rels list references charts.
   * Used to decide whether we need to keep raw drawing XML for passthrough.
   */
  private drawingRelsHasChartReference(drawingRels: any[] | undefined): boolean {
    return (
      Array.isArray(drawingRels) &&
      drawingRels.some(rel => typeof rel?.Target === "string" && rel.Target.includes("/charts/"))
    );
  }

  /**
   * Process a known OOXML entry (workbook, styles, shared strings, etc.)
   * Returns true if handled, false if should be passed to _processDefaultEntry
   */
  protected async _processKnownEntry(
    stream: IParseStream,
    model: any,
    entryName: string,
    options?: XlsxOptions
  ): Promise<boolean> {
    const sheetNo = getWorksheetNoFromWorksheetPath(entryName);
    if (sheetNo !== undefined) {
      await this._processWorksheetEntry(stream, model, sheetNo, options, entryName);
      return true;
    }

    switch (entryName) {
      case OOXML_PATHS.rootRels:
        model.globalRels = await this.parseRels(stream);
        return true;
      case OOXML_PATHS.xlWorkbook: {
        const workbook = await this.parseWorkbook(stream);
        model.sheets = workbook.sheets;
        model.definedNames = workbook.definedNames;
        model.views = workbook.views;
        model.properties = workbook.properties;
        model.calcProperties = workbook.calcProperties;
        model.pivotCaches = workbook.pivotCaches;
        return true;
      }
      case OOXML_PATHS.xlSharedStrings:
        model.sharedStrings = new SharedStringsXform();
        await model.sharedStrings.parseStream(stream);
        return true;
      case OOXML_PATHS.xlWorkbookRels:
        model.workbookRels = await this.parseRels(stream);
        return true;
      case OOXML_PATHS.docPropsApp: {
        const appXform = new AppXform();
        const appProperties = await appXform.parseStream(stream);
        if (appProperties) {
          model.company = appProperties.company;
          model.manager = appProperties.manager;
        }
        return true;
      }
      case OOXML_PATHS.docPropsCore: {
        const coreXform = new CoreXform();
        const coreProperties = await coreXform.parseStream(stream);
        Object.assign(model, coreProperties);
        return true;
      }
      case OOXML_PATHS.xlStyles:
        model.styles = new StylesXform();
        await model.styles.parseStream(stream);
        return true;
      default:
        return false;
    }
  }

  protected async loadFromZipEntries(
    entries: AsyncIterable<ZipEntryLike>,
    options?: XlsxOptions
  ): Promise<any> {
    const model: any = this.createEmptyModel();

    for await (const entry of entries) {
      let drained = false;
      const drainEntry = async () => {
        if (drained) {
          return;
        }
        drained = true;
        await entry.drain();
      };

      if (entry.type === "Directory") {
        await drainEntry();
        continue;
      }

      const entryName = normalizeZipPath(entry.name);
      const stream = entry.stream;

      try {
        const handled = await this._processKnownEntry(stream, model, entryName, options);
        if (!handled) {
          const defaultHandled = await this._processDefaultEntry(stream, model, entryName);
          if (!defaultHandled) {
            // Important for true streaming parsers: always consume unknown entries
            await drainEntry();
          }
        }
      } finally {
        // Make sure we don't leave the entry stream partially consumed.
        // This is critical for true streaming parsers which may otherwise abort
        // the underlying entry stream (showing up as AbortError/ABORT_ERR).
        try {
          await drainEntry();
        } catch {
          // ignore drain errors; the primary parse error (if any) is more useful
        }
      }
    }

    this.reconcile(model, options);
    this.workbook.model = model;
    return this.workbook;
  }

  /**
   * Write workbook to buffer
   */
  async writeBuffer(options?: XlsxWriteOptions): Promise<Uint8Array> {
    options = options || {};

    options.zip = options.zip || {};
    options.zip.modTime ??= this.workbook.modified ?? this.workbook.created;

    const zip = this.createZipWriter(options.zip);
    const stream = this.createStreamBuf();
    zip.pipe(stream);
    await this.writeToZip(zip, options);
    await this._finalize(zip);
    return stream.read() || new Uint8Array(0);
  }

  // ===========================================================================
  // Media handling - base implementation (buffer/base64 only)
  // ===========================================================================

  /**
   * Add media files to ZIP
   * Supports buffer, base64, and filename (if readFileAsync is provided)
   */
  async addMedia(zip: IZipWriter, model: MediaModel): Promise<void> {
    await Promise.all(
      model.media.map(async (medium: WorkbookMediaLike) => {
        if (medium.type !== "image") {
          throw new Error("Unsupported media");
        }

        // Preserve legacy behavior: `${undefined}` becomes "undefined" in template strings
        const mediaName = medium.name ?? "undefined";
        const filename = mediaPath(`${mediaName}.${medium.extension}`);

        if (medium.filename) {
          if (this.readFileAsync) {
            const data = await this.readFileAsync(medium.filename);
            return zip.append(data, { name: filename });
          }
          throw new Error("Loading images from filename is not supported in this environment");
        }

        if (medium.buffer) {
          return zip.append(medium.buffer, { name: filename });
        }

        if (medium.base64) {
          const content = medium.base64.substring(medium.base64.indexOf(",") + 1);
          return zip.append(content, { name: filename, base64: true });
        }

        throw new Error("Unsupported media");
      })
    );
  }

  /**
   * Optional file reader - can be overridden by subclasses (e.g., Node.js version)
   */
  protected readFileAsync?: (filename: string) => Promise<Uint8Array>;

  // ===========================================================================
  // Parse helpers - shared by all platforms
  // ===========================================================================

  parseRels(stream: IParseStream): Promise<any> {
    const xform = new RelationshipsXform();
    return xform.parseStream(stream);
  }

  parseWorkbook(stream: IParseStream): Promise<any> {
    const xform = new WorkbookXform();
    return xform.parseStream(stream);
  }

  parseSharedStrings(stream: IParseStream): Promise<any> {
    const xform = new SharedStringsXform();
    return xform.parseStream(stream);
  }

  // ===========================================================================
  // Reconcile - shared by all platforms
  // ===========================================================================

  reconcile(model: any, options?: XlsxOptions): void {
    const workbookXform = new WorkbookXform();
    const worksheetXform = new WorkSheetXform(options);
    const drawingXform = new DrawingXform();
    const tableXform = new TableXform();

    workbookXform.reconcile(model);

    // reconcile drawings with their rels
    const drawingOptions: any = {
      media: model.media,
      mediaIndex: model.mediaIndex
    };
    Object.keys(model.drawings).forEach(name => {
      const drawing = model.drawings[name];
      const drawingRel = model.drawingRels[name];
      if (drawingRel) {
        drawingOptions.rels = drawingRel.reduce((o: any, rel: any) => {
          o[rel.Id] = rel;
          return o;
        }, {});
        (drawing.anchors || []).forEach((anchor: any) => {
          const hyperlinks = anchor.picture && anchor.picture.hyperlinks;
          if (hyperlinks && drawingOptions.rels[hyperlinks.rId]) {
            hyperlinks.hyperlink = drawingOptions.rels[hyperlinks.rId].Target;
            delete hyperlinks.rId;
          }
        });
        drawingXform.reconcile(drawing, drawingOptions);
      }
    });

    // Trim raw drawings for non-chart drawings to avoid bloating the serialized workbook model.
    if (model.rawDrawings && model.drawingRels) {
      for (const name of Object.keys(model.rawDrawings)) {
        const drawingRel = model.drawingRels[name];
        if (drawingRel && !this.drawingRelsHasChartReference(drawingRel)) {
          delete model.rawDrawings[name];
        }
      }
    }

    // reconcile tables with the default styles
    const tableOptions = {
      styles: model.styles
    };
    Object.values(model.tables).forEach((table: any) => {
      tableXform.reconcile(table, tableOptions);
    });

    // Reconcile pivot tables
    this._reconcilePivotTables(model);

    const sheetOptions = {
      styles: model.styles,
      sharedStrings: model.sharedStrings,
      media: model.media,
      mediaIndex: model.mediaIndex,
      date1904: model.properties && model.properties.date1904,
      drawings: model.drawings,
      drawingRels: model.drawingRels,
      comments: model.comments,
      tables: model.tables,
      vmlDrawings: model.vmlDrawings,
      pivotTables: model.pivotTablesIndexed
    };
    model.worksheets.forEach((worksheet: any) => {
      worksheet.relationships = model.worksheetRels[worksheet.sheetNo];
      worksheetXform.reconcile(worksheet, sheetOptions);
    });

    // delete unnecessary parts
    delete model.worksheetHash;
    delete model.worksheetRels;
    delete model.globalRels;
    delete model.sharedStrings;
    delete model.workbookRels;
    delete model.sheetDefs;
    // Preserve default font before deleting styles
    model.defaultFont = model.styles?.defaultFont;
    delete model.styles;
    delete model.mediaIndex;
    delete model.drawings;
    delete model.drawingRels;
    delete model.vmlDrawings;
    delete model.pivotTableRels;
    delete model.pivotCacheDefinitionRels;
  }

  /**
   * Reconcile pivot tables by linking them to worksheets and their cache data.
   */
  protected _reconcilePivotTables(model: any): void {
    const rawPivotTables = model.pivotTables || {};
    if (typeof rawPivotTables !== "object" || Object.keys(rawPivotTables).length === 0) {
      model.pivotTables = [];
      model.pivotTablesIndexed = {};
      return;
    }

    const definitionToCacheId = this._buildDefinitionToCacheIdMap(model);

    const cacheMap = new Map<
      number,
      {
        definition: ParsedCacheDefinitionModel;
        records: any;
        definitionName: string;
      }
    >();

    Object.entries(model.pivotCacheDefinitions || {}).forEach(
      ([name, definition]: [string, any]) => {
        const cacheId = definitionToCacheId.get(name);
        if (cacheId !== undefined) {
          const recordsName = name.replace("Definition", "Records");
          cacheMap.set(cacheId, {
            definition,
            records: model.pivotCacheRecords?.[recordsName],
            definitionName: name
          });
        }
      }
    );

    const loadedPivotTables: any[] = [];
    const pivotTablesIndexed: Record<string, any> = {};

    Object.entries(rawPivotTables).forEach(([pivotName, pivotTable]: [string, any]) => {
      const pt = pivotTable as ParsedPivotTableModel;
      const tableNumber = this._extractTableNumber(pivotName);
      const cacheData = cacheMap.get(pt.cacheId);

      const completePivotTable = {
        ...pt,
        tableNumber,
        cacheDefinition: cacheData?.definition,
        cacheRecords: cacheData?.records,
        cacheFields: cacheData?.definition?.cacheFields || [],
        rows: pt.rowFields.filter(f => f >= 0),
        columns: pt.colFields.filter(f => f >= 0 && f !== -2),
        values: pt.dataFields.map(df => df.fld),
        metric: this._determineMetric(pt.dataFields),
        applyWidthHeightFormats: pt.applyWidthHeightFormats || "0"
      };

      loadedPivotTables.push(completePivotTable);
      pivotTablesIndexed[pivotTableRelTargetFromWorksheetName(pivotName)] = completePivotTable;
    });

    loadedPivotTables.sort((a, b) => a.tableNumber - b.tableNumber);
    model.pivotTables = loadedPivotTables;
    model.pivotTablesIndexed = pivotTablesIndexed;
    model.loadedPivotTables = loadedPivotTables;
  }

  protected _extractTableNumber(name: string): number {
    const match = name.match(/pivotTable(\d+)/);
    return match ? parseInt(match[1], 10) : 1;
  }

  protected _buildCacheIdMap(model: any): Map<string, number> {
    const rIdToCacheId = new Map<string, number>();
    const pivotCaches = model.pivotCaches || [];
    for (const cache of pivotCaches) {
      if (cache.cacheId && cache.rId) {
        rIdToCacheId.set(cache.rId, parseInt(cache.cacheId, 10));
      }
    }
    return rIdToCacheId;
  }

  protected _buildDefinitionToCacheIdMap(model: any): Map<string, number> {
    const definitionToCacheId = new Map<string, number>();
    const rIdToCacheId = this._buildCacheIdMap(model);
    const workbookRels = model.workbookRels || [];

    for (const rel of workbookRels) {
      if (rel.Type === XLSX.RelType.PivotCacheDefinition && rel.Target) {
        const match = rel.Target.match(/pivotCacheDefinition(\d+)\.xml/);
        if (match) {
          const defName = `pivotCacheDefinition${match[1]}`;
          const cacheId = rIdToCacheId.get(rel.Id);
          if (cacheId !== undefined) {
            definitionToCacheId.set(defName, cacheId);
          }
        }
      }
    }

    return definitionToCacheId;
  }

  protected _determineMetric(dataFields: Array<{ subtotal?: string }>): "sum" | "count" {
    if (dataFields.length > 0 && dataFields[0].subtotal === "count") {
      return "count";
    }
    return "sum";
  }

  // ===========================================================================
  // Process Entry methods - shared by all platforms
  // ===========================================================================

  async _processWorksheetEntry(
    stream: IParseStream,
    model: any,
    sheetNo: number,
    options: XlsxOptions | undefined,
    path: string
  ): Promise<void> {
    const xform = new WorkSheetXform(options);
    const worksheet = await xform.parseStream(stream);
    if (!worksheet) {
      throw new Error(`Failed to parse worksheet ${path}`);
    }
    worksheet.sheetNo = sheetNo;
    model.worksheetHash[path] = worksheet;
    model.worksheets.push(worksheet);
  }

  async _processCommentEntry(stream: IParseStream, model: any, name: string): Promise<void> {
    const xform = new CommentsXform();
    const comments = await xform.parseStream(stream);
    model.comments[commentsRelTargetFromWorksheetName(name)] = comments;
  }

  async _processTableEntry(stream: IParseStream, model: any, name: string): Promise<void> {
    const xform = new TableXform();
    const table = await xform.parseStream(stream);
    model.tables[tableRelTargetFromWorksheetName(name)] = table;
  }

  async _processWorksheetRelsEntry(
    stream: IParseStream,
    model: any,
    sheetNo: number
  ): Promise<void> {
    const xform = new RelationshipsXform();
    const relationships = await xform.parseStream(stream);
    model.worksheetRels[sheetNo] = relationships;
  }

  async _processMediaEntry(stream: IParseStream, model: any, filename: string): Promise<void> {
    const lastDot = filename.lastIndexOf(".");
    if (lastDot >= 1) {
      const extension = filename.substr(lastDot + 1);
      const name = filename.substr(0, lastDot);
      await new Promise<void>((resolve, reject) => {
        const streamBuf = this.createStreamBuf();

        const cleanup = () => {
          stream.off("error", onError);
          streamBuf.off("error", onError);
          streamBuf.off("finish", onFinish);
        };

        const onFinish = () => {
          cleanup();
          model.mediaIndex[filename] = model.media.length;
          model.mediaIndex[name] = model.media.length;
          const medium = {
            type: "image",
            name,
            extension,
            buffer: streamBuf.read()
          };
          model.media.push(medium);
          resolve();
        };

        const onError = (error: Error) => {
          cleanup();
          reject(error);
        };

        streamBuf.once("finish", onFinish);
        stream.on("error", onError);
        streamBuf.on("error", onError);
        stream.pipe(streamBuf);
      });
    }
  }

  /**
   * Process a drawing XML entry.
   *
   * @param stream - Stream to read from (used in loadFromZipEntries path)
   * @param model - Model to populate
   * @param name - Drawing name (e.g., "drawing1")
   * @param rawData - Pre-read raw data (used in loadFromFiles path to avoid re-reading stream)
   */
  async _processDrawingEntry(
    stream: IParseStream,
    model: any,
    name: string,
    rawData?: Uint8Array
  ): Promise<void> {
    // Use provided rawData if available (loadFromFiles path), otherwise collect from stream.
    // In loadFromFiles, the stream is created from already-decoded text, and collecting from
    // it may not work correctly due to PassThrough stream timing issues.
    const data = rawData ?? (await this.collectStreamData(stream));

    // Parse the drawing for normal processing (images, etc.)
    const xform = new DrawingXform();
    const xmlString = this.bufferToString(data);
    const drawing = await xform.parseStream(this.createTextStream(xmlString));
    model.drawings[name] = drawing;

    // Store raw data; reconcile() may later drop it if charts are not referenced.
    model.rawDrawings[name] = data;
  }

  async _processDrawingRelsEntry(entry: any, model: any, name: string): Promise<void> {
    const xform = new RelationshipsXform();
    const relationships = await xform.parseStream(entry);
    model.drawingRels[name] = relationships;
  }

  async _processVmlDrawingEntry(entry: any, model: any, name: string): Promise<void> {
    const xform = new VmlDrawingXform();
    const vmlDrawing = await xform.parseStream(entry);
    model.vmlDrawings[vmlDrawingRelTargetFromWorksheetName(name)] = vmlDrawing;
  }

  async _processThemeEntry(stream: IParseStream, model: any, name: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const streamBuf = this.createStreamBuf();

      const cleanup = () => {
        stream.off("error", onError);
        streamBuf.off("error", onError);
        streamBuf.off("finish", onFinish);
      };

      const onFinish = () => {
        cleanup();
        const data = streamBuf.read();
        model.themes[name] = data
          ? typeof data === "string"
            ? data
            : this.bufferToString(data)
          : "";
        resolve();
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      streamBuf.once("finish", onFinish);
      stream.on("error", onError);
      streamBuf.on("error", onError);
      stream.pipe(streamBuf);
    });
  }

  async _processPivotTableEntry(stream: IParseStream, model: any, name: string): Promise<void> {
    const xform = new PivotTableXform();
    const pivotTable = await xform.parseStream(stream);
    if (pivotTable) {
      model.pivotTables[name] = pivotTable;
    }
  }

  async _processPivotTableRelsEntry(stream: IParseStream, model: any, name: string): Promise<void> {
    const xform = new RelationshipsXform();
    const relationships = await xform.parseStream(stream);
    model.pivotTableRels[name] = relationships;
  }

  async _processPivotCacheDefinitionEntry(
    stream: IParseStream,
    model: any,
    name: string
  ): Promise<void> {
    const xform = new PivotCacheDefinitionXform();
    const cacheDefinition = await xform.parseStream(stream);
    if (cacheDefinition) {
      model.pivotCacheDefinitions[name] = cacheDefinition;
    }
  }

  async _processPivotCacheDefinitionRelsEntry(
    stream: IParseStream,
    model: any,
    name: string
  ): Promise<void> {
    const xform = new RelationshipsXform();
    const relationships = await xform.parseStream(stream);
    model.pivotCacheDefinitionRels[name] = relationships;
  }

  async _processPivotCacheRecordsEntry(
    stream: IParseStream,
    model: any,
    name: string
  ): Promise<void> {
    const xform = new PivotCacheRecordsXform();
    const cacheRecords = await xform.parseStream(stream);
    if (cacheRecords) {
      model.pivotCacheRecords[name] = cacheRecords;
    }
  }

  // ===========================================================================
  // loadFromFiles - shared logic for loading from pre-extracted ZIP data
  // ===========================================================================

  async loadFromFiles(zipData: Record<string, Uint8Array>, options?: any): Promise<any> {
    const model: any = this.createEmptyModel();

    const entries = Object.keys(zipData).map(name => ({
      name,
      dir: name.endsWith("/"),
      data: zipData[name]
    }));

    for (const entry of entries) {
      if (!entry.dir) {
        const entryName = normalizeZipPath(entry.name);

        // Create appropriate stream based on entry type
        const isBinaryEntry = isBinaryEntryPath(entryName);
        const stream = isBinaryEntry
          ? this.createBinaryStream(entry.data)
          : this.createTextStream(this.bufferToString(entry.data));

        const handled = await this._processKnownEntry(stream, model, entryName, options);
        if (!handled) {
          // Pass raw entry data for drawings to enable passthrough
          await this._processDefaultEntry(stream, model, entryName, entry.data);
        }
      }
    }

    this.reconcile(model, options);
    this.workbook.model = model;
    return this.workbook;
  }

  /**
   * Process default entries (drawings, comments, tables, etc.)
   * @param rawData Optional raw entry data for passthrough preservation (used by loadFromFiles)
   */
  protected async _processDefaultEntry(
    stream: IParseStream,
    model: any,
    entryName: string,
    rawData?: Uint8Array
  ): Promise<boolean> {
    const sheetNo = getWorksheetNoFromWorksheetRelsPath(entryName);
    if (sheetNo !== undefined) {
      await this._processWorksheetRelsEntry(stream, model, sheetNo);
      return true;
    }

    const mediaFilename = getMediaFilenameFromPath(entryName);
    if (mediaFilename) {
      await this._processMediaEntry(stream, model, mediaFilename);
      return true;
    }

    const drawingName = getDrawingNameFromPath(entryName);
    if (drawingName) {
      await this._processDrawingEntry(stream, model, drawingName, rawData);
      // rawData is now stored inside _processDrawingEntry
      return true;
    }

    const drawingRelsName = getDrawingNameFromRelsPath(entryName);
    if (drawingRelsName) {
      await this._processDrawingRelsEntry(stream, model, drawingRelsName);
      return true;
    }

    const vmlDrawingName = getVmlDrawingNameFromPath(entryName);
    if (vmlDrawingName) {
      await this._processVmlDrawingEntry(stream, model, vmlDrawingName);
      return true;
    }

    const commentsIndex = getCommentsIndexFromPath(entryName);
    if (commentsIndex) {
      await this._processCommentEntry(stream, model, `comments${commentsIndex}`);
      return true;
    }

    const tableName = getTableNameFromPath(entryName);
    if (tableName) {
      await this._processTableEntry(stream, model, tableName);
      return true;
    }

    const themeName = getThemeNameFromPath(entryName);
    if (themeName) {
      await this._processThemeEntry(stream, model, themeName);
      return true;
    }

    // Pivot table files
    const pivotTableName = getPivotTableNameFromPath(entryName);
    if (pivotTableName) {
      await this._processPivotTableEntry(stream, model, pivotTableName);
      return true;
    }

    const pivotTableRelsName = getPivotTableNameFromRelsPath(entryName);
    if (pivotTableRelsName) {
      await this._processPivotTableRelsEntry(stream, model, pivotTableRelsName);
      return true;
    }

    // Pivot cache files
    const pivotCacheDefinitionName = getPivotCacheDefinitionNameFromPath(entryName);
    if (pivotCacheDefinitionName) {
      await this._processPivotCacheDefinitionEntry(stream, model, pivotCacheDefinitionName);
      return true;
    }

    const pivotCacheDefinitionRelsName = getPivotCacheDefinitionNameFromRelsPath(entryName);
    if (pivotCacheDefinitionRelsName) {
      await this._processPivotCacheDefinitionRelsEntry(stream, model, pivotCacheDefinitionRelsName);
      return true;
    }

    const pivotCacheRecordsName = getPivotCacheRecordsNameFromPath(entryName);
    if (pivotCacheRecordsName) {
      await this._processPivotCacheRecordsEntry(stream, model, pivotCacheRecordsName);
      return true;
    }

    // Store passthrough files (charts, etc.) for preservation
    if (PassthroughManager.isPassthroughPath(entryName)) {
      // If raw data is available (loadFromFiles path), use it directly
      if (rawData) {
        model.passthrough[entryName] = rawData;
      } else {
        await this._processPassthroughEntry(stream, model, entryName);
      }
      return true;
    }

    return false;
  }

  /**
   * Store a passthrough file for preservation during read/write cycles.
   * These files are not parsed but stored as raw bytes to be written back unchanged.
   */
  async _processPassthroughEntry(
    stream: IParseStream,
    model: any,
    entryName: string
  ): Promise<void> {
    const data = await this.collectStreamData(stream);
    model.passthrough[entryName] = data;
  }

  // ===========================================================================
  // Write methods - shared by all platforms
  // ===========================================================================

  async addContentTypes(zip: IZipWriter, model: any): Promise<void> {
    const xform = new ContentTypesXform();
    const xml = xform.toXml(model);
    zip.append(xml, { name: OOXML_PATHS.contentTypes });
  }

  async addApp(zip: IZipWriter, model: any): Promise<void> {
    const xform = new AppXform();
    const xml = xform.toXml(model);
    zip.append(xml, { name: OOXML_PATHS.docPropsApp });
  }

  async addCore(zip: IZipWriter, model: any): Promise<void> {
    const xform = new CoreXform();
    zip.append(xform.toXml(model), { name: OOXML_PATHS.docPropsCore });
  }

  async addThemes(zip: IZipWriter, model: any): Promise<void> {
    const themes = model.themes || { theme1: theme1Xml };
    Object.keys(themes).forEach(name => {
      const xml = themes[name];
      zip.append(xml, { name: themePath(name) });
    });
  }

  async addOfficeRels(zip: IZipWriter, _model: any): Promise<void> {
    const xform = new RelationshipsXform();
    const xml = xform.toXml([
      { Id: "rId1", Type: XLSX.RelType.OfficeDocument, Target: OOXML_PATHS.xlWorkbook },
      { Id: "rId2", Type: XLSX.RelType.CoreProperties, Target: OOXML_PATHS.docPropsCore },
      { Id: "rId3", Type: XLSX.RelType.ExtenderProperties, Target: OOXML_PATHS.docPropsApp }
    ]);
    zip.append(xml, { name: OOXML_PATHS.rootRels });
  }

  async addWorkbookRels(zip: IZipWriter, model: any): Promise<void> {
    let count = 1;
    const relationships: any[] = [
      { Id: `rId${count++}`, Type: XLSX.RelType.Styles, Target: OOXML_REL_TARGETS.workbookStyles },
      { Id: `rId${count++}`, Type: XLSX.RelType.Theme, Target: OOXML_REL_TARGETS.workbookTheme1 }
    ];
    if (model.sharedStrings.count) {
      relationships.push({
        Id: `rId${count++}`,
        Type: XLSX.RelType.SharedStrings,
        Target: OOXML_REL_TARGETS.workbookSharedStrings
      });
    }

    // Add FeaturePropertyBag relationship if checkboxes are used
    if (model.hasCheckboxes) {
      relationships.push({
        Id: `rId${count++}`,
        Type: XLSX.RelType.FeaturePropertyBag,
        Target: OOXML_REL_TARGETS.workbookFeaturePropertyBag
      });
    }
    (model.pivotTables || []).forEach((pivotTable: any) => {
      pivotTable.rId = `rId${count++}`;
      relationships.push({
        Id: pivotTable.rId,
        Type: XLSX.RelType.PivotCacheDefinition,
        Target: pivotCacheDefinitionRelTargetFromWorkbook(pivotTable.tableNumber)
      });
    });
    model.worksheets.forEach((worksheet: any, index: number) => {
      worksheet.rId = `rId${count++}`;
      worksheet.fileIndex = index + 1;
      relationships.push({
        Id: worksheet.rId,
        Type: XLSX.RelType.Worksheet,
        Target: `worksheets/sheet${worksheet.fileIndex}.xml`
      });
    });
    const xform = new RelationshipsXform();
    const xml = xform.toXml(relationships);
    zip.append(xml, { name: OOXML_PATHS.xlWorkbookRels });
  }

  async addFeaturePropertyBag(zip: IZipWriter, model: any): Promise<void> {
    if (!model.hasCheckboxes) {
      return;
    }
    const xform = new FeaturePropertyBagXform();
    zip.append(xform.toXml({}), { name: OOXML_PATHS.xlFeaturePropertyBag });
  }

  async addSharedStrings(zip: IZipWriter, model: any): Promise<void> {
    if (model.sharedStrings && model.sharedStrings.count) {
      zip.append(model.sharedStrings.xml, { name: OOXML_PATHS.xlSharedStrings });
    }
  }

  async addStyles(zip: IZipWriter, model: any): Promise<void> {
    const { xml } = model.styles;
    if (xml) {
      zip.append(xml, { name: OOXML_PATHS.xlStyles });
    }
  }

  async addWorkbook(zip: IZipWriter, model: any): Promise<void> {
    const xform = new WorkbookXform();
    zip.append(xform.toXml(model), { name: OOXML_PATHS.xlWorkbook });
  }

  async addWorksheets(zip: IZipWriter, model: any): Promise<void> {
    const worksheetXform = new WorkSheetXform();
    const relationshipsXform = new RelationshipsXform();
    const commentsXform = new CommentsXform();
    const vmlDrawingXform = new VmlDrawingXform();
    const ctrlPropXform = new CtrlPropXform();

    model.worksheets.forEach((worksheet: any, index: number) => {
      const fileIndex = worksheet.fileIndex || index + 1;
      let xmlStream = new XmlStream();
      worksheetXform.render(xmlStream, worksheet);
      zip.append(xmlStream.xml, { name: worksheetPath(fileIndex) });

      if (worksheet.rels && worksheet.rels.length) {
        xmlStream = new XmlStream();
        relationshipsXform.render(xmlStream, worksheet.rels);
        zip.append(xmlStream.xml, { name: worksheetRelsPath(fileIndex) });
      }

      // Generate comments XML (separate from VML)
      if (worksheet.comments.length > 0) {
        xmlStream = new XmlStream();
        commentsXform.render(xmlStream, worksheet);
        zip.append(xmlStream.xml, { name: commentsPath(fileIndex) });
      }

      // Generate unified VML drawing (contains both notes and form controls)
      const hasComments = worksheet.comments.length > 0;
      const hasFormControls = worksheet.formControls && worksheet.formControls.length > 0;

      if (hasComments || hasFormControls) {
        xmlStream = new XmlStream();
        vmlDrawingXform.render(xmlStream, {
          comments: hasComments ? worksheet.comments : [],
          formControls: hasFormControls ? worksheet.formControls : []
        });
        zip.append(xmlStream.xml, { name: vmlDrawingPath(fileIndex) });
      }

      // Generate ctrlProp files for form controls
      if (hasFormControls) {
        worksheet.formControls.forEach((control: FormCheckboxModel) => {
          const xml = ctrlPropXform.toXml(control);
          zip.append(xml, { name: ctrlPropPath(control.ctrlPropId) });
        });
      }
    });
  }

  addDrawings(zip: IZipWriter, model: any): void {
    const drawingXform = new DrawingXform();
    const relsXform = new RelationshipsXform();
    const rawDrawings = model.rawDrawings || {};

    model.worksheets.forEach((worksheet: any) => {
      const { drawing } = worksheet;
      if (drawing) {
        // Check if drawing rels contain chart references using helper
        const hasChartReference = this.drawingHasChartReference(drawing);

        if (hasChartReference && rawDrawings[drawing.name]) {
          // Use raw data for drawings with chart references (passthrough)
          zip.append(rawDrawings[drawing.name], { name: drawingPath(drawing.name) });
        } else {
          // Use regenerated XML for normal drawings (images, shapes)
          // Filter out invalid anchors (null, undefined, or missing content)
          const filteredAnchors = (drawing.anchors || []).filter((a: any) => {
            if (a == null) {
              return false;
            }
            // Form controls have range.br and shape properties
            if (a.range?.br && a.shape) {
              return true;
            }
            // One-cell anchors need a valid picture
            if (!a.br && !a.picture) {
              return false;
            }
            // Two-cell anchors need either picture or shape
            if (a.br && !a.picture && !a.shape) {
              return false;
            }
            return true;
          });
          const drawingForWrite = drawing.anchors
            ? { ...drawing, anchors: filteredAnchors }
            : drawing;
          drawingXform.prepare(drawingForWrite);
          const xml = drawingXform.toXml(drawingForWrite);
          zip.append(xml, { name: drawingPath(drawing.name) });
        }

        const relsXml = relsXform.toXml(drawing.rels);
        zip.append(relsXml, { name: drawingRelsPath(drawing.name) });
      }
    });
  }

  addTables(zip: IZipWriter, model: any): void {
    const tableXform = new TableXform();

    model.worksheets.forEach((worksheet: any) => {
      const { tables } = worksheet;
      tables.forEach((table: any) => {
        tableXform.prepare(table, {});
        const tableXml = tableXform.toXml(table);
        zip.append(tableXml, { name: tablePath(table.target) });
      });
    });
  }

  /**
   * Write passthrough files (charts, etc.) that were preserved during read.
   * These files are written back unchanged to preserve unsupported features.
   */
  addPassthrough(zip: IZipWriter, model: any): void {
    const passthroughManager = new PassthroughManager();
    passthroughManager.fromRecord(model.passthrough || {});
    passthroughManager.writeToZip(zip);
  }

  addPivotTables(zip: IZipWriter, model: any): void {
    if (!model.pivotTables.length) {
      return;
    }

    const pivotCacheRecordsXform = new PivotCacheRecordsXform();
    const pivotCacheDefinitionXform = new PivotCacheDefinitionXform();
    const pivotTableXform = new PivotTableXform();
    const relsXform = new RelationshipsXform();

    model.pivotTables.forEach((pivotTable: any) => {
      const n = pivotTable.tableNumber;
      const isLoaded = pivotTable.isLoaded;

      if (isLoaded) {
        if (pivotTable.cacheDefinition) {
          const xml = pivotCacheDefinitionXform.toXml(pivotTable.cacheDefinition);
          zip.append(xml, { name: pivotCacheDefinitionPath(n) });
        }
        if (pivotTable.cacheRecords) {
          const xml = pivotCacheRecordsXform.toXml(pivotTable.cacheRecords);
          zip.append(xml, { name: pivotCacheRecordsPath(n) });
        }
      } else {
        let xml = pivotCacheRecordsXform.toXml(pivotTable);
        zip.append(xml, { name: pivotCacheRecordsPath(n) });

        xml = pivotCacheDefinitionXform.toXml(pivotTable);
        zip.append(xml, { name: pivotCacheDefinitionPath(n) });
      }

      let xml = relsXform.toXml([
        {
          Id: "rId1",
          Type: XLSX.RelType.PivotCacheRecords,
          Target: pivotCacheRecordsRelTarget(n)
        }
      ]);
      zip.append(xml, { name: pivotCacheDefinitionRelsPath(n) });

      xml = pivotTableXform.toXml(pivotTable);
      zip.append(xml, { name: pivotTablePath(n) });

      xml = relsXform.toXml([
        {
          Id: "rId1",
          Type: XLSX.RelType.PivotCacheDefinition,
          Target: pivotCacheDefinitionRelTargetFromPivotTable(n)
        }
      ]);
      zip.append(xml, { name: pivotTableRelsPath(n) });
    });
  }

  _finalize(zip: IZipWriter): Promise<this> {
    return new Promise((resolve, reject) => {
      zip.on("finish", () => {
        resolve(this);
      });
      zip.on("error", reject);
      zip.finalize();
    });
  }

  prepareModel(model: any, options: any): void {
    model.creator = model.creator || "ExcelTS";
    model.lastModifiedBy = model.lastModifiedBy || "ExcelTS";
    model.created = model.created || new Date();
    model.modified = model.modified || new Date();

    model.useSharedStrings =
      options.useSharedStrings !== undefined ? options.useSharedStrings : true;
    model.useStyles = options.useStyles !== undefined ? options.useStyles : true;

    model.sharedStrings = new SharedStringsXform();

    // Preserve default font from parsed styles if available
    const oldDefaultFont = model.defaultFont;
    model.styles = model.useStyles ? new StylesXform(true) : new (StylesXform as any).Mock();
    if (oldDefaultFont && model.styles.setDefaultFont) {
      model.styles.setDefaultFont(oldDefaultFont);
    }

    const workbookXform = new WorkbookXform();
    const worksheetXform = new WorkSheetXform();

    workbookXform.prepare(model);

    const worksheetOptions: any = {
      sharedStrings: model.sharedStrings,
      styles: model.styles,
      date1904: model.properties.date1904,
      drawingsCount: 0,
      media: model.media
    };
    worksheetOptions.drawings = model.drawings = [];
    worksheetOptions.commentRefs = model.commentRefs = [];
    worksheetOptions.formControlRefs = model.formControlRefs = [];
    let tableCount = 0;
    model.tables = [];
    model.worksheets.forEach((worksheet: any) => {
      worksheet.tables.forEach((table: any) => {
        tableCount++;
        table.target = `table${tableCount}.xml`;
        table.id = tableCount;
        model.tables.push(table);
      });

      worksheetXform.prepare(worksheet, worksheetOptions);
    });

    // ContentTypesXform expects this flag
    model.hasCheckboxes = model.styles.hasCheckboxes;

    // Build passthroughContentTypes for ContentTypesXform using PassthroughManager
    const passthrough = model.passthrough || {};
    const passthroughManager = new PassthroughManager();
    passthroughManager.fromRecord(passthrough);
    model.passthroughContentTypes = passthroughManager.getContentTypes();
  }
}

export { XLSX };
