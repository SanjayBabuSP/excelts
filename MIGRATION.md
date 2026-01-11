# Migration Guide

This document describes user-facing breaking changes and recommended migrations.

## CSV: `decimalSeparator` option moved (recommended)

### What changed

Previously, some examples used `parserOptions.decimalSeparator` to control how CSV string values are converted to numbers.

The CSV parser (`parseCsv` / `CsvParserStream`) still returns strings. Number conversion happens in the higher-level CSV worksheet integration (the default value mapper).

To make this clearer, the preferred configuration is now:

- **New (recommended):** `CsvReadOptions.valueMapperOptions.decimalSeparator`
- **Old (still supported, deprecated):** `CsvParseOptions.decimalSeparator`

### Why

- Parsing and value conversion are different concerns.
- Keeping the parser string-only avoids surprising implicit conversions.
- The new API makes it explicit that this option affects the default mapper.

### Before → After

#### In-memory read (`workbook.csv.load` / `parseCsvToWorksheet`)

Before:

```ts
workbook.csv.load(csvText, {
  parserOptions: {
    delimiter: ";",
    decimalSeparator: "," // deprecated
  }
});
```

After (recommended):

```ts
workbook.csv.load(csvText, {
  parserOptions: {
    delimiter: ";"
  },
  valueMapperOptions: {
    decimalSeparator: ","
  }
});
```

#### Streaming read (`workbook.csv.read` / `createWriteStream`)

Before:

```ts
await workbook.csv.read(readableStream, {
  parserOptions: {
    delimiter: ";",
    decimalSeparator: "," // deprecated
  }
});
```

After (recommended):

```ts
await workbook.csv.read(readableStream, {
  parserOptions: {
    delimiter: ";"
  },
  valueMapperOptions: {
    decimalSeparator: ","
  }
});
```

### Notes

- If you pass a custom `options.map`, the default mapper is not used, so `valueMapperOptions.decimalSeparator` will not affect your mapping.
- `CsvFormatOptions.decimalSeparator` is still the correct way to control number formatting when writing CSV.

## XLSX: DataValidations no longer expands small ranges

### What changed

When reading XLSX files, `dataValidations` entries with a range `sqref` (e.g. `A1:Y40`) are now stored as range entries in the internal model instead of being expanded into per-cell keys.

This reduces memory usage and avoids work proportional to the number of cells in the validation range.

### Impact

- `worksheet.getCell("A1").dataValidation` continues to work.
- If you accessed `worksheet.dataValidations.model` directly and expected per-cell keys for small ranges, update your code.

### How to migrate

- Prefer `worksheet.getCell(address).dataValidation` (or `worksheet.dataValidations.find(address)`) for lookups.
- If you need to iterate validations, iterate over the model entries and handle `range:` keys.

## Archive/ZIP: timestamp defaults are now reproducible-friendly

### What changed

When creating ZIPs, the default timestamp mode is now `"dos"` (DOS date/time only).
Previously, the default was `"dos+utc"`, which additionally writes a UTC mtime in the Info-ZIP extended timestamp extra field (0x5455).

### Why

- Omitting the UTC extra field makes output smaller and more stable.
- It avoids cross-machine differences when callers provide a `Date` interpreted in local time.

### How to migrate

- If you need the UTC timestamp extra field for interoperability or precision, pass `timestamps: "dos+utc"`.
- If you need stable hashes/byte-for-byte output across runs, use `reproducible: true` (or pass a fixed `modTime`).

## Cell: removed `HyperlinkValueData` type alias

### What changed

The legacy `HyperlinkValueData` type alias has been removed.

### How to migrate

Use the canonical `CellHyperlinkValue` type instead.
