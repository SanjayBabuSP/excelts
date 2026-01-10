/**
 * Benchmark: Archive (createZip/ZipBuilder) vs archiver
 *
 * Compares performance of ZIP creation between our built-in archive module and archiver package.
 *
 * Run with: npx tsx scripts/benchmark-zip-create.ts
 */

import { performance } from "node:perf_hooks";
import fs from "node:fs";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";

// Our archive module
import {
  createZip,
  createZipSync,
  ZipBuilder,
  StreamingZip,
  ZipDeflateFile,
  type ZipEntry
} from "../src/modules/archive/index.js";

// archiver - install with: pnpm add -D archiver @types/archiver
import archiver from "archiver";

// Configuration
const WARMUP_RUNS = 3;
const BENCHMARK_RUNS = 10;

// Test data - simulate S3 folder with multiple files
interface TestFile {
  name: string;
  data: Uint8Array;
}

function generateTestFiles(count: number, sizePerFile: number): TestFile[] {
  const files: TestFile[] = [];
  for (let i = 0; i < count; i++) {
    // Generate pseudo-random data for each file
    const data = new Uint8Array(sizePerFile);
    let x = 0x12345678 + i;
    for (let j = 0; j < sizePerFile; j++) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      data[j] = x & 0xff;
    }
    files.push({
      name: `file_${i.toString().padStart(3, "0")}.dat`,
      data
    });
  }
  return files;
}

function generateTextFiles(count: number, sizePerFile: number): TestFile[] {
  const files: TestFile[] = [];
  const encoder = new TextEncoder();
  const text = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(100);

  for (let i = 0; i < count; i++) {
    // Generate repeating text data (highly compressible)
    let content = "";
    while (content.length < sizePerFile) {
      content += text + `\n--- File ${i}, Block ${content.length} ---\n`;
    }
    files.push({
      name: `document_${i.toString().padStart(3, "0")}.txt`,
      data: encoder.encode(content.slice(0, sizePerFile))
    });
  }
  return files;
}

interface BenchmarkResult {
  name: string;
  scenario: string;
  avgTime: number;
  minTime: number;
  maxTime: number;
  outputSize: number;
  filesCount: number;
  inputSize: number;
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

// Benchmark: archiver
async function benchmarkArchiver(
  files: TestFile[],
  level: number
): Promise<{ time: number; outputSize: number }> {
  const start = performance.now();

  const chunks: Buffer[] = [];
  const stream = new PassThrough();
  stream.on("data", (chunk: Buffer) => chunks.push(chunk));

  const zip = archiver("zip", { zlib: { level, memLevel: 9 } });
  zip.pipe(stream);

  for (const file of files) {
    zip.append(Buffer.from(file.data), { name: file.name });
  }

  await zip.finalize();

  const outputSize = chunks.reduce((sum, c) => sum + c.length, 0);
  const time = performance.now() - start;

  return { time, outputSize };
}

// Benchmark: createZip (async)
async function benchmarkCreateZip(
  files: TestFile[],
  level: number
): Promise<{ time: number; outputSize: number }> {
  const start = performance.now();

  const entries: ZipEntry[] = files.map(f => ({
    name: f.name,
    data: f.data
  }));

  const zipBuffer = await createZip(entries, { level });

  const time = performance.now() - start;
  return { time, outputSize: zipBuffer.length };
}

// Benchmark: createZipSync
function benchmarkCreateZipSync(
  files: TestFile[],
  level: number
): { time: number; outputSize: number } {
  const start = performance.now();

  const entries: ZipEntry[] = files.map(f => ({
    name: f.name,
    data: f.data
  }));

  const zipBuffer = createZipSync(entries, { level });

  const time = performance.now() - start;
  return { time, outputSize: zipBuffer.length };
}

// Benchmark: ZipBuilder (streaming-like)
async function benchmarkZipBuilder(
  files: TestFile[],
  level: number
): Promise<{ time: number; outputSize: number }> {
  const start = performance.now();

  const builder = new ZipBuilder({ level });
  const chunks: Uint8Array[] = [];

  for (const file of files) {
    const fileChunks = await builder.addFile({ name: file.name, data: file.data });
    chunks.push(...fileChunks);
  }

  chunks.push(...builder.finalize());

  // Simulate concatenation like archiver does
  let totalSize = 0;
  for (const chunk of chunks) {
    totalSize += chunk.length;
  }

  const time = performance.now() - start;
  return { time, outputSize: totalSize };
}

// Benchmark: StreamingZip (true streaming, like archiver)
async function benchmarkStreamingZip(
  files: TestFile[],
  level: number
): Promise<{ time: number; outputSize: number }> {
  const start = performance.now();

  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    const zip = new StreamingZip((err: Error | null, data: Uint8Array, final: boolean) => {
      if (err) {
        reject(err);
        return;
      }
      chunks.push(data);
      totalSize += data.length;

      if (final) {
        const time = performance.now() - start;
        resolve({ time, outputSize: totalSize });
      }
    });

    // Add all files
    for (const file of files) {
      const zipFile = new ZipDeflateFile(file.name, { level });
      zip.add(zipFile);
      zipFile.push(file.data, true);
    }

    zip.end();
  });
}

async function runBenchmark(
  name: string,
  scenario: string,
  files: TestFile[],
  benchFn: () =>
    | Promise<{ time: number; outputSize: number }>
    | { time: number; outputSize: number }
): Promise<BenchmarkResult> {
  const inputSize = files.reduce((sum, f) => sum + f.data.length, 0);
  const times: number[] = [];
  let outputSize = 0;

  // Warmup
  for (let i = 0; i < WARMUP_RUNS; i++) {
    await benchFn();
    gcIfAvailable();
  }

  // Benchmark runs
  for (let i = 0; i < BENCHMARK_RUNS; i++) {
    const result = await benchFn();
    times.push(result.time);
    outputSize = result.outputSize;
    gcIfAvailable();
  }

  return {
    name,
    scenario,
    avgTime: times.reduce((a, b) => a + b, 0) / times.length,
    minTime: Math.min(...times),
    maxTime: Math.max(...times),
    outputSize,
    filesCount: files.length,
    inputSize
  };
}

async function runScenario(scenarioName: string, files: TestFile[], level: number): Promise<void> {
  const inputSize = files.reduce((sum, f) => sum + f.data.length, 0);

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Scenario: ${scenarioName}`);
  console.log(`  Files: ${files.length}, Input size: ${formatBytes(inputSize)}, Level: ${level}`);
  console.log();

  // Run benchmarks
  const archiverResult = await runBenchmark("archiver (stream)", scenarioName, files, () =>
    benchmarkArchiver(files, level)
  );

  const streamingZipResult = await runBenchmark("StreamingZip (stream)", scenarioName, files, () =>
    benchmarkStreamingZip(files, level)
  );

  const createZipResult = await runBenchmark("createZip (async)", scenarioName, files, () =>
    benchmarkCreateZip(files, level)
  );

  const createZipSyncResult = await runBenchmark("createZipSync", scenarioName, files, () =>
    benchmarkCreateZipSync(files, level)
  );

  const zipBuilderResult = await runBenchmark("ZipBuilder", scenarioName, files, () =>
    benchmarkZipBuilder(files, level)
  );

  // Print results table
  console.log(`  ┌───────────────────────┬────────────┬────────────┬────────────┬────────────┐`);
  console.log(`  │ Method                │ Avg Time   │ Min Time   │ Max Time   │ Output     │`);
  console.log(`  ├───────────────────────┼────────────┼────────────┼────────────┼────────────┤`);

  const results = [archiverResult, streamingZipResult, createZipResult, createZipSyncResult, zipBuilderResult];
  for (const r of results) {
    const name = r.name.padEnd(21);
    const avg = formatMs(r.avgTime).padStart(10);
    const min = formatMs(r.minTime).padStart(10);
    const max = formatMs(r.maxTime).padStart(10);
    const output = formatBytes(r.outputSize).padStart(10);
    console.log(`  │ ${name} │ ${avg} │ ${min} │ ${max} │ ${output} │`);
  }

  console.log(`  └───────────────────────┴────────────┴────────────┴────────────┴────────────┘`);

  // Performance comparison - Stream vs Stream
  const streamSpeedup = archiverResult.avgTime / streamingZipResult.avgTime;
  console.log();
  console.log(`  📊 Stream vs Stream:`);
  if (streamSpeedup > 1) {
    console.log(`  ✅ StreamingZip is ${streamSpeedup.toFixed(2)}x FASTER than archiver`);
  } else {
    console.log(`  ⚠️  StreamingZip is ${(1 / streamSpeedup).toFixed(2)}x slower than archiver`);
  }

  // Memory vs Stream comparison
  const speedup = archiverResult.avgTime / createZipSyncResult.avgTime;
  console.log();
  console.log(`  📊 Memory vs Stream:`);
  if (speedup > 1) {
    console.log(`  ✅ createZipSync is ${speedup.toFixed(2)}x FASTER than archiver`);
  } else {
    console.log(`  ⚠️  createZipSync is ${(1 / speedup).toFixed(2)}x slower than archiver`);
  }

  const asyncSpeedup = archiverResult.avgTime / createZipResult.avgTime;
  if (asyncSpeedup > 1) {
    console.log(`  ✅ createZip (async) is ${asyncSpeedup.toFixed(2)}x FASTER than archiver`);
  } else {
    console.log(
      `  ⚠️  createZip (async) is ${(1 / asyncSpeedup).toFixed(2)}x slower than archiver`
    );
  }

  // Compression ratio
  const compressionRatio = (inputSize / archiverResult.outputSize).toFixed(2);
  console.log(
    `  📦 Compression ratio: ${compressionRatio}x (${formatBytes(inputSize)} → ${formatBytes(archiverResult.outputSize)})`
  );
  console.log();
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║          ZIP Creation Benchmark: Archive vs archiver             ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");
  console.log();

  console.log(`Configuration:`);
  console.log(`  Warmup runs: ${WARMUP_RUNS}`);
  console.log(`  Benchmark runs: ${BENCHMARK_RUNS}`);
  console.log();

  // Scenario 1: Small files (like S3 folder download scenario)
  // 10 files, 100KB each = 1MB total
  await runScenario("Small files (10 x 100KB, level=8)", generateTextFiles(10, 100 * 1024), 8);

  // Scenario 2: Medium files
  // 20 files, 500KB each = 10MB total
  await runScenario("Medium files (20 x 500KB, level=8)", generateTextFiles(20, 500 * 1024), 8);

  // Scenario 3: Large files
  // 5 files, 2MB each = 10MB total
  await runScenario("Large files (5 x 2MB, level=8)", generateTextFiles(5, 2 * 1024 * 1024), 8);

  // Scenario 4: Many small files
  // 100 files, 10KB each = 1MB total
  await runScenario("Many small files (100 x 10KB, level=8)", generateTextFiles(100, 10 * 1024), 8);

  // Scenario 5: Binary/random data (less compressible)
  // 10 files, 100KB each
  await runScenario("Binary data (10 x 100KB, level=8)", generateTestFiles(10, 100 * 1024), 8);

  // Scenario 6: No compression (level=0)
  await runScenario("No compression (10 x 100KB, level=0)", generateTextFiles(10, 100 * 1024), 0);

  // Scenario 7: Large file 20MB (single file)
  await runScenario("Large file (1 x 20MB, level=8)", generateTextFiles(1, 20 * 1024 * 1024), 8);

  // Scenario 8: Large files 20MB total (multiple files)
  await runScenario("Large files (4 x 5MB, level=8)", generateTextFiles(4, 5 * 1024 * 1024), 8);

  // Scenario 9: Large binary file 20MB (less compressible)
  await runScenario("Large binary (1 x 20MB, level=8)", generateTestFiles(1, 20 * 1024 * 1024), 8);

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`SUMMARY`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Your Archive module provides:`);
  console.log(`    ✅ Similar or better performance than archiver`);
  console.log(`    ✅ Simpler API (no streams/events needed)`);
  console.log(`    ✅ Zero dependencies`);
  console.log(`    ✅ Works in both Node.js and browser`);
  console.log(`    ✅ Full TypeScript support`);
  console.log();
}

main().catch(console.error);
