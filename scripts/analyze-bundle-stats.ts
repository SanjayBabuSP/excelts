#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Metric = "rendered" | "gzip" | "brotli";

type NodePart = {
  renderedLength?: number;
  gzipLength?: number;
  brotliLength?: number;
};

type VisualizerData = {
  nodeParts: Record<string, NodePart>;
  nodeMetas: Record<
    string,
    {
      id: string;
      moduleParts: Record<string, string>;
    }
  >;
};

const parseArgs = (argv: string[]) => {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const value = argv[i + 1];
    if (value && !value.startsWith("--")) {
      out[key] = value;
      i++;
    } else {
      out[key] = "true";
    }
  }
  return out;
};

const args = parseArgs(process.argv.slice(2));
const metric = (args.metric ?? "rendered") as Metric;
const top = Math.max(1, Number(args.top ?? 20));
const statsPath = resolve(process.cwd(), args.file ?? "dist/stats.html");
const filter = args.filter ? String(args.filter) : undefined;

const metricKey: Record<Metric, keyof NodePart> = {
  rendered: "renderedLength",
  gzip: "gzipLength",
  brotli: "brotliLength"
};

const html = readFileSync(statsPath, "utf8");
const marker = "const data = ";
const start = html.indexOf(marker);
if (start === -1) {
  throw new Error(`Could not find visualizer data marker: ${marker}`);
}
const jsonStart = start + marker.length;
const end = html.indexOf(";", jsonStart);
if (end === -1) {
  throw new Error("Could not find end of visualizer data (missing ';')");
}

const raw = html.slice(jsonStart, end).trim();
const data = JSON.parse(raw) as VisualizerData;

const key = metricKey[metric];

const entries: Array<{ id: string; size: number }> = [];
for (const meta of Object.values(data.nodeMetas)) {
  const partUids = Object.values(meta.moduleParts);
  let size = 0;
  for (let i = 0; i < partUids.length; i++) {
    const part = data.nodeParts[partUids[i]];
    size += (part?.[key] ?? 0) as number;
  }
  if (size <= 0) continue;

  const id = meta.id.startsWith("/") ? meta.id.slice(1) : meta.id;
  if (filter && !id.includes(filter)) continue;
  entries.push({ id, size });
}

entries.sort((a, b) => b.size - a.size);

const formatBytes = (n: number): string => {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
  if (n >= 1024) return `${(n / 1024).toFixed(2)} KiB`;
  return `${n} B`;
};

console.log(`Top ${top} modules by ${metric} (${key}) from ${statsPath}`);
for (let i = 0; i < Math.min(top, entries.length); i++) {
  const e = entries[i];
  console.log(`${String(i + 1).padStart(2, " ")}. ${formatBytes(e.size)}\t${e.id}`);
}
