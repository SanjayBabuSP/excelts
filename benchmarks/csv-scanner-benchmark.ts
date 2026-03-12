/**
 * CSV Scanner Performance Benchmark
 *
 * Benchmarks the Scanner-based CSV parser performance.
 */

import { parseCsv } from "../src/modules/csv/parse";

// =============================================================================
// Test Data Generation
// =============================================================================

function generateSimpleCsv(rows: number, cols: number): string {
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    const row: string[] = [];
    for (let c = 0; c < cols; c++) {
      row.push(`value_${r}_${c}`);
    }
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

function generateQuotedCsv(rows: number, cols: number): string {
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    const row: string[] = [];
    for (let c = 0; c < cols; c++) {
      // Mix of quoted and unquoted fields
      if (c % 2 === 0) {
        row.push(`"value,with,commas_${r}_${c}"`);
      } else {
        row.push(`simple_${r}_${c}`);
      }
    }
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

function generateComplexCsv(rows: number, cols: number): string {
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    const row: string[] = [];
    for (let c = 0; c < cols; c++) {
      if (c % 3 === 0) {
        // Quoted with escaped quotes
        row.push(`"value ""quoted"" here_${r}_${c}"`);
      } else if (c % 3 === 1) {
        // Quoted with newline
        row.push(`"line1\nline2_${r}_${c}"`);
      } else {
        row.push(`simple_${r}_${c}`);
      }
    }
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

// =============================================================================
// Benchmark Functions
// =============================================================================

function benchmark(
  name: string,
  fn: () => void,
  iterations: number = 10
): { avg: number; min: number; max: number } {
  const times: number[] = [];

  // Warmup
  for (let i = 0; i < 3; i++) {
    fn();
  }

  // Actual benchmark
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    times.push(end - start);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);

  return { avg, min, max };
}

function runParser(input: string): void {
  parseCsv(input);
}

// =============================================================================
// Main
// =============================================================================

console.log("CSV Scanner Performance Benchmark");
console.log("=".repeat(60));
console.log();

const testCases = [
  { name: "Simple 1K rows x 10 cols", data: generateSimpleCsv(1000, 10) },
  { name: "Simple 10K rows x 10 cols", data: generateSimpleCsv(10000, 10) },
  { name: "Quoted 1K rows x 10 cols", data: generateQuotedCsv(1000, 10) },
  { name: "Quoted 10K rows x 10 cols", data: generateQuotedCsv(10000, 10) },
  { name: "Complex 1K rows x 10 cols", data: generateComplexCsv(1000, 10) },
  { name: "Complex 5K rows x 10 cols", data: generateComplexCsv(5000, 10) }
];

for (const { name, data } of testCases) {
  console.log(`Test: ${name}`);
  console.log(`  Data size: ${(data.length / 1024).toFixed(1)} KB`);

  const result = benchmark("Scanner", () => runParser(data));

  console.log(
    `  Time: avg=${result.avg.toFixed(2)}ms, min=${result.min.toFixed(2)}ms, max=${result.max.toFixed(2)}ms`
  );
  console.log(`  Throughput: ${(data.length / 1024 / 1024 / (result.avg / 1000)).toFixed(2)} MB/s`);
  console.log();
}

console.log("Benchmark complete!");
