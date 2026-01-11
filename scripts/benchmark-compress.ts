import { performance } from "node:perf_hooks";

// Note: this benchmark expects `npm run build:esm` to have been run.
// It imports the built ESM output to benchmark the real published code.
import {
  compress,
  compressSync,
  decompress,
  decompressSync
} from "../dist/esm/modules/archive/compression/compress.js";

const DEFAULT_LEVEL = 6;
const DEFAULT_THRESHOLD_BYTES = 8 * 1024 * 1024;

const DEFAULT_MARGIN = 0.05;

const sizes = [256, 1024, 8 * 1024, 32 * 1024, 128 * 1024, 512 * 1024, 2 * 1024 * 1024];

interface Pattern {
  name: string;
  make: (size: number) => Uint8Array;
}

const patterns: Pattern[] = [
  { name: "repeat", make: makeRepeating },
  { name: "pseudo-random", make: makePseudoRandom }
];

const runs = Number.parseInt(process.env.BENCH_RUNS ?? "50", 10);
const warmupRuns = Number.parseInt(process.env.BENCH_WARMUP ?? "10", 10);
const margin = Number.parseFloat(process.env.BENCH_MARGIN ?? String(DEFAULT_MARGIN));

function resolveSizes(): number[] {
  const raw = process.env.BENCH_SIZES;
  if (!raw) return sizes;
  return raw
    .split(",")
    .map(s => Number.parseInt(s.trim(), 10))
    .filter(n => Number.isFinite(n) && n > 0);
}

function makeRepeating(size: number): Uint8Array {
  const out = new Uint8Array(size);
  const text = new TextEncoder().encode("EXCELTS".repeat(64));
  for (let i = 0; i < out.length; i++) out[i] = text[i % text.length];
  return out;
}

function makePseudoRandom(size: number): Uint8Array {
  const out = new Uint8Array(size);
  let x = 0x12345678;
  for (let i = 0; i < out.length; i++) {
    // xorshift32
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    out[i] = x & 0xff;
  }
  return out;
}

function fmtMs(ms: number): string {
  return `${ms.toFixed(3)}ms`;
}

function fmtMBps(bytes: number, ms: number): string {
  const sec = ms / 1000;
  if (sec === 0) return "∞";
  return `${(bytes / 1024 / 1024 / sec).toFixed(1)} MB/s`;
}

async function timeAsync(fn: () => Promise<unknown>, iters: number): Promise<number> {
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) await fn();
  return performance.now() - t0;
}

function timeSync(fn: () => unknown, iters: number): number {
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) fn();
  return performance.now() - t0;
}

function gcIfAvailable(): void {
  // `node --expose-gc` enables this (we use it in the npm script).
  if (typeof globalThis.gc === "function") globalThis.gc();
}

interface BenchmarkRow {
  size: number;
  cSync: number;
  cAsync: number;
  cAuto: number;
  dSync: number;
  dAsync: number;
  dAuto: number;
}

function findCrossoverBytes(
  rows: BenchmarkRow[],
  syncKey: keyof BenchmarkRow,
  asyncKey: keyof BenchmarkRow,
  marginRatio: number
): number | null {
  // Return the smallest size where async is clearly faster than sync.
  // We use a small margin to reduce noise-driven flips.
  for (const r of rows) {
    const syncMs = r[syncKey] as number;
    const asyncMs = r[asyncKey] as number;
    if (asyncMs <= syncMs * (1 - marginRatio)) return r.size;
  }
  return null;
}

async function run(): Promise<void> {
  console.log("\n=== compress/decompress benchmark (Node) ===");
  console.log(`level=${DEFAULT_LEVEL}, thresholdBytes(default)=${DEFAULT_THRESHOLD_BYTES}`);
  console.log(
    `runs=${runs}, warmup=${warmupRuns}, margin=${Number.isFinite(margin) ? margin : DEFAULT_MARGIN}`
  );

  const resolvedSizes = resolveSizes();

  for (const pattern of patterns) {
    console.log(`\n--- pattern: ${pattern.name} ---`);

    const rows: BenchmarkRow[] = [];

    for (const size of resolvedSizes) {
      const data = pattern.make(size);

      // precompute a compressed buffer for decompress benchmarks
      const compressedSync = compressSync(data, { level: DEFAULT_LEVEL });

      // warmup
      for (let i = 0; i < warmupRuns; i++) {
        compressSync(data, { level: DEFAULT_LEVEL });
        decompressSync(compressedSync);
        await compress(data, { level: DEFAULT_LEVEL, thresholdBytes: 0 });
        await decompress(compressedSync, { thresholdBytes: 0 });
        await compress(data, { level: DEFAULT_LEVEL, thresholdBytes: DEFAULT_THRESHOLD_BYTES });
        await decompress(compressedSync, { thresholdBytes: DEFAULT_THRESHOLD_BYTES });
      }

      gcIfAvailable();

      const tCompressSync = timeSync(() => compressSync(data, { level: DEFAULT_LEVEL }), runs);
      const tDecompressSync = timeSync(() => decompressSync(compressedSync), runs);

      const tCompressAsyncForced = await timeAsync(
        () => compress(data, { level: DEFAULT_LEVEL, thresholdBytes: 0 }),
        runs
      );
      const tDecompressAsyncForced = await timeAsync(
        () => decompress(compressedSync, { thresholdBytes: 0 }),
        runs
      );

      const tCompressAuto = await timeAsync(
        () => compress(data, { level: DEFAULT_LEVEL, thresholdBytes: DEFAULT_THRESHOLD_BYTES }),
        runs
      );
      const tDecompressAuto = await timeAsync(
        () => decompress(compressedSync, { thresholdBytes: DEFAULT_THRESHOLD_BYTES }),
        runs
      );

      const perCSync = tCompressSync / runs;
      const perCAsync = tCompressAsyncForced / runs;
      const perCAuto = tCompressAuto / runs;

      const perDSync = tDecompressSync / runs;
      const perDAsync = tDecompressAsyncForced / runs;
      const perDAuto = tDecompressAuto / runs;

      rows.push({
        size,
        cSync: perCSync,
        cAsync: perCAsync,
        cAuto: perCAuto,
        dSync: perDSync,
        dAsync: perDAsync,
        dAuto: perDAuto
      });

      console.log(
        `${String(size).padStart(8)} bytes | ` +
          `cSync ${fmtMs(perCSync)} (${fmtMBps(size, perCSync)}) | ` +
          `cAsync ${fmtMs(perCAsync)} (${fmtMBps(size, perCAsync)}) | ` +
          `cAuto ${fmtMs(perCAuto)} | ` +
          `dSync ${fmtMs(perDSync)} | ` +
          `dAsync ${fmtMs(perDAsync)} | ` +
          `dAuto ${fmtMs(perDAuto)}`
      );
    }

    const safeMargin = Number.isFinite(margin) ? margin : DEFAULT_MARGIN;
    const cX = findCrossoverBytes(rows, "cSync", "cAsync", safeMargin);
    const dX = findCrossoverBytes(rows, "dSync", "dAsync", safeMargin);
    const recommend = Math.max(cX ?? 0, dX ?? 0) || null;
    console.log("\n  threshold suggestion (Node)");
    console.log(`  - compress crossover: ${cX ? `${cX} bytes` : "(no crossover in tested sizes)"}`);
    console.log(
      `  - decompress crossover: ${dX ? `${dX} bytes` : "(no crossover in tested sizes)"}`
    );
    console.log(
      `  - recommended thresholdBytes: ${recommend ? `${recommend} bytes` : "(keep default / test more sizes)"}`
    );
  }
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
