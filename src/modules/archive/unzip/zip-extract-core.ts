/**
 * Core ZIP extraction logic - shared between ZipParser and RemoteZipReader.
 *
 * This module provides unified functions for:
 * - Decrypting entry data (AES and ZipCrypto)
 * - Decompressing entry data
 * - Reading local file header
 * - CRC32 validation
 *
 * @module
 */

import { decompress, decompressSync } from "@archive/compression/compress";
import { crc32 } from "@archive/compression/crc32";
import { zipCryptoDecrypt, aesDecrypt } from "@archive/crypto";
import { BinaryReader } from "@archive/zip-spec/binary";
import type { ZipEntryInfo } from "@archive/zip-spec/zip-entry-info";
import {
  COMPRESSION_DEFLATE,
  COMPRESSION_STORE,
  LOCAL_FILE_HEADER_SIG
} from "@archive/zip-spec/zip-records";
import {
  Crc32MismatchError,
  DecryptionError,
  PasswordRequiredError,
  UnsupportedCompressionError
} from "@archive/shared/errors";

/**
 * Local file header fixed size (30 bytes)
 */
export const LOCAL_HEADER_FIXED_SIZE = 30;

/**
 * Options for extracting entry data
 */
export interface ExtractCoreOptions {
  /** Password for encrypted entries */
  password?: string | Uint8Array;
  /** Whether to validate CRC32 checksum after extraction */
  checkCrc32?: boolean;
}

/**
 * Process compressed (and possibly encrypted) entry data to get the final content.
 *
 * This is the core extraction logic used by both ZipParser and RemoteZipReader.
 *
 * @param entry - Entry metadata
 * @param compressedData - Raw compressed (and possibly encrypted) data from the ZIP
 * @param password - Optional password for decryption
 * @param checkCrc32 - Whether to validate CRC32 checksum (default: false)
 * @returns Decompressed entry content
 */
export async function processEntryData(
  entry: ZipEntryInfo,
  compressedData: Uint8Array,
  password?: string | Uint8Array,
  checkCrc32 = false
): Promise<Uint8Array> {
  let result: Uint8Array;

  // Handle encrypted entries
  if (entry.isEncrypted) {
    if (!password) {
      throw new PasswordRequiredError(entry.path);
    }

    if (entry.encryptionMethod === "aes" && entry.aesKeyStrength) {
      // AES decryption
      const decrypted = await aesDecrypt(compressedData, password, entry.aesKeyStrength);
      if (!decrypted) {
        throw new DecryptionError(entry.path);
      }

      // Decompress if needed (use original compression method)
      result = await decompressData(
        decrypted,
        entry.originalCompressionMethod ?? COMPRESSION_STORE,
        entry.path
      );
    } else if (entry.encryptionMethod === "zipcrypto") {
      // ZipCrypto decryption
      const decrypted = zipCryptoDecrypt(compressedData, password, entry.crc32, entry.dosTime);
      if (!decrypted) {
        throw new DecryptionError(entry.path);
      }

      result = await decompressData(decrypted, entry.compressionMethod, entry.path);
    } else {
      throw new DecryptionError(entry.path, "Unsupported encryption method");
    }
  } else {
    // Non-encrypted entry
    result = await decompressData(compressedData, entry.compressionMethod, entry.path);
  }

  // Validate CRC32 if requested
  // Note: AES-encrypted entries don't use CRC32 (they use HMAC instead)
  if (checkCrc32 && entry.encryptionMethod !== "aes") {
    const actualCrc = crc32(result);
    if (actualCrc !== entry.crc32) {
      throw new Crc32MismatchError(entry.path, entry.crc32, actualCrc);
    }
  }

  return result;
}

/**
 * Process compressed (and possibly encrypted) entry data synchronously.
 *
 * Note: AES-encrypted files cannot be processed synchronously because
 * the Web Crypto API is async. Use processEntryData() instead.
 *
 * @param entry - Entry metadata
 * @param compressedData - Raw compressed (and possibly encrypted) data from the ZIP
 * @param password - Optional password for decryption
 * @returns Decompressed entry content
 * @throws Error if the entry uses AES encryption
 */
export function processEntryDataSync(
  entry: ZipEntryInfo,
  compressedData: Uint8Array,
  password?: string | Uint8Array
): Uint8Array {
  // Handle encrypted entries
  if (entry.isEncrypted) {
    if (!password) {
      throw new PasswordRequiredError(entry.path);
    }

    if (entry.encryptionMethod === "aes") {
      // AES requires async Web Crypto API
      throw new Error(
        `File "${entry.path}" uses AES encryption. Use the async extract() method instead of extractSync().`
      );
    } else if (entry.encryptionMethod === "zipcrypto") {
      // ZipCrypto decryption (synchronous)
      const decrypted = zipCryptoDecrypt(compressedData, password, entry.crc32, entry.dosTime);
      if (!decrypted) {
        throw new DecryptionError(entry.path);
      }

      return decompressDataSync(decrypted, entry.compressionMethod, entry.path);
    } else {
      throw new DecryptionError(entry.path, "Unsupported encryption method");
    }
  }

  // Non-encrypted entry
  return decompressDataSync(compressedData, entry.compressionMethod, entry.path);
}

/**
 * Decompress data based on compression method (async).
 */
async function decompressData(
  data: Uint8Array,
  compressionMethod: number,
  path: string
): Promise<Uint8Array> {
  if (compressionMethod === COMPRESSION_STORE) {
    return data;
  }
  if (compressionMethod === COMPRESSION_DEFLATE) {
    return decompress(data);
  }
  throw new UnsupportedCompressionError(compressionMethod);
}

/**
 * Decompress data based on compression method (sync).
 */
function decompressDataSync(data: Uint8Array, compressionMethod: number, path: string): Uint8Array {
  if (compressionMethod === COMPRESSION_STORE) {
    return data;
  }
  if (compressionMethod === COMPRESSION_DEFLATE) {
    return decompressSync(data);
  }
  throw new UnsupportedCompressionError(compressionMethod);
}

/**
 * Read the data offset from a local file header.
 *
 * The data offset is the position after the local file header where
 * the actual compressed data begins.
 *
 * @param reader - Binary reader positioned at the local file header
 * @param expectedOffset - Expected offset (for error messages)
 * @returns Offset where the compressed data starts
 */
export function readLocalHeaderDataOffset(reader: BinaryReader, expectedOffset: number): number {
  const sig = reader.readUint32();
  if (sig !== LOCAL_FILE_HEADER_SIG) {
    throw new Error(`Invalid local file header signature at offset ${expectedOffset}`);
  }

  reader.skip(2); // version needed
  reader.skip(2); // flags
  reader.skip(2); // compression method
  reader.skip(2); // last mod time
  reader.skip(2); // last mod date
  reader.skip(4); // crc32
  reader.skip(4); // compressed size
  reader.skip(4); // uncompressed size
  const fileNameLength = reader.readUint16();
  const extraFieldLength = reader.readUint16();

  reader.skip(fileNameLength);
  reader.skip(extraFieldLength);

  return reader.position;
}

/**
 * Read compressed data for an entry from a buffer.
 *
 * @param data - Full ZIP buffer
 * @param entry - Entry to read
 * @returns Compressed data for the entry
 */
export function readEntryCompressedData(data: Uint8Array, entry: ZipEntryInfo): Uint8Array {
  const reader = new BinaryReader(data, entry.localHeaderOffset);
  const dataOffset = readLocalHeaderDataOffset(reader, entry.localHeaderOffset);
  return data.subarray(dataOffset, dataOffset + entry.compressedSize);
}
