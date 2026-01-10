#!/usr/bin/env node
// Post-build script:
// - rewrites relative imports/exports in a dist folder to prefer sibling `.browser.js` when present.
// This mirrors src/utils/browser.ts (preferBrowserFilesPlugin) but works on emitted JS files.
import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function readArg(name: string): string | null {
  const argv = process.argv;
  const idx = argv.indexOf(name);
  if (idx === -1) {
    return null;
  }
  return argv[idx + 1] ?? null;
}

function resolveDirArg(value: string | null): string | null {
  if (!value || typeof value !== "string") {
    return null;
  }
  return path.isAbsolute(value) ? value : path.resolve(projectRoot, value);
}

const distDir = resolveDirArg(readArg("--dir") ?? readArg("--dist"));
if (!distDir) {
  console.error("Usage: node scripts/fix-browser-imports.mjs --dir <distDir>");
  process.exitCode = 1;
  process.exit();
}

function toPosixPath(p: string): string {
  return p.split(path.sep).join("/");
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

interface PreferBrowserSpecifierOptions {
  filePath: string;
  specifier: string;
}

function preferBrowserSpecifier({
  filePath,
  specifier
}: PreferBrowserSpecifierOptions): string | null {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
    return null;
  }
  if (specifier.includes(".browser.")) {
    return null;
  }
  if (!specifier.endsWith(".js")) {
    return null;
  }

  const absTarget = path.resolve(path.dirname(filePath), specifier);
  const base = absTarget.slice(0, -".js".length);
  const candidateAbs = `${base}.browser.js`;
  if (fs.existsSync(candidateAbs) && fs.statSync(candidateAbs).isFile()) {
    let rel = path.relative(path.dirname(filePath), candidateAbs);
    rel = toPosixPath(rel);
    if (!rel.startsWith(".")) {
      rel = `./${rel}`;
    }
    return rel;
  }

  // Also support swapping `/index.js` to `/index.browser.js` if it exists.
  if (absTarget.endsWith(`${path.sep}index.js`)) {
    const indexBase = absTarget.slice(0, -"index.js".length);
    const indexBrowserAbs = path.join(indexBase, "index.browser.js");
    if (fs.existsSync(indexBrowserAbs) && fs.statSync(indexBrowserAbs).isFile()) {
      let rel = path.relative(path.dirname(filePath), indexBrowserAbs);
      rel = toPosixPath(rel);
      if (!rel.startsWith(".")) {
        rel = `./${rel}`;
      }
      return rel;
    }
  }

  return null;
}

let filesModified = 0;
let specifiersRewritten = 0;

const files = walk(distDir);
for (const filePath of files) {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    continue;
  }
  const original = content;

  // Static imports/exports: import ... from "x"; export ... from "x";
  content = content.replace(
    /((?:import|export)\s*(?:[^'\"]*\s+from\s+)?['\"])(\.[^'\"]+)(['\"])/g,
    (match, prefix, specifier, suffix) => {
      const rewritten = preferBrowserSpecifier({ filePath, specifier });
      if (!rewritten) {
        return match;
      }
      specifiersRewritten++;
      return `${prefix}${rewritten}${suffix}`;
    }
  );

  // Dynamic imports: import("x")
  content = content.replace(
    /(import\s*\(\s*['\"])(\.[^'\"]+)(['\"]\s*\))/g,
    (match, prefix, specifier, suffix) => {
      const rewritten = preferBrowserSpecifier({ filePath, specifier });
      if (!rewritten) {
        return match;
      }
      specifiersRewritten++;
      return `${prefix}${rewritten}${suffix}`;
    }
  );

  if (content !== original) {
    try {
      fs.writeFileSync(filePath, content);
      filesModified++;
    } catch {
      // ignore
    }
  }
}

console.log(
  `Prefer browser imports in ${toPosixPath(distDir)}: modified ${filesModified} files; rewrote ${specifiersRewritten} specifiers.`
);
