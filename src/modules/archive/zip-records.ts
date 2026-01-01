/**
 * ZIP record builders (PKWARE APPNOTE)
 *
 * Shared by streaming zip writer and buffer zip builder.
 */

import {
  CENTRAL_DIR_HEADER_SIG,
  DATA_DESCRIPTOR_SIG,
  END_OF_CENTRAL_DIR_SIG,
  LOCAL_FILE_HEADER_SIG,
  VERSION_MADE_BY,
  VERSION_NEEDED
} from "./zip-constants";

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

export function buildLocalFileHeader(input: ZipLocalFileHeaderInput): Uint8Array {
  const versionNeeded = input.versionNeeded ?? VERSION_NEEDED;

  const header = new Uint8Array(30 + input.fileName.length + input.extraField.length);
  const view = new DataView(header.buffer);

  view.setUint32(0, LOCAL_FILE_HEADER_SIG, true);
  view.setUint16(4, versionNeeded, true);
  view.setUint16(6, input.flags, true);
  view.setUint16(8, input.compressionMethod, true);
  view.setUint16(10, input.dosTime, true);
  view.setUint16(12, input.dosDate, true);
  view.setUint32(14, input.crc32, true);
  view.setUint32(18, input.compressedSize, true);
  view.setUint32(22, input.uncompressedSize, true);
  view.setUint16(26, input.fileName.length, true);
  view.setUint16(28, input.extraField.length, true);

  header.set(input.fileName, 30);
  if (input.extraField.length > 0) {
    header.set(input.extraField, 30 + input.fileName.length);
  }

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

export function buildCentralDirectoryHeader(input: ZipCentralDirectoryHeaderInput): Uint8Array {
  const versionMadeBy = input.versionMadeBy ?? VERSION_MADE_BY;
  const versionNeeded = input.versionNeeded ?? VERSION_NEEDED;
  const externalAttributes = input.externalAttributes ?? 0;

  const header = new Uint8Array(
    46 + input.fileName.length + input.extraField.length + input.comment.length
  );
  const view = new DataView(header.buffer);

  view.setUint32(0, CENTRAL_DIR_HEADER_SIG, true);
  view.setUint16(4, versionMadeBy, true);
  view.setUint16(6, versionNeeded, true);
  view.setUint16(8, input.flags, true);
  view.setUint16(10, input.compressionMethod, true);
  view.setUint16(12, input.dosTime, true);
  view.setUint16(14, input.dosDate, true);
  view.setUint32(16, input.crc32, true);
  view.setUint32(20, input.compressedSize, true);
  view.setUint32(24, input.uncompressedSize, true);
  view.setUint16(28, input.fileName.length, true);
  view.setUint16(30, input.extraField.length, true);
  view.setUint16(32, input.comment.length, true);
  view.setUint16(34, 0, true); // disk number start
  view.setUint16(36, 0, true); // internal file attributes
  view.setUint32(38, externalAttributes, true);
  view.setUint32(42, input.localHeaderOffset, true);

  header.set(input.fileName, 46);
  if (input.extraField.length > 0) {
    header.set(input.extraField, 46 + input.fileName.length);
  }
  if (input.comment.length > 0) {
    header.set(input.comment, 46 + input.fileName.length + input.extraField.length);
  }

  return header;
}

export interface ZipEndOfCentralDirectoryInput {
  entryCount: number;
  centralDirSize: number;
  centralDirOffset: number;
  comment: Uint8Array;
}

export function buildEndOfCentralDirectory(input: ZipEndOfCentralDirectoryInput): Uint8Array {
  const record = new Uint8Array(22 + input.comment.length);
  const view = new DataView(record.buffer);

  view.setUint32(0, END_OF_CENTRAL_DIR_SIG, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, input.entryCount, true);
  view.setUint16(10, input.entryCount, true);
  view.setUint32(12, input.centralDirSize, true);
  view.setUint32(16, input.centralDirOffset, true);
  view.setUint16(20, input.comment.length, true);

  if (input.comment.length > 0) {
    record.set(input.comment, 22);
  }

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
