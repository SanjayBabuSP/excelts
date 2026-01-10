/**
 * Benchmark: Archive (ZipParser) vs AdmZip
 *
 * Compares performance of our built-in archive module against adm-zip package.
 *
 * Run with: npx tsx scripts/benchmark-unzip.ts
 * Or after build: node --expose-gc scripts/benchmark-unzip.ts
 */

import { performance } from "node:perf_hooks";
import fs from "node:fs";
import path from "node:path";

// Our archive module
import { ZipParser, extractAll, forEachEntry } from "../src/modules/archive/index.js";

// AdmZip - install with: pnpm add -D adm-zip @types/adm-zip
import AdmZip from "adm-zip";

// Configuration
const WARMUP_RUNS = 3;
const BENCHMARK_RUNS = 10;

// Test files - using existing xlsx files as they are zip archives
const TEST_FILES = [
  "./src/modules/excel/__tests__/data/gold.xlsx",
  "./src/modules/excel/stream/__tests__/data/huge.xlsx"
].filter(f => fs.existsSync(f));

interface BenchmarkResult {
  name: string;
  file: string;
  fileSize: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  entriesCount: number;
  memoryUsed: number;
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

async function benchmarkZipParser(
  buffer: Uint8Array
): Promise<{ time: number; entriesCount: number }> {
  const start = performance.now();

  const parser = new ZipParser(buffer);
  const entries = parser.getEntries();

  let entriesCount = 0;
  for (const entry of entries) {
    if (!entry.isDirectory) {
      // Extract data
      const _data = await parser.extract(entry.path);
      entriesCount++;
    }
  }

  const time = performance.now() - start;
  return { time, entriesCount };
}

async function benchmarkZipParserSync(
  buffer: Uint8Array
): Promise<{ time: number; entriesCount: number }> {
  const start = performance.now();

  const parser = new ZipParser(buffer);
  const entries = parser.getEntries();

  let entriesCount = 0;
  for (const entry of entries) {
    if (!entry.isDirectory) {
      // Extract data synchronously
      const _data = parser.extractSync(entry.path);
      entriesCount++;
    }
  }

  const time = performance.now() - start;
  return { time, entriesCount };
}

async function benchmarkExtractAll(
  buffer: Uint8Array
): Promise<{ time: number; entriesCount: number }> {
  const start = performance.now();

  const files = await extractAll(buffer);
  let entriesCount = 0;
  for (const [_path, file] of files) {
    if (!file.isDirectory) {
      entriesCount++;
    }
  }

  const time = performance.now() - start;
  return { time, entriesCount };
}

async function benchmarkForEachEntry(
  buffer: Uint8Array
): Promise<{ time: number; entriesCount: number }> {
  const start = performance.now();

  let entriesCount = 0;
  await forEachEntry(buffer, async (_path, getData, entry) => {
    if (!entry.isDirectory) {
      const _data = await getData();
      entriesCount++;
    }
    return true;
  });

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

  // Warmup
  for (let i = 0; i < WARMUP_RUNS; i++) {
    await benchFn(buffer);
    gcIfAvailable();
  }

  // Benchmark runs
  const memBefore = getMemoryUsage();
  for (let i = 0; i < BENCHMARK_RUNS; i++) {
    const result = await benchFn(buffer);
    times.push(result.time);
    entriesCount = result.entriesCount;
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
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║           ZIP Extraction Benchmark: Archive vs AdmZip            ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");
  console.log();

  if (TEST_FILES.length === 0) {
    console.error("No test files found!");
    process.exit(1);
  }

  console.log(`Configuration:`);
  console.log(`  Warmup runs: ${WARMUP_RUNS}`);
  console.log(`  Benchmark runs: ${BENCHMARK_RUNS}`);
  console.log(`  Test files: ${TEST_FILES.length}`);
  console.log();

  const allResults: BenchmarkResult[] = [];

  for (const filePath of TEST_FILES) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Testing: ${path.basename(filePath)}`);

    const buffer = fs.readFileSync(filePath);
    console.log(`  File size: ${formatBytes(buffer.length)}`);
    console.log();

    // Run benchmarks
    const admZipResult = await runBenchmark("AdmZip", filePath, buffer, benchmarkAdmZip);
    const zipParserResult = await runBenchmark(
      "ZipParser (async)",
      filePath,
      buffer,
      benchmarkZipParser
    );
    const zipParserSyncResult = await runBenchmark(
      "ZipParser (sync)",
      filePath,
      buffer,
      benchmarkZipParserSync
    );
    const extractAllResult = await runBenchmark(
      "extractAll",
      filePath,
      buffer,
      benchmarkExtractAll
    );
    const forEachResult = await runBenchmark(
      "forEachEntry",
      filePath,
      buffer,
      benchmarkForEachEntry
    );

    allResults.push(
      admZipResult,
      zipParserResult,
      zipParserSyncResult,
      extractAllResult,
      forEachResult
    );

    // Print results table
    console.log(`  ┌─────────────────────┬────────────┬────────────┬────────────┬─────────┐`);
    console.log(`  │ Method              │ Avg Time   │ Min Time   │ Max Time   │ Entries │`);
    console.log(`  ├─────────────────────┼────────────┼────────────┼────────────┼─────────┤`);

    const results = [
      admZipResult,
      zipParserResult,
      zipParserSyncResult,
      extractAllResult,
      forEachResult
    ];
    for (const r of results) {
      const name = r.name.padEnd(19);
      const avg = formatMs(r.avgTime).padStart(10);
      const min = formatMs(r.minTime).padStart(10);
      const max = formatMs(r.maxTime).padStart(10);
      const entries = String(r.entriesCount).padStart(7);
      console.log(`  │ ${name} │ ${avg} │ ${min} │ ${max} │ ${entries} │`);
    }

    console.log(`  └─────────────────────┴────────────┴────────────┴────────────┴─────────┘`);

    // Performance comparison
    const speedup = admZipResult.avgTime / zipParserSyncResult.avgTime;
    console.log();
    if (speedup > 1) {
      console.log(`  ✅ ZipParser (sync) is ${speedup.toFixed(2)}x FASTER than AdmZip`);
    } else {
      console.log(`  ⚠️  ZipParser (sync) is ${(1 / speedup).toFixed(2)}x slower than AdmZip`);
    }

    const asyncSpeedup = admZipResult.avgTime / zipParserResult.avgTime;
    if (asyncSpeedup > 1) {
      console.log(`  ✅ ZipParser (async) is ${asyncSpeedup.toFixed(2)}x FASTER than AdmZip`);
    } else {
      console.log(
        `  ⚠️  ZipParser (async) is ${(1 / asyncSpeedup).toFixed(2)}x slower than AdmZip`
      );
    }

    console.log();
  }

  // Summary
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`SUMMARY`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // Calculate overall averages
  const admZipAvg =
    allResults.filter(r => r.name === "AdmZip").reduce((sum, r) => sum + r.avgTime, 0) /
    TEST_FILES.length;
  const zipParserAvg =
    allResults.filter(r => r.name === "ZipParser (sync)").reduce((sum, r) => sum + r.avgTime, 0) /
    TEST_FILES.length;

  console.log(`  AdmZip average:     ${formatMs(admZipAvg)}`);
  console.log(`  ZipParser average:  ${formatMs(zipParserAvg)}`);
  console.log();

  const overallSpeedup = admZipAvg / zipParserAvg;
  if (overallSpeedup > 1) {
    console.log(`  🏆 Overall: ZipParser is ${overallSpeedup.toFixed(2)}x FASTER than AdmZip`);
  } else {
    console.log(
      `  📊 Overall: ZipParser is ${(1 / overallSpeedup).toFixed(2)}x slower than AdmZip`
    );
  }
}

main().catch(console.error);
