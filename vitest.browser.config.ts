import path from "path";
import { defineConfig, type Plugin } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

const archiveDir = path.resolve("./src/modules/archive");
const streamDir = path.resolve("./src/modules/stream");
const utilsDir = path.resolve("./src/utils");
const xlsxDir = path.resolve("./src/xlsx");
const streamWriterDir = path.resolve("./src/stream");

/**
 * Vite plugin to redirect module imports to browser-specific versions.
 */
function browserRedirect(): Plugin {
  const redirects: Record<string, Record<string, string>> = {
    "/modules/archive/": {
      "./compress": `${archiveDir}/compress.browser.ts`,
      "./crc32": `${archiveDir}/crc32.browser.ts`,
      "./streaming-compress": `${archiveDir}/streaming-compress.browser.ts`,
      "./streaming-zip": `${archiveDir}/streaming-zip.ts`,
      "./parse": `${archiveDir}/parse.browser.ts`,
      "../stream/streams": `${streamDir}/streams.browser.ts`
    },
    "/modules/stream/": {
      "./streams": `${streamDir}/streams.browser.ts`
    },
    "/modules/csv/": {
      "../stream/streams": `${streamDir}/streams.browser.ts`,
      "./streams": `${streamDir}/streams.browser.ts`
    },
    "/utils/": {
      "../modules/stream/streams": `${streamDir}/streams.browser.ts`,
      "./utils": `${utilsDir}/utils.browser.ts`
    },
    // xlsx imports
    "/xlsx/": {
      "../utils/utils": `${utilsDir}/utils.browser.ts`,
      "../modules/archive/parse": `${archiveDir}/parse.browser.ts`
    },
    // doc imports
    "/doc/": {
      "../xlsx/xlsx": `${xlsxDir}/xlsx.browser.ts`,
      "../utils/utils": `${utilsDir}/utils.browser.ts`,
      "../stream/workbook-writer": `${streamWriterDir}/workbook-writer.browser.ts`,
      "../stream/workbook-reader": `${streamWriterDir}/workbook-reader.browser.ts`
    },
    // stream writer/reader imports (src/stream/)
    "/stream/": {
      "../modules/stream/streams": `${streamDir}/streams.browser.ts`,
      "../modules/archive/parse": `${archiveDir}/parse.browser.ts`,
      "./workbook-writer": `${streamWriterDir}/workbook-writer.browser.ts`,
      "./workbook-reader": `${streamWriterDir}/workbook-reader.browser.ts`,
      "../utils/utils": `${utilsDir}/utils.browser.ts`
    },
    // browser test imports (from src/__test__/browser/)
    "/__test__/browser/": {
      "../../stream/workbook-writer": `${streamWriterDir}/workbook-writer.browser.ts`,
      "../../stream/workbook-reader": `${streamWriterDir}/workbook-reader.browser.ts`
    }
  };

  return {
    name: "browser-redirect",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer) return null;
      for (const [pattern, map] of Object.entries(redirects)) {
        if (importer.includes(pattern) && map[source]) {
          console.log(`[redirect] ${source} from ${importer} -> ${map[source]}`);
          return map[source];
        }
      }
      if (source.includes("streams")) {
        console.log(`[no-match] ${source} from ${importer}`);
      }
      return null;
    }
  };
}

export default defineConfig({
  plugins: [browserRedirect()],
  define: {
    global: "globalThis"
  },
  test: {
    globals: true,
    testTimeout: 30000,
    setupFiles: ["./src/__test__/browser/setup.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [
        {
          browser: "chromium"
        }
      ]
    },
    include: ["src/__test__/browser/**/*.test.ts"]
  }
});
