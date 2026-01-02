import { xmlEncode } from "@utils/utils";

interface CacheFieldConfig {
  name: string;
  sharedItems: any[] | null;
  minValue?: number;
  maxValue?: number;
}

class CacheField {
  declare private name: string;
  declare private sharedItems: any[] | null;
  declare private minValue?: number;
  declare private maxValue?: number;

  constructor({ name, sharedItems, minValue, maxValue }: CacheFieldConfig) {
    // string type
    //
    // {
    //   'name': 'A',
    //   'sharedItems': ['a1', 'a2', 'a3']
    // }
    //
    // or
    //
    // integer type (no sharedItems)
    //
    // {
    //   'name': 'D',
    //   'sharedItems': null,
    //   'minValue': 5,
    //   'maxValue': 45
    // }
    //
    // or
    //
    // numeric type with shared items (used as both row/column and value field)
    //
    // {
    //   'name': 'C',
    //   'sharedItems': [5, 24, 35, 45]
    // }
    this.name = name;
    this.sharedItems = sharedItems;
    this.minValue = minValue;
    this.maxValue = maxValue;
  }

  render(): string {
    // PivotCache Field: http://www.datypic.com/sc/ooxml/e-ssml_cacheField-1.html
    // Shared Items: http://www.datypic.com/sc/ooxml/e-ssml_sharedItems-1.html

    // Escape XML special characters in name attribute
    const escapedName = xmlEncode(this.name);

    // No shared items - field not used for rows/columns
    if (this.sharedItems === null) {
      // If no minValue/maxValue, this is an unused field - use empty sharedItems like Excel does
      if (this.minValue === undefined || this.maxValue === undefined) {
        return `<cacheField name="${escapedName}" numFmtId="0">
      <sharedItems />
    </cacheField>`;
      }
      // Numeric field used only for values (not rows/columns) - include min/max
      return `<cacheField name="${escapedName}" numFmtId="0">
      <sharedItems containsSemiMixedTypes="0" containsString="0" containsNumber="1" containsInteger="1" minValue="${this.minValue}" maxValue="${this.maxValue}" />
    </cacheField>`;
    }

    // Shared items exist - check if all values are numeric
    // Note: empty array returns true for every(), so check length first
    const allNumeric =
      this.sharedItems.length > 0 &&
      this.sharedItems.every(item => typeof item === "number" && Number.isFinite(item));
    const allInteger = allNumeric && this.sharedItems.every(item => Number.isInteger(item));

    if (allNumeric) {
      // Numeric shared items - used when field is both a row/column field AND a value field
      // This allows Excel to both group by unique values AND perform aggregation
      const minValue = Math.min(...this.sharedItems);
      const maxValue = Math.max(...this.sharedItems);
      const integerAttr = allInteger ? ' containsInteger="1"' : "";
      return `<cacheField name="${escapedName}" numFmtId="0">
      <sharedItems containsSemiMixedTypes="0" containsString="0" containsNumber="1"${integerAttr} minValue="${minValue}" maxValue="${maxValue}" count="${this.sharedItems.length}">
        ${this.sharedItems.map(item => `<n v="${item}" />`).join("")}
      </sharedItems>
    </cacheField>`;
    }

    // String shared items - escape XML special characters in each value
    return `<cacheField name="${escapedName}" numFmtId="0">
      <sharedItems count="${this.sharedItems.length}">
        ${this.sharedItems.map(item => `<s v="${xmlEncode(String(item))}" />`).join("")}
      </sharedItems>
    </cacheField>`;
  }
}

export { CacheField };
