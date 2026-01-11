/**
 * ZIP record builders (PKWARE APPNOTE)
 *
 * Shared by streaming zip writer and buffer zip builder.
 */

// =============================================================================
// ZIP format constants (PKWARE APPNOTE)
// =============================================================================

// Signatures
export const LOCAL_FILE_HEADER_SIG = 0x04034b50;
export const CENTRAL_DIR_HEADER_SIG = 0x02014b50;
export const END_OF_CENTRAL_DIR_SIG = 0x06054b50;
export const DATA_DESCRIPTOR_SIG = 0x08074b50;

export const ZIP64_END_OF_CENTRAL_DIR_SIG = 0x06064b50;
export const ZIP64_END_OF_CENTRAL_DIR_LOCATOR_SIG = 0x07064b50;

// Versions
export const VERSION_NEEDED = 20; // 2.0 - supports DEFLATE
export const VERSION_MADE_BY = 20; // 2.0

// Compression methods
export const COMPRESSION_STORE = 0;
export const COMPRESSION_DEFLATE = 8;

// General purpose bit flags
export const FLAG_UTF8 = 0x0800;
export const FLAG_DATA_DESCRIPTOR = 0x0008;

// ZIP64 / sentinel sizes
export const UINT16_MAX = 0xffff;
export const UINT32_MAX = 0xffffffff;

export const ZIP_LOCAL_FILE_HEADER_FIXED_SIZE = 30;
export const ZIP_CENTRAL_DIR_HEADER_FIXED_SIZE = 46;
export const ZIP_END_OF_CENTRAL_DIR_FIXED_SIZE = 22;

export interface ZipLocalFileHeaderInput {
  fileName: Uint8Array;
  extraField: Uint8Array;
  flags: number;
  compressionMethod: number;
  dosTime: number;
  dosDate: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  versionNeeded?: number;
}

export function writeLocalFileHeaderInto(
  out: Uint8Array,
  view: DataView,
  offset: number,
  input: ZipLocalFileHeaderInput
): number {
  const versionNeeded = input.versionNeeded ?? VERSION_NEEDED;

  view.setUint32(offset + 0, LOCAL_FILE_HEADER_SIG, true);
  view.setUint16(offset + 4, versionNeeded, true);
  view.setUint16(offset + 6, input.flags, true);
  view.setUint16(offset + 8, input.compressionMethod, true);
  view.setUint16(offset + 10, input.dosTime, true);
  view.setUint16(offset + 12, input.dosDate, true);
  view.setUint32(offset + 14, input.crc32, true);
  view.setUint32(offset + 18, input.compressedSize, true);
  view.setUint32(offset + 22, input.uncompressedSize, true);
  view.setUint16(offset + 26, input.fileName.length, true);
  view.setUint16(offset + 28, input.extraField.length, true);

  out.set(input.fileName, offset + ZIP_LOCAL_FILE_HEADER_FIXED_SIZE);
  if (input.extraField.length > 0) {
    out.set(input.extraField, offset + ZIP_LOCAL_FILE_HEADER_FIXED_SIZE + input.fileName.length);
  }

  return ZIP_LOCAL_FILE_HEADER_FIXED_SIZE + input.fileName.length + input.extraField.length;
}

export function buildLocalFileHeader(input: ZipLocalFileHeaderInput): Uint8Array {
  const header = new Uint8Array(
    ZIP_LOCAL_FILE_HEADER_FIXED_SIZE + input.fileName.length + input.extraField.length
  );
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  writeLocalFileHeaderInto(header, view, 0, input);
  return header;
}

export interface ZipCentralDirectoryHeaderInput {
  fileName: Uint8Array;
  extraField: Uint8Array;
  comment: Uint8Array;
  flags: number;
  compressionMethod: number;
  dosTime: number;
  dosDate: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  versionMadeBy?: number;
  versionNeeded?: number;
  externalAttributes?: number;
}

export function writeCentralDirectoryHeaderInto(
  out: Uint8Array,
  view: DataView,
  offset: number,
  input: ZipCentralDirectoryHeaderInput
): number {
  const versionMadeBy = input.versionMadeBy ?? VERSION_MADE_BY;
  const versionNeeded = input.versionNeeded ?? VERSION_NEEDED;
  const externalAttributes = input.externalAttributes ?? 0;

  view.setUint32(offset + 0, CENTRAL_DIR_HEADER_SIG, true);
  view.setUint16(offset + 4, versionMadeBy, true);
  view.setUint16(offset + 6, versionNeeded, true);
  view.setUint16(offset + 8, input.flags, true);
  view.setUint16(offset + 10, input.compressionMethod, true);
  view.setUint16(offset + 12, input.dosTime, true);
  view.setUint16(offset + 14, input.dosDate, true);
  view.setUint32(offset + 16, input.crc32, true);
  view.setUint32(offset + 20, input.compressedSize, true);
  view.setUint32(offset + 24, input.uncompressedSize, true);
  view.setUint16(offset + 28, input.fileName.length, true);
  view.setUint16(offset + 30, input.extraField.length, true);
  view.setUint16(offset + 32, input.comment.length, true);
  view.setUint16(offset + 34, 0, true); // disk number start
  view.setUint16(offset + 36, 0, true); // internal file attributes
  view.setUint32(offset + 38, externalAttributes, true);
  view.setUint32(offset + 42, input.localHeaderOffset, true);

  out.set(input.fileName, offset + ZIP_CENTRAL_DIR_HEADER_FIXED_SIZE);
  if (input.extraField.length > 0) {
    out.set(input.extraField, offset + ZIP_CENTRAL_DIR_HEADER_FIXED_SIZE + input.fileName.length);
  }
  if (input.comment.length > 0) {
    out.set(
      input.comment,
      offset + ZIP_CENTRAL_DIR_HEADER_FIXED_SIZE + input.fileName.length + input.extraField.length
    );
  }

  return (
    ZIP_CENTRAL_DIR_HEADER_FIXED_SIZE +
    input.fileName.length +
    input.extraField.length +
    input.comment.length
  );
}

export function buildCentralDirectoryHeader(input: ZipCentralDirectoryHeaderInput): Uint8Array {
  const header = new Uint8Array(
    ZIP_CENTRAL_DIR_HEADER_FIXED_SIZE +
      input.fileName.length +
      input.extraField.length +
      input.comment.length
  );
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  writeCentralDirectoryHeaderInto(header, view, 0, input);
  return header;
}

export interface ZipEndOfCentralDirectoryInput {
  entryCount: number;
  centralDirSize: number;
  centralDirOffset: number;
  comment: Uint8Array;
}

export function writeEndOfCentralDirectoryInto(
  out: Uint8Array,
  view: DataView,
  offset: number,
  input: ZipEndOfCentralDirectoryInput
): number {
  view.setUint32(offset + 0, END_OF_CENTRAL_DIR_SIG, true);
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, input.entryCount, true);
  view.setUint16(offset + 10, input.entryCount, true);
  view.setUint32(offset + 12, input.centralDirSize, true);
  view.setUint32(offset + 16, input.centralDirOffset, true);
  view.setUint16(offset + 20, input.comment.length, true);

  if (input.comment.length > 0) {
    out.set(input.comment, offset + ZIP_END_OF_CENTRAL_DIR_FIXED_SIZE);
  }

  return ZIP_END_OF_CENTRAL_DIR_FIXED_SIZE + input.comment.length;
}

export function buildEndOfCentralDirectory(input: ZipEndOfCentralDirectoryInput): Uint8Array {
  const record = new Uint8Array(ZIP_END_OF_CENTRAL_DIR_FIXED_SIZE + input.comment.length);
  const view = new DataView(record.buffer, record.byteOffset, record.byteLength);
  writeEndOfCentralDirectoryInto(record, view, 0, input);
  return record;
}

export function buildDataDescriptor(
  crc32: number,
  compressedSize: number,
  uncompressedSize: number
) {
  const descriptor = new Uint8Array(16);
  const view = new DataView(descriptor.buffer);

  view.setUint32(0, DATA_DESCRIPTOR_SIG, true);
  view.setUint32(4, crc32, true);
  view.setUint32(8, compressedSize, true);
  view.setUint32(12, uncompressedSize, true);

  return descriptor;
}
