import { XmlStream } from "@excel/utils/xml-stream";
import { xmlEncode, xmlDecode } from "@utils/utils";
import { BaseXform } from "@excel/xlsx/xform/base-xform";

/**
 * Model for generating pivot table (with live source)
 */
interface PivotTableModel {
  rows: number[];
  columns: number[];
  values: number[];
  metric: "sum" | "count";
  cacheFields: any[];
  cacheId: number;
  applyWidthHeightFormats: "0" | "1";
}

/**
 * Parsed pivot field
 */
interface ParsedPivotField {
  axis?: "axisRow" | "axisCol" | "axisPage" | "axisValues";
  dataField?: boolean;
  items?: number[];
  compact?: boolean;
  outline?: boolean;
  showAll?: boolean;
  defaultSubtotal?: boolean;
}

/**
 * Parsed data field
 */
interface ParsedDataField {
  name: string;
  fld: number;
  baseField?: number;
  baseItem?: number;
  subtotal?:
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
}

/**
 * Parsed pivot table model (loaded from file)
 */
interface ParsedPivotTableModel {
  // Core identifiers
  name?: string;
  cacheId: number;
  uid?: string;

  // Location info
  location?: {
    ref: string;
    firstHeaderRow?: number;
    firstDataRow?: number;
    firstDataCol?: number;
  };

  // Field configurations
  pivotFields: ParsedPivotField[];
  rowFields: number[]; // Field indices for rows
  colFields: number[]; // Field indices for columns
  dataFields: ParsedDataField[];

  // Style and formatting
  applyNumberFormats?: string;
  applyBorderFormats?: string;
  applyFontFormats?: string;
  applyPatternFormats?: string;
  applyAlignmentFormats?: string;
  applyWidthHeightFormats?: string;
  dataCaption?: string;
  styleName?: string;

  // Version info
  updatedVersion?: string;
  minRefreshableVersion?: string;
  createdVersion?: string;

  // Other attributes
  useAutoFormatting?: boolean;
  itemPrintTitles?: boolean;
  indent?: number;
  compact?: boolean;
  compactData?: boolean;
  multipleFieldFilters?: boolean;

  // Row/col items (for grand totals etc)
  rowItems?: any[];
  colItems?: any[];

  // Flag indicating this was loaded from file
  isLoaded?: boolean;

  // Extended attributes to preserve any custom extensions
  extensions?: any[];
}

class PivotTableXform extends BaseXform {
  declare public map: { [key: string]: any };
  declare public model: ParsedPivotTableModel | null;

  // Parser state
  private inPivotFields: boolean;
  private inRowFields: boolean;
  private inColFields: boolean;
  private inDataFields: boolean;
  private inRowItems: boolean;
  private inColItems: boolean;
  private inLocation: boolean;
  private currentPivotField: ParsedPivotField | null;
  private inItems: boolean;
  private inPivotTableStyleInfo: boolean;

  constructor() {
    super();

    this.map = {};
    this.model = null;
    this.inPivotFields = false;
    this.inRowFields = false;
    this.inColFields = false;
    this.inDataFields = false;
    this.inRowItems = false;
    this.inColItems = false;
    this.inLocation = false;
    this.currentPivotField = null;
    this.inItems = false;
    this.inPivotTableStyleInfo = false;
  }

  prepare(_model: any): void {
    // No preparation needed
  }

  get tag(): string {
    // http://www.datypic.com/sc/ooxml/e-ssml_pivotTableDefinition.html
    return "pivotTableDefinition";
  }

  reset(): void {
    this.model = null;
    this.inPivotFields = false;
    this.inRowFields = false;
    this.inColFields = false;
    this.inDataFields = false;
    this.inRowItems = false;
    this.inColItems = false;
    this.inLocation = false;
    this.currentPivotField = null;
    this.inItems = false;
    this.inPivotTableStyleInfo = false;
  }

  /**
   * Render pivot table XML.
   * Supports both newly created models and loaded models.
   */
  render(xmlStream: any, model: PivotTableModel | ParsedPivotTableModel): void {
    const isLoaded = (model as ParsedPivotTableModel).isLoaded;

    if (isLoaded) {
      this.renderLoaded(xmlStream, model as ParsedPivotTableModel);
    } else {
      this.renderNew(xmlStream, model as PivotTableModel);
    }
  }

  /**
   * Render newly created pivot table
   */
  private renderNew(xmlStream: any, model: PivotTableModel): void {
    const { rows, columns, values, cacheFields, cacheId, applyWidthHeightFormats } = model;

    // Build rowItems - need one <i> for each unique value in row fields, plus grand total
    const rowItems = buildRowItems(rows, cacheFields);
    // Build colItems - need one <i> for each unique value in col fields, plus grand total
    const colItems = buildColItems(columns, cacheFields, values.length);

    // Calculate pivot table dimensions
    const rowFieldItemCount = rows.length > 0 ? cacheFields[rows[0]]?.sharedItems?.length || 0 : 0;
    const colFieldItemCount =
      columns.length > 0 ? cacheFields[columns[0]]?.sharedItems?.length || 0 : 0;

    // Location: A3 is where pivot table starts
    // - firstHeaderRow: 1 (column headers are in first row of pivot table)
    // - firstDataRow: 2 (data starts in second row)
    // - firstDataCol: 1 (data starts in second column, after row labels)
    // Calculate ref based on actual data size:
    // - Start row: 3
    // - Header rows: 2 (column label row + subheader row)
    // - Data rows: rowFieldItemCount
    // - Grand total row: 1
    // endRow = 3 + 2 + rowFieldItemCount + 1 - 1 = 5 + rowFieldItemCount
    // Or simplified: startRow (3) + 1 (column labels) + rowFieldItemCount (data) + 1 (grand total)
    const endRow = 3 + 1 + rowFieldItemCount + 1; // = 5 + rowFieldItemCount
    const endCol = 1 + colFieldItemCount + 1; // start col + data cols + grand total
    const endColLetter = String.fromCharCode(64 + endCol);
    const locationRef = `A3:${endColLetter}${endRow}`;

    xmlStream.openXml(XmlStream.StdDocAttributes);
    xmlStream.openNode(this.tag, {
      ...PivotTableXform.PIVOT_TABLE_ATTRIBUTES,
      name: "PivotTable2",
      cacheId,
      applyNumberFormats: "0",
      applyBorderFormats: "0",
      applyFontFormats: "0",
      applyPatternFormats: "0",
      applyAlignmentFormats: "0",
      applyWidthHeightFormats,
      dataCaption: "Values",
      updatedVersion: "8",
      minRefreshableVersion: "3",
      useAutoFormatting: "1",
      itemPrintTitles: "1",
      createdVersion: "8",
      indent: "0",
      compact: "0",
      compactData: "0",
      multipleFieldFilters: "0"
    });

    xmlStream.writeXml(`
      <location ref="${locationRef}" firstHeaderRow="1" firstDataRow="2" firstDataCol="1" />
      <pivotFields count="${cacheFields.length}">
        ${renderPivotFields(model)}
      </pivotFields>
      <rowFields count="${rows.length}">
        ${rows.map(rowIndex => `<field x="${rowIndex}" />`).join("\n    ")}
      </rowFields>
      <rowItems count="${rowItems.count}">
        ${rowItems.xml}
      </rowItems>
      <colFields count="${columns.length === 0 ? 1 : columns.length}">
        ${
          columns.length === 0
            ? '<field x="-2" />'
            : columns.map(columnIndex => `<field x="${columnIndex}" />`).join("\n    ")
        }
      </colFields>
      <colItems count="${colItems.count}">
        ${colItems.xml}
      </colItems>
      <dataFields count="${values.length}">
        ${buildDataFields(cacheFields, values, model.metric)}
      </dataFields>
      <pivotTableStyleInfo
        name="PivotStyleLight16"
        showRowHeaders="1"
        showColHeaders="1"
        showRowStripes="0"
        showColStripes="0"
        showLastColumn="1"
      />
      <extLst>
        <ext
          uri="{962EF5D1-5CA2-4c93-8EF4-DBF5C05439D2}"
          xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"
        >
          <x14:pivotTableDefinition
            hideValuesRow="1"
            xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main"
          />
        </ext>
        <ext
          uri="{747A6164-185A-40DC-8AA5-F01512510D54}"
          xmlns:xpdl="http://schemas.microsoft.com/office/spreadsheetml/2016/pivotdefaultlayout"
        >
          <xpdl:pivotTableDefinition16
            EnabledSubtotalsDefault="0"
            SubtotalsOnTopDefault="0"
          />
        </ext>
      </extLst>
    `);

    xmlStream.closeNode();
  }

  /**
   * Render loaded pivot table (preserving original structure)
   */
  private renderLoaded(xmlStream: any, model: ParsedPivotTableModel): void {
    xmlStream.openXml(XmlStream.StdDocAttributes);
    xmlStream.openNode(this.tag, {
      ...PivotTableXform.PIVOT_TABLE_ATTRIBUTES,
      name: model.name || "PivotTable1",
      cacheId: model.cacheId,
      applyNumberFormats: model.applyNumberFormats || "0",
      applyBorderFormats: model.applyBorderFormats || "0",
      applyFontFormats: model.applyFontFormats || "0",
      applyPatternFormats: model.applyPatternFormats || "0",
      applyAlignmentFormats: model.applyAlignmentFormats || "0",
      applyWidthHeightFormats: model.applyWidthHeightFormats || "0",
      dataCaption: model.dataCaption || "Values",
      updatedVersion: model.updatedVersion || "8",
      minRefreshableVersion: model.minRefreshableVersion || "3",
      useAutoFormatting: model.useAutoFormatting ? "1" : "0",
      itemPrintTitles: model.itemPrintTitles ? "1" : "0",
      createdVersion: model.createdVersion || "8",
      indent: model.indent !== undefined ? String(model.indent) : "0",
      compact: model.compact ? "1" : "0",
      compactData: model.compactData ? "1" : "0",
      multipleFieldFilters: model.multipleFieldFilters ? "1" : "0"
    });

    // Location
    if (model.location) {
      xmlStream.leafNode("location", {
        ref: model.location.ref,
        firstHeaderRow: model.location.firstHeaderRow,
        firstDataRow: model.location.firstDataRow,
        firstDataCol: model.location.firstDataCol
      });
    }

    // Pivot fields
    if (model.pivotFields.length > 0) {
      xmlStream.openNode("pivotFields", { count: model.pivotFields.length });
      for (const pivotField of model.pivotFields) {
        this.renderPivotFieldLoaded(xmlStream, pivotField);
      }
      xmlStream.closeNode();
    }

    // Row fields
    if (model.rowFields.length > 0) {
      xmlStream.openNode("rowFields", { count: model.rowFields.length });
      for (const fieldIndex of model.rowFields) {
        xmlStream.leafNode("field", { x: fieldIndex });
      }
      xmlStream.closeNode();
    }

    // Row items (simplified - just grand total)
    xmlStream.writeXml(`
      <rowItems count="1">
        <i t="grand"><x /></i>
      </rowItems>`);

    // Col fields
    const colFieldCount = model.colFields.length === 0 ? 1 : model.colFields.length;
    xmlStream.openNode("colFields", { count: colFieldCount });
    if (model.colFields.length === 0) {
      xmlStream.leafNode("field", { x: -2 });
    } else {
      for (const fieldIndex of model.colFields) {
        xmlStream.leafNode("field", { x: fieldIndex });
      }
    }
    xmlStream.closeNode();

    // Col items (simplified - just grand total)
    xmlStream.writeXml(`
      <colItems count="1">
        <i t="grand"><x /></i>
      </colItems>`);

    // Data fields
    if (model.dataFields.length > 0) {
      xmlStream.openNode("dataFields", { count: model.dataFields.length });
      for (const dataField of model.dataFields) {
        const attrs: any = {
          name: dataField.name,
          fld: dataField.fld,
          baseField: dataField.baseField ?? 0,
          baseItem: dataField.baseItem ?? 0
        };
        if (dataField.subtotal && dataField.subtotal !== "sum") {
          attrs.subtotal = dataField.subtotal;
        }
        xmlStream.leafNode("dataField", attrs);
      }
      xmlStream.closeNode();
    }

    // Style info
    xmlStream.leafNode("pivotTableStyleInfo", {
      name: model.styleName || "PivotStyleLight16",
      showRowHeaders: "1",
      showColHeaders: "1",
      showRowStripes: "0",
      showColStripes: "0",
      showLastColumn: "1"
    });

    // Extensions
    xmlStream.writeXml(`
      <extLst>
        <ext
          uri="{962EF5D1-5CA2-4c93-8EF4-DBF5C05439D2}"
          xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"
        >
          <x14:pivotTableDefinition
            hideValuesRow="1"
            xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main"
          />
        </ext>
        <ext
          uri="{747A6164-185A-40DC-8AA5-F01512510D54}"
          xmlns:xpdl="http://schemas.microsoft.com/office/spreadsheetml/2016/pivotdefaultlayout"
        >
          <xpdl:pivotTableDefinition16
            EnabledSubtotalsDefault="0"
            SubtotalsOnTopDefault="0"
          />
        </ext>
      </extLst>
    `);

    xmlStream.closeNode();
  }

  /**
   * Render a loaded pivot field
   */
  private renderPivotFieldLoaded(xmlStream: any, field: ParsedPivotField): void {
    const attrs: any = {
      compact: field.compact ? "1" : "0",
      outline: field.outline ? "1" : "0",
      showAll: field.showAll ? "1" : "0",
      defaultSubtotal: field.defaultSubtotal ? "1" : "0"
    };

    if (field.axis) {
      attrs.axis = field.axis;
    }
    if (field.dataField) {
      attrs.dataField = "1";
    }

    if (field.items && field.items.length > 0) {
      xmlStream.openNode("pivotField", attrs);
      xmlStream.openNode("items", { count: field.items.length + 1 });
      for (const itemIndex of field.items) {
        xmlStream.leafNode("item", { x: itemIndex });
      }
      // Grand total item
      xmlStream.writeXml('<item t="default" />');
      xmlStream.closeNode(); // items
      xmlStream.closeNode(); // pivotField
    } else {
      xmlStream.leafNode("pivotField", attrs);
    }
  }

  parseOpen(node: any): boolean {
    const { name, attributes } = node;

    switch (name) {
      case this.tag:
        // pivotTableDefinition root element
        this.reset();
        this.model = {
          name: attributes.name,
          cacheId: parseInt(attributes.cacheId || "0", 10),
          uid: attributes["xr:uid"],
          pivotFields: [],
          rowFields: [],
          colFields: [],
          dataFields: [],
          applyNumberFormats: attributes.applyNumberFormats,
          applyBorderFormats: attributes.applyBorderFormats,
          applyFontFormats: attributes.applyFontFormats,
          applyPatternFormats: attributes.applyPatternFormats,
          applyAlignmentFormats: attributes.applyAlignmentFormats,
          applyWidthHeightFormats: attributes.applyWidthHeightFormats,
          dataCaption: attributes.dataCaption,
          updatedVersion: attributes.updatedVersion,
          minRefreshableVersion: attributes.minRefreshableVersion,
          createdVersion: attributes.createdVersion,
          useAutoFormatting: attributes.useAutoFormatting === "1",
          itemPrintTitles: attributes.itemPrintTitles === "1",
          indent: attributes.indent ? parseInt(attributes.indent, 10) : 0,
          compact: attributes.compact === "1",
          compactData: attributes.compactData === "1",
          multipleFieldFilters: attributes.multipleFieldFilters === "1",
          isLoaded: true
        };
        break;

      case "location":
        if (this.model) {
          this.model.location = {
            ref: attributes.ref,
            firstHeaderRow: attributes.firstHeaderRow
              ? parseInt(attributes.firstHeaderRow, 10)
              : undefined,
            firstDataRow: attributes.firstDataRow
              ? parseInt(attributes.firstDataRow, 10)
              : undefined,
            firstDataCol: attributes.firstDataCol
              ? parseInt(attributes.firstDataCol, 10)
              : undefined
          };
        }
        break;

      case "pivotFields":
        this.inPivotFields = true;
        break;

      case "pivotField":
        if (this.inPivotFields) {
          this.currentPivotField = {
            axis: attributes.axis as any,
            dataField: attributes.dataField === "1",
            items: [],
            compact: attributes.compact === "1",
            outline: attributes.outline === "1",
            showAll: attributes.showAll === "1",
            defaultSubtotal: attributes.defaultSubtotal === "1"
          };
        }
        break;

      case "items":
        if (this.currentPivotField) {
          this.inItems = true;
        }
        break;

      case "item":
        if (this.inItems && this.currentPivotField && attributes.x !== undefined) {
          this.currentPivotField.items!.push(parseInt(attributes.x, 10));
        }
        break;

      case "rowFields":
        this.inRowFields = true;
        break;

      case "colFields":
        this.inColFields = true;
        break;

      case "dataFields":
        this.inDataFields = true;
        break;

      case "rowItems":
        this.inRowItems = true;
        break;

      case "colItems":
        this.inColItems = true;
        break;

      case "field":
        // Handle field element (used in rowFields, colFields)
        if (this.model) {
          const fieldIndex = parseInt(attributes.x || "0", 10);
          if (this.inRowFields) {
            this.model.rowFields.push(fieldIndex);
          } else if (this.inColFields) {
            this.model.colFields.push(fieldIndex);
          }
        }
        break;

      case "dataField":
        if (this.inDataFields && this.model) {
          this.model.dataFields.push({
            name: xmlDecode(attributes.name || ""),
            fld: parseInt(attributes.fld || "0", 10),
            baseField: attributes.baseField ? parseInt(attributes.baseField, 10) : 0,
            baseItem: attributes.baseItem ? parseInt(attributes.baseItem, 10) : 0,
            subtotal: attributes.subtotal as any
          });
        }
        break;

      case "pivotTableStyleInfo":
        if (this.model) {
          this.model.styleName = attributes.name;
        }
        break;
    }

    return true;
  }

  parseText(_text: string): void {
    // No text content in pivot table elements
  }

  parseClose(name: string): boolean {
    switch (name) {
      case this.tag:
        // End of pivotTableDefinition
        return false;

      case "pivotFields":
        this.inPivotFields = false;
        break;

      case "pivotField":
        if (this.currentPivotField && this.model) {
          this.model.pivotFields.push(this.currentPivotField);
          this.currentPivotField = null;
        }
        break;

      case "items":
        this.inItems = false;
        break;

      case "rowFields":
        this.inRowFields = false;
        break;

      case "colFields":
        this.inColFields = false;
        break;

      case "dataFields":
        this.inDataFields = false;
        break;

      case "rowItems":
        this.inRowItems = false;
        break;

      case "colItems":
        this.inColItems = false;
        break;
    }

    return true;
  }

  reconcile(_model: any, _options: any): void {
    // No reconciliation needed
  }

  static PIVOT_TABLE_ATTRIBUTES = {
    xmlns: "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  };
}

// Helpers

/**
 * Build rowItems XML - one item for each unique value in row fields, plus grand total.
 * Each <i> represents a row in the pivot table.
 * - Regular items: <i><x/></i> for index 0, <i><x v="index"/></i> for index > 0
 * - Grand total: <i t="grand"><x/></i>
 * Note: When v=0, the v attribute should be omitted (Excel convention)
 */
function buildRowItems(rows: number[], cacheFields: any[]): { count: number; xml: string } {
  if (rows.length === 0) {
    // No row fields - just grand total
    return { count: 1, xml: '<i t="grand"><x /></i>' };
  }

  // Get unique values count from the first row field
  const rowFieldIndex = rows[0];
  const sharedItems = cacheFields[rowFieldIndex]?.sharedItems || [];
  const itemCount = sharedItems.length;

  // Build items: one for each unique value + grand total
  const items: string[] = [];

  // Regular items - reference each unique value by index
  // Note: v="0" should be omitted (Excel uses <x/> instead of <x v="0"/>)
  for (let i = 0; i < itemCount; i++) {
    if (i === 0) {
      items.push("<i><x /></i>");
    } else {
      items.push(`<i><x v="${i}" /></i>`);
    }
  }

  // Grand total row
  items.push('<i t="grand"><x /></i>');

  return {
    count: items.length,
    xml: items.join("\n        ")
  };
}

/**
 * Build colItems XML - one item for each unique value in column fields, plus grand total.
 * When there are multiple data fields (values), each column value may have sub-columns.
 * Note: When v=0, the v attribute should be omitted (Excel convention)
 */
function buildColItems(
  columns: number[],
  cacheFields: any[],
  valueCount: number
): { count: number; xml: string } {
  if (columns.length === 0) {
    // No column fields - columns are based on data fields (values)
    if (valueCount > 1) {
      // Multiple values: one column per value + grand total
      const items: string[] = [];
      for (let i = 0; i < valueCount; i++) {
        if (i === 0) {
          items.push("<i><x /></i>");
        } else {
          items.push(`<i><x v="${i}" /></i>`);
        }
      }
      items.push('<i t="grand"><x /></i>');
      return { count: items.length, xml: items.join("\n        ") };
    }
    // Single value: just grand total
    return { count: 1, xml: '<i t="grand"><x /></i>' };
  }

  // Get unique values count from the first column field
  const colFieldIndex = columns[0];
  const sharedItems = cacheFields[colFieldIndex]?.sharedItems || [];
  const itemCount = sharedItems.length;

  // Build items: one for each unique value + grand total
  const items: string[] = [];

  // Regular items - reference each unique value by index
  // Note: v="0" should be omitted (Excel uses <x/> instead of <x v="0"/>)
  for (let i = 0; i < itemCount; i++) {
    if (i === 0) {
      items.push("<i><x /></i>");
    } else {
      items.push(`<i><x v="${i}" /></i>`);
    }
  }

  // Grand total column
  items.push('<i t="grand"><x /></i>');

  return {
    count: items.length,
    xml: items.join("\n        ")
  };
}

/**
 * Build dataField XML elements for all values in the pivot table.
 * Supports multiple values when columns is empty.
 */
function buildDataFields(cacheFields: any[], values: number[], metric: "sum" | "count"): string {
  const metricName = metric === "count" ? "Count" : "Sum";
  // For 'count' metric, Excel requires subtotal="count" attribute
  const subtotalAttr = metric === "count" ? ' subtotal="count"' : "";

  return values
    .map(
      valueIndex => `<dataField
          name="${metricName} of ${xmlEncode(cacheFields[valueIndex].name)}"
          fld="${valueIndex}"
          baseField="0"
          baseItem="0"${subtotalAttr}
        />`
    )
    .join("");
}

function renderPivotFields(pivotTable: PivotTableModel): string {
  // Pre-compute field type lookup for O(1) access
  const rowSet = new Set(pivotTable.rows);
  const colSet = new Set(pivotTable.columns);
  const valueSet = new Set(pivotTable.values);

  return pivotTable.cacheFields
    .map((cacheField: any, fieldIndex: number) => {
      const isRow = rowSet.has(fieldIndex);
      const isCol = colSet.has(fieldIndex);
      const isValue = valueSet.has(fieldIndex);
      return renderPivotField(isRow, isCol, isValue, cacheField.sharedItems);
    })
    .join("");
}

function renderPivotField(
  isRow: boolean,
  isCol: boolean,
  isValue: boolean,
  sharedItems: any[] | null
): string {
  // A field can be both a row/column field AND a value field
  // In this case, it needs both axis attribute AND dataField="1"

  if (isRow || isCol) {
    const axis = isRow ? "axisRow" : "axisCol";
    // Row and column fields should NOT have defaultSubtotal="0"
    let axisAttributes = 'compact="0" outline="0" showAll="0"';
    // If also a value field, add dataField="1"
    if (isValue) {
      axisAttributes = `dataField="1" ${axisAttributes}`;
    }
    // items = one for each shared item + one default item
    const itemsXml = [
      ...sharedItems!.map((_item: any, index: number) => `<item x="${index}" />`),
      '<item t="default" />' // Required default item for subtotals/grand totals
    ].join("\n              ");
    return `
      <pivotField axis="${axis}" ${axisAttributes}>
        <items count="${sharedItems!.length + 1}">
          ${itemsXml}
        </items>
      </pivotField>
    `;
  }
  // Value fields and non-axis fields should have defaultSubtotal="0"
  const defaultAttributes = 'compact="0" outline="0" showAll="0" defaultSubtotal="0"';
  return `
    <pivotField
      ${isValue ? 'dataField="1"' : ""}
      ${defaultAttributes}
    />
  `;
}

export { PivotTableXform, type ParsedPivotTableModel };
