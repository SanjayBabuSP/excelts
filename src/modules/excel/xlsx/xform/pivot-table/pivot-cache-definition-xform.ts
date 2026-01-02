import { BaseXform } from "@excel/xlsx/xform/base-xform";
import { CacheField } from "@excel/xlsx/xform/pivot-table/cache-field";
import { CacheFieldXform, type CacheFieldModel } from "@excel/xlsx/xform/pivot-table/cache-field-xform";
import { XmlStream } from "@excel/utils/xml-stream";
import type { PivotTableSource } from "@excel/pivot-table";

/**
 * Model for parsed pivot cache definition
 */
interface ParsedCacheDefinitionModel {
  // Source worksheet reference
  sourceRef?: string;
  sourceSheet?: string;
  // Cache fields with their shared items
  cacheFields: CacheFieldModel[];
  // Record count
  recordCount?: number;
  // Relationship ID for cache records
  rId?: string;
  // Additional attributes to preserve
  refreshOnLoad?: string;
  createdVersion?: string;
  refreshedVersion?: string;
  minRefreshableVersion?: string;
  // Flag indicating this was loaded from file (not newly created)
  isLoaded?: boolean;
}

/**
 * Model for generating pivot cache definition (with live source)
 */
interface CacheDefinitionModel {
  source: PivotTableSource;
  cacheFields: any[];
}

class PivotCacheDefinitionXform extends BaseXform {
  declare public map: { [key: string]: any };
  declare public model: ParsedCacheDefinitionModel | null;

  // Parser state
  private currentCacheField: CacheFieldXform | null;
  private inCacheFields: boolean;
  private inCacheSource: boolean;

  constructor() {
    super();

    this.map = {};
    this.model = null;
    this.currentCacheField = null;
    this.inCacheFields = false;
    this.inCacheSource = false;
  }

  prepare(_model: any): void {
    // No preparation needed for writing
  }

  get tag(): string {
    // http://www.datypic.com/sc/ooxml/e-ssml_pivotCacheDefinition.html
    return "pivotCacheDefinition";
  }

  reset(): void {
    this.model = null;
    this.currentCacheField = null;
    this.inCacheFields = false;
    this.inCacheSource = false;
  }

  /**
   * Render pivot cache definition XML.
   * Supports both newly created models (with PivotTableSource) and loaded models.
   */
  render(xmlStream: any, model: CacheDefinitionModel | ParsedCacheDefinitionModel): void {
    // Check if this is a loaded model (has isLoaded flag or no source property)
    const isLoaded = (model as ParsedCacheDefinitionModel).isLoaded || !("source" in model);

    if (isLoaded) {
      this.renderLoaded(xmlStream, model as ParsedCacheDefinitionModel);
    } else {
      this.renderNew(xmlStream, model as CacheDefinitionModel);
    }
  }

  /**
   * Render newly created pivot cache definition
   */
  private renderNew(xmlStream: any, model: CacheDefinitionModel): void {
    const { source, cacheFields } = model;

    // Record count = number of data rows (excluding header row)
    const recordCount = source.getSheetValues().slice(2).length;

    xmlStream.openXml(XmlStream.StdDocAttributes);
    xmlStream.openNode(this.tag, {
      ...PivotCacheDefinitionXform.PIVOT_CACHE_DEFINITION_ATTRIBUTES,
      "r:id": "rId1",
      refreshOnLoad: "1", // important for our implementation to work
      createdVersion: "8",
      refreshedVersion: "8",
      minRefreshableVersion: "3",
      recordCount
    });

    xmlStream.openNode("cacheSource", { type: "worksheet" });
    xmlStream.leafNode("worksheetSource", {
      ref: source.dimensions.shortRange,
      sheet: source.name
    });
    xmlStream.closeNode();

    xmlStream.openNode("cacheFields", { count: cacheFields.length });
    // Note: keeping this pretty-printed for now to ease debugging.
    xmlStream.writeXml(
      cacheFields.map((cacheField: any) => new CacheField(cacheField).render()).join("\n    ")
    );
    xmlStream.closeNode();

    xmlStream.closeNode();
  }

  /**
   * Render loaded pivot cache definition (preserving original structure)
   */
  private renderLoaded(xmlStream: any, model: ParsedCacheDefinitionModel): void {
    const { cacheFields, sourceRef, sourceSheet, recordCount } = model;

    xmlStream.openXml(XmlStream.StdDocAttributes);
    xmlStream.openNode(this.tag, {
      ...PivotCacheDefinitionXform.PIVOT_CACHE_DEFINITION_ATTRIBUTES,
      "r:id": model.rId || "rId1",
      refreshOnLoad: model.refreshOnLoad || "1",
      createdVersion: model.createdVersion || "8",
      refreshedVersion: model.refreshedVersion || "8",
      minRefreshableVersion: model.minRefreshableVersion || "3",
      recordCount: recordCount || cacheFields.length + 1
    });

    xmlStream.openNode("cacheSource", { type: "worksheet" });
    xmlStream.leafNode("worksheetSource", {
      ref: sourceRef,
      sheet: sourceSheet
    });
    xmlStream.closeNode();

    xmlStream.openNode("cacheFields", { count: cacheFields.length });
    xmlStream.writeXml(
      cacheFields
        .map((cacheField: CacheFieldModel) => new CacheField(cacheField).render())
        .join("\n    ")
    );
    xmlStream.closeNode();

    xmlStream.closeNode();
  }

  parseOpen(node: any): boolean {
    const { name, attributes } = node;

    // Delegate to current cacheField parser if active
    if (this.currentCacheField) {
      this.currentCacheField.parseOpen(node);
      return true;
    }

    switch (name) {
      case this.tag:
        // pivotCacheDefinition root element
        this.reset();
        this.model = {
          cacheFields: [],
          rId: attributes["r:id"],
          refreshOnLoad: attributes.refreshOnLoad,
          createdVersion: attributes.createdVersion,
          refreshedVersion: attributes.refreshedVersion,
          minRefreshableVersion: attributes.minRefreshableVersion,
          recordCount: attributes.recordCount ? parseInt(attributes.recordCount, 10) : undefined,
          isLoaded: true
        };
        break;

      case "cacheSource":
        this.inCacheSource = true;
        break;

      case "worksheetSource":
        if (this.inCacheSource && this.model) {
          this.model.sourceRef = attributes.ref;
          this.model.sourceSheet = attributes.sheet;
        }
        break;

      case "cacheFields":
        this.inCacheFields = true;
        break;

      case "cacheField":
        if (this.inCacheFields) {
          this.currentCacheField = new CacheFieldXform();
          this.currentCacheField.parseOpen(node);
        }
        break;
    }

    return true;
  }

  parseText(text: string): void {
    if (this.currentCacheField) {
      this.currentCacheField.parseText(text);
    }
  }

  parseClose(name: string): boolean {
    // Delegate to current cacheField parser if active
    if (this.currentCacheField) {
      if (!this.currentCacheField.parseClose(name)) {
        // cacheField parsing complete, add to model
        if (this.model && this.currentCacheField.model) {
          this.model.cacheFields.push(this.currentCacheField.model);
        }
        this.currentCacheField = null;
      }
      return true;
    }

    switch (name) {
      case this.tag:
        // End of pivotCacheDefinition
        return false;

      case "cacheSource":
        this.inCacheSource = false;
        break;

      case "cacheFields":
        this.inCacheFields = false;
        break;
    }

    return true;
  }

  reconcile(_model: any, _options: any): void {
    // No reconciliation needed
  }

  static PIVOT_CACHE_DEFINITION_ATTRIBUTES = {
    xmlns: "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "xmlns:r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  };
}

export { PivotCacheDefinitionXform, type ParsedCacheDefinitionModel };
