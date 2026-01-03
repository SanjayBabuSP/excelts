#!/usr/bin/env node
// Post-build script for ESM:
// - rewrites TS path aliases (from tsconfig.json) to relative paths in dist/esm
// - adds .js extensions to relative imports for Node.js ESM compatibility
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const defaultEsmDir = path.join(__dirname, "../dist/esm");
const defaultTypesDir = path.join(__dirname, "../dist/types");

function resolveDirArg(value) {
  if (!value || typeof value !== "string") {
    return null;
  }
  const resolved = path.isAbsolute(value) ? value : path.resolve(projectRoot, value);
  return resolved;
}

function readArg(name) {
  const argv = process.argv;
  const idx = argv.indexOf(name);
  if (idx === -1) {
    return null;
  }
  const value = argv[idx + 1];
  return value ?? null;
}

const esmDir = resolveDirArg(readArg("--dist") ?? readArg("--esm")) ?? defaultEsmDir;
const typesDir = resolveDirArg(readArg("--types")) ?? defaultTypesDir;

let filesModified = 0;

function toPosixPath(p) {
  return p.split(path.sep).join("/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isSafeAliasCapture(value) {
  if (typeof value !== "string") {
    return false;
  }
  if (value.includes("\0") || value.includes("\\")) {
    return false;
  }
  // Reject absolute paths and any traversal outside the alias root.
  // Captures can contain forward slashes (e.g. utils/sheet-utils).
  const normalized = path.posix.normalize(value);
  if (path.posix.isAbsolute(normalized)) {
    return false;
  }
  return !normalized.startsWith("..") && !normalized.includes("../");
}

function replaceStarLiteral(pattern, replacement) {
  // Avoid String.replace replacement semantics (e.g. $1) by using split/join.
  return pattern.split("*").join(replacement);
}

function tryResolveFile(filePathWithoutExt) {
  const candidates = [
    filePathWithoutExt,
    `${filePathWithoutExt}.ts`,
    `${filePathWithoutExt}.tsx`,
    path.join(filePathWithoutExt, "index.ts"),
    path.join(filePathWithoutExt, "index.tsx")
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function loadTsconfigPaths() {
  const tsconfigPath = path.join(projectRoot, "tsconfig.json");
  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf8"));
  return tsconfig?.compilerOptions?.paths ?? {};
}

const tsconfigPaths = loadTsconfigPaths();

function resolveAliasToRelativeImport({ specifier, filePath, distRoot, outputExtension }) {
  if (!specifier.startsWith("@")) {
    return null;
  }

  const srcRoot = path.join(projectRoot, "src");

  for (const [aliasPattern, targetPatterns] of Object.entries(tsconfigPaths)) {
    const hasStar = aliasPattern.includes("*");

    let captured = null;
    if (hasStar) {
      const [prefix, suffix] = aliasPattern.split("*");
      if (specifier.startsWith(prefix) && specifier.endsWith(suffix)) {
        captured = specifier.slice(prefix.length, specifier.length - suffix.length);
        if (!isSafeAliasCapture(captured)) {
          continue;
        }
      } else {
        continue;
      }
    } else {
      if (specifier !== aliasPattern) {
        continue;
      }
      captured = "";
    }

    for (const targetPattern of targetPatterns) {
      const replaced = hasStar ? replaceStarLiteral(targetPattern, captured) : targetPattern;
      const absTarget = path.resolve(projectRoot, replaced);
      const absSrcFile = tryResolveFile(absTarget) ?? absTarget;

      // Map src -> dist preserving folder structure
      const relFromSrcRoot = path.relative(srcRoot, absSrcFile);
      if (relFromSrcRoot.startsWith("..") || (path.isAbsolute(relFromSrcRoot) && !relFromSrcRoot)) {
        continue;
      }

      let absDistFile = path
        .join(distRoot, relFromSrcRoot)
        .replace(/\.[cm]?tsx?$/i, outputExtension);

      // If the target was a directory mapping, prefer index + extension
      if (!absDistFile.endsWith(outputExtension)) {
        absDistFile = `${absDistFile}${outputExtension}`;
      }
      if (!fs.existsSync(absDistFile)) {
        const outputExtRegex = new RegExp(`${escapeRegExp(outputExtension)}$`, "i");
        const indexCandidate = path.join(
          absDistFile.replace(outputExtRegex, ""),
          `index${outputExtension}`
        );
        if (fs.existsSync(indexCandidate)) {
          absDistFile = indexCandidate;
        }
      }

      let rel = path.relative(path.dirname(filePath), absDistFile);
      rel = toPosixPath(rel);
      if (!rel.startsWith(".")) {
        rel = `./${rel}`;
      }
      return rel;
    }
  }

  return null;
}

function rewritePathAliasesInFile(filePath, distRoot, outputExtension) {
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  const originalContent = content;

  // Static imports/exports: import ... from "x"; export ... from "x";
  content = content.replace(
    /((?:import|export)\s*(?:[^'\"]*\s+from\s+)?['\"])([^'\"]+)(['\"])/g,
    (match, prefix, specifier, suffix) => {
      const rewritten = resolveAliasToRelativeImport({
        specifier,
        filePath,
        distRoot,
        outputExtension
      });
      if (!rewritten) {
        return match;
      }
      return `${prefix}${rewritten}${suffix}`;
    }
  );

  // Dynamic imports: import("x")
  content = content.replace(
    /(import\s*\(\s*['\"])([^'\"]+)(['\"]\s*\))/g,
    (match, prefix, specifier, suffix) => {
      const rewritten = resolveAliasToRelativeImport({
        specifier,
        filePath,
        distRoot,
        outputExtension
      });
      if (!rewritten) {
        return match;
      }
      return `${prefix}${rewritten}${suffix}`;
    }
  );

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    filesModified++;
  }
}

function rewritePathAliases(dir, distRoot, { fileExtensions, outputExtension }) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      rewritePathAliases(filePath, distRoot, { fileExtensions, outputExtension });
    } else if (entry.isFile() && fileExtensions.some(ext => entry.name.endsWith(ext))) {
      rewritePathAliasesInFile(filePath, distRoot, outputExtension);
    }
  }
}

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

console.log(`Rewriting tsconfig path aliases in ESM output (${toPosixPath(esmDir)})...`);
rewritePathAliases(esmDir, esmDir, { fileExtensions: [".js"], outputExtension: ".js" });

console.log(`Rewriting tsconfig path aliases in declaration output (${toPosixPath(typesDir)})...`);
rewritePathAliases(typesDir, typesDir, { fileExtensions: [".d.ts"], outputExtension: ".d.ts" });

console.log("Adding .js extensions to ESM imports for Node.js compatibility...");
addJsExtensions(esmDir);
console.log(`Done! Modified ${filesModified} files.`);
