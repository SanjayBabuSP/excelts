import { XmlStream } from "@excel/utils/xml-stream";
import { xmlEncode, xmlDecode } from "@utils/utils";
import { BaseXform } from "@excel/xlsx/xform/base-xform";
import { PivotTableError } from "@excel/errors";
import type { PivotTableSource } from "@excel/pivot-table";

/**
 * Model for generating pivot cache records (with live source)
 */
interface CacheRecordsModel {
  source: PivotTableSource;
  cacheFields: any[];
}

/**
 * Parsed record value - can be:
 * - { type: 'x', value: number } - Shared item index
 * - { type: 'n', value: number } - Numeric value
 * - { type: 's', value: string } - String value
 * - { type: 'b', value: boolean } - Boolean value
 * - { type: 'm' } - Missing/null value
 * - { type: 'd', value: Date } - Date value
 * - { type: 'e', value: string } - Error value
 */
interface RecordValue {
  type: "x" | "n" | "s" | "b" | "m" | "d" | "e";
  value?: any;
}

/**
 * Parsed cache records model
 */
interface ParsedCacheRecordsModel {
  // Array of records, each record is an array of values
  records: RecordValue[][];
  // Record count
  count: number;
  // Flag indicating this was loaded from file (not newly created)
  isLoaded?: boolean;
}

class PivotCacheRecordsXform extends BaseXform {
  declare public map: { [key: string]: any };
  declare public model: ParsedCacheRecordsModel | null;

  // Parser state
  private currentRecord: RecordValue[] | null;

  constructor() {
    super();

    this.map = {};
    this.model = null;
    this.currentRecord = null;
  }

  prepare(_model: any): void {
    // No preparation needed
  }

  get tag(): string {
    // http://www.datypic.com/sc/ooxml/e-ssml_pivotCacheRecords.html
    return "pivotCacheRecords";
  }

  reset(): void {
    this.model = null;
    this.currentRecord = null;
  }

  /**
   * Render pivot cache records XML.
   * Supports both newly created models (with PivotTableSource) and loaded models.
   */
  render(xmlStream: any, model: CacheRecordsModel | ParsedCacheRecordsModel): void {
    // Check if this is a loaded model
    const isLoaded = (model as ParsedCacheRecordsModel).isLoaded || !("source" in model);

    if (isLoaded) {
      this.renderLoaded(xmlStream, model as ParsedCacheRecordsModel);
    } else {
      this.renderNew(xmlStream, model as CacheRecordsModel);
    }
  }

  /**
   * Render newly created pivot cache records
   */
  private renderNew(xmlStream: any, model: CacheRecordsModel): void {
    const { source, cacheFields } = model;
    const sourceBodyRows = source.getSheetValues().slice(2);

    xmlStream.openXml(XmlStream.StdDocAttributes);
    xmlStream.openNode(this.tag, {
      ...PivotCacheRecordsXform.PIVOT_CACHE_RECORDS_ATTRIBUTES,
      count: sourceBodyRows.length
    });
    xmlStream.writeXml(this.renderTableNew(sourceBodyRows, cacheFields));
    xmlStream.closeNode();
  }

  /**
   * Render loaded pivot cache records
   */
  private renderLoaded(xmlStream: any, model: ParsedCacheRecordsModel): void {
    xmlStream.openXml(XmlStream.StdDocAttributes);
    xmlStream.openNode(this.tag, {
      ...PivotCacheRecordsXform.PIVOT_CACHE_RECORDS_ATTRIBUTES,
      count: model.count
    });

    // Render each record
    for (const record of model.records) {
      xmlStream.writeXml("\n  <r>");
      for (const value of record) {
        xmlStream.writeXml("\n    ");
        xmlStream.writeXml(this.renderRecordValue(value));
      }
      xmlStream.writeXml("\n  </r>");
    }

    xmlStream.closeNode();
  }

  /**
   * Render a single record value to XML
   */
  private renderRecordValue(value: RecordValue): string {
    switch (value.type) {
      case "x":
        return `<x v="${value.value}" />`;
      case "n":
        return `<n v="${value.value}" />`;
      case "s":
        return `<s v="${xmlEncode(String(value.value))}" />`;
      case "b":
        return `<b v="${value.value ? "1" : "0"}" />`;
      case "m":
        return "<m />";
      case "d":
        return `<d v="${(value.value as Date).toISOString()}" />`;
      case "e":
        return `<e v="${value.value}" />`;
      default:
        return "<m />";
    }
  }

  // Helper methods for rendering new records
  private renderTableNew(sourceBodyRows: any[], cacheFields: any[]): string {
    const parts: string[] = [];
    for (const row of sourceBodyRows) {
      const realRow = row.slice(1);
      parts.push("\n  <r>");
      for (let i = 0; i < realRow.length; i++) {
        parts.push("\n    ");
        parts.push(this.renderCellNew(realRow[i], cacheFields[i].sharedItems));
      }
      parts.push("\n  </r>");
    }
    return parts.join("");
  }

  private renderCellNew(value: any, sharedItems: any[] | null): string {
    // Handle null/undefined values first
    if (value === null || value === undefined) {
      return "<m />";
    }

    // no shared items
    if (sharedItems === null) {
      if (Number.isFinite(value)) {
        return `<n v="${value}" />`;
      }
      return `<s v="${xmlEncode(String(value))}" />`;
    }

    // shared items - use indexOf for value lookup (works for both string and numeric)
    const sharedItemsIndex = sharedItems.indexOf(value);
    if (sharedItemsIndex < 0) {
      throw new PivotTableError(
        `${JSON.stringify(value)} not in sharedItems ${JSON.stringify(sharedItems)}`
      );
    }
    return `<x v="${sharedItemsIndex}" />`;
  }

  parseOpen(node: any): boolean {
    const { name, attributes } = node;

    switch (name) {
      case this.tag:
        // pivotCacheRecords root element
        this.reset();
        this.model = {
          records: [],
          count: parseInt(attributes.count || "0", 10),
          isLoaded: true
        };
        break;

      case "r":
        // Start of a new record
        this.currentRecord = [];
        break;

      case "x":
        // Shared item index
        if (this.currentRecord) {
          this.currentRecord.push({
            type: "x",
            value: parseInt(attributes.v || "0", 10)
          });
        }
        break;

      case "n":
        // Numeric value
        if (this.currentRecord) {
          this.currentRecord.push({
            type: "n",
            value: parseFloat(attributes.v || "0")
          });
        }
        break;

      case "s":
        // String value
        if (this.currentRecord) {
          this.currentRecord.push({
            type: "s",
            value: xmlDecode(attributes.v || "")
          });
        }
        break;

      case "b":
        // Boolean value
        if (this.currentRecord) {
          this.currentRecord.push({
            type: "b",
            value: attributes.v === "1"
          });
        }
        break;

      case "m":
        // Missing/null value
        if (this.currentRecord) {
          this.currentRecord.push({ type: "m" });
        }
        break;

      case "d":
        // Date value
        if (this.currentRecord) {
          this.currentRecord.push({
            type: "d",
            value: new Date(attributes.v || "")
          });
        }
        break;

      case "e":
        // Error value
        if (this.currentRecord) {
          this.currentRecord.push({
            type: "e",
            value: attributes.v || ""
          });
        }
        break;
    }

    return true;
  }

  parseText(_text: string): void {
    // No text content in cache records elements
  }

  parseClose(name: string): boolean {
    switch (name) {
      case this.tag:
        // End of pivotCacheRecords
        return false;

      case "r":
        // End of record - add to model
        if (this.model && this.currentRecord) {
          this.model.records.push(this.currentRecord);
          this.currentRecord = null;
        }
        break;
    }

    return true;
  }

  reconcile(_model: any, _options: any): void {
    // No reconciliation needed
  }

  static PIVOT_CACHE_RECORDS_ATTRIBUTES = {
    xmlns: "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "xmlns:r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "xmlns:mc": "http://schemas.openxmlformats.org/markup-compatibility/2006",
    "mc:Ignorable": "xr",
    "xmlns:xr": "http://schemas.microsoft.com/office/spreadsheetml/2014/revision"
  };
}

export { PivotCacheRecordsXform, type ParsedCacheRecordsModel };
