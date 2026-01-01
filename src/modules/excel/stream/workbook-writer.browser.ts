/**
 * WorkbookWriter - Browser Streaming Excel Writer
 *
 * This module contains the full cross-platform implementation for the streaming
 * workbook writer and a browser-compatible `WorkbookWriter` class.
 *
 * Node.js uses `workbook-writer.ts`, which extends the same base implementation
 * with filesystem-specific features (filename output + image loading).
 */

import { Zip, ZipDeflate } from "../../archive/streaming-zip";
import { StreamBuf } from "../utils/stream-buf";
import { base64ToUint8Array } from "../utils/utils";
import { RelType } from "../xlsx/rel-type";
import { StylesXform } from "../xlsx/xform/style/styles-xform";
import { SharedStrings } from "../utils/shared-strings";
import { DefinedNames } from "../defined-names";
import { CoreXform } from "../xlsx/xform/core/core-xform";
import { RelationshipsXform } from "../xlsx/xform/core/relationships-xform";
import { ContentTypesXform } from "../xlsx/xform/core/content-types-xform";
import { AppXform } from "../xlsx/xform/core/app-xform";
import { WorkbookXform } from "../xlsx/xform/book/workbook-xform";
import { SharedStringsXform } from "../xlsx/xform/strings/shared-strings-xform";
import { theme1Xml } from "../xlsx/xml/theme1";
import type { Writable } from "../../stream";
import { Writeable, stringToUint8Array } from "../../stream";
import {
  mediaPath,
  OOXML_PATHS,
  OOXML_REL_TARGETS,
  worksheetRelTarget
} from "../utils/ooxml-paths";
import type { Image, WorkbookView, AddWorksheetOptions } from "../types";
import { WorksheetWriter } from "./worksheet-writer";

const EMPTY_U8 = new Uint8Array(0);
const TEXT_DECODER = new TextDecoder();

// ============================================================================
// Types
// ============================================================================

interface Medium extends Image {
  type: "image";
  name: string;
}

interface CommentRef {
  commentName: string;
  vmlDrawing: string;
}

export interface ZlibOptions {
  flush?: number;
  finishFlush?: number;
  chunkSize?: number;
  windowBits?: number;
  level?: number;
  memLevel?: number;
  strategy?: number;
  dictionary?: Uint8Array | ArrayBuffer;
}

export interface ZipOptions {
  comment?: string;
  forceLocalTime?: boolean;
  forceZip64?: boolean;
  store?: boolean;
  zlib?: Partial<ZlibOptions>;
  compressionOptions?: { level?: number };
}

export interface WorkbookWriterOptions {
  created?: Date;
  modified?: Date;
  creator?: string;
  lastModifiedBy?: string;
  lastPrinted?: Date;
  useSharedStrings?: boolean;
  useStyles?: boolean;
  zip?: Partial<ZipOptions>;
  stream?: Writable | WritableStream<Uint8Array>;
  filename?: string; // Node.js only
  trueStreaming?: boolean;
}

interface OutputStreamLike {
  emit(eventName: string | symbol, ...args: any[]): boolean;
  write(chunk: any): boolean | Promise<boolean>;
  end(): void;
  once(eventName: string | symbol, listener: (...args: any[]) => void): this;
  removeListener(eventName: string | symbol, listener: (...args: any[]) => void): this;
}

// ============================================================================
// WorksheetWriter interface (to avoid circular dependency)
// ============================================================================

export interface WorksheetWriterLike {
  id: number;
  name: string;
  rId?: string;
  committed?: boolean;
  stream: any;
  commit(): void;
}

export interface WorksheetWriterConstructor<T extends WorksheetWriterLike> {
  new (options: {
    id: number;
    name: string;
    workbook: any;
    useSharedStrings: boolean;
    properties?: any;
    state?: any;
    pageSetup?: any;
    views?: any;
    autoFilter?: any;
    headerFooter?: any;
  }): T;
}

// ============================================================================
// Base Class
// ============================================================================

export abstract class WorkbookWriterBase<TWorksheetWriter extends WorksheetWriterLike> {
  created: Date;
  modified: Date;
  creator: string;
  lastModifiedBy: string;
  lastPrinted?: Date;
  useSharedStrings: boolean;
  sharedStrings: SharedStrings;
  styles: StylesXform;
  _definedNames: DefinedNames;
  _worksheets: TWorksheetWriter[];
  views: WorkbookView[];
  zipOptions?: Partial<ZipOptions>;
  compressionLevel: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  media: Medium[];
  commentRefs: CommentRef[];
  zip: Zip;
  stream: OutputStreamLike;
  promise: Promise<void[]>;
  protected _trueStreaming: boolean;
  protected WorksheetWriterClass: WorksheetWriterConstructor<TWorksheetWriter>;

  constructor(
    options: WorkbookWriterOptions,
    WorksheetWriterClass: WorksheetWriterConstructor<TWorksheetWriter>
  ) {
    this.WorksheetWriterClass = WorksheetWriterClass;
    this.created = options.created || new Date();
    this.modified = options.modified || this.created;
    this.creator = options.creator || "ExcelTS";
    this.lastModifiedBy = options.lastModifiedBy || "ExcelTS";
    this.lastPrinted = options.lastPrinted;

    this.useSharedStrings = options.useSharedStrings || false;
    this.sharedStrings = new SharedStrings();
    this.styles = options.useStyles ? new StylesXform(true) : new (StylesXform as any).Mock(true);
    this._definedNames = new DefinedNames();
    this._worksheets = [];
    this.views = [];

    this.zipOptions = options.zip;
    const level = options.zip?.zlib?.level ?? options.zip?.compressionOptions?.level ?? 1;
    this.compressionLevel = Math.max(0, Math.min(9, level)) as
      | 0
      | 1
      | 2
      | 3
      | 4
      | 5
      | 6
      | 7
      | 8
      | 9;

    this.media = [];
    this.commentRefs = [];
    this._trueStreaming = options.trueStreaming ?? false;

    // Create Zip instance
    this.zip = new Zip((err, data, final) => {
      if (err) {
        this.stream.emit("error", err);
      } else {
        // `streaming-zip` already emits `Uint8Array`; avoid copying per chunk.
        this.stream.write(data);
        if (final) {
          this.stream.end();
        }
      }
    });

    // Setup output stream
    this.stream = this._createOutputStream(options);

    // Add initial files
    this.promise = Promise.all([this.addThemes(), this.addOfficeRels()]);
  }

  /**
   * Create output stream - can be overridden by Node.js to support filename
   */
  protected _createOutputStream(options: WorkbookWriterOptions): OutputStreamLike {
    if (options.stream) {
      return Writeable(options.stream);
    }
    return new StreamBuf();
  }

  get definedNames(): DefinedNames {
    return this._definedNames;
  }

  _openStream(path: string): InstanceType<typeof StreamBuf> {
    const stream = new StreamBuf({
      bufSize: this._trueStreaming ? 4096 : 65536,
      batch: !this._trueStreaming
    });

    const zipFile = new ZipDeflate(path, { level: this.compressionLevel });
    this.zip.add(zipFile);

    const onData = (chunk: Uint8Array) => zipFile.push(chunk);
    stream.on("data", onData);

    stream.once("finish", () => {
      stream.removeListener("data", onData);
      zipFile.push(EMPTY_U8, true);
      stream.emit("zipped");
    });

    return stream;
  }

  _addFile(data: string | Uint8Array, name: string, base64?: boolean): void {
    const zipFile = new ZipDeflate(name, { level: this.compressionLevel });
    this.zip.add(zipFile);

    let buffer: Uint8Array;
    if (base64) {
      const base64Data = typeof data === "string" ? data : TEXT_DECODER.decode(data);
      buffer = base64ToUint8Array(base64Data);
    } else if (typeof data === "string") {
      buffer = stringToUint8Array(data);
    } else {
      buffer = data;
    }

    zipFile.push(buffer, true);
  }

  _commitWorksheets(): Promise<void> {
    const commitWorksheet = (worksheet: TWorksheetWriter): Promise<void> => {
      if (!worksheet.committed) {
        return new Promise(resolve => {
          worksheet.stream.once("zipped", () => resolve());
          worksheet.commit();
        });
      }
      return Promise.resolve();
    };
    const promises = this._worksheets.map(commitWorksheet);
    return promises.length ? Promise.all(promises).then(() => {}) : Promise.resolve();
  }

  async commit(): Promise<void> {
    await this.promise;
    await this._commitWorksheets();
    await this.addMedia();
    await Promise.all([
      this.addContentTypes(),
      this.addApp(),
      this.addCore(),
      this.addSharedStrings(),
      this.addStyles(),
      this.addWorkbookRels()
    ]);
    await this.addWorkbook();
    await this._finalize();
  }

  get nextId(): number {
    for (let i = 1; i < this._worksheets.length; i++) {
      if (!this._worksheets[i]) {
        return i;
      }
    }
    return this._worksheets.length || 1;
  }

  addImage(image: Image): number {
    const id = this.media.length;
    const medium: Medium = {
      ...image,
      type: "image" as const,
      name: `image${id}.${image.extension}`
    };
    this.media.push(medium);
    return id;
  }

  getImage(id: number): Image | undefined {
    return this.media[id];
  }

  addWorksheet(name?: string, options?: Partial<AddWorksheetOptions>): TWorksheetWriter {
    const opts = options || {};
    const useSharedStrings =
      opts.useSharedStrings !== undefined ? opts.useSharedStrings : this.useSharedStrings;

    if ((opts as any).tabColor) {
      console.trace("tabColor option has moved to { properties: tabColor: {...} }");
      opts.properties = { tabColor: (opts as any).tabColor, ...opts.properties };
    }

    const id = this.nextId;
    name = name || `sheet${id}`;

    const worksheet = new this.WorksheetWriterClass({
      id,
      name,
      workbook: this,
      useSharedStrings,
      properties: opts.properties,
      state: opts.state,
      pageSetup: opts.pageSetup,
      views: opts.views,
      autoFilter: opts.autoFilter,
      headerFooter: opts.headerFooter
    });

    this._worksheets[id] = worksheet;
    return worksheet;
  }

  getWorksheet(id?: string | number): TWorksheetWriter | undefined {
    if (id === undefined) {
      return this._worksheets.find(() => true);
    }
    if (typeof id === "number") {
      return this._worksheets[id];
    }
    if (typeof id === "string") {
      return this._worksheets.find(ws => ws?.name === id);
    }
    return undefined;
  }

  addStyles(): Promise<void> {
    return new Promise(resolve => {
      this._addFile(this.styles.xml, OOXML_PATHS.xlStyles);
      resolve();
    });
  }

  addThemes(): Promise<void> {
    return new Promise(resolve => {
      this._addFile(theme1Xml, OOXML_PATHS.xlTheme1);
      resolve();
    });
  }

  addOfficeRels(): Promise<void> {
    return new Promise(resolve => {
      const xform = new RelationshipsXform();
      const xml = xform.toXml([
        { Id: "rId1", Type: RelType.OfficeDocument, Target: OOXML_PATHS.xlWorkbook },
        { Id: "rId2", Type: RelType.CoreProperties, Target: OOXML_PATHS.docPropsCore },
        { Id: "rId3", Type: RelType.ExtenderProperties, Target: OOXML_PATHS.docPropsApp }
      ]);
      this._addFile(xml, OOXML_PATHS.rootRels);
      resolve();
    });
  }

  addContentTypes(): Promise<void> {
    return new Promise(resolve => {
      const model = {
        worksheets: this._worksheets.filter(Boolean),
        sharedStrings: this.sharedStrings,
        commentRefs: this.commentRefs,
        media: this.media
      };
      const xform = new ContentTypesXform();
      this._addFile(xform.toXml(model), OOXML_PATHS.contentTypes);
      resolve();
    });
  }

  /**
   * Add media files - can be overridden by Node.js for file system support
   */
  addMedia(): Promise<void[]> {
    return Promise.all(
      this.media.map(async medium => {
        if (medium.type === "image") {
          const filename = mediaPath(medium.name);
          if (medium.buffer) {
            this._addFile(medium.buffer, filename);
            return;
          }
          if (medium.base64) {
            const content = medium.base64.substring(medium.base64.indexOf(",") + 1);
            this._addFile(content, filename, true);
            return;
          }
          if (medium.filename) {
            throw new Error(
              "Loading images from filename is not supported in browser. Use buffer or base64."
            );
          }
        }
        throw new Error("Unsupported media");
      })
    );
  }

  addApp(): Promise<void> {
    return new Promise(resolve => {
      const xform = new AppXform();
      this._addFile(
        xform.toXml({ worksheets: this._worksheets.filter(Boolean) }),
        OOXML_PATHS.docPropsApp
      );
      resolve();
    });
  }

  addCore(): Promise<void> {
    return new Promise(resolve => {
      const xform = new CoreXform();
      this._addFile(xform.toXml(this), OOXML_PATHS.docPropsCore);
      resolve();
    });
  }

  addSharedStrings(): Promise<void> {
    if (this.sharedStrings.count) {
      return new Promise(resolve => {
        const xform = new SharedStringsXform();
        this._addFile(xform.toXml(this.sharedStrings), OOXML_PATHS.xlSharedStrings);
        resolve();
      });
    }
    return Promise.resolve();
  }

  addWorkbookRels(): Promise<void> {
    let count = 1;
    const relationships: Array<{ Id: string; Type: string; Target: string }> = [
      { Id: `rId${count++}`, Type: RelType.Styles, Target: OOXML_REL_TARGETS.workbookStyles },
      { Id: `rId${count++}`, Type: RelType.Theme, Target: OOXML_REL_TARGETS.workbookTheme1 }
    ];
    if (this.sharedStrings.count) {
      relationships.push({
        Id: `rId${count++}`,
        Type: RelType.SharedStrings,
        Target: OOXML_REL_TARGETS.workbookSharedStrings
      });
    }
    this._worksheets.forEach(ws => {
      if (ws) {
        ws.rId = `rId${count++}`;
        relationships.push({
          Id: ws.rId,
          Type: RelType.Worksheet,
          Target: worksheetRelTarget(ws.id)
        });
      }
    });

    return new Promise(resolve => {
      const xform = new RelationshipsXform();
      this._addFile(xform.toXml(relationships), OOXML_PATHS.xlWorkbookRels);
      resolve();
    });
  }

  addWorkbook(): Promise<void> {
    const model = {
      worksheets: this._worksheets.filter(Boolean),
      definedNames: this._definedNames.model,
      views: this.views,
      properties: {},
      calcProperties: {}
    };
    return new Promise(resolve => {
      const xform = new WorkbookXform();
      xform.prepare(model);
      this._addFile(xform.toXml(model), OOXML_PATHS.xlWorkbook);
      resolve();
    });
  }

  _finalize(): Promise<this> {
    return new Promise((resolve, reject) => {
      const onError = (err: Error) => {
        this.stream.removeListener("finish", onFinish);
        reject(err);
      };
      const onFinish = () => {
        this.stream.removeListener("error", onError);
        resolve(this);
      };
      this.stream.once("error", onError);
      this.stream.once("finish", onFinish);
      this.zip.end();
    });
  }
}

export const WorkbookWriterOptionsSchema = {
  useSharedStrings: ["boolean"],
  useStyles: ["boolean"],
  trueStreaming: ["boolean"]
} as const;

// ============================================================================
// Browser-compatible WorkbookWriter
// ============================================================================

class WorkbookWriter extends WorkbookWriterBase<WorksheetWriter> {
  constructor(options: WorkbookWriterOptions = {}) {
    super(options, WorksheetWriter);
  }
}

export { WorkbookWriter };
