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
import { Readable } from "node:stream";

// Our archive module (built ESM output)
import { unzip, zip } from "../dist/esm/modules/archive/index.js";

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

// Generate a large ZIP buffer for testing
function generateLargeZipBuffer(totalSizeMB: number, fileCount: number): Buffer {
  const sizePerFile = Math.floor((totalSizeMB * 1024 * 1024) / fileCount);
  const encoder = new TextEncoder();
  const text = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(100);

  const archive = zip({ level: 6 });

  for (let i = 0; i < fileCount; i++) {
    let content = "";
    while (content.length < sizePerFile) {
      content += text + `\n--- File ${i}, Block ${content.length} ---\n`;
    }
    archive.add(
      `document_${i.toString().padStart(3, "0")}.txt`,
      encoder.encode(content.slice(0, sizePerFile))
    );
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

async function benchmarkUnzipBuffer(
  buffer: Uint8Array
): Promise<{ time: number; entriesCount: number }> {
  const start = performance.now();

  const reader = unzip(buffer);

  let entriesCount = 0;
  for await (const entry of reader.entries()) {
    if (entry.isDirectory) {
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
    const unzipForceStreamResult = await runBenchmark(
      "unzip() (stream+forceStream)",
      filePath,
      buffer,
      benchmarkUnzipStreamForceStream
    );

    allResults.push(admZipResult, unzipBufferResult, unzipStreamResult, unzipForceStreamResult);

    // Print results table
    console.log(`  ┌─────────────────────┬────────────┬────────────┬────────────┬─────────┐`);
    console.log(`  │ Method              │ Avg Time   │ Min Time   │ Max Time   │ Entries │`);
    console.log(`  ├─────────────────────┼────────────┼────────────┼────────────┼─────────┤`);

    const results = [admZipResult, unzipBufferResult, unzipStreamResult, unzipForceStreamResult];
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
    const speedup = admZipResult.avgTime / unzipBufferResult.avgTime;
    console.log();
    if (speedup > 1) {
      console.log(`  ✅ unzip() (buffer) is ${speedup.toFixed(2)}x FASTER than AdmZip`);
    } else {
      console.log(`  ⚠️  unzip() (buffer) is ${(1 / speedup).toFixed(2)}x slower than AdmZip`);
    }

    const streamSpeedup = admZipResult.avgTime / unzipStreamResult.avgTime;
    if (streamSpeedup > 1) {
      console.log(`  ✅ unzip() (stream) is ${streamSpeedup.toFixed(2)}x FASTER than AdmZip`);
    } else {
      console.log(
        `  ⚠️  unzip() (stream) is ${(1 / streamSpeedup).toFixed(2)}x slower than AdmZip`
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
  const unzipAvg =
    allResults.filter(r => r.name === "unzip() (buffer)").reduce((sum, r) => sum + r.avgTime, 0) /
    TEST_FILES.length;

  console.log(`  AdmZip average:     ${formatMs(admZipAvg)}`);
  console.log(`  unzip() average:    ${formatMs(unzipAvg)}`);
  console.log();

  const overallSpeedup = admZipAvg / unzipAvg;
  if (overallSpeedup > 1) {
    console.log(`  🏆 Overall: unzip() is ${overallSpeedup.toFixed(2)}x FASTER than AdmZip`);
  } else {
    console.log(`  📊 Overall: unzip() is ${(1 / overallSpeedup).toFixed(2)}x slower than AdmZip`);
  }

  // Run large file benchmarks
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

async function runLargeFileBenchmark(name: string, buffer: Buffer): Promise<void> {
  console.log(`  Testing: ${name}`);

  const admZipResult = await runBenchmark("AdmZip", name, buffer, benchmarkAdmZip);
  const unzipBufferResult = await runBenchmark(
    "unzip() (buffer)",
    name,
    buffer,
    benchmarkUnzipBuffer
  );
  const unzipStreamResult = await runBenchmark(
    "unzip() (stream)",
    name,
    buffer,
    benchmarkUnzipStream
  );
  const unzipForceStreamResult = await runBenchmark(
    "unzip() (stream+forceStream)",
    name,
    buffer,
    benchmarkUnzipStreamForceStream
  );

  console.log(`  ┌──────────────────────┬────────────┬────────────┬────────────┬─────────┐`);
  console.log(`  │ Method               │ Avg Time   │ Min Time   │ Max Time   │ Entries │`);
  console.log(`  ├──────────────────────┼────────────┼────────────┼────────────┼─────────┤`);

  for (const r of [admZipResult, unzipBufferResult, unzipStreamResult, unzipForceStreamResult]) {
    const rname = r.name.padEnd(20);
    const avg = formatMs(r.avgTime).padStart(10);
    const min = formatMs(r.minTime).padStart(10);
    const max = formatMs(r.maxTime).padStart(10);
    const entries = String(r.entriesCount).padStart(7);
    console.log(`  │ ${rname} │ ${avg} │ ${min} │ ${max} │ ${entries} │`);
  }

  console.log(`  └──────────────────────┴────────────┴────────────┴────────────┴─────────┘`);

  const speedup = admZipResult.avgTime / unzipBufferResult.avgTime;
  if (speedup > 1) {
    console.log(`  ✅ unzip() (buffer) is ${speedup.toFixed(2)}x FASTER than AdmZip`);
  } else {
    console.log(`  ⚠️  unzip() (buffer) is ${(1 / speedup).toFixed(2)}x slower than AdmZip`);
  }

  const streamSpeedup = admZipResult.avgTime / unzipStreamResult.avgTime;
  if (streamSpeedup > 1) {
    console.log(`  ✅ unzip() (stream) is ${streamSpeedup.toFixed(2)}x FASTER than AdmZip`);
  } else {
    console.log(`  ⚠️  unzip() (stream) is ${(1 / streamSpeedup).toFixed(2)}x slower than AdmZip`);
  }

  const forceStreamSpeedup = admZipResult.avgTime / unzipForceStreamResult.avgTime;
  if (forceStreamSpeedup > 1) {
    console.log(
      `  ✅ unzip() (stream+forceStream) is ${forceStreamSpeedup.toFixed(2)}x FASTER than AdmZip`
    );
  } else {
    console.log(
      `  ⚠️  unzip() (stream+forceStream) is ${(1 / forceStreamSpeedup).toFixed(2)}x slower than AdmZip`
    );
  }
}

main().catch(console.error);
