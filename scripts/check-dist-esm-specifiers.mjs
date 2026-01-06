#!/usr/bin/env node
import fs from "fs";
import path from "path";

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function readArg(name) {
  const argv = process.argv;
  const idx = argv.indexOf(name);
  if (idx === -1) {
    return null;
  }
  return argv[idx + 1] ?? null;
}

function resolveDirArg(value) {
  if (!value || typeof value !== "string") {
    return null;
  }
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

const dir =
  resolveDirArg(readArg("--dir") ?? readArg("--dist") ?? process.argv[2]) ??
  path.resolve(process.cwd(), "dist/esm");

function listFiles(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
      } else if (entry.isFile() && entry.name.endsWith(".js")) {
        out.push(abs);
      }
    }
  }
  return out;
}

function hasExplicitExtension(specifier) {
  // For URL-like specifiers, extname is not reliable, but we only care about relative file paths.
  if (specifier.endsWith("/index.js")) {
    return true;
  }
  if (specifier.endsWith(".js") || specifier.endsWith(".json")) {
    return true;
  }
  // Any other extension counts as explicit.
  return Boolean(path.posix.extname(specifier));
}

function isRelativeSpecifier(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

function computeLineNumber(source, offset) {
  // 1-based line number
  let line = 1;
  for (let i = 0; i < offset; i++) {
    if (source.charCodeAt(i) === 10) {
      line++;
    }
  }
  return line;
}

function scanFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }

  const issues = [];

  // import ... from "x"; export ... from "x"; and side-effect imports: import "x";
  const staticRe =
    /\b(?:import|export)\b[\s\S]*?\bfrom\s*["'](?<spec1>[^"']+)["']|\bimport\s*["'](?<spec2>[^"']+)["']/g;

  for (const match of content.matchAll(staticRe)) {
    const specifier = match.groups?.spec1 ?? match.groups?.spec2;
    if (!specifier || !isRelativeSpecifier(specifier)) {
      continue;
    }
    if (!hasExplicitExtension(specifier)) {
      issues.push({
        filePath,
        line: computeLineNumber(content, match.index ?? 0),
        kind: "static",
        specifier
      });
    }
  }

  // dynamic imports: import("x")
  const dynamicRe = /\bimport\s*\(\s*["'](?<spec>[^"']+)["']\s*\)/g;
  for (const match of content.matchAll(dynamicRe)) {
    const specifier = match.groups?.spec;
    if (!specifier || !isRelativeSpecifier(specifier)) {
      continue;
    }
    if (!hasExplicitExtension(specifier)) {
      issues.push({
        filePath,
        line: computeLineNumber(content, match.index ?? 0),
        kind: "dynamic",
        specifier
      });
    }
  }

  return issues;
}

const jsFiles = listFiles(dir);
let issues = [];
for (const file of jsFiles) {
  issues = issues.concat(scanFile(file));
}

if (issues.length === 0) {
  console.log(`✅ OK: all relative ESM specifiers in ${toPosix(dir)} have explicit extensions.`);
  process.exit(0);
}

issues.sort((a, b) =>
  a.filePath === b.filePath ? a.line - b.line : a.filePath.localeCompare(b.filePath)
);

console.error(`❌ Found ${issues.length} extensionless relative specifier(s) in ${toPosix(dir)}:`);
for (const issue of issues) {
  const relFile = toPosix(path.relative(process.cwd(), issue.filePath));
  console.error(`${relFile}:${issue.line}  ${issue.kind}  ${issue.specifier}`);
}
process.exit(1);
