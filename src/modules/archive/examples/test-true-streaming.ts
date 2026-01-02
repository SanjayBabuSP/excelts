/**
 * Verify if TRUE STREAMING really works for row data
 */
import { StreamingZip, ZipDeflateFile } from "@archive/streaming-zip";

async function testTrueStreaming() {
  console.log("=== Testing TRUE STREAMING for Row Data ===\n");

  const chunks: { time: number; size: number; phase: string }[] = [];
  const startTime = Date.now();
  let phase = "setup";

  // Create ZIP with callback-based streaming
  const zip = new StreamingZip((err: Error | null, data: Uint8Array, _final: boolean) => {
    if (err) {
      console.error("ZIP error:", err);
      return;
    }
    chunks.push({ time: Date.now() - startTime, size: data.length, phase });
  });

  // Create worksheet file
  phase = "create-file";
  const worksheet = new ZipDeflateFile("xl/worksheets/sheet1.xml");
  zip.add(worksheet);

  // Write XML header
  phase = "xml-header";
  const encoder = new TextEncoder();
  worksheet.push(
    encoder.encode('<?xml version="1.0" encoding="UTF-8"?>\n<worksheet>\n<sheetData>\n')
  );

  // Wait for any async processing
  await new Promise(r => setTimeout(r, 50));
  console.log(`After XML header: ${chunks.length} chunks`);

  // Write 10000 rows, checking chunks every 1000 rows
  phase = "row-writes";
  for (let i = 1; i <= 10000; i++) {
    const rowXml = `<row r="${i}"><c r="A${i}" t="s"><v>${i}</v></c><c r="B${i}" t="s"><v>Data for row ${i} with some extra text to make it bigger</v></c></row>\n`;
    worksheet.push(encoder.encode(rowXml));

    if (i % 1000 === 0) {
      // Yield to event loop
      await new Promise(r => setTimeout(r, 0));
      const rowChunks = chunks.filter(c => c.phase === "row-writes").length;
      console.log(`Row ${i}: ${rowChunks} chunks during row writes`);
    }
  }

  const chunksBeforeClose = chunks.filter(c => c.phase === "row-writes").length;
  console.log(`\nBefore closing worksheet: ${chunksBeforeClose} chunks from row writes`);

  // Close worksheet
  phase = "close-worksheet";
  await worksheet.push(encoder.encode("</sheetData>\n</worksheet>"), true); // true = final

  await new Promise(r => setTimeout(r, 50));

  // Finalize ZIP
  phase = "finalize";
  zip.end();

  await new Promise(r => setTimeout(r, 100));

  console.log(`\n=== Summary ===`);
  console.log(`Total chunks: ${chunks.length}`);

  const rowWriteChunks = chunks.filter(c => c.phase === "row-writes");
  console.log(`Chunks during row writes: ${rowWriteChunks.length}`);

  if (rowWriteChunks.length > 0) {
    console.log("✅ TRUE STREAMING: Compressed data emitted DURING row writes!");
    console.log("Row write chunks timeline:");
    rowWriteChunks.slice(0, 10).forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.time}ms: ${c.size} bytes`);
    });
  } else {
    console.log("❌ NOT TRUE STREAMING: All data buffered until close");
  }
}

testTrueStreaming().catch(console.error);
