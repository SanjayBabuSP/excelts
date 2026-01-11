/**
 * Benchmark: Archive (unzip) vs AdmZip
 *
 * Compares performance of our built-in archive module against adm-zip package.
 *
 * Note: this benchmark expects `npm run build:esm` to have been run.
 * It imports the built ESM output to benchmark the real published code.
 */

import { performance } from "node:perf_hooks";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import util from "node:util";

// Our archive module runtime functions (loaded from built ESM output).
// This script benchmarks built output, so we intentionally load from dist.
let unzip: any;
let zip: any;

async function loadBuiltArchiveModule(): Promise<void> {
  // Built output exists after `npm run build:esm`.
  // @ts-ignore - dist output is generated at build time.
  const mod = await import("../dist/esm/modules/archive/index.js");
  unzip = mod.unzip;
  zip = mod.zip;
}

// AdmZip - install with: pnpm add -D adm-zip @types/adm-zip
import AdmZip from "adm-zip";

// Configuration
const RUN_QUICK = process.argv.includes("--quick");
const RUN_LARGE = !process.argv.includes("--no-large");
const WARMUP_RUNS = RUN_QUICK ? 1 : 3;
const BENCHMARK_RUNS = RUN_QUICK ? 3 : 10;
const VERBOSE = process.argv.includes("--verbose");
const RUN_ALL_MODES = process.argv.includes("--all-modes");

const TIMEOUT_ARG_INDEX = process.argv.indexOf("--timeout-ms");
const TIMEOUT_MS =
  TIMEOUT_ARG_INDEX >= 0 && process.argv[TIMEOUT_ARG_INDEX + 1]
    ? Number(process.argv[TIMEOUT_ARG_INDEX + 1])
    : 120_000;

const REPORT_ENABLED = !process.argv.includes("--no-report");
const REPORT_ARG_INDEX = process.argv.indexOf("--report");
const REPORT_PATH =
  REPORT_ARG_INDEX >= 0 && process.argv[REPORT_ARG_INDEX + 1]
    ? path.resolve(process.cwd(), process.argv[REPORT_ARG_INDEX + 1])
    : path.resolve(process.cwd(), "tmp/benchmark-unzip-report.txt");

// Test files - using existing xlsx files as they are zip archives
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_FILES = [
  path.join(REPO_ROOT, "src/modules/excel/__tests__/data/gold.xlsx"),
  path.join(REPO_ROOT, "src/modules/excel/stream/__tests__/data/huge.xlsx")
].filter(f => fs.existsSync(f));

// Generate a large ZIP buffer for testing
function generateLargeZipBuffer(totalSizeMB: number, fileCount: number): Buffer {
  const sizePerFile = Math.floor((totalSizeMB * 1024 * 1024) / fileCount);
  const encoder = new TextEncoder();
  const pattern = encoder.encode(
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(64)
  );

  const archive = zip({ level: 6 });

  for (let i = 0; i < fileCount; i++) {
    const content = new Uint8Array(sizePerFile);
    // Fast O(n) fill with repeating bytes (avoid O(n^2) string concatenation)
    let offset = 0;
    while (offset < content.length) {
      const toCopy = Math.min(pattern.length, content.length - offset);
      content.set(pattern.subarray(0, toCopy), offset);
      offset += toCopy;
    }
    if (content.length > 0) content[0] = i & 0xff;
    archive.add(`document_${i.toString().padStart(3, "0")}.txt`, content);
  }

  const zipData = archive.bytesSync();
  return Buffer.from(zipData);
}

interface BenchmarkResult {
  name: string;
  file: string;
  fileSize: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  entriesCount: number;
  memoryUsed: number;
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatMs(ms: number): string {
  return `${ms.toFixed(2)}ms`;
}

function gcIfAvailable(): void {
  if (typeof globalThis.gc === "function") {
    globalThis.gc();
  }
}

function getMemoryUsage(): number {
  gcIfAvailable();
  return process.memoryUsage().heapUsed;
}

function safeDiv(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return NaN;
  return numerator / denominator;
}

function formatSpeedup(speedup: number): string {
  if (!Number.isFinite(speedup) || speedup <= 0) return "n/a";
  return `${speedup.toFixed(2)}x`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Timeout after ${timeoutMs}ms (${label})`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function benchmarkAdmZip(buffer: Buffer): Promise<{ time: number; entriesCount: number }> {
  const start = performance.now();

  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  let entriesCount = 0;
  for (const entry of entries) {
    if (!entry.isDirectory) {
      // Extract data like in the user's original code
      const _data = entry.getData();
      entriesCount++;
    }
  }

  const time = performance.now() - start;
  return { time, entriesCount };
}

async function benchmarkUnzipBuffer(
  buffer: Uint8Array
): Promise<{ time: number; entriesCount: number }> {
  const start = performance.now();

  const reader = unzip(buffer);

  let entriesCount = 0;
  for await (const entry of reader.entries()) {
    if (entry.isDirectory) {
      // Always discard to avoid stalling the iterator.
      entry.discard();
      continue;
    }
    const _data = await entry.bytes();
    entriesCount++;
  }

  const time = performance.now() - start;
  return { time, entriesCount };
}

function bufferAsReadable(buffer: Uint8Array, chunkSize = 64 * 1024): Readable {
  return Readable.from(
    (function* (): Generator<Uint8Array> {
      for (let i = 0; i < buffer.length; i += chunkSize) {
        yield buffer.subarray(i, Math.min(buffer.length, i + chunkSize));
      }
    })()
  );
}

async function benchmarkUnzipStream(
  buffer: Uint8Array
): Promise<{ time: number; entriesCount: number }> {
  const start = performance.now();

  const reader = unzip(bufferAsReadable(buffer));

  let entriesCount = 0;
  for await (const entry of reader.entries()) {
    if (entry.isDirectory) {
      entry.discard();
      continue;
    }
    const _data = await entry.bytes();
    entriesCount++;
  }

  const time = performance.now() - start;
  return { time, entriesCount };
}

async function benchmarkUnzipStreamForceStream(
  buffer: Uint8Array
): Promise<{ time: number; entriesCount: number }> {
  const start = performance.now();

  const reader = unzip(bufferAsReadable(buffer), { parse: { forceStream: true } });

  let entriesCount = 0;
  for await (const entry of reader.entries()) {
    if (entry.isDirectory) {
      entry.discard();
      continue;
    }
    const _data = await entry.bytes();
    entriesCount++;
  }

  const time = performance.now() - start;
  return { time, entriesCount };
}

async function runBenchmark(
  name: string,
  filePath: string,
  buffer: Buffer,
  benchFn: (buf: any) => Promise<{ time: number; entriesCount: number }>
): Promise<BenchmarkResult> {
  const fileSize = buffer.length;
  const times: number[] = [];
  let entriesCount = 0;

  const label = `${name} @ ${path.basename(filePath)}`;

  // Always show which method is running (even without --verbose)
  console.log(`  → ${name}`);

  try {
    if (VERBOSE) console.log(`  → ${name} (warmup ${WARMUP_RUNS} + runs ${BENCHMARK_RUNS})`);

    // Warmup
    for (let i = 0; i < WARMUP_RUNS; i++) {
      if (VERBOSE) console.log(`    warmup ${i + 1}/${WARMUP_RUNS}`);
      await withTimeout(benchFn(buffer), TIMEOUT_MS, `${label} warmup ${i + 1}`);
      gcIfAvailable();
    }

    // Benchmark runs
    const memBefore = getMemoryUsage();
    for (let i = 0; i < BENCHMARK_RUNS; i++) {
      const result = await withTimeout(benchFn(buffer), TIMEOUT_MS, `${label} run ${i + 1}`);
      times.push(result.time);
      entriesCount = result.entriesCount;
      if (VERBOSE) {
        console.log(
          `    run ${i + 1}/${BENCHMARK_RUNS}: ${formatMs(result.time)} entries=${entriesCount}`
        );
      }
      gcIfAvailable();
    }
    const memAfter = getMemoryUsage();

    return {
      name,
      file: path.basename(filePath),
      fileSize,
      avgTime: times.reduce((a, b) => a + b, 0) / times.length,
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
      entriesCount,
      memoryUsed: Math.max(0, memAfter - memBefore)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      name,
      file: path.basename(filePath),
      fileSize,
      avgTime: Number.NaN,
      minTime: Number.NaN,
      maxTime: Number.NaN,
      entriesCount,
      memoryUsed: 0,
      error: message
    };
  }
}

function printComparison(title: string, results: BenchmarkResult[]): void {
  const adm = results.find(r => r.name === "AdmZip");
  const admTime = adm?.avgTime ?? Number.NaN;

  console.log(`  ${title}`);
  console.log(`  ┌──────────────────────────┬────────────┬───────────────┬─────────┐`);
  console.log(`  │ Method                   │ Avg Time   │ vs AdmZip      │ Entries │`);
  console.log(`  ├──────────────────────────┼────────────┼───────────────┼─────────┤`);

  for (const r of results) {
    const name = r.name.padEnd(24);
    const avg = Number.isFinite(r.avgTime) ? formatMs(r.avgTime).padStart(10) : "   (error)";
    const entries = String(r.entriesCount).padStart(7);

    let vs = "";
    if (r.name === "AdmZip") {
      vs = "1.00x";
    } else if (r.error) {
      vs = "ERROR";
    } else {
      const speedup = safeDiv(admTime, r.avgTime);
      vs = formatSpeedup(speedup);
      if (Number.isFinite(speedup)) {
        vs = speedup >= 1 ? `${vs} faster` : `${formatSpeedup(1 / speedup)} slower`;
      }
    }
    const vsCell = vs.padStart(13);

    console.log(`  │ ${name} │ ${avg} │ ${vsCell} │ ${entries} │`);
  }

  console.log(`  └──────────────────────────┴────────────┴───────────────┴─────────┘`);

  const failures = results.filter(r => r.error);
  if (failures.length > 0) {
    for (const f of failures) {
      console.log(`  ❌ ${f.name} failed: ${f.error}`);
    }
  }
}

async function main() {
  if (REPORT_ENABLED) {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, "", "utf8");

    const originalLog = console.log.bind(console);
    const originalError = console.error.bind(console);

    console.log = (...args: unknown[]) => {
      const msg = util.format(...args);
      originalLog(msg);
      fs.appendFileSync(REPORT_PATH, msg + "\n", "utf8");
    };

    console.error = (...args: unknown[]) => {
      const msg = util.format(...args);
      originalError(msg);
      fs.appendFileSync(REPORT_PATH, "[stderr] " + msg + "\n", "utf8");
    };
  }

  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║           ZIP Extraction Benchmark: Archive vs AdmZip            ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");
  console.log();

  await loadBuiltArchiveModule();

  if (TEST_FILES.length === 0) {
    console.error("No test files found!");
    process.exit(1);
  }

  console.log(`Configuration:`);
  console.log(`  Warmup runs: ${WARMUP_RUNS}`);
  console.log(`  Benchmark runs: ${BENCHMARK_RUNS}`);
  console.log(`  Test files: ${TEST_FILES.length}`);
  console.log(`  Large tests: ${RUN_LARGE ? "enabled" : "disabled (--no-large)"}`);
  if (RUN_QUICK) console.log(`  Mode: quick (--quick)`);
  console.log(`  Modes: ${RUN_ALL_MODES ? "all (--all-modes)" : "head-to-head (default)"}`);
  console.log(`  Timeout: ${TIMEOUT_MS}ms (--timeout-ms <n>)`);
  console.log(`  Verbose: ${VERBOSE ? "on" : "off (--verbose)"}`);
  console.log(`  Report file: ${REPORT_ENABLED ? REPORT_PATH : "disabled (--no-report)"}`);
  console.log();

  const allResults: BenchmarkResult[] = [];

  for (const filePath of TEST_FILES) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Testing: ${path.basename(filePath)}`);

    const buffer = fs.readFileSync(filePath);
    console.log(`  File size: ${formatBytes(buffer.length)}`);
    console.log();

    // Default: head-to-head
    const admZipResult = await runBenchmark("AdmZip", filePath, buffer, benchmarkAdmZip);
    const unzipTrueStreamResult = await runBenchmark(
      "unzip() (true stream)",
      filePath,
      buffer,
      benchmarkUnzipStreamForceStream
    );

    const results: BenchmarkResult[] = [admZipResult, unzipTrueStreamResult];

    // Optional: include all modes for diagnosis
    if (RUN_ALL_MODES) {
      const unzipBufferResult = await runBenchmark(
        "unzip() (buffer)",
        filePath,
        buffer,
        benchmarkUnzipBuffer
      );
      const unzipStreamResult = await runBenchmark(
        "unzip() (stream)",
        filePath,
        buffer,
        benchmarkUnzipStream
      );
      results.push(unzipBufferResult, unzipStreamResult);
    }

    allResults.push(...results);
    printComparison("Results", results);
    console.log();
  }

  // Summary
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`SUMMARY`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // Calculate overall averages (ignore failures)
  const admZipResults = allResults.filter(r => r.name === "AdmZip" && !r.error);
  const unzipTrueStreamResults = allResults.filter(
    r => r.name === "unzip() (true stream)" && !r.error
  );
  const unzipBufferResults = allResults.filter(r => r.name === "unzip() (buffer)" && !r.error);
  const unzipStreamResults = allResults.filter(r => r.name === "unzip() (stream)" && !r.error);

  const avgOf = (arr: BenchmarkResult[]) =>
    arr.length ? arr.reduce((sum, r) => sum + r.avgTime, 0) / arr.length : Number.NaN;

  const admZipAvg = avgOf(admZipResults);
  const unzipTrueStreamAvg = avgOf(unzipTrueStreamResults);
  const unzipBufferAvg = avgOf(unzipBufferResults);
  const unzipStreamAvg = avgOf(unzipStreamResults);

  const summaryRows: BenchmarkResult[] = [
    {
      name: "AdmZip",
      file: "(overall)",
      fileSize: 0,
      avgTime: admZipAvg,
      minTime: 0,
      maxTime: 0,
      entriesCount: 0,
      memoryUsed: 0
    },
    {
      name: "unzip() (true stream)",
      file: "(overall)",
      fileSize: 0,
      avgTime: unzipTrueStreamAvg,
      minTime: 0,
      maxTime: 0,
      entriesCount: 0,
      memoryUsed: 0
    }
  ];

  if (RUN_ALL_MODES) {
    summaryRows.push(
      {
        name: "unzip() (buffer)",
        file: "(overall)",
        fileSize: 0,
        avgTime: unzipBufferAvg,
        minTime: 0,
        maxTime: 0,
        entriesCount: 0,
        memoryUsed: 0
      },
      {
        name: "unzip() (stream)",
        file: "(overall)",
        fileSize: 0,
        avgTime: unzipStreamAvg,
        minTime: 0,
        maxTime: 0,
        entriesCount: 0,
        memoryUsed: 0
      }
    );
  }

  printComparison("Overall (avg across files)", summaryRows);

  // Run large file benchmarks
  if (RUN_LARGE) {
    console.log();
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`LARGE FILE TESTS (20MB)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Test 1: Single 20MB file
    console.log();
    console.log(`Generating 20MB ZIP (1 file)...`);
    const largeBuffer1 = generateLargeZipBuffer(20, 1);
    console.log(`  Generated ZIP size: ${formatBytes(largeBuffer1.length)}`);
    await runLargeFileBenchmark("20MB (1 file)", largeBuffer1);

    // Test 2: 20MB split into 4 files
    console.log();
    console.log(`Generating 20MB ZIP (4 files)...`);
    const largeBuffer4 = generateLargeZipBuffer(20, 4);
    console.log(`  Generated ZIP size: ${formatBytes(largeBuffer4.length)}`);
    await runLargeFileBenchmark("20MB (4 files)", largeBuffer4);

    // Test 3: 20MB split into 10 files
    console.log();
    console.log(`Generating 20MB ZIP (10 files)...`);
    const largeBuffer10 = generateLargeZipBuffer(20, 10);
    console.log(`  Generated ZIP size: ${formatBytes(largeBuffer10.length)}`);
    await runLargeFileBenchmark("20MB (10 files)", largeBuffer10);
  }
}

async function runLargeFileBenchmark(name: string, buffer: Buffer): Promise<void> {
  console.log(`  Testing: ${name}`);

  const admZipResult = await runBenchmark("AdmZip", name, buffer, benchmarkAdmZip);
  const unzipTrueStreamResult = await runBenchmark(
    "unzip() (true stream)",
    name,
    buffer,
    benchmarkUnzipStreamForceStream
  );

  const results: BenchmarkResult[] = [admZipResult, unzipTrueStreamResult];
  if (RUN_ALL_MODES) {
    results.push(
      await runBenchmark("unzip() (buffer)", name, buffer, benchmarkUnzipBuffer),
      await runBenchmark("unzip() (stream)", name, buffer, benchmarkUnzipStream)
    );
  }

  printComparison("Results", results);
}

main().catch(console.error);
