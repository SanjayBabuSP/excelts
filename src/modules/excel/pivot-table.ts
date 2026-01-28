import { range, toSortedArray } from "@utils/utils";
import { colCache } from "@excel/utils/col-cache";
import { PivotTableError } from "@excel/errors";
import type { Table } from "@excel/table";

/**
 * Interface representing the source data abstraction for pivot tables.
 * This allows both Worksheet and Table to be used as pivot table data sources.
 */
export interface PivotTableSource {
  /** Name of the worksheet containing the source data (used in pivotCacheDefinition) */
  name: string;
  /** Get row values by 1-indexed row number */
  getRow(rowNumber: number): { values: any[] };
  /** Get column values by 1-indexed column number */
  getColumn(columnNumber: number): { values: any[] };
  /** Get all sheet values as a sparse 2D array */
  getSheetValues(): any[][];
  /** Dimensions with short range reference (e.g., "A1:E10") */
  dimensions: { shortRange: string };
}

/**
 * Model for creating a new pivot table.
 * Pass this to worksheet.addPivotTable() to create a pivot table.
 */
export interface PivotTableModel {
  /**
   * Source worksheet for the pivot table data.
   * Either sourceSheet or sourceTable must be provided (mutually exclusive).
   */
  sourceSheet?: PivotTableSource;
  /**
   * Source table for the pivot table data.
   * Either sourceSheet or sourceTable must be provided (mutually exclusive).
   * The table must have headerRow=true and contain at least one data row.
   */
  sourceTable?: Table;
  /** Column names to use as row fields in the pivot table */
  rows: string[];
  /**
   * Column names to use as column fields in the pivot table.
   * If omitted or empty, Excel will use "Values" as the column field.
   * @default []
   */
  columns?: string[];
  /** Column names to aggregate as values in the pivot table */
  values: string[];
  /**
   * Aggregation metric for the pivot table values.
   * - 'sum': Sum of values (default)
   * - 'count': Count of values
   * @default 'sum'
   */
  metric?: "sum" | "count";
  /**
   * Controls whether pivot table style overrides worksheet column widths.
   * - '0': Preserve worksheet column widths (useful for custom sizing)
   * - '1': Apply pivot table style width/height (default Excel behavior)
   * @default '1'
   */
  applyWidthHeightFormats?: "0" | "1";
}

/**
 * Represents a cache field in a pivot table.
 * Cache fields store unique values from source columns for row/column grouping.
 */
export interface CacheField {
  /** Name of the field (column header from source) */
  name: string;
  /** Unique values for row/column fields, null for value fields */
  sharedItems: any[] | null;
  /** Minimum value for numeric fields */
  minValue?: number;
  /** Maximum value for numeric fields */
  maxValue?: number;
}

/** Aggregation function types for pivot table data fields */
export type PivotTableSubtotal =
  | "sum"
  | "count"
  | "average"
  | "max"
  | "min"
  | "product"
  | "countNums"
  | "stdDev"
  | "stdDevP"
  | "var"
  | "varP";

/**
 * Data field configuration for pivot table aggregation.
 * Defines how values are aggregated in the pivot table.
 */
export interface DataField {
  /** Display name for the data field (e.g., "Sum of Sales") */
  name: string;
  /** Index of the source field in cacheFields */
  fld: number;
  /** Base field index for calculated fields */
  baseField?: number;
  /** Base item index for calculated fields */
  baseItem?: number;
  /** Aggregation function (default: 'sum') */
  subtotal?: PivotTableSubtotal;
}

/**
 * Internal pivot table representation used by the library.
 * This is the processed model after calling makePivotTable().
 */
export interface PivotTable {
  /** Source data adapter (always present for new pivot tables) */
  source?: PivotTableSource;
  /** Field indices for row fields */
  rows: number[];
  /** Field indices for column fields */
  columns: number[];
  /** Field indices for value fields */
  values: number[];
  /** Aggregation metric */
  metric: "sum" | "count";
  /** Cache fields with shared items */
  cacheFields: CacheField[];
  /** Cache ID for linking to pivot cache */
  cacheId: string;
  /** Width/height format setting */
  applyWidthHeightFormats: "0" | "1";
  /** 1-indexed table number for file naming (pivotTable1.xml, pivotTable2.xml, etc.) */
  tableNumber: number;
  /** Flag indicating this pivot table was loaded from file (not newly created) */
  isLoaded?: boolean;
  /** Data fields for loaded pivot tables */
  dataFields?: DataField[];
  /** Cache definition for loaded pivot tables */
  cacheDefinition?: ParsedCacheDefinition;
  /** Cache records for loaded pivot tables */
  cacheRecords?: ParsedCacheRecords;
}

/**
 * Parsed cache definition from loaded pivot table files.
 */
export interface ParsedCacheDefinition {
  sourceRef?: string;
  sourceSheet?: string;
  cacheFields: CacheField[];
  recordCount?: number;
  rId?: string;
  isLoaded?: boolean;
}

/**
 * Parsed cache records from loaded pivot table files.
 */
export interface ParsedCacheRecords {
  records: Array<Array<{ type: string; value?: any }>>;
  count: number;
  isLoaded?: boolean;
}

// TK(2023-10-10): turn this into a class constructor.

/**
 * Creates a PivotTableSource adapter from a Table object.
 * This allows Tables to be used as pivot table data sources with the same interface as Worksheets.
 */
function createTableSourceAdapter(table: Table): PivotTableSource {
  const tableModel = table.model;

  // Validate that table has headerRow enabled (required for pivot table column names)
  if (tableModel.headerRow === false) {
    throw new PivotTableError(
      "Cannot create pivot table from a table without headers. Set headerRow: true on the table."
    );
  }

  // Validate table has data rows
  if (!tableModel.rows || tableModel.rows.length === 0) {
    throw new PivotTableError(
      "Cannot create pivot table from an empty table. Add data rows to the table."
    );
  }

  const columnNames = tableModel.columns.map(col => col.name);

  // Check for duplicate column names
  const nameSet = new Set<string>();
  for (const name of columnNames) {
    if (nameSet.has(name)) {
      throw new PivotTableError(
        `Duplicate column name "${name}" found in table. Pivot tables require unique column names.`
      );
    }
    nameSet.add(name);
  }

  // Build the full data array: headers + rows
  const headerRow = [undefined, ...columnNames]; // sparse array starting at index 1
  const dataRows = tableModel.rows.map(row => [undefined, ...row]); // sparse array starting at index 1

  // Calculate the range reference for the table
  const tl = tableModel.tl!;
  const startRow = tl.row;
  const startCol = tl.col;
  const endRow = startRow + tableModel.rows.length; // header row + data rows
  const endCol = startCol + columnNames.length - 1;

  const shortRange = colCache.encode(startRow, startCol, endRow, endCol);

  // Use the worksheet name (not table name) for pivotCacheDefinition's worksheetSource
  // The sheet attribute in worksheetSource must reference the actual worksheet name
  const worksheetName = table.worksheet.name;

  return {
    name: worksheetName,
    getRow(rowNumber: number): { values: any[] } {
      if (rowNumber === 1) {
        return { values: headerRow };
      }
      const dataIndex = rowNumber - 2; // rowNumber 2 maps to index 0
      if (dataIndex >= 0 && dataIndex < dataRows.length) {
        return { values: dataRows[dataIndex] };
      }
      return { values: [] };
    },
    getColumn(columnNumber: number): { values: any[] } {
      // Validate column number is within bounds
      if (columnNumber < 1 || columnNumber > columnNames.length) {
        return { values: [] };
      }
      // Values should be sparse array with header at index 1, data starting at index 2
      const values: any[] = [];
      values[1] = columnNames[columnNumber - 1];
      for (let i = 0; i < tableModel.rows.length; i++) {
        values[i + 2] = tableModel.rows[i][columnNumber - 1];
      }
      return { values };
    },
    getSheetValues(): any[][] {
      // Return sparse array where index 1 is header row, and subsequent indices are data rows
      const result: any[][] = [];
      result[1] = headerRow;
      for (let i = 0; i < dataRows.length; i++) {
        result[i + 2] = dataRows[i];
      }
      return result;
    },
    dimensions: { shortRange }
  };
}

/**
 * Resolves the data source from the model, supporting both sourceSheet and sourceTable.
 */
function resolveSource(model: PivotTableModel): PivotTableSource {
  if (model.sourceTable) {
    return createTableSourceAdapter(model.sourceTable);
  }
  // For sourceSheet, it already implements the required interface
  return model.sourceSheet as PivotTableSource;
}

function makePivotTable(worksheet: any, model: PivotTableModel): PivotTable {
  // Example `model`:
  // {
  //   // Source of data (either sourceSheet OR sourceTable):
  //   sourceSheet: worksheet1,  // Use entire sheet range
  //   // OR
  //   sourceTable: table,       // Use table data
  //
  //   // Pivot table fields: values indicate field names;
  //   // they come from the first row in `worksheet1` or table column names.
  //   rows: ['A', 'B'],
  //   columns: ['C'],
  //   values: ['E'], // only 1 item possible for now
  //   metric: 'sum', // only 'sum' possible for now
  // }

  // Validate source exists before trying to resolve it
  if (!model.sourceSheet && !model.sourceTable) {
    throw new PivotTableError("Either sourceSheet or sourceTable must be provided.");
  }
  if (model.sourceSheet && model.sourceTable) {
    throw new PivotTableError("Cannot specify both sourceSheet and sourceTable. Choose one.");
  }

  // Resolve source first to avoid creating adapter multiple times
  const source = resolveSource(model);

  validate(worksheet, model, source);

  const { rows, values } = model;
  const columns = model.columns ?? [];

  const cacheFields = makeCacheFields(source, [...rows, ...columns], values);

  const nameToIndex = cacheFields.reduce(
    (result: Record<string, number>, cacheField: CacheField, index: number) => {
      result[cacheField.name] = index;
      return result;
    },
    {} as Record<string, number>
  );
  const rowIndices = rows.map(row => nameToIndex[row]);
  const columnIndices = columns.map(column => nameToIndex[column]);
  const valueIndices = values.map(value => nameToIndex[value]);

  // Calculate tableNumber based on existing pivot tables (1-indexed)
  const tableNumber = worksheet.workbook.pivotTables.length + 1;

  // Base cache ID starts at 10 (Excel convention), each subsequent table increments
  const BASE_CACHE_ID = 10;

  // form pivot table object
  return {
    source,
    rows: rowIndices,
    columns: columnIndices,
    values: valueIndices,
    metric: model.metric ?? "sum",
    cacheFields,
    // Dynamic cacheId: 10 for first table, 11 for second, etc.
    // Used in <pivotTableDefinition> and xl/workbook.xml
    cacheId: String(BASE_CACHE_ID + tableNumber - 1),
    // Control whether pivot table style overrides worksheet column widths
    // '0' = preserve worksheet column widths (useful for custom sizing)
    // '1' = apply pivot table style width/height (default Excel behavior)
    applyWidthHeightFormats: model.applyWidthHeightFormats ?? "1",
    // Table number for file naming (pivotTable1.xml, pivotTable2.xml, etc.)
    tableNumber
  };
}

function validate(_worksheet: any, model: PivotTableModel, source: PivotTableSource): void {
  if (model.metric && model.metric !== "sum" && model.metric !== "count") {
    throw new PivotTableError('Only the "sum" and "count" metrics are supported at this time.');
  }

  const columns = model.columns ?? [];

  // Get header names from source (already resolved)
  const headerNames = source.getRow(1).values.slice(1);
  // Use Set for O(1) lookup
  const headerNameSet = new Set(headerNames);
  for (const name of [...model.rows, ...columns, ...model.values]) {
    if (!headerNameSet.has(name)) {
      throw new PivotTableError(`The header name "${name}" was not found in ${source.name}.`);
    }
  }

  if (!model.rows.length) {
    throw new PivotTableError("No pivot table rows specified.");
  }

  // Allow empty columns - Excel will use "Values" as column field
  // But can't have multiple values with columns specified
  if (model.values.length < 1) {
    throw new PivotTableError("Must have at least one value.");
  }

  if (model.values.length > 1 && columns.length > 0) {
    throw new PivotTableError(
      "It is currently not possible to have multiple values when columns are specified. Please either supply an empty array for columns or a single value."
    );
  }
}

function makeCacheFields(
  source: PivotTableSource,
  fieldNamesWithSharedItems: string[],
  valueFieldNames: string[]
): CacheField[] {
  // Cache fields are used in pivot tables to reference source data.
  // Fields in fieldNamesWithSharedItems get their unique values extracted as sharedItems.
  // Fields in valueFieldNames (but not in fieldNamesWithSharedItems) get min/max calculated.
  // Other fields are unused and get empty sharedItems.

  const names = source.getRow(1).values;
  // Use Set for O(1) lookup instead of object
  const sharedItemsFields = new Set(fieldNamesWithSharedItems);
  const valueFields = new Set(valueFieldNames);

  const aggregate = (columnIndex: number): any[] => {
    const columnValues = source.getColumn(columnIndex).values;
    // Build unique values set directly, skipping header (index 0,1) and null/undefined
    const uniqueValues = new Set<any>();
    for (let i = 2; i < columnValues.length; i++) {
      const v = columnValues[i];
      if (v !== null && v !== undefined) {
        uniqueValues.add(v);
      }
    }
    return toSortedArray(uniqueValues);
  };

  // Calculate min/max for numeric fields
  const getMinMax = (columnIndex: number): { minValue: number; maxValue: number } | null => {
    const columnValues = source.getColumn(columnIndex).values;
    let min = Infinity;
    let max = -Infinity;
    let hasNumeric = false;
    for (let i = 2; i < columnValues.length; i++) {
      const v = columnValues[i];
      if (typeof v === "number" && !isNaN(v)) {
        hasNumeric = true;
        if (v < min) {
          min = v;
        }
        if (v > max) {
          max = v;
        }
      }
    }
    return hasNumeric ? { minValue: min, maxValue: max } : null;
  };

  // Build result array
  const result: CacheField[] = [];
  for (const columnIndex of range(1, names.length)) {
    const name = names[columnIndex];
    if (sharedItemsFields.has(name)) {
      // Field used for rows/columns - extract unique values as sharedItems
      result.push({ name, sharedItems: aggregate(columnIndex) });
    } else if (valueFields.has(name)) {
      // Field used only for values (aggregation) - calculate min/max
      const minMax = getMinMax(columnIndex);
      result.push({
        name,
        sharedItems: null,
        minValue: minMax?.minValue,
        maxValue: minMax?.maxValue
      });
    } else {
      // Unused field - just empty sharedItems (like Excel does)
      result.push({ name, sharedItems: null });
    }
  }
  return result;
}

export { makePivotTable };
