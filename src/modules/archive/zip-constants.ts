/**
 * ZIP format constants (PKWARE APPNOTE)
 * Shared by ZIP writer and parser implementations.
 */

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
