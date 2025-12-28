import { EventEmitter } from "events";
import { parseSax } from "../../utils/parse-sax";
import { xmlDecode, isDateFmt, excelToDate } from "../../utils/utils";
import { colCache } from "../../utils/col-cache";
import { Dimensions } from "../../doc/range";
import { Row } from "../../doc/row";
import { Column } from "../../doc/column";
import type { WorkbookReader, InternalWorksheetOptions } from "./workbook-reader";
import type { WorksheetState, CellErrorValue } from "../../types";

// ============================================================================
// Internal Types
// ============================================================================

/** Column model from parsed XML */
interface ParsedColumnModel {
  min: number;
  max: number;
  width: number;
  styleId: number;
}

/** Cell parsing state during XML processing */
interface CellParseState {
  ref: string;
  s: number;
  t?: string;
  f?: { text: string };
  v?: { text: string };
}

/** Hyperlink reference from worksheet XML */
export interface WorksheetHyperlink {
  ref: string;
  rId: string;
}

/** Events emitted during worksheet parsing */
export type WorksheetEventType = RowEvent["eventType"] | HyperlinkEvent["eventType"];

/** Row event emitted during parsing */
export interface RowEvent {
  eventType: "row";
  value: Row;
}

/** Hyperlink event emitted during parsing */
export interface HyperlinkEvent {
  eventType: "hyperlink";
  value: WorksheetHyperlink;
}

export type WorksheetEvent = RowEvent | HyperlinkEvent;

// ============================================================================
// Public Types
// ============================================================================

export interface WorksheetReaderOptions {
  workbook: WorkbookReader;
  id: number;
  iterator: AsyncIterable<unknown>;
  options?: InternalWorksheetOptions;
}

class WorksheetReader extends EventEmitter {
  workbook: WorkbookReader;
  id: number | string;
  iterator: AsyncIterable<unknown>;
  options: InternalWorksheetOptions;
  name: string;
  state?: WorksheetState;
  declare private _columns: Column[] | null;
  declare private _keys: Record<string, Column>;
  declare private _dimensions: Dimensions;
  hyperlinks?: Record<string, WorksheetHyperlink>;

  constructor({ workbook, id, iterator, options }: WorksheetReaderOptions) {
    super();

    this.workbook = workbook;
    this.id = id;
    this.iterator = iterator;
    this.options = options || {};

    // and a name
    this.name = `Sheet${this.id}`;

    // column definitions
    this._columns = null;
    this._keys = {};

    // keep a record of dimensions
    this._dimensions = new Dimensions();
  }

  // destroy - not a valid operation for a streaming writer
  // even though some streamers might be able to, it's a bad idea.
  destroy(): void {
    throw new Error("Invalid Operation: destroy");
  }

  // return the current dimensions of the reader
  get dimensions(): Dimensions {
    return this._dimensions;
  }

  // =========================================================================
  // Columns

  // get the current columns array.
  get columns(): Column[] | null {
    return this._columns;
  }

  // get a single column by col number. If it doesn't exist, it and any gaps before it
  // are created.
  getColumn(c: string | number): Column {
    if (typeof c === "string") {
      // if it matches a key'd column, return that
      const col = this._keys[c];
      if (col) {
        return col;
      }

      // otherwise, assume letter
      c = colCache.l2n(c);
    }
    if (!this._columns) {
      this._columns = [];
    }
    if (c > this._columns.length) {
      let n = this._columns.length + 1;
      while (n <= c) {
        this._columns.push(new Column(this as any, n++));
      }
    }
    return this._columns[c - 1];
  }

  getColumnKey(key: string): Column | undefined {
    return this._keys[key];
  }

  setColumnKey(key: string, value: Column): void {
    this._keys[key] = value;
  }

  deleteColumnKey(key: string): void {
    delete this._keys[key];
  }

  eachColumnKey(f: (column: Column, key: string) => void): void {
    Object.keys(this._keys).forEach(key => f(this._keys[key], key));
  }

  async read(): Promise<void> {
    try {
      for await (const events of this.parse()) {
        for (const { eventType, value } of events) {
          this.emit(eventType, value);
        }
      }
      this.emit("finished");
    } catch (error) {
      this.emit("error", error);
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<Row> {
    for await (const events of this.parse()) {
      for (const event of events) {
        if (event.eventType === "row") {
          yield event.value;
        }
      }
    }
  }

  async *parse(): AsyncIterableIterator<WorksheetEvent[]> {
    const { iterator, options } = this;
    let emitSheet = false;
    let emitHyperlinks = false;
    let hyperlinks: Record<string, WorksheetHyperlink> | null = null;
    switch (options.worksheets) {
      case "emit":
        emitSheet = true;
        break;
      case "prep":
        break;
      default:
        break;
    }
    switch (options.hyperlinks) {
      case "emit":
        emitHyperlinks = true;
        break;
      case "cache":
        this.hyperlinks = hyperlinks = {};
        break;
      default:
        break;
    }
    if (!emitSheet && !emitHyperlinks && !hyperlinks) {
      return;
    }

    // references
    const { sharedStrings, styles, properties } = this.workbook;

    // xml position
    let inCols = false;
    let inRows = false;
    let inHyperlinks = false;

    // parse state
    let cols: ParsedColumnModel[] | null = null;
    let row: Row | null = null;
    let c: CellParseState | null = null;
    let current: { text: string } | null = null;
    for await (const events of parseSax(iterator)) {
      const worksheetEvents: WorksheetEvent[] = [];
      for (const { eventType, value } of events) {
        if (eventType === "opentag") {
          const node = value;
          if (emitSheet) {
            switch (node.name) {
              case "cols":
                inCols = true;
                cols = [];
                break;
              case "sheetData":
                inRows = true;
                break;

              case "col":
                if (inCols) {
                  cols!.push({
                    min: parseInt(node.attributes.min, 10),
                    max: parseInt(node.attributes.max, 10),
                    width: parseFloat(node.attributes.width),
                    styleId: parseInt(node.attributes.style || "0", 10)
                  });
                }
                break;

              case "row":
                if (inRows) {
                  const r = parseInt(node.attributes.r, 10);
                  row = new Row(this as any, r);
                  if (node.attributes.ht) {
                    row.height = parseFloat(node.attributes.ht);
                  }
                  if (node.attributes.s) {
                    const styleId = parseInt(node.attributes.s, 10);
                    const style = styles.getStyleModel(styleId);
                    if (style) {
                      row.style = style;
                    }
                  }
                }
                break;
              case "c":
                if (row) {
                  c = {
                    ref: node.attributes.r,
                    s: parseInt(node.attributes.s, 10),
                    t: node.attributes.t
                  };
                }
                break;
              case "f":
                if (c) {
                  current = c.f = { text: "" };
                }
                break;
              case "v":
                if (c) {
                  current = c.v = { text: "" };
                }
                break;
              case "is":
              case "t":
                if (c) {
                  current = c.v = { text: "" };
                }
                break;
              case "mergeCell":
                break;
              default:
                break;
            }
          }

          // =================================================================
          //
          if (emitHyperlinks || hyperlinks) {
            switch (node.name) {
              case "hyperlinks":
                inHyperlinks = true;
                break;
              case "hyperlink":
                if (inHyperlinks) {
                  const hyperlink = {
                    ref: node.attributes.ref,
                    rId: node.attributes["r:id"]
                  };
                  if (emitHyperlinks) {
                    worksheetEvents.push({ eventType: "hyperlink", value: hyperlink });
                  } else {
                    hyperlinks![hyperlink.ref] = hyperlink;
                  }
                }
                break;
              default:
                break;
            }
          }
        } else if (eventType === "text") {
          // only text data is for sheet values
          if (emitSheet) {
            if (current) {
              current.text += value;
            }
          }
        } else if (eventType === "closetag") {
          const node = value;
          if (emitSheet) {
            switch (node.name) {
              case "cols":
                inCols = false;
                this._columns = (
                  Column as unknown as { fromModel(model: ParsedColumnModel[]): Column[] }
                ).fromModel(cols!);
                break;
              case "sheetData":
                inRows = false;
                break;

              case "row":
                this._dimensions.expandRow(row);
                worksheetEvents.push({ eventType: "row", value: row });
                row = null;
                break;

              case "c":
                if (row && c) {
                  const address = colCache.decodeAddress(c.ref);
                  const cell = row.getCell(address.col);
                  if (c.s) {
                    const style = styles.getStyleModel(c.s);
                    if (style) {
                      cell.style = style;
                    }
                  }

                  if (c.f) {
                    const cellValue: any = {
                      formula: c.f.text
                    };
                    if (c.v) {
                      if (c.t === "str") {
                        cellValue.result = xmlDecode(c.v.text);
                      } else {
                        cellValue.result = parseFloat(c.v.text);
                      }
                    }
                    cell.value = cellValue;
                  } else if (c.v) {
                    switch (c.t) {
                      case "s": {
                        const index = parseInt(c.v.text, 10);
                        if (sharedStrings) {
                          cell.value = sharedStrings[index];
                        } else {
                          // Streaming format - unresolved shared string reference
                          (cell as { value: unknown }).value = {
                            sharedString: index
                          };
                        }
                        break;
                      }

                      case "inlineStr":
                      case "str":
                        cell.value = xmlDecode(c.v.text);
                        break;

                      case "e":
                        cell.value = { error: c.v.text as CellErrorValue["error"] };
                        break;

                      case "b":
                        cell.value = parseInt(c.v.text, 10) !== 0;
                        break;

                      default: {
                        const numFmtStr =
                          typeof cell.numFmt === "string" ? cell.numFmt : cell.numFmt?.formatCode;
                        if (numFmtStr && isDateFmt(numFmtStr)) {
                          cell.value = excelToDate(
                            parseFloat(c.v.text),
                            properties?.model?.date1904
                          );
                        } else {
                          cell.value = parseFloat(c.v.text);
                        }
                        break;
                      }
                    }
                  }
                  if (hyperlinks) {
                    const hyperlink = hyperlinks[c.ref];
                    if (hyperlink) {
                      // Streaming-specific: assign text and hyperlink for further processing
                      (cell as { text: unknown }).text = cell.value;
                      cell.value = undefined;
                      (cell as { hyperlink: unknown }).hyperlink = hyperlink;
                    }
                  }
                  c = null;
                }
                break;
              default:
                break;
            }
          }
          if (emitHyperlinks || hyperlinks) {
            switch (node.name) {
              case "hyperlinks":
                inHyperlinks = false;
                break;
              default:
                break;
            }
          }
        }
      }
      if (worksheetEvents.length > 0) {
        yield worksheetEvents;
      }
    }
  }
}

export { WorksheetReader };
