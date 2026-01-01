import { describe, it, expect } from "vitest";
import { CacheField } from "../../../xform/pivot-table/cache-field";

describe("CacheField", () => {
  describe("render", () => {
    describe("string sharedItems", () => {
      it("should render string sharedItems with <s> elements", () => {
        const cacheField = new CacheField({
          name: "Category",
          sharedItems: ["Apple", "Banana", "Cherry"]
        });

        const xml = cacheField.render();

        expect(xml).toContain('name="Category"');
        expect(xml).toContain('count="3"');
        expect(xml).toContain('<s v="Apple" />');
        expect(xml).toContain('<s v="Banana" />');
        expect(xml).toContain('<s v="Cherry" />');
        // Should NOT contain numeric attributes
        expect(xml).not.toContain("containsNumber");
      });

      it("should escape XML special characters in string values", () => {
        const cacheField = new CacheField({
          name: "Data",
          sharedItems: ["A & B", "C < D", 'E "F"']
        });

        const xml = cacheField.render();

        expect(xml).toContain('<s v="A &amp; B" />');
        expect(xml).toContain('<s v="C &lt; D" />');
        expect(xml).toContain('<s v="E &quot;F&quot;" />');
      });

      it("should escape XML special characters in field name", () => {
        const cacheField = new CacheField({
          name: "A & B",
          sharedItems: ["value"]
        });

        const xml = cacheField.render();

        expect(xml).toContain('name="A &amp; B"');
      });
    });

    describe("numeric sharedItems (Issue #15)", () => {
      it("should render integer sharedItems with <n> elements", () => {
        const cacheField = new CacheField({
          name: "Amount",
          sharedItems: [5, 24, 35, 45]
        });

        const xml = cacheField.render();

        expect(xml).toContain('name="Amount"');
        expect(xml).toContain('containsNumber="1"');
        expect(xml).toContain('containsInteger="1"');
        expect(xml).toContain('minValue="5"');
        expect(xml).toContain('maxValue="45"');
        expect(xml).toContain('count="4"');
        expect(xml).toContain('<n v="5" />');
        expect(xml).toContain('<n v="24" />');
        expect(xml).toContain('<n v="35" />');
        expect(xml).toContain('<n v="45" />');
        // Should NOT use string format
        expect(xml).not.toContain('<s v="5"');
        expect(xml).not.toContain('<s v="24"');
      });

      it("should render float sharedItems without containsInteger", () => {
        const cacheField = new CacheField({
          name: "Price",
          sharedItems: [5.5, 10.25, 24.75]
        });

        const xml = cacheField.render();

        expect(xml).toContain('containsNumber="1"');
        expect(xml).not.toContain('containsInteger="1"');
        expect(xml).toContain('minValue="5.5"');
        expect(xml).toContain('maxValue="24.75"');
        expect(xml).toContain('<n v="5.5" />');
        expect(xml).toContain('<n v="10.25" />');
        expect(xml).toContain('<n v="24.75" />');
      });

      it("should handle negative numbers correctly", () => {
        const cacheField = new CacheField({
          name: "Value",
          sharedItems: [-10, 0, 20]
        });

        const xml = cacheField.render();

        expect(xml).toContain('minValue="-10"');
        expect(xml).toContain('maxValue="20"');
        expect(xml).toContain('<n v="-10" />');
        expect(xml).toContain('<n v="0" />');
        expect(xml).toContain('<n v="20" />');
      });

      it("should handle single numeric value", () => {
        const cacheField = new CacheField({
          name: "Single",
          sharedItems: [42]
        });

        const xml = cacheField.render();

        expect(xml).toContain('minValue="42"');
        expect(xml).toContain('maxValue="42"');
        expect(xml).toContain('count="1"');
        expect(xml).toContain('<n v="42" />');
      });
    });

    describe("mixed types in sharedItems", () => {
      it("should treat mixed string/number as strings", () => {
        const cacheField = new CacheField({
          name: "Mixed",
          sharedItems: ["text", 123, "another"]
        });

        const xml = cacheField.render();

        // Mixed types should be treated as strings
        expect(xml).toContain('<s v="text" />');
        expect(xml).toContain('<s v="123" />');
        expect(xml).toContain('<s v="another" />');
        expect(xml).not.toContain("containsNumber");
      });
    });

    describe("edge cases", () => {
      it("should handle empty sharedItems array", () => {
        const cacheField = new CacheField({
          name: "Empty",
          sharedItems: []
        });

        const xml = cacheField.render();

        // Empty array should render as string type with count=0
        expect(xml).toContain('name="Empty"');
        expect(xml).toContain('count="0"');
        // Should NOT have numeric attributes (especially not Infinity/-Infinity)
        expect(xml).not.toContain("containsNumber");
        expect(xml).not.toContain("minValue");
        expect(xml).not.toContain("maxValue");
        expect(xml).not.toContain("Infinity");
      });

      it("should handle zero-only values", () => {
        const cacheField = new CacheField({
          name: "Zeros",
          sharedItems: [0, 0, 0]
        });

        const xml = cacheField.render();

        expect(xml).toContain('containsNumber="1"');
        expect(xml).toContain('containsInteger="1"');
        expect(xml).toContain('minValue="0"');
        expect(xml).toContain('maxValue="0"');
        expect(xml).toContain('<n v="0" />');
      });

      it("should handle very large numbers", () => {
        const cacheField = new CacheField({
          name: "Large",
          sharedItems: [1e10, 1e15, Number.MAX_SAFE_INTEGER]
        });

        const xml = cacheField.render();

        expect(xml).toContain('containsNumber="1"');
        expect(xml).toContain(`<n v="${1e10}" />`);
        expect(xml).toContain(`<n v="${1e15}" />`);
        expect(xml).toContain(`<n v="${Number.MAX_SAFE_INTEGER}" />`);
      });

      it("should handle very small decimal numbers", () => {
        const cacheField = new CacheField({
          name: "Small",
          sharedItems: [0.001, 0.0001, 1e-10]
        });

        const xml = cacheField.render();

        expect(xml).toContain('containsNumber="1"');
        expect(xml).not.toContain('containsInteger="1"');
        expect(xml).toContain(`minValue="${1e-10}"`);
      });

      it("should treat NaN and Infinity as non-numeric", () => {
        const cacheField = new CacheField({
          name: "Special",
          sharedItems: [NaN, Infinity, -Infinity]
        });

        const xml = cacheField.render();

        // NaN and Infinity should be treated as strings since they're not finite
        expect(xml).not.toContain("containsNumber");
        expect(xml).toContain("<s v=");
      });

      it("should handle Unicode characters in field name", () => {
        const cacheField = new CacheField({
          name: "日本語フィールド",
          sharedItems: ["値1", "値2"]
        });

        const xml = cacheField.render();

        expect(xml).toContain('name="日本語フィールド"');
        expect(xml).toContain('<s v="値1" />');
        expect(xml).toContain('<s v="値2" />');
      });

      it("should handle emoji in values", () => {
        const cacheField = new CacheField({
          name: "Emoji",
          sharedItems: ["😀", "🎉", "👍"]
        });

        const xml = cacheField.render();

        expect(xml).toContain('<s v="😀" />');
        expect(xml).toContain('<s v="🎉" />');
        expect(xml).toContain('<s v="👍" />');
      });

      it("should handle boolean values as strings", () => {
        const cacheField = new CacheField({
          name: "Boolean",
          sharedItems: [true, false] as any[]
        });

        const xml = cacheField.render();

        // Booleans are not numbers, so should be treated as strings
        expect(xml).not.toContain("containsNumber");
        expect(xml).toContain('<s v="true" />');
        expect(xml).toContain('<s v="false" />');
      });

      it("should handle single string value", () => {
        const cacheField = new CacheField({
          name: "Single",
          sharedItems: ["OnlyOne"]
        });

        const xml = cacheField.render();

        expect(xml).toContain('count="1"');
        expect(xml).toContain('<s v="OnlyOne" />');
      });

      it("should handle whitespace-only values", () => {
        const cacheField = new CacheField({
          name: "Whitespace",
          sharedItems: [" ", "  ", "\t", "\n"]
        });

        const xml = cacheField.render();

        expect(xml).toContain('<s v=" " />');
        expect(xml).toContain('<s v="  " />');
      });

      it("should handle empty string value", () => {
        const cacheField = new CacheField({
          name: "EmptyString",
          sharedItems: ["", "nonempty"]
        });

        const xml = cacheField.render();

        expect(xml).toContain('<s v="" />');
        expect(xml).toContain('<s v="nonempty" />');
      });
    });

    describe("null sharedItems (unused or value-only fields)", () => {
      it("should render empty sharedItems for unused field", () => {
        const cacheField = new CacheField({
          name: "Unused",
          sharedItems: null
        });

        const xml = cacheField.render();

        expect(xml).toContain('name="Unused"');
        expect(xml).toContain("<sharedItems />");
        // Should NOT contain numeric attributes for unused fields
        expect(xml).not.toContain("containsNumber");
        expect(xml).not.toContain("minValue");
        expect(xml).not.toContain("maxValue");
      });

      it("should render numeric attributes for value-only field with minMax", () => {
        const cacheField = new CacheField({
          name: "ValueOnly",
          sharedItems: null,
          minValue: 10,
          maxValue: 100
        });

        const xml = cacheField.render();

        expect(xml).toContain('name="ValueOnly"');
        expect(xml).toContain('containsNumber="1"');
        expect(xml).toContain('containsInteger="1"');
        expect(xml).toContain('minValue="10"');
        expect(xml).toContain('maxValue="100"');
        // Should be self-closing (no child elements)
        expect(xml).toMatch(/<sharedItems[^>]+\/>/);
      });
    });
  });
});
