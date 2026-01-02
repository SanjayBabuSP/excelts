import { defineConfig } from "rolldown";
import fs from "node:fs";
import { preferBrowserFilesPlugin } from "./src/utils/browser";

const pkg = JSON.parse(fs.readFileSync("./package.json", "utf-8"));
const banner = `/*!
 * ${pkg.name} v${pkg.version}
 * ${pkg.description}
 * (c) ${new Date().getFullYear()} ${pkg.author.name}
 * Released under the ${pkg.license} License
 */`;

// Common config shared by both builds
// Browser version now has NO Node.js polyfills - pure browser code

const commonConfig = {
  input: "./src/index.browser.ts",
  platform: "browser" as const,
  tsconfig: "./tsconfig.json",
  plugins: [preferBrowserFilesPlugin()]
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
  {
    ...commonConfig,
    output: {
      dir: "./dist/browser",
      format: "esm",
      sourcemap: true,
      banner,
      entryFileNames: "excelts.esm.js"
    },
    plugins: [...commonConfig.plugins, copyLicensePlugin]
  },
  {
    ...commonConfig,
    output: {
      dir: "./dist/browser",
      format: "esm",
      sourcemap: false,
      banner,
      minify: true,
      entryFileNames: "excelts.esm.min.js"
    },
    plugins: [...commonConfig.plugins]
  },
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
    },
    plugins: [...commonConfig.plugins]
  },
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
    },
    plugins: [...commonConfig.plugins]
  }
]);
