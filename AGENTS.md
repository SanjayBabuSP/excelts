# AGENTS.md - AI Coding Agent Guidelines

This document provides guidelines for AI coding agents working in the excelts codebase.

## Project Overview

**excelts** is a TypeScript Excel workbook manager for reading/writing XLSX and CSV files.

- Zero runtime dependencies
- Cross-platform: Node.js (22+) and browsers (Chrome 89+, Firefox 102+, Safari 14.1+)
- ESM-first with CommonJS compatibility

## Build/Lint/Test Commands

```bash
pnpm install             # Install dependencies (use pnpm)
pnpm run check           # Type check + lint (parallel)
pnpm run type            # Type checking only
pnpm run lint            # Linting (ESLint + OxLint)
pnpm run lint:fix        # Auto-fix lint issues
pnpm run format          # Format with Prettier
pnpm run test            # Run all tests (Node + browser)
pnpm run test:watch      # Watch mode
pnpm run test:browser    # Browser tests only
pnpm run build           # Full production build

# Run a SINGLE test file
pnpm exec vitest run src/modules/excel/__tests__/cell.test.ts

# Run tests matching a pattern
pnpm exec vitest run -t "should handle empty cells"
```

## Project Structure

```
src/
├── index.ts              # Main Node.js entry
├── index.browser.ts      # Browser entry
├── modules/
│   ├── excel/            # Workbook, Worksheet, Cell, Row, Column
│   │   ├── __tests__/    # Tests
│   │   ├── stream/       # WorkbookWriter, WorkbookReader
│   │   └── xlsx/         # XLSX format parsing/writing
│   ├── archive/          # ZIP/compression (zero-dependency)
│   ├── csv/              # CSV parsing/formatting
│   └── stream/           # Cross-platform streaming
├── utils/                # Shared utilities (errors, datetime, fs)
└── test/                 # Test utilities and fixtures
```

## Path Aliases

- `@excel/*` → `./src/modules/excel/*`
- `@archive/*` → `./src/modules/archive/*`
- `@csv/*` → `./src/modules/csv/*`
- `@stream/*` → `./src/modules/stream/*`
- `@utils/*` → `./src/utils/*`
- `@test/*` → `./src/test/*`

## Code Style Guidelines

### Formatting (Prettier)

- Semi-colons: required | Quotes: double (`"`) | Trailing commas: none
- Print width: 100 chars | Tab width: 2 spaces | Line endings: LF
- Arrow parens: avoid when possible (`x => x` not `(x) => x`)

### Imports

```typescript
import type { WorksheetModel } from "@excel/worksheet"; // Type-only imports
import { Worksheet } from "@excel/worksheet";
import { Cell } from "@excel/cell"; // Use path aliases (Good)
import { Cell } from "../../excel/cell"; // Avoid relative cross-module
import { Foo, Bar } from "./module"; // Combine, no duplicates
```

### TypeScript

- Use `type` keyword for type-only exports: `export type { MyType }`
- Prefix unused variables with underscore: `_unusedVar`
- Use `declare` for class properties assigned in constructor
- Use ES2022 error cause pattern for error chaining

### Naming Conventions

- **Classes**: PascalCase (`Workbook`, `Cell`)
- **Interfaces/Types**: PascalCase (`WorkbookModel`, `CellValue`)
- **Functions/Methods**: camelCase (`getCell`, `addWorksheet`)
- **Files**: kebab-case (`workbook-writer.ts`)
- **Test files**: `*.test.ts` in `__tests__/` directories
- **Browser variants**: `*.browser.ts` (e.g., `fs.browser.ts`)

### Error Handling

```typescript
import { BaseError } from "@utils/errors";

export class ExcelError extends BaseError {
  override name = "ExcelError";
}
throw new ExcelError("Failed to parse", { cause: originalError });
```

### Code Organization

```typescript
// =============================================================================
// Section Name
// =============================================================================

/** Creates a new worksheet. @param name - The worksheet name */
```

### Control Flow

Always use braces (enforced by OxLint):

```typescript
if (condition) {
  doSomething();
} // Good
if (condition) doSomething(); // Bad
```

## Testing

```typescript
import { describe, it, expect, beforeEach } from "vitest";

describe("Cell", () => {
  it("should set value correctly", () => {
    expect(cell.value).toBe(expected);
  });
});
```

### Test File Patterns

- Unit tests: `src/**/__tests__/*.test.ts`
- Integration: `*.integration.test.ts`
- Browser: `src/**/__tests__/browser/*.test.ts`
- Node-specific: `*.node.test.ts`

## Git Hooks & CI

- **pre-push**: Runs `pnpm run check`
- **CI**: Node 22.x/24.x/25.x on Ubuntu/macOS/Windows
- **Browser tests**: Playwright with Chromium

## Important Notes

1. Files ending in `.browser.ts` are browser-specific (swapped via build)
2. No circular imports (enforced by `import/no-cycle`)
3. Named exports only (for tree-shaking)
4. Test timeout: 30 seconds
5. ESM-first with `.js` extensions in built output
