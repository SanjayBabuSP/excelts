import { describe, it, expect } from "vitest";
import { PivotCacheDefinitionXform } from "@excel/xlsx/xform/pivot-table/pivot-cache-definition-xform";

describe("PivotCacheDefinitionXform", () => {
  describe("parseOpen - worksheetSource", () => {
    it("should parse name attribute (table reference style)", () => {
      const xform = new PivotCacheDefinitionXform();

      // Simulate parsing pivotCacheDefinition
      xform.parseOpen({ name: "pivotCacheDefinition", attributes: { "r:id": "rId1" } });
      xform.parseOpen({ name: "cacheSource", attributes: { type: "worksheet" } });
      xform.parseOpen({ name: "worksheetSource", attributes: { name: "bookingData" } });

      expect(xform.model?.sourceTableName).toBe("bookingData");
      expect(xform.model?.sourceRef).toBeUndefined();
      expect(xform.model?.sourceSheet).toBeUndefined();
    });

    it("should parse ref and sheet attributes (cell range reference style)", () => {
      const xform = new PivotCacheDefinitionXform();

      xform.parseOpen({ name: "pivotCacheDefinition", attributes: { "r:id": "rId1" } });
      xform.parseOpen({ name: "cacheSource", attributes: { type: "worksheet" } });
      xform.parseOpen({
        name: "worksheetSource",
        attributes: { ref: "A1:C10", sheet: "DataSheet" }
      });

      expect(xform.model?.sourceRef).toBe("A1:C10");
      expect(xform.model?.sourceSheet).toBe("DataSheet");
      expect(xform.model?.sourceTableName).toBeUndefined();
    });
  });

  describe("renderLoaded - worksheetSource", () => {
    it("should render name attribute when sourceTableName is set", () => {
      const xform = new PivotCacheDefinitionXform();
      const xml = xform.toXml({
        isLoaded: true,
        sourceTableName: "bookingData",
        cacheFields: [],
        recordCount: 5
      });

      expect(xml).toContain('<worksheetSource name="bookingData"/>');
      expect(xml).not.toContain("ref=");
      expect(xml).not.toContain("sheet=");
    });

    it("should render ref and sheet attributes when sourceRef/sourceSheet are set", () => {
      const xform = new PivotCacheDefinitionXform();
      const xml = xform.toXml({
        isLoaded: true,
        sourceRef: "A1:D100",
        sourceSheet: "RawData",
        cacheFields: [],
        recordCount: 99
      });

      expect(xml).toContain('ref="A1:D100"');
      expect(xml).toContain('sheet="RawData"');
      expect(xml).not.toContain("name=");
    });

    it("should prefer sourceTableName over sourceRef/sourceSheet", () => {
      const xform = new PivotCacheDefinitionXform();
      const xml = xform.toXml({
        isLoaded: true,
        sourceTableName: "MyTable",
        sourceRef: "A1:D100",
        sourceSheet: "Sheet1",
        cacheFields: [],
        recordCount: 10
      });

      // sourceTableName takes precedence
      expect(xml).toContain('<worksheetSource name="MyTable"/>');
      expect(xml).not.toContain('ref="A1:D100"');
      expect(xml).not.toContain('sheet="Sheet1"');
    });
  });

  describe("roundtrip", () => {
    it("should preserve sourceTableName through parse → render cycle", () => {
      const xform = new PivotCacheDefinitionXform();

      // Parse original XML structure
      xform.parseOpen({ name: "pivotCacheDefinition", attributes: { "r:id": "rId1" } });
      xform.parseOpen({ name: "cacheSource", attributes: { type: "worksheet" } });
      xform.parseOpen({ name: "worksheetSource", attributes: { name: "SalesData" } });
      xform.parseClose("worksheetSource");
      xform.parseClose("cacheSource");
      xform.parseOpen({ name: "cacheFields", attributes: { count: "0" } });
      xform.parseClose("cacheFields");
      xform.parseClose("pivotCacheDefinition");

      // Render back to XML
      const xml = xform.toXml(xform.model!);

      // Verify the name attribute is preserved
      expect(xml).toContain('<worksheetSource name="SalesData"/>');
    });
  });
});
