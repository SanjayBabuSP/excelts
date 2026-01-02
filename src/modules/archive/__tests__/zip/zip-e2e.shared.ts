/**
 * ZIP End-to-End (E2E) Accuracy Shared Tests
 *
 * These tests run identically in both Node.js and Browser environments.
 *
 * Goals:
 * - Non-stream ZIP generation (`createZip`/`createZipSync`) must be accurate.
 * - True streaming ZIP generation (`Zip` + `ZipDeflate`) must be accurate.
 * - Streaming and non-stream outputs must unzip to identical bytes.
 */

import { describe, it, expect } from "vitest";

export interface ZipE2EModuleImports {
  // Non-stream ZIP
  createZip: (
    entries: Array<{ name: string; data: Uint8Array }>,
    options?: { level?: number }
  ) => Promise<Uint8Array> | Uint8Array;
  createZipSync: (
    entries: Array<{ name: string; data: Uint8Array }>,
    options?: { level?: number }
  ) => Uint8Array;

  // True streaming ZIP (fflate-like API)
  Zip: new (callback: (err: Error | null, data: Uint8Array, final: boolean) => void) => {
    add(file: any): void;
    end(): void;
  };
  ZipDeflate: new (
    name: string,
    options?: { level?: number }
  ) => {
    push(data: Uint8Array, final?: boolean, callback?: (err?: Error | null) => void): Promise<void>;
    complete(): Promise<void>;
  };

  // Unzip / verify
  extractAll: (
    zipData: Uint8Array | ArrayBuffer
  ) => Promise<Map<string, { data: Uint8Array; isDirectory?: boolean; size?: number }>>;
  listFiles: (zipData: Uint8Array | ArrayBuffer) => Promise<string[]>;

  // Extra integrity checks
  crc32: (data: Uint8Array) => number;
  ZipParser: new (data: Uint8Array | ArrayBuffer) => {
    getEntries(): Array<{
      path: string;
      isDirectory: boolean;
      compressedSize: number;
      uncompressedSize: number;
      compressionMethod: number;
      crc32: number;
      lastModified: Date;
      localHeaderOffset: number;
      comment: string;
      externalAttributes: number;
      isEncrypted: boolean;
    }>;

    listFiles(): string[];
    getEntry(path: string): unknown | undefined;
    hasEntry(path: string): boolean;
    extract(path: string): Promise<Uint8Array | null>;
    extractSync(path: string): Uint8Array | null;
    extractAll(): Promise<Map<string, Uint8Array>>;
    extractAllSync(): Record<string, Uint8Array>;
  };
}

const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const END_OF_CENTRAL_DIR_SIG = 0x06054b50;
const COMPRESSION_STORE = 0;
const COMPRESSION_DEFLATE = 8;

function hasSignature(data: Uint8Array, signature: number, start: number, end: number): boolean {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const min = Math.max(0, start);
  const max = Math.min(data.length - 4, end);
  for (let i = min; i <= max; i++) {
    if (view.getUint32(i, true) === signature) {
      return true;
    }
  }
  return false;
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function makeTestEntries(): Array<{ name: string; data: Uint8Array }> {
  const text = new TextEncoder();

  const binary256 = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    binary256[i] = i;
  }

  // Keep sizes moderate so the suite is browser-friendly.
  const mediumBinary = new Uint8Array(256 * 1024);
  for (let i = 0; i < mediumBinary.length; i++) {
    mediumBinary[i] = (i * 31) & 0xff;
  }

  return [
    // Directory entry (empty data) is a common real-world edge case.
    { name: "dir/", data: new Uint8Array(0) },
    { name: "empty.txt", data: new Uint8Array(0) },
    { name: "hello.txt", data: text.encode("Hello, ZIP!\n") },
    { name: "dir/subdir/newline.txt", data: text.encode("a\n\nb\r\nc\r\n") },
    { name: "unicode/文件-🌍.txt", data: text.encode("你好世界 🌍 مرحبا العالم") },
    // Filename edge cases (UTF-8 + spaces)
    { name: "names/space name.txt", data: text.encode("space") },
    { name: "names/leading-dot/.env", data: text.encode("KEY=VALUE") },
    { name: "binary-256.bin", data: binary256 },
    { name: "binary-medium.bin", data: mediumBinary }
  ];
}

function makeBoundaryEntries(): Array<{ name: string; data: Uint8Array }> {
  // Sizes around powers-of-two boundaries frequently expose buffering bugs.
  const sizes = [
    1,
    2,
    3,
    7,
    8,
    15,
    16,
    31,
    32,
    63,
    64,
    127,
    128,
    255,
    256,
    257,
    511,
    512,
    1023,
    1024,
    1025,
    4095,
    4096,
    4097,
    16 * 1024 - 1,
    16 * 1024,
    16 * 1024 + 1,
    32 * 1024 - 1,
    32 * 1024,
    32 * 1024 + 1,
    64 * 1024,
    64 * 1024 + 1
  ];
  const out: Array<{ name: string; data: Uint8Array }> = [];
  for (const size of sizes) {
    const data = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      data[i] = (i * 131 + size) & 0xff;
    }
    out.push({ name: `boundary/${size}.bin`, data });
  }
  return out;
}

function createXorshift32(seed: number): () => number {
  let x = seed | 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x >>> 0;
  };
}

function makeRandomBytes(length: number, nextU32: () => number): Uint8Array {
  const out = new Uint8Array(length);
  let i = 0;
  while (i < length) {
    const v = nextU32();
    out[i++] = v & 0xff;
    if (i < length) {
      out[i++] = (v >>> 8) & 0xff;
    }
    if (i < length) {
      out[i++] = (v >>> 16) & 0xff;
    }
    if (i < length) {
      out[i++] = (v >>> 24) & 0xff;
    }
  }
  return out;
}

function makeCompressibleBytes(length: number): Uint8Array {
  // Repetitive patterns exercise long LZ77 matches across window boundaries.
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = i % 16;
  }
  return out;
}

function makeSeededRandomEntries(): Array<{ name: string; data: Uint8Array }> {
  const nextU32 = createXorshift32(0xdeadbeef);
  const sizes = [
    0,
    1,
    2,
    3,
    7,
    8,
    15,
    16,
    31,
    32,
    63,
    64,
    127,
    128,
    255,
    256,
    257,
    1023,
    1024,
    1025,
    4095,
    4096,
    4097,
    16 * 1024 - 1,
    16 * 1024,
    16 * 1024 + 1,
    32 * 1024 - 1,
    32 * 1024,
    32 * 1024 + 1,
    64 * 1024 + 1
  ];

  return sizes.map(size => ({
    name: `seeded/random-${size}.bin`,
    data: makeRandomBytes(size, nextU32)
  }));
}

function makeCompressibilityEntries(): Array<{ name: string; data: Uint8Array }> {
  const nextU32 = createXorshift32(0x12345678);
  const sizes = [0, 1, 255, 256, 257, 4096, 4097, 16 * 1024, 16 * 1024 + 1, 64 * 1024];

  const entries: Array<{ name: string; data: Uint8Array }> = [];
  for (const size of sizes) {
    entries.push({ name: `compressible/${size}.bin`, data: makeCompressibleBytes(size) });
    entries.push({ name: `incompressible/${size}.bin`, data: makeRandomBytes(size, nextU32) });
  }
  return entries;
}

function makeManySmallEntries(): Array<{ name: string; data: Uint8Array }> {
  const text = new TextEncoder();
  const out: Array<{ name: string; data: Uint8Array }> = [];
  for (let i = 0; i < 200; i++) {
    const name = `many/${String(i).padStart(3, "0")}.txt`;
    out.push({ name, data: text.encode(`line-${i}\n`) });
  }
  return out;
}

async function buildZipStreamingWithChunking(
  imports: Pick<ZipE2EModuleImports, "Zip" | "ZipDeflate">,
  entries: Array<{ name: string; data: Uint8Array }>,
  options: { level: number; chunkSize?: number; randomizeChunking?: boolean; seed?: number }
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];

  let resolveZip: ((zipData: Uint8Array) => void) | null = null;
  let rejectZip: ((err: Error) => void) | null = null;
  const zipPromise = new Promise<Uint8Array>((resolve, reject) => {
    resolveZip = resolve;
    rejectZip = reject;
  });

  const zip = new imports.Zip((err, data, final) => {
    if (err) {
      rejectZip?.(err);
      return;
    }
    chunks.push(data);
    if (final) {
      resolveZip?.(concatUint8Arrays(chunks));
    }
  });

  const files: Array<InstanceType<ZipE2EModuleImports["ZipDeflate"]>> = [];
  const nextU32 = options.randomizeChunking ? createXorshift32(options.seed ?? 0xc0ffee) : null;

  for (const entry of entries) {
    const file = new imports.ZipDeflate(entry.name, { level: options.level });
    files.push(file);
    zip.add(file);

    // Chunked writes (including empty chunks) are a critical streaming edge case.
    // Keep chunk sizes small enough to exercise internal buffering.
    const data = entry.data;
    const baseChunkSize = options.chunkSize ?? 1024;
    if (data.length === 0) {
      await file.push(new Uint8Array(0), false);
      await file.push(new Uint8Array(0), true);
      continue;
    }

    // Start with an empty chunk.
    await file.push(new Uint8Array(0), false);

    let offset = 0;
    while (offset < data.length) {
      let chunkSize = baseChunkSize;
      if (nextU32) {
        // Mix very small and medium chunk sizes; occasionally emit empty chunks.
        const r = nextU32();
        const candidate = (r % (baseChunkSize * 2)) + 1;
        chunkSize = Math.min(candidate, baseChunkSize * 2);
        if ((r & 0x1f) === 0) {
          await file.push(new Uint8Array(0), false);
        }
      }

      const next = Math.min(offset + chunkSize, data.length);
      const isFinal = next === data.length;
      await file.push(data.subarray(offset, next), isFinal);
      offset = next;
    }
  }

  zip.end();
  await Promise.all(files.map(f => f.complete()));

  return zipPromise;
}

async function buildZipStreaming(
  imports: Pick<ZipE2EModuleImports, "Zip" | "ZipDeflate">,
  entries: Array<{ name: string; data: Uint8Array }>,
  options: { level: number }
): Promise<Uint8Array> {
  return buildZipStreamingWithChunking(imports, entries, { level: options.level });
}

async function unzipAsMap(
  imports: Pick<ZipE2EModuleImports, "extractAll" | "listFiles" | "crc32" | "ZipParser">,
  zipData: Uint8Array,
  options: { deepChecks?: boolean } = {}
): Promise<Map<string, { data: Uint8Array; isDirectory: boolean; size: number }>> {
  // Sanity check: listFiles should be consistent with extractAll.
  const paths = (await imports.listFiles(zipData)).slice().sort();
  const extracted = await imports.extractAll(zipData);

  // ZIP structural sanity: EOCD must exist in the last 65557 bytes.
  const minOffset = Math.max(0, zipData.length - 65557);
  expect(hasSignature(zipData, END_OF_CENTRAL_DIR_SIG, minOffset, zipData.length - 4)).toBe(true);

  // Cross-check central directory entry info from the parser.
  const parser = new imports.ZipParser(zipData);
  const entryInfos = parser.getEntries();
  expect(entryInfos.length).toBe(paths.length);
  const parsedPaths = entryInfos
    .map(e => e.path)
    .slice()
    .sort();
  expect(parsedPaths).toEqual(paths);
  expect(parser.listFiles().slice().sort()).toEqual(paths);

  const out = new Map<string, { data: Uint8Array; isDirectory: boolean; size: number }>();
  for (const [path, file] of extracted) {
    const data = file.data;
    const size = file.size ?? data.length;
    const isDirectory = file.isDirectory ?? (path.endsWith("/") || path.endsWith("\\"));
    expect(size).toBe(data.length);
    out.set(path, { data, isDirectory, size });
  }

  const extractedPaths = Array.from(out.keys()).slice().sort();
  expect(extractedPaths).toEqual(paths);

  // Extra integrity: ZipParser metadata must match extracted output.
  const view = new DataView(zipData.buffer, zipData.byteOffset, zipData.byteLength);
  for (const entry of entryInfos) {
    const extractedFile = out.get(entry.path);
    expect(extractedFile, `Missing entry from extractAll: ${entry.path}`).toBeDefined();

    // Local header signature at the recorded offset.
    expect(entry.localHeaderOffset).toBeGreaterThanOrEqual(0);
    expect(entry.localHeaderOffset).toBeLessThanOrEqual(Math.max(0, zipData.length - 4));
    expect(view.getUint32(entry.localHeaderOffset, true)).toBe(LOCAL_FILE_HEADER_SIG);

    // Common ZIP constraints.
    expect(entry.isEncrypted).toBe(false);
    expect([COMPRESSION_STORE, COMPRESSION_DEFLATE]).toContain(entry.compressionMethod);
    expect(entry.lastModified instanceof Date).toBe(true);

    // Size + directory consistency.
    expect(extractedFile!.size).toBe(entry.uncompressedSize);
    expect(extractedFile!.data.length).toBe(entry.uncompressedSize);
    expect(extractedFile!.isDirectory).toBe(entry.isDirectory);
    if (entry.isDirectory) {
      expect(extractedFile!.data.length).toBe(0);
    }

    // CRC32 must match decompressed bytes exactly.
    const crc = imports.crc32(extractedFile!.data);
    expect(crc).toBe(entry.crc32);
  }

  if (options.deepChecks) {
    // Deep cross-checks: verify a second extraction path yields identical bytes.
    // This is enabled only for selected tests to keep browser runtime reasonable.

    // Lookup helpers should agree.
    for (const path of paths) {
      expect(parser.hasEntry(path)).toBe(true);
      expect(parser.getEntry(path)).toBeDefined();
    }
    expect(parser.hasEntry("__missing__.txt")).toBe(false);
    expect(parser.getEntry("__missing__.txt")).toBeUndefined();

    // Per-entry async extract
    for (const path of paths) {
      const fromParser = await parser.extract(path);
      expect(
        fromParser,
        `ZipParser.extract returned null for existing entry: ${path}`
      ).not.toBeNull();
      expect(fromParser!).toEqual(out.get(path)!.data);
    }

    // Per-entry sync extract
    for (const path of paths) {
      const fromParser = parser.extractSync(path);
      expect(
        fromParser,
        `ZipParser.extractSync returned null for existing entry: ${path}`
      ).not.toBeNull();
      expect(fromParser!).toEqual(out.get(path)!.data);
    }

    // extractAll (async)
    const allFromParser = await parser.extractAll();
    expect(Array.from(allFromParser.keys()).slice().sort()).toEqual(paths);
    for (const path of paths) {
      expect(allFromParser.get(path)!).toEqual(out.get(path)!.data);
    }

    // extractAllSync
    const allSyncFromParser = parser.extractAllSync();
    expect(Object.keys(allSyncFromParser).slice().sort()).toEqual(paths);
    for (const path of paths) {
      expect(allSyncFromParser[path]).toEqual(out.get(path)!.data);
    }

    // Negative extract sanity
    expect(await parser.extract("__missing__.txt")).toBeNull();
    expect(parser.extractSync("__missing__.txt")).toBeNull();
  }

  return out;
}

function expectSameFiles(
  actual: Map<string, { data: Uint8Array; isDirectory: boolean; size: number }>,
  expected: Array<{ name: string; data: Uint8Array }>
): void {
  expect(actual.size).toBe(expected.length);
  for (const e of expected) {
    const got = actual.get(e.name);
    expect(got, `Missing entry: ${e.name}`).toBeDefined();
    expect(got!.data).toEqual(e.data);
    expect(got!.size).toBe(e.data.length);
    if (e.name.endsWith("/") || e.name.endsWith("\\")) {
      expect(got!.isDirectory).toBe(true);
    }
  }
}

function expectExtractedMapsEqual(
  a: Map<string, { data: Uint8Array; isDirectory: boolean; size: number }>,
  b: Map<string, { data: Uint8Array; isDirectory: boolean; size: number }>
): void {
  expect(Array.from(a.keys()).sort()).toEqual(Array.from(b.keys()).sort());
  for (const [path, aFile] of a) {
    const bFile = b.get(path);
    expect(bFile, `Missing entry: ${path}`).toBeDefined();
    expect(bFile!.data).toEqual(aFile.data);
    expect(bFile!.size).toBe(aFile.size);
    expect(bFile!.isDirectory).toBe(aFile.isDirectory);
  }
}

export function runZipE2ETests(imports: ZipE2EModuleImports): void {
  describe("ZIP E2E Accuracy (shared)", () => {
    it("non-stream createZipSync roundtrips accurately (level 6)", async () => {
      const entries = makeTestEntries();
      const zip = imports.createZipSync(entries, { level: 6 });
      const extracted = await unzipAsMap(imports, zip, { deepChecks: true });
      expectSameFiles(extracted, entries);
    });

    it("non-stream createZip (async) roundtrips accurately (level 6)", async () => {
      const entries = makeTestEntries();
      const zip = await Promise.resolve(imports.createZip(entries, { level: 6 }));
      const extracted = await unzipAsMap(imports, zip, { deepChecks: true });
      expectSameFiles(extracted, entries);
    });

    it("non-stream STORE mode (level 0) roundtrips accurately", async () => {
      const entries = makeTestEntries();
      const zip = imports.createZipSync(entries, { level: 0 });
      const extracted = await unzipAsMap(imports, zip, { deepChecks: true });
      expectSameFiles(extracted, entries);
    });

    it("non-stream max compression (level 9) roundtrips accurately", async () => {
      const entries = makeTestEntries();
      const zip = imports.createZipSync(entries, { level: 9 });
      const extracted = await unzipAsMap(imports, zip, { deepChecks: true });
      expectSameFiles(extracted, entries);
    });

    it("true streaming Zip+ZipDeflate roundtrips accurately (chunked writes)", async () => {
      const entries = makeTestEntries();
      const zip = await buildZipStreaming(imports, entries, { level: 6 });
      const extracted = await unzipAsMap(imports, zip, { deepChecks: true });
      expectSameFiles(extracted, entries);
    });

    it("true streaming STORE mode (level 0) roundtrips accurately", async () => {
      const entries = makeTestEntries();
      const zip = await buildZipStreaming(imports, entries, { level: 0 });
      const extracted = await unzipAsMap(imports, zip, { deepChecks: true });
      expectSameFiles(extracted, entries);
    });

    it("streaming and non-stream zips unzip to identical bytes", async () => {
      const entries = makeTestEntries();

      const zipNonStream = imports.createZipSync(entries, { level: 6 });
      const zipStreaming = await buildZipStreaming(imports, entries, { level: 6 });

      const extractedNonStream = await unzipAsMap(imports, zipNonStream, { deepChecks: true });
      const extractedStreaming = await unzipAsMap(imports, zipStreaming, { deepChecks: true });

      expectExtractedMapsEqual(extractedNonStream, extractedStreaming);
    });

    it("boundary sizes roundtrip correctly (non-stream and streaming)", async () => {
      const entries = makeBoundaryEntries();
      const zipNonStream = imports.createZipSync(entries, { level: 6 });
      const zipStreaming = await buildZipStreaming(imports, entries, { level: 6 });

      const extractedNonStream = await unzipAsMap(imports, zipNonStream);
      const extractedStreaming = await unzipAsMap(imports, zipStreaming);

      expectSameFiles(extractedNonStream, entries);
      expectSameFiles(extractedStreaming, entries);
      expectExtractedMapsEqual(extractedNonStream, extractedStreaming);
    });

    it("many small files roundtrip correctly (non-stream and streaming)", async () => {
      const entries = makeManySmallEntries();
      const zipNonStream = imports.createZipSync(entries, { level: 6 });
      const zipStreaming = await buildZipStreaming(imports, entries, { level: 6 });

      const extractedNonStream = await unzipAsMap(imports, zipNonStream);
      const extractedStreaming = await unzipAsMap(imports, zipStreaming);

      expectSameFiles(extractedNonStream, entries);
      expectSameFiles(extractedStreaming, entries);
      expectExtractedMapsEqual(extractedNonStream, extractedStreaming);
    });

    it("seeded random sizes roundtrip correctly (non-stream and streaming)", async () => {
      const entries = makeSeededRandomEntries();
      const zipNonStream = imports.createZipSync(entries, { level: 6 });
      const zipStreaming = await buildZipStreaming(imports, entries, { level: 6 });

      const extractedNonStream = await unzipAsMap(imports, zipNonStream);
      const extractedStreaming = await unzipAsMap(imports, zipStreaming);

      expectSameFiles(extractedNonStream, entries);
      expectSameFiles(extractedStreaming, entries);
      expectExtractedMapsEqual(extractedNonStream, extractedStreaming);
    });

    it("compressible vs incompressible data roundtrip across sizes", async () => {
      const entries = makeCompressibilityEntries();
      const zipNonStream = imports.createZipSync(entries, { level: 9 });
      const zipStreaming = await buildZipStreaming(imports, entries, { level: 9 });

      const extractedNonStream = await unzipAsMap(imports, zipNonStream);
      const extractedStreaming = await unzipAsMap(imports, zipStreaming);

      expectSameFiles(extractedNonStream, entries);
      expectSameFiles(extractedStreaming, entries);
      expectExtractedMapsEqual(extractedNonStream, extractedStreaming);
    });

    it("streaming handles pathological 1-byte chunking", async () => {
      const nextU32 = createXorshift32(0x0badf00d);
      const entries = [
        { name: "chunking/empty.bin", data: new Uint8Array(0) },
        { name: "chunking/one-byte.bin", data: makeRandomBytes(4096 + 1, nextU32) }
      ];

      const zipStreaming = await buildZipStreamingWithChunking(imports, entries, {
        level: 6,
        chunkSize: 1
      });
      const extracted = await unzipAsMap(imports, zipStreaming, { deepChecks: true });
      expectSameFiles(extracted, entries);
    });

    it("streaming handles randomized chunk sizes (seeded)", async () => {
      const nextU32 = createXorshift32(0xa5a5a5a5);
      const entries = [
        { name: "chunking/random.bin", data: makeRandomBytes(64 * 1024 + 1, nextU32) },
        { name: "chunking/compressible.bin", data: makeCompressibleBytes(64 * 1024 + 1) }
      ];

      const zipStreaming = await buildZipStreamingWithChunking(imports, entries, {
        level: 6,
        chunkSize: 4096,
        randomizeChunking: true,
        seed: 0xfaceb00c
      });
      const extracted = await unzipAsMap(imports, zipStreaming, { deepChecks: true });
      expectSameFiles(extracted, entries);
    });
  });
}
