const DEFAULT_SAMPLE_BYTES = 64 * 1024;
const MIN_DECISION_BYTES = 16 * 1024;

function log2(x: number): number {
  return Math.log(x) / Math.LN2;
}

function shannonEntropy(bytes: Uint8Array): number {
  const counts = new Uint32Array(256);
  for (let i = 0; i < bytes.length; i++) {
    counts[bytes[i]!] += 1;
  }

  let entropy = 0;
  const total = bytes.length;
  for (let i = 0; i < 256; i++) {
    const count = counts[i]!;
    if (count === 0) {
      continue;
    }
    const p = count / total;
    entropy -= p * log2(p);
  }

  return entropy;
}

/**
 * Heuristic: detect incompressible (high-entropy) data.
 *
 * This is a performance optimization: if data looks random, DEFLATE usually
 * wastes CPU and may even produce slightly larger output.
 */
export function isProbablyIncompressible(
  data: Uint8Array,
  options: { sampleBytes?: number; minDecisionBytes?: number } = {}
): boolean {
  const sampleBytes = options.sampleBytes ?? DEFAULT_SAMPLE_BYTES;
  const minDecisionBytes = options.minDecisionBytes ?? MIN_DECISION_BYTES;

  const len = Math.min(data.length, sampleBytes);
  if (len < minDecisionBytes) {
    return false;
  }

  const sample = data.subarray(0, len);

  // Fast-ish early filter: if there are too few unique bytes, it's probably compressible.
  // (e.g. text, repeated patterns)
  const seen = new Uint8Array(256);
  let unique = 0;
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i]!;
    if (seen[b] === 0) {
      seen[b] = 1;
      unique += 1;
      if (unique >= 200) {
        break;
      }
    }
  }

  if (unique < 200) {
    return false;
  }

  // Shannon entropy in bits/byte; random tends to ~8.
  // Threshold picked to be conservative.
  return shannonEntropy(sample) >= 7.95;
}
