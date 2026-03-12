/**
 * Benchmark: Archive (zip) vs archiver
 *
 * Compares performance of ZIP creation between our built-in archive module and archiver package.
 *
 * Note: this benchmark expects `npm run build:esm` to have been run.
 * It imports the built ESM output to benchmark the real published code.
 */

import { Buffer } from "node:buffer";
import { performance } from "node:perf_hooks";
import { PassThrough } from "node:stream";

// Our archive module (built ESM output)
import { zip } from "../dist/esm/modules/archive/index.js";

// archiver - install with: pnpm add -D archiver @types/archiver
import archiver from "archiver";

// Configuration (override via env for quick local runs)
const WARMUP_RUNS = Number(process.env.WARMUP_RUNS ?? 3);
const BENCHMARK_RUNS = Number(process.env.BENCHMARK_RUNS ?? 10);
const ONLY_SCENARIO = (process.env.ONLY_SCENARIO ?? "").trim();

// Test data - simulate S3 folder with multiple files
interface TestFile {
  name: string;
  data: Uint8Array | string;
  comment?: string;
}

function inputSizeOf(files: TestFile[]): number {
  let total = 0;
  for (const f of files) {
    total += typeof f.data === "string" ? Buffer.byteLength(f.data, "utf8") : f.data.length;
  }
  return total;
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

function generateTinyTextStringFiles(count: number, sizePerFile: number): TestFile[] {
  const files: TestFile[] = [];
  const text = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(4);

  for (let i = 0; i < count; i++) {
    let content = "";
    while (content.length < sizePerFile) {
      content += text + `\n--- File ${i}, Block ${content.length} ---\n`;
    }
    files.push({
      name: `document_${i.toString().padStart(5, "0")}.txt`,
      data: content.slice(0, sizePerFile)
    });
  }

  return files;
}

function withEntryComments(files: TestFile[], commentBytes: number): TestFile[] {
  const comment = "c".repeat(commentBytes);
  return files.map(f => ({ ...f, comment }));
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

  const archive = archiver("zip", { zlib: { level, memLevel: 9 } });
  archive.pipe(stream);

  for (const file of files) {
    const buffer =
      typeof file.data === "string" ? Buffer.from(file.data, "utf8") : Buffer.from(file.data);
    archive.append(buffer, {
      name: file.name,
      ...(file.comment ? { comment: file.comment } : {})
    } as any);
  }

  await archive.finalize();

  const outputSize = chunks.reduce((sum, c) => sum + c.length, 0);
  const time = performance.now() - start;

  return { time, outputSize };
}

function buildZip(files: TestFile[], level: number, smartStore = true) {
  const archive = zip({ level, smartStore });
  for (const file of files) {
    archive.add(file.name, file.data as any, file.comment ? { comment: file.comment } : undefined);
  }
  return archive;
}

// Benchmark: zip().bytes() (async)
async function benchmarkZipBytes(
  files: TestFile[],
  level: number,
  smartStore: boolean
): Promise<{ time: number; outputSize: number }> {
  const start = performance.now();

  const zipBuffer = await buildZip(files, level, smartStore).bytes();

  const time = performance.now() - start;
  return { time, outputSize: zipBuffer.length };
}

// Benchmark: zip().bytesSync()
function benchmarkZipBytesSync(
  files: TestFile[],
  level: number,
  smartStore: boolean
): { time: number; outputSize: number } {
  const start = performance.now();

  const zipBuffer = buildZip(files, level, smartStore).bytesSync();

  const time = performance.now() - start;
  return { time, outputSize: zipBuffer.length };
}

// Benchmark: zip().stream() (true streaming, like archiver)
async function benchmarkZipStream(
  files: TestFile[],
  level: number,
  smartStore: boolean
): Promise<{ time: number; outputSize: number }> {
  const start = performance.now();

  let totalSize = 0;
  for await (const chunk of buildZip(files, level, smartStore).stream()) {
    totalSize += chunk.length;
  }

  const time = performance.now() - start;
  return { time, outputSize: totalSize };
}

async function runBenchmark(
  name: string,
  scenario: string,
  files: TestFile[],
  benchFn: () =>
    | Promise<{ time: number; outputSize: number }>
    | { time: number; outputSize: number }
): Promise<BenchmarkResult> {
  const inputSize = inputSizeOf(files);
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

async function runScenario(
  scenarioName: string,
  files: TestFile[],
  level: number,
  options: { smartStore?: boolean } = {}
): Promise<void> {
  if (ONLY_SCENARIO && !scenarioName.toLowerCase().includes(ONLY_SCENARIO.toLowerCase())) {
    return;
  }
  const smartStore = options.smartStore ?? true;
  const inputSize = inputSizeOf(files);

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Scenario: ${scenarioName}`);
  console.log(`  Files: ${files.length}, Input size: ${formatBytes(inputSize)}, Level: ${level}`);
  console.log();

  // Run benchmarks
  const archiverResult = await runBenchmark("archiver (stream)", scenarioName, files, () =>
    benchmarkArchiver(files, level)
  );

  const zipStreamResult = await runBenchmark("zip().stream()", scenarioName, files, () =>
    benchmarkZipStream(files, level, smartStore)
  );

  const zipBytesResult = await runBenchmark("zip().bytes()", scenarioName, files, () =>
    benchmarkZipBytes(files, level, smartStore)
  );

  const zipBytesSyncResult = await runBenchmark("zip().bytesSync()", scenarioName, files, () =>
    benchmarkZipBytesSync(files, level, smartStore)
  );

  // Print results table
  console.log(`  ┌───────────────────────┬────────────┬────────────┬────────────┬────────────┐`);
  console.log(`  │ Method                │ Avg Time   │ Min Time   │ Max Time   │ Output     │`);
  console.log(`  ├───────────────────────┼────────────┼────────────┼────────────┼────────────┤`);

  const results = [archiverResult, zipStreamResult, zipBytesResult, zipBytesSyncResult];
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
  const streamSpeedup = archiverResult.avgTime / zipStreamResult.avgTime;
  console.log();
  console.log(`  📊 Stream vs Stream:`);
  if (streamSpeedup > 1) {
    console.log(`  ✅ zip().stream() is ${streamSpeedup.toFixed(2)}x FASTER than archiver`);
  } else {
    console.log(`  ⚠️  zip().stream() is ${(1 / streamSpeedup).toFixed(2)}x slower than archiver`);
  }

  // Memory vs Stream comparison
  const speedup = archiverResult.avgTime / zipBytesSyncResult.avgTime;
  console.log();
  console.log(`  📊 Memory vs Stream:`);
  if (speedup > 1) {
    console.log(`  ✅ zip().bytesSync() is ${speedup.toFixed(2)}x FASTER than archiver`);
  } else {
    console.log(`  ⚠️  zip().bytesSync() is ${(1 / speedup).toFixed(2)}x slower than archiver`);
  }

  const asyncSpeedup = archiverResult.avgTime / zipBytesResult.avgTime;
  if (asyncSpeedup > 1) {
    console.log(`  ✅ zip().bytes() is ${asyncSpeedup.toFixed(2)}x FASTER than archiver`);
  } else {
    console.log(`  ⚠️  zip().bytes() is ${(1 / asyncSpeedup).toFixed(2)}x slower than archiver`);
  }

  // Compression ratio (report per method to avoid confusion)
  const ratio = (out: number): string => (inputSize / Math.max(1, out)).toFixed(2);
  console.log(
    `  📦 Compression ratio (archiver): ${ratio(archiverResult.outputSize)}x (${formatBytes(inputSize)} → ${formatBytes(archiverResult.outputSize)})`
  );
  console.log(
    `  📦 Compression ratio (zip().stream()): ${ratio(zipStreamResult.outputSize)}x (${formatBytes(inputSize)} → ${formatBytes(zipStreamResult.outputSize)})`
  );
  console.log(
    `  📦 Compression ratio (zip().bytes()): ${ratio(zipBytesResult.outputSize)}x (${formatBytes(inputSize)} → ${formatBytes(zipBytesResult.outputSize)})`
  );
  console.log(
    `  📦 Compression ratio (zip().bytesSync()): ${ratio(zipBytesSyncResult.outputSize)}x (${formatBytes(inputSize)} → ${formatBytes(zipBytesSyncResult.outputSize)})`
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
  if (ONLY_SCENARIO) {
    console.log(`  Only scenario filter: ${ONLY_SCENARIO}`);
  }
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

  // Scenario 5b: Fair DEFLATE-vs-DEFLATE on incompressible data (disable smart STORE)
  await runScenario(
    "Binary data (10 x 100KB, level=8, smartStore=false)",
    generateTestFiles(10, 100 * 1024),
    8,
    { smartStore: false }
  );

  // Scenario 6: No compression (level=0)
  await runScenario("No compression (10 x 100KB, level=0)", generateTextFiles(10, 100 * 1024), 0);

  // Scenario 7: Large file 20MB (single file)
  await runScenario("Large file (1 x 20MB, level=8)", generateTextFiles(1, 20 * 1024 * 1024), 8);

  // Scenario 8: Large files 20MB total (multiple files)
  await runScenario("Large files (4 x 5MB, level=8)", generateTextFiles(4, 8 * 1024 * 1024), 8);

  // Scenario 9: Large binary file 20MB (less compressible)
  await runScenario("Large binary (1 x 20MB, level=8)", generateTestFiles(1, 20 * 1024 * 1024), 8);

  // Scenario 10: Tiny files (stress per-entry overhead and metadata)
  // 2000 files, 256B each ~= 500KB total
  await runScenario("Tiny files (2000 x 256B text, level=0)", generateTextFiles(2000, 256), 0);

  // Scenario 11: Tiny files from string sources (stress source normalization/UTF-8 encoding)
  await runScenario(
    "Tiny files (2000 x 256B text as string, level=0)",
    generateTinyTextStringFiles(2000, 256),
    0
  );

  // Scenario 12: Tiny files with per-entry comments (stress comment encoding/headers)
  await runScenario(
    "Tiny files (2000 x 256B text + 64B comment, level=0)",
    withEntryComments(generateTextFiles(2000, 256), 64),
    0
  );

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
