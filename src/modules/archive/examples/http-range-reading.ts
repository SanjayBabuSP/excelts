/**
 * Example: HTTP Range reading for remote ZIP files
 *
 * This example demonstrates how to use RemoteZipReader to efficiently
 * access ZIP files stored on remote servers using HTTP Range requests.
 *
 * The key advantage is that only the necessary parts of the ZIP file
 * are downloaded:
 * 1. End of Central Directory (EOCD) - ~22 bytes at the end
 * 2. Central Directory - metadata about all files
 * 3. Individual file data - only when extracted
 *
 * For a 100MB ZIP file where you need just one 1KB file, this can mean
 * downloading only a few kilobytes instead of 100MB!
 */

import { RemoteZipReader, BufferReader } from "@archive";
import { createZip, type ZipEntry } from "@archive/zip/zip-bytes";

// Helper to create test entries
function textEntry(name: string, content: string): ZipEntry {
  return { name, data: new TextEncoder().encode(content) };
}

async function main(): Promise<void> {
  console.log("=== HTTP Range Reading Example ===\n");

  // ========================================
  // Example 1: Small ZIP demonstration
  // ========================================
  console.log("--- Example 1: Small ZIP ---");

  const smallEntries: ZipEntry[] = [
    textEntry("readme.txt", "Welcome to the archive!\n"),
    textEntry("config.json", JSON.stringify({ version: "1.0.0", name: "demo" }, null, 2))
  ];

  const smallZip = await createZip(smallEntries);
  console.log(`Small ZIP: ${smallZip.length} bytes`);

  const reader1 = await RemoteZipReader.fromReader(new BufferReader(smallZip));
  console.log(`Entries: ${reader1.getEntries().length}`);
  await reader1.close();
  console.log();

  // ========================================
  // Example 2: Large ZIP with many files
  // ========================================
  console.log("--- Example 2: Large ZIP simulation ---");

  // Create a larger archive with many files to demonstrate efficiency
  const largeEntries: ZipEntry[] = [];

  // Add 100 "data" files (each ~10KB of content)
  for (let i = 0; i < 100; i++) {
    const content = `File ${i} content\n${"x".repeat(10000)}`;
    largeEntries.push(textEntry(`data/file${String(i).padStart(3, "0")}.txt`, content));
  }

  // Add a small config file
  largeEntries.push(
    textEntry("config.json", JSON.stringify({ version: "1.0.0", files: 100 }, null, 2))
  );

  const largeZip = await createZip(largeEntries, { level: 0 }); // Store uncompressed for realistic sizes
  console.log(
    `Large ZIP: ${(largeZip.length / 1024).toFixed(1)} KB (${largeEntries.length} files)`
  );

  // Track reads to show efficiency
  const reads: Array<{ start: number; end: number; bytes: number }> = [];
  const trackingReader = {
    size: largeZip.length,
    async read(start: number, end: number): Promise<Uint8Array> {
      const bytes = end - start;
      reads.push({ start, end, bytes });
      return largeZip.slice(start, end);
    },
    async close(): Promise<void> {}
  };

  const reader2 = await RemoteZipReader.fromReader(trackingReader);

  const metadataBytes = reads.reduce((s, r) => s + r.bytes, 0);
  console.log(`\nAfter parsing metadata:`);
  console.log(`  Reads: ${reads.length}`);
  console.log(`  Bytes read: ${(metadataBytes / 1024).toFixed(1)} KB`);
  console.log(
    `  Efficiency: ${((1 - metadataBytes / largeZip.length) * 100).toFixed(1)}% of file NOT downloaded`
  );

  // Extract just the config file
  const readsBefore = reads.length;
  const config = await reader2.extract("config.json");
  const extractBytes = reads.slice(readsBefore).reduce((s, r) => s + r.bytes, 0);

  console.log(`\nAfter extracting config.json (${config?.length} bytes):`);
  console.log(`  Additional reads: ${reads.length - readsBefore}`);
  console.log(`  Additional bytes: ${extractBytes}`);
  console.log(`  Total downloaded: ${((metadataBytes + extractBytes) / 1024).toFixed(1)} KB`);
  console.log(
    `  Savings: ${((1 - (metadataBytes + extractBytes) / largeZip.length) * 100).toFixed(1)}%`
  );

  await reader2.close();
  console.log();

  // ========================================
  // Example 3: Iterator pattern
  // ========================================
  console.log("--- Example 3: Iterator pattern ---");

  const reader3 = await RemoteZipReader.fromReader(new BufferReader(largeZip));

  // Find and extract just files matching a pattern
  let found = 0;
  await reader3.forEach(async (entry, getData) => {
    if (entry.path.endsWith(".json")) {
      const data = await getData();
      console.log(`Found JSON: ${entry.path} (${data.length} bytes)`);
      found++;
    }
    // Don't load data for other files - they won't be downloaded!
  });

  console.log(`Total JSON files found: ${found}`);
  await reader3.close();
}

main().catch(console.error);
