#!/usr/bin/env node
// Post-build script for ESM: adds .js extensions to imports for Node.js ESM compatibility
// Node.js ESM requires explicit file extensions in import statements
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const esmDir = path.join(__dirname, "../dist/esm");

let filesModified = 0;

function addJsExtensions(dir) {
  let entries;
  try {
    // Use withFileTypes to get file type info in a single call, avoiding TOCTOU race
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      addJsExtensions(filePath);
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      try {
        let content = fs.readFileSync(filePath, "utf8");
        const originalContent = content;

        // Add .js extensions to relative imports that don't already have them
        // Handles: import { x } from "./path" -> import { x } from "./path.js"
        // And: export { x } from "./path" -> export { x } from "./path.js"
        content = content.replace(
          /((?:import|export)\s*(?:[^'"]*\s+from\s+)?['"])(\.\.?\/[^'"]+?)(?<!\.js)(['"])/g,
          (match, prefix, importPath, suffix) => {
            // Don't add .js if already has an extension or is a directory index
            if (importPath.endsWith(".js") || importPath.endsWith(".json")) {
              return match;
            }
            // Check if this is a directory import (has index.js)
            const resolvedPath = path.resolve(path.dirname(filePath), importPath);
            const indexPath = path.join(resolvedPath, "index.js");
            if (fs.existsSync(indexPath)) {
              // It's a directory with index.js, add /index.js
              return `${prefix}${importPath}/index.js${suffix}`;
            }
            return `${prefix}${importPath}.js${suffix}`;
          }
        );

        // Handle dynamic imports: import("./path") -> import("./path.js")
        content = content.replace(
          /(import\s*\(\s*['"])(\.\.?\/[^'"]+?)(?<!\.js)(['"]\s*\))/g,
          (match, prefix, importPath, suffix) => {
            if (importPath.endsWith(".js") || importPath.endsWith(".json")) {
              return match;
            }
            // Check if this is a directory import (has index.js)
            const resolvedPath = path.resolve(path.dirname(filePath), importPath);
            const indexPath = path.join(resolvedPath, "index.js");
            if (fs.existsSync(indexPath)) {
              return `${prefix}${importPath}/index.js${suffix}`;
            }
            return `${prefix}${importPath}.js${suffix}`;
          }
        );

        if (content !== originalContent) {
          fs.writeFileSync(filePath, content);
          filesModified++;
        }
      } catch {
        // File may have been deleted or modified, skip it
        continue;
      }
    }
  }
}

console.log("Adding .js extensions to ESM imports for Node.js compatibility...");
addJsExtensions(esmDir);
console.log(`Done! Modified ${filesModified} files.`);
