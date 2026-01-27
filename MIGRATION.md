# Migration Guide

This document describes user-facing breaking changes and recommended migrations.

## CSV: `decimalSeparator` option moved

### What changed

Previously, some examples used `parserOptions.decimalSeparator` to control how CSV string values are converted to numbers. That option has been removed.

The CSV parser (`parseCsv` / `CsvParserStream`) still returns strings. Number conversion happens in the higher-level CSV worksheet integration (the default value mapper).

To make this clearer, the preferred configuration is now:

- **Use:** `CsvReadOptions.valueMapperOptions.decimalSeparator`

### Why

- Parsing and value conversion are different concerns.
- Keeping the parser string-only avoids surprising implicit conversions.
- The new API makes it explicit that this option affects the default mapper.

### How to migrate

#### In-memory read (`workbook.csv.load` / `parseCsvToWorksheet`)

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

## CSV: unified `parse` / `stringify` / `toBuffer`

### What changed

A unified, higher-level CSV API is available on `workbook.csv`:

- `await workbook.csv.parse(input, options)` reads CSV into a worksheet
- `workbook.csv.stringify(options)` converts a worksheet to a CSV string
- `await workbook.csv.toBuffer(options)` converts a worksheet to a `Uint8Array`

`parse` accepts multiple input types:

- CSV string
- URL string (`http://` / `https://`)
- `File` / `Blob` (browser)
- readable stream

### How to migrate

#### In-memory read (string/bytes)

```ts
// Before
workbook.csv.load(csvText, { parserOptions: { delimiter: ";" } });

// After
await workbook.csv.parse(csvText, { delimiter: ";" });
```

#### Remote read (URL)

```ts
const ws = await workbook.csv.parse("https://example.com/data.csv");
```

#### Browser read (File)

```ts
const ws = await workbook.csv.parse(file);
```

#### Write to string / buffer

```ts
// Before
const csvText = workbook.csv.writeString({ formatterOptions: { delimiter: ";" } });
const bytes = await workbook.csv.writeBuffer();

// After
const csvText = workbook.csv.stringify({ delimiter: ";" });
const bytes = await workbook.csv.toBuffer();
```

### Notes

- Options are flattened: prefer `delimiter` / `header` over `parserOptions.delimiter` / `parserOptions.headers`.
- If you rely on a fixed delimiter, always pass `delimiter` explicitly.

## CSV: Legacy type aliases removed

### What changed

The following type aliases have been removed:

- `CsvReadOptions`
- `CsvWriteOptions`
- `CsvStreamReadOptions`
- `CsvStreamWriteOptions`

### How to migrate

Use `CsvOptions` instead — it's the unified options type for all CSV operations.

```ts
// Before
import type { CsvReadOptions, CsvWriteOptions } from "@cj-tech-master/excelts";

// After
import type { CsvOptions } from "@cj-tech-master/excelts";
```

## CSV: Legacy methods removed

### What changed

The following methods have been removed from the CSV class:

- `load()` → use `parse()` instead
- `writeString()` → use `stringify()` instead
- `writeBuffer()` → use `toBuffer()` instead

### How to migrate

```ts
// Before
const ws = workbook.csv.load(csvText);
const csvOut = workbook.csv.writeString();
const buffer = await workbook.csv.writeBuffer();

// After
const ws = await workbook.csv.parse(csvText);
const csvOut = workbook.csv.stringify();
const buffer = await workbook.csv.toBuffer();
```

Note: `parse()` is now async for consistency across all input types.

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
