/**
 * WorkbookReader - Node.js Streaming Workbook Reader
 *
 * Extends base with file path support and temp file storage for large files.
 */

import fs from "fs";
import type { Readable } from "../../stream";
import os from "os";
import { join } from "path";
import { iterateStream } from "../utils/iterate-stream";
import { WorksheetReader } from "./worksheet-reader";
import { HyperlinkReader } from "./hyperlink-reader";
import {
  WorkbookReaderBase,
  type CommonInput,
  type WorkbookReaderOptions,
  type WorksheetReadyEvent,
  WorkbookReaderOptionsSchema
} from "./workbook-reader.browser";

// Re-export types
export type {
  WorkbookReaderOptions,
  InternalWorksheetOptions,
  SharedStringRichText,
  SharedStringValue,
  WorkbookRelationship,
  SheetMetadata,
  WorkbookModel,
  WorkbookPropertiesXform,
  ParseEventType,
  SharedStringEvent,
  WorksheetReadyEvent,
  HyperlinksEvent,
  ParseEvent
} from "./workbook-reader.browser";

export type NodeInput = string | CommonInput;

interface WaitingWorksheet {
  sheetNo: string;
  path: string;
  cleanup: () => void;
  writePromise: Promise<void>;
}

class WorkbookReader extends WorkbookReaderBase<
  NodeInput,
  WorksheetReader,
  HyperlinkReader,
  WaitingWorksheet
> {
  constructor(input: NodeInput, options: WorkbookReaderOptions = {}) {
    super(input as CommonInput, options, WorksheetReader, HyperlinkReader);
    this.input = input as NodeInput;
  }

  _getStream(input: NodeInput): Readable {
    if (typeof input === "string") {
      return fs.createReadStream(input);
    }
    return super._getStream(input as CommonInput);
  }

  async _storeWaitingWorksheet(sheetNo: string, entry: any): Promise<WaitingWorksheet> {
    const tmpDir = fs.mkdtempSync(join(os.tmpdir(), "excelts-"));
    const path = join(tmpDir, `sheet${sheetNo}.xml`);
    const cleanup = () => fs.rm(tmpDir, { recursive: true, force: true }, () => {});

    const writePromise = new Promise<void>((resolve, reject) => {
      const tempStream = fs.createWriteStream(path);
      tempStream.on("error", reject);
      tempStream.on("finish", resolve);
      entry.pipe(tempStream);
    });

    return { sheetNo, path, cleanup, writePromise };
  }

  async *_processWaitingWorksheets(
    waitingWorksheets: WaitingWorksheet[]
  ): AsyncIterableIterator<WorksheetReadyEvent<WorksheetReader>> {
    for (const ws of waitingWorksheets) {
      await ws.writePromise;
      const fileStream = fs.createReadStream(ws.path);
      try {
        yield* this._parseWorksheet(iterateStream(fileStream), ws.sheetNo);
      } finally {
        fileStream.close();
        ws.cleanup();
      }
    }
  }
}

export { WorkbookReader, WorkbookReaderOptionsSchema };
