import { defineConfig } from "rolldown";
import fs from "fs";
import path from "path";

const pkg = JSON.parse(fs.readFileSync("./package.json", "utf-8"));
const banner = `/*!
 * ${pkg.name} v${pkg.version}
 * ${pkg.description}
 * (c) ${new Date().getFullYear()} ${pkg.author.name}
 * Released under the ${pkg.license} License
 */`;

// Browser alias - redirect Node.js modules to browser-specific implementations
// Use absolute paths for both find and replacement
const srcPath = path.resolve("./src");
const browserAlias = {
  // Core modules with platform-specific implementations
  [path.join(srcPath, "xlsx/xlsx")]: path.join(srcPath, "xlsx/xlsx.browser.ts"),
  [path.join(srcPath, "modules/csv/csv")]: path.join(srcPath, "modules/csv/csv.browser.ts"),

  // Stream module - browser version uses our custom stream implementation
  // Note: index.ts imports from ./streams, which gets aliased to ./streams.browser.ts
  [path.join(srcPath, "modules/stream/streams")]: path.join(
    srcPath,
    "modules/stream/streams.browser.ts"
  ),

  // Streaming workbook reader/writer - browser uses browser version (no file system)
  [path.join(srcPath, "stream/workbook-writer")]: path.join(
    srcPath,
    "stream/workbook-writer.browser.ts"
  ),
  [path.join(srcPath, "stream/workbook-reader")]: path.join(
    srcPath,
    "stream/workbook-reader.browser.ts"
  ),

  // Utility modules - browser versions use Web APIs instead of Node.js APIs
  // Note: stream-buf.ts is now cross-platform (uses EventEmitter from modules/stream)
  [path.join(srcPath, "utils/utils")]: path.join(srcPath, "utils/utils.browser.ts"),
  [path.join(srcPath, "utils/encryptor")]: path.join(srcPath, "utils/encryptor.browser.ts"),

  // ZIP utilities - browser versions use CompressionStream instead of Node.js zlib
  [path.join(srcPath, "modules/archive/crc32")]: path.join(
    srcPath,
    "modules/archive/crc32.browser.ts"
  ),
  [path.join(srcPath, "modules/archive/compress")]: path.join(
    srcPath,
    "modules/archive/compress.browser.ts"
  ),
  [path.join(srcPath, "modules/archive/streaming-compress")]: path.join(
    srcPath,
    "modules/archive/streaming-compress.browser.ts"
  ),

  // Archive unzip stream parser - browser version uses native DecompressionStream
  [path.join(srcPath, "modules/archive/parse")]: path.join(
    srcPath,
    "modules/archive/parse.browser.ts"
  )
};

// Common config shared by both builds
// Browser version now has NO Node.js polyfills - pure browser code
const commonConfig = {
  input: "./src/index.browser.ts",
  external: ["@aws-sdk/client-s3"],
  platform: "browser",
  tsconfig: "./tsconfig.json",
  resolve: {
    alias: browserAlias
  }
};

const copyLicensePlugin = {
  name: "copy-license",
  writeBundle() {
    if (!fs.existsSync("./dist")) {
      fs.mkdirSync("./dist", { recursive: true });
    }
    fs.copyFileSync("./LICENSE", "./dist/LICENSE");
  }
};

export default defineConfig([
  // Browser ESM: excelts.esm.js (for Vite/Webpack bundlers - zero config)
  {
    ...commonConfig,
    output: {
      dir: "./dist/browser",
      format: "esm",
      sourcemap: true,
      banner,
      entryFileNames: "excelts.esm.js"
    },
    plugins: [copyLicensePlugin]
  },
  // Browser ESM minified: excelts.esm.min.js
  {
    ...commonConfig,
    output: {
      dir: "./dist/browser",
      format: "esm",
      sourcemap: false,
      banner,
      minify: true,
      entryFileNames: "excelts.esm.min.js"
    }
  },
  // Browser IIFE: excelts.iife.js (for development/debugging with <script> tag)
  {
    ...commonConfig,
    output: {
      dir: "./dist/browser",
      format: "iife",
      name: "ExcelTS",
      sourcemap: true,
      banner,
      exports: "named",
      entryFileNames: "excelts.iife.js"
    }
  },
  // Browser: excelts.iife.min.js (for production with <script> tag)
  {
    ...commonConfig,
    output: {
      dir: "./dist/browser",
      format: "iife",
      name: "ExcelTS",
      sourcemap: false,
      banner,
      exports: "named",
      minify: true,
      entryFileNames: "excelts.iife.min.js"
    }
  }
]);
