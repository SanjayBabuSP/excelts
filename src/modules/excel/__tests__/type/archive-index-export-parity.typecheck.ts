// This file is typechecked by `npm run type` (tsgo) but is NOT executed by Vitest.
// It enforces that Node and browser archive index modules keep compatible export surfaces.

type Assert<T extends true> = T;

type IsNever<T> = [T] extends [never] ? true : false;

type IsAny<T> = 0 extends 1 & T ? true : false;

type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type IsEqualStrict<A, B> =
  IsAny<A> extends true ? false : IsAny<B> extends true ? false : IsEqual<A, B>;

import type * as NodeIndexModule from "@archive";
import type * as BrowserIndexModule from "@archive/index.browser";

import type {
  CompressOptions as NodeCompressOptions,
  StreamCompressOptions as NodeStreamCompressOptions,
  ZipOptions as NodeZipOptions,
  ZipEntry as NodeZipEntry,
  ParseOptions as NodeParseOptions,
  StreamZipEntry as NodeStreamZipEntry,
  ZipParseOptions as NodeZipParseOptions,
  ExtractedFile as NodeExtractedFile,
  ZipEntryInfo as NodeZipEntryInfo
} from "@archive";

import type {
  CompressOptions as BrowserCompressOptions,
  StreamCompressOptions as BrowserStreamCompressOptions,
  ZipOptions as BrowserZipOptions,
  ZipEntry as BrowserZipEntry,
  ParseOptions as BrowserParseOptions,
  StreamZipEntry as BrowserStreamZipEntry,
  ZipParseOptions as BrowserZipParseOptions,
  ExtractedFile as BrowserExtractedFile,
  ZipEntryInfo as BrowserZipEntryInfo
} from "@archive/index.browser";

type NodeRuntime = typeof NodeIndexModule;
type BrowserRuntime = typeof BrowserIndexModule;

type ClassKeys<T> = {
  [K in keyof T]-?: T[K] extends abstract new (...args: any[]) => any ? K : never;
}[keyof T];

type NonClassKeys<T> = Exclude<keyof T, ClassKeys<T>>;

type NodeRuntimeNonClass = Pick<NodeRuntime, NonClassKeys<NodeRuntime>>;
type BrowserRuntimeNonClass = Pick<BrowserRuntime, NonClassKeys<BrowserRuntime>>;

// Export name parity

type _ClassExportNames_NodeExtra = Assert<
  IsNever<Exclude<ClassKeys<NodeRuntime>, ClassKeys<BrowserRuntime>>>
>;

type _ClassExportNames_BrowserExtra = Assert<
  IsNever<Exclude<ClassKeys<BrowserRuntime>, ClassKeys<NodeRuntime>>>
>;

type _NonClassExportNames_NodeExtra = Assert<
  IsNever<Exclude<keyof NodeRuntimeNonClass, keyof BrowserRuntimeNonClass>>
>;

type _NonClassExportNames_BrowserExtra = Assert<
  IsNever<Exclude<keyof BrowserRuntimeNonClass, keyof NodeRuntimeNonClass>>
>;

// Non-class export type parity (explicit list to keep errors actionable)

type _NonClass_crc32 = Assert<
  IsEqualStrict<NodeRuntimeNonClass["crc32"], BrowserRuntimeNonClass["crc32"]>
>;

type _NonClass_crc32Update = Assert<
  IsEqualStrict<NodeRuntimeNonClass["crc32Update"], BrowserRuntimeNonClass["crc32Update"]>
>;

type _NonClass_crc32Finalize = Assert<
  IsEqualStrict<NodeRuntimeNonClass["crc32Finalize"], BrowserRuntimeNonClass["crc32Finalize"]>
>;

type _NonClass_compress = Assert<
  IsEqualStrict<NodeRuntimeNonClass["compress"], BrowserRuntimeNonClass["compress"]>
>;

type _NonClass_compressSync = Assert<
  IsEqualStrict<NodeRuntimeNonClass["compressSync"], BrowserRuntimeNonClass["compressSync"]>
>;

type _NonClass_decompress = Assert<
  IsEqualStrict<NodeRuntimeNonClass["decompress"], BrowserRuntimeNonClass["decompress"]>
>;

type _NonClass_decompressSync = Assert<
  IsEqualStrict<NodeRuntimeNonClass["decompressSync"], BrowserRuntimeNonClass["decompressSync"]>
>;

type _NonClass_hasCompressionStream = Assert<
  IsEqualStrict<
    NodeRuntimeNonClass["hasCompressionStream"],
    BrowserRuntimeNonClass["hasCompressionStream"]
  >
>;

type _NonClass_createDeflateStream = Assert<
  IsEqualStrict<
    NodeRuntimeNonClass["createDeflateStream"],
    BrowserRuntimeNonClass["createDeflateStream"]
  >
>;

type _NonClass_createInflateStream = Assert<
  IsEqualStrict<
    NodeRuntimeNonClass["createInflateStream"],
    BrowserRuntimeNonClass["createInflateStream"]
  >
>;

type _NonClass_hasDeflateRaw = Assert<
  IsEqualStrict<NodeRuntimeNonClass["hasDeflateRaw"], BrowserRuntimeNonClass["hasDeflateRaw"]>
>;

type _NonClass_createZip = Assert<
  IsEqualStrict<NodeRuntimeNonClass["createZip"], BrowserRuntimeNonClass["createZip"]>
>;

type _NonClass_createZipSync = Assert<
  IsEqualStrict<NodeRuntimeNonClass["createZipSync"], BrowserRuntimeNonClass["createZipSync"]>
>;

type _NonClass_createParse = Assert<
  IsEqualStrict<NodeRuntimeNonClass["createParse"], BrowserRuntimeNonClass["createParse"]>
>;

type _NonClass_extractAll = Assert<
  IsEqualStrict<NodeRuntimeNonClass["extractAll"], BrowserRuntimeNonClass["extractAll"]>
>;

type _NonClass_extractFile = Assert<
  IsEqualStrict<NodeRuntimeNonClass["extractFile"], BrowserRuntimeNonClass["extractFile"]>
>;

type _NonClass_listFiles = Assert<
  IsEqualStrict<NodeRuntimeNonClass["listFiles"], BrowserRuntimeNonClass["listFiles"]>
>;

type _NonClass_forEachEntry = Assert<
  IsEqualStrict<NodeRuntimeNonClass["forEachEntry"], BrowserRuntimeNonClass["forEachEntry"]>
>;

// Exported type parity

type _Type_CompressOptions = Assert<IsEqual<NodeCompressOptions, BrowserCompressOptions>>;

type _Type_StreamCompressOptions = Assert<
  IsEqual<NodeStreamCompressOptions, BrowserStreamCompressOptions>
>;

type _Type_ZipOptions = Assert<IsEqual<NodeZipOptions, BrowserZipOptions>>;

type _Type_ZipEntry = Assert<IsEqual<NodeZipEntry, BrowserZipEntry>>;

type _Type_ParseOptions = Assert<IsEqual<NodeParseOptions, BrowserParseOptions>>;

type _Type_StreamZipEntry = Assert<IsEqual<NodeStreamZipEntry, BrowserStreamZipEntry>>;

type _Type_ZipParseOptions = Assert<IsEqual<NodeZipParseOptions, BrowserZipParseOptions>>;

type _Type_ExtractedFile = Assert<IsEqual<NodeExtractedFile, BrowserExtractedFile>>;

type _Type_ZipEntryInfo = Assert<IsEqual<NodeZipEntryInfo, BrowserZipEntryInfo>>;

export {};
