import { colCache } from "@excel/utils/col-cache";
import type {
  Address,
  CellFormulaValue,
  CellValue,
  Style,
  TableColumnProperties,
  TableStyleProperties
} from "@excel/types";
import type { Worksheet } from "@excel/worksheet";
import type { Cell } from "@excel/cell";

interface TableModel {
  ref: string;
  name: string;
  displayName?: string;
  columns: TableColumnProperties[];
  rows: CellValue[][];
  headerRow?: boolean;
  totalsRow?: boolean;
  qualifyImplicitStructuredReferences?: boolean;
  style?: TableStyleProperties;
  tl?: Address;
  autoFilterRef?: string;
  tableRef?: string;
}

/**
 * Maximum length for an Excel defined name (and therefore table name).
 */
const MAX_TABLE_NAME_LENGTH = 255;

/**
 * Matches an A1-style cell reference pattern like A1, Z99, XFD1048576.
 * Excel rejects table names that match this pattern.
 */
const CELL_REF_PATTERN = /^[A-Za-z]{1,3}\d+$/;

/**
 * Matches an R1C1-style cell reference, e.g. R1C1, R100C200.
 * Must have at least one digit after R and at least one digit after C
 * to be considered a cell reference. Bare "RC" is NOT a cell reference.
 */
const R1C1_PATTERN = /^[Rr]\d+[Cc]\d+$/;

/**
 * Single-character names that Excel reserves for row/column navigation.
 * Per Microsoft docs: "You cannot use the uppercase and lowercase characters
 * 'C', 'c', 'R', or 'r' as a defined name."
 */
const RESERVED_SINGLE_CHARS = new Set(["C", "c", "R", "r"]);

/**
 * Sanitize a table name to comply with OOXML defined name rules
 * (ECMA-376, 4th edition, Part 1, §18.5.1.2).
 *
 * Rules enforced (per Microsoft documentation):
 * - First character must be a letter (any script), underscore (_), or backslash (\)
 * - Subsequent characters may be letters, digits, underscores, or periods (.)
 * - Backslash is only valid as the first character
 * - Spaces are replaced with underscores
 * - Other invalid characters are stripped
 * - Single-character names "C", "c", "R", "r" are prefixed with _
 * - Names that look like cell references (e.g. A1, R1C1) are prefixed with _
 * - Maximum 255 characters
 * - Empty result falls back to "_Table"
 *
 * This library applies these rules automatically so that generated files
 * always comply with the OOXML schema, avoiding Excel "repair" dialogs.
 */
function sanitizeTableName(name: string): string {
  // Replace all whitespace characters (space, tab, newline, etc.) with underscores
  let sanitized = name.replace(/\s/g, "_");

  // Preserve a leading backslash (valid only as first character per spec)
  let leadingBackslash = false;
  if (sanitized.startsWith("\\")) {
    leadingBackslash = true;
    sanitized = sanitized.slice(1);
  }

  // Strip characters not valid in defined names.
  // Subsequent characters: Unicode letters, digits, underscore, period.
  // Backslash is NOT valid in subsequent positions.
  sanitized = sanitized.replace(/[^\p{L}\p{N}_.]/gu, "");

  // Re-attach leading backslash
  if (leadingBackslash) {
    sanitized = `\\${sanitized}`;
  }

  // Ensure the first character is valid (letter, underscore, or backslash)
  if (sanitized.length > 0 && !/^[\p{L}_\\]/u.test(sanitized[0])) {
    sanitized = `_${sanitized}`;
  }

  // Truncate to max length
  if (sanitized.length > MAX_TABLE_NAME_LENGTH) {
    sanitized = sanitized.slice(0, MAX_TABLE_NAME_LENGTH);
  }

  // Fallback if empty after sanitization
  if (sanitized.length === 0) {
    return "_Table";
  }

  // Avoid reserved single-character names (C, c, R, r)
  if (sanitized.length === 1 && RESERVED_SINGLE_CHARS.has(sanitized)) {
    sanitized = `_${sanitized}`;
  }

  // Avoid names that look like cell references
  if (CELL_REF_PATTERN.test(sanitized) || R1C1_PATTERN.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }

  return sanitized;
}

interface CacheState {
  ref: string;
  width: number;
  tableHeight: number;
}

class Column {
  // wrapper around column model, allowing access and manipulation
  table: Table;
  column: TableColumnProperties;
  index: number;

  constructor(table: Table, column: TableColumnProperties, index: number) {
    this.table = table;
    this.column = column;
    this.index = index;
  }

  private _set<K extends keyof TableColumnProperties>(
    name: K,
    value: TableColumnProperties[K]
  ): void {
    this.table.cacheState();
    this.column[name] = value;
  }

  get name(): string {
    return this.column.name;
  }
  set name(value: string) {
    this._set("name", value);
  }

  get filterButton(): boolean | undefined {
    return this.column.filterButton;
  }
  set filterButton(value: boolean | undefined) {
    this.column.filterButton = value;
  }

  get style(): Partial<Style> | undefined {
    return this.column.style;
  }
  set style(value: Partial<Style> | undefined) {
    this.column.style = value;
  }

  get totalsRowLabel(): string | undefined {
    return this.column.totalsRowLabel;
  }
  set totalsRowLabel(value: string | undefined) {
    this._set("totalsRowLabel", value);
  }

  get totalsRowFunction(): TableColumnProperties["totalsRowFunction"] {
    return this.column.totalsRowFunction;
  }
  set totalsRowFunction(value: TableColumnProperties["totalsRowFunction"]) {
    this._set("totalsRowFunction", value);
  }

  get totalsRowResult(): CellValue {
    return this.column.totalsRowResult;
  }
  set totalsRowResult(value: CellFormulaValue["result"]) {
    this._set("totalsRowResult", value);
  }

  get totalsRowFormula(): string | undefined {
    return this.column.totalsRowFormula;
  }
  set totalsRowFormula(value: string | undefined) {
    this._set("totalsRowFormula", value);
  }
}

class Table {
  worksheet: Worksheet;
  table!: TableModel;
  declare private _cache?: CacheState;

  constructor(worksheet: Worksheet, table?: TableModel) {
    this.worksheet = worksheet;
    if (table) {
      this.table = table;

      // When loading tables from xlsx, Excel stores table ranges and cell values in the worksheet,
      // but may not embed row data into the table definition. Hydrate rows from the worksheet so
      // table mutations (e.g. addRow) can correctly expand table ranges and serialize.
      if (Array.isArray(table.rows) && table.rows.length === 0 && table.tableRef) {
        const decoded = colCache.decode(table.tableRef);
        if ("dimensions" in decoded) {
          const startRow = decoded.top + (table.headerRow === false ? 0 : 1);
          const endRow = decoded.bottom - (table.totalsRow === true ? 1 : 0);

          if (endRow >= startRow) {
            for (let r = startRow; r <= endRow; r++) {
              const row = worksheet.getRow(r);
              const values: CellValue[] = [];
              for (let c = decoded.left; c <= decoded.right; c++) {
                values.push(row.getCell(c).value);
              }
              table.rows.push(values);
            }
          }
        }
      }
      // check things are ok first
      this.validate();

      this.store();
    }
  }

  getFormula(column: TableColumnProperties): string | null {
    // get the correct formula to apply to the totals row
    switch (column.totalsRowFunction) {
      case "none":
        return null;
      case "average":
        return `SUBTOTAL(101,${this.table.name}[${column.name}])`;
      case "countNums":
        return `SUBTOTAL(102,${this.table.name}[${column.name}])`;
      case "count":
        return `SUBTOTAL(103,${this.table.name}[${column.name}])`;
      case "max":
        return `SUBTOTAL(104,${this.table.name}[${column.name}])`;
      case "min":
        return `SUBTOTAL(105,${this.table.name}[${column.name}])`;
      case "stdDev":
        return `SUBTOTAL(106,${this.table.name}[${column.name}])`;
      case "var":
        return `SUBTOTAL(107,${this.table.name}[${column.name}])`;
      case "sum":
        return `SUBTOTAL(109,${this.table.name}[${column.name}])`;
      case "custom":
        return column.totalsRowFormula ?? null;
      default:
        throw new Error(`Invalid Totals Row Function: ${column.totalsRowFunction}`);
    }
  }

  get width(): number {
    // width of the table
    return this.table.columns.length;
  }

  get height(): number {
    // height of the table data
    return this.table.rows.length;
  }

  get filterHeight(): number {
    // height of the table data plus optional header row
    return this.height + (this.table.headerRow ? 1 : 0);
  }

  get tableHeight(): number {
    // full height of the table on the sheet
    return this.filterHeight + (this.table.totalsRow ? 1 : 0);
  }

  validate(): void {
    const { table } = this;
    // set defaults and check is valid
    const assign = <T extends object, K extends keyof T>(o: T, name: K, dflt: T[K]): void => {
      if (o[name] === undefined) {
        o[name] = dflt;
      }
    };
    assign(table, "headerRow", true);
    assign(table, "totalsRow", false);

    assign(table, "style", {});
    assign(table.style, "theme", "TableStyleMedium2");
    assign(table.style, "showFirstColumn", false);
    assign(table.style, "showLastColumn", false);
    assign(table.style, "showRowStripes", false);
    assign(table.style, "showColumnStripes", false);

    // Sanitize table name and displayName to comply with OOXML defined name rules.
    // Excel UI rejects invalid names; here we auto-correct to avoid "repair" dialogs.
    if (table.name) {
      table.name = sanitizeTableName(table.name);
    }
    if (table.displayName) {
      table.displayName = sanitizeTableName(table.displayName);
    }

    const assert = (test: boolean, message: string) => {
      if (!test) {
        throw new Error(message);
      }
    };
    assert(!!table.name, "Table must have a name");
    assert(!!table.ref, "Table must have ref");
    assert(!!table.columns, "Table must have column definitions");
    assert(!!table.rows, "Table must have row definitions");

    table.tl = colCache.decodeAddress(table.ref);
    const { row, col } = table.tl;
    assert(row > 0, "Table must be on valid row");
    assert(col > 0, "Table must be on valid col");

    const { width, tableHeight } = this;

    // autoFilterRef is a single-row range that targets the header row only.
    // Excel uses this for filter buttons; including data rows can break filter rendering.
    table.autoFilterRef = colCache.encode(row, col, row, col + width - 1);

    // tableRef is a range that includes optional headers and totals
    table.tableRef = colCache.encode(row, col, row + tableHeight - 1, col + width - 1);

    table.columns.forEach((column, i) => {
      assert(!!column.name, `Column ${i} must have a name`);
      if (i === 0) {
        assign(column, "totalsRowLabel", "Total");
      } else {
        assign(column, "totalsRowFunction", "none");
        column.totalsRowFormula = this.getFormula(column) ?? undefined;
      }
    });
  }

  store(): void {
    // where the table needs to store table data, headers, footers in
    // the sheet...
    const assignStyle = (cell: Cell, style: Partial<Style> | undefined): void => {
      if (style) {
        Object.assign(cell.style, style);
      }
    };

    const { worksheet, table } = this;
    const { row, col } = table.tl;
    let count = 0;
    if (table.headerRow) {
      const r = worksheet.getRow(row + count++);
      table.columns.forEach((column, j) => {
        const { style, name } = column;
        const cell = r.getCell(col + j);
        cell.value = name;
        assignStyle(cell, style);
      });
    }
    table.rows.forEach(data => {
      const r = worksheet.getRow(row + count++);
      data.forEach((value, j) => {
        const cell = r.getCell(col + j);
        const formula = (value as any)?.formula;
        if (typeof formula === "string") {
          const shouldQualify = table.qualifyImplicitStructuredReferences === true;
          cell.value = {
            ...(value as CellFormulaValue),
            formula: shouldQualify
              ? formula.replace(
                  /(^|[^A-Za-z0-9_])\[@\[?([^\[\]]+?)\]?\]/g,
                  `$1${table.name}[[#This Row],[$2]]`
                )
              : formula
          } as CellFormulaValue;
        } else {
          cell.value = value;
        }

        assignStyle(cell, table.columns[j]?.style);
      });
    });

    if (table.totalsRow) {
      const r = worksheet.getRow(row + count++);
      table.columns.forEach((column, j) => {
        const cell = r.getCell(col + j);
        if (j === 0) {
          cell.value = column.totalsRowLabel;
        } else {
          const formula = this.getFormula(column);
          if (formula) {
            cell.value = {
              formula: column.totalsRowFormula,
              result: column.totalsRowResult
            };
          } else {
            cell.value = null;
          }
        }

        assignStyle(cell, column.style);
      });
    }
  }

  load(worksheet: Worksheet): void {
    // where the table will read necessary features from a loaded sheet
    const { table } = this;
    const { row, col } = table.tl!;
    let count = 0;
    if (table.headerRow) {
      const r = worksheet.getRow(row + count++);
      table.columns.forEach((column, j) => {
        const cell = r.getCell(col + j);
        cell.value = column.name;
      });
    }
    table.rows.forEach(data => {
      const r = worksheet.getRow(row + count++);
      data.forEach((value, j) => {
        const cell = r.getCell(col + j);
        cell.value = value;
      });
    });

    if (table.totalsRow) {
      const r = worksheet.getRow(row + count++);
      table.columns.forEach((column, j) => {
        const cell = r.getCell(col + j);
        if (j === 0) {
          cell.value = column.totalsRowLabel;
        } else {
          const formula = this.getFormula(column);
          if (formula) {
            cell.value = {
              formula: column.totalsRowFormula,
              result: column.totalsRowResult
            };
          }
        }
      });
    }
  }

  get model(): TableModel {
    return this.table;
  }

  set model(value: TableModel) {
    this.table = value;
  }

  // ================================================================
  // TODO: Mutating methods
  cacheState(): void {
    if (!this._cache) {
      this._cache = {
        ref: this.ref,
        width: this.width,
        tableHeight: this.tableHeight
      };
    }
  }

  commit(): void {
    // changes may have been made that might have on-sheet effects
    if (!this._cache) {
      return;
    }

    // check things are ok first
    this.validate();

    const ref = colCache.decodeAddress(this._cache.ref);
    if (this.ref !== this._cache.ref) {
      // wipe out whole table footprint at previous location
      for (let i = 0; i < this._cache.tableHeight; i++) {
        const row = this.worksheet.getRow(ref.row + i);
        for (let j = 0; j < this._cache.width; j++) {
          const cell = row.getCell(ref.col + j);
          cell.value = null;
        }
      }
    } else {
      // clear out below table if it has shrunk
      for (let i = this.tableHeight; i < this._cache.tableHeight; i++) {
        const row = this.worksheet.getRow(ref.row + i);
        for (let j = 0; j < this._cache.width; j++) {
          const cell = row.getCell(ref.col + j);
          cell.value = null;
        }
      }

      // clear out to right of table if it has lost columns
      for (let i = 0; i < this.tableHeight; i++) {
        const row = this.worksheet.getRow(ref.row + i);
        for (let j = this.width; j < this._cache.width; j++) {
          const cell = row.getCell(ref.col + j);
          cell.value = null;
        }
      }
    }

    this.store();
    this._cache = undefined;
  }

  addRow(values: CellValue[], rowNumber?: number, options?: { commit?: boolean }): void {
    // Add a row of data, either insert at rowNumber or append
    this.cacheState();

    if (rowNumber === undefined) {
      this.table.rows.push(values);
    } else {
      this.table.rows.splice(rowNumber, 0, values);
    }

    if (options?.commit !== false) {
      this.commit();
    }
  }

  removeRows(rowIndex: number, count: number = 1, options?: { commit?: boolean }): void {
    // Remove a rows of data
    this.cacheState();
    this.table.rows.splice(rowIndex, count);

    if (options?.commit !== false) {
      this.commit();
    }
  }

  getColumn(colIndex: number): Column {
    const column = this.table.columns[colIndex];
    return new Column(this, column, colIndex);
  }

  addColumn(column: TableColumnProperties, values: CellValue[], colIndex?: number): void {
    // Add a new column, including column defn and values
    // Inserts at colNumber or adds to the right
    this.cacheState();

    if (colIndex === undefined) {
      this.table.columns.push(column);
      this.table.rows.forEach((row, i) => {
        row.push(values[i]);
      });
    } else {
      this.table.columns.splice(colIndex, 0, column);
      this.table.rows.forEach((row, i) => {
        row.splice(colIndex, 0, values[i]);
      });
    }
  }

  removeColumns(colIndex: number, count: number = 1): void {
    // Remove a column with data
    this.cacheState();

    this.table.columns.splice(colIndex, count);
    this.table.rows.forEach(row => {
      row.splice(colIndex, count);
    });
  }

  private _assign<T extends object, K extends keyof T>(target: T, prop: K, value: T[K]): void {
    this.cacheState();
    target[prop] = value;
  }

  get ref(): string {
    return this.table.ref;
  }
  set ref(value: string) {
    this._assign(this.table, "ref", value);
  }

  get name(): string {
    return this.table.name;
  }
  set name(value: string) {
    this.table.name = sanitizeTableName(value);
  }

  get displayName(): string {
    return this.table.displayName || this.table.name;
  }
  set displayName(value: string) {
    this.table.displayName = sanitizeTableName(value);
  }

  get headerRow(): boolean | undefined {
    return this.table.headerRow;
  }
  set headerRow(value: boolean | undefined) {
    this._assign(this.table, "headerRow", value);
  }

  get totalsRow(): boolean | undefined {
    return this.table.totalsRow;
  }
  set totalsRow(value: boolean | undefined) {
    this._assign(this.table, "totalsRow", value);
  }

  get theme(): TableStyleProperties["theme"] {
    return this.table.style.theme;
  }
  set theme(value: TableStyleProperties["theme"]) {
    this.table.style.theme = value;
  }

  get showFirstColumn(): boolean | undefined {
    return this.table.style.showFirstColumn;
  }
  set showFirstColumn(value: boolean | undefined) {
    this.table.style.showFirstColumn = value;
  }

  get showLastColumn(): boolean | undefined {
    return this.table.style.showLastColumn;
  }
  set showLastColumn(value: boolean | undefined) {
    this.table.style.showLastColumn = value;
  }

  get showRowStripes(): boolean | undefined {
    return this.table.style.showRowStripes;
  }
  set showRowStripes(value: boolean | undefined) {
    this.table.style.showRowStripes = value;
  }

  get showColumnStripes(): boolean | undefined {
    return this.table.style.showColumnStripes;
  }
  set showColumnStripes(value: boolean | undefined) {
    this.table.style.showColumnStripes = value;
  }
}

export { Table, sanitizeTableName, type TableModel };
