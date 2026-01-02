import { encodeUtf8 } from "@archive/utils/text";
import {
  buildZipTimestampExtraField,
  dateToZipDos,
  type ZipTimestampMode
} from "@archive/utils/timestamps";
import {
  COMPRESSION_DEFLATE,
  COMPRESSION_STORE,
  FLAG_DATA_DESCRIPTOR,
  FLAG_UTF8
} from "@archive/zip-constants";

export interface ZipEntryMetadata {
  nameBytes: Uint8Array;
  commentBytes: Uint8Array;
  dosTime: number;
  dosDate: number;
  extraField: Uint8Array;
  compressionMethod: number;
  flags: number;
}

export interface ZipEntryMetadataInput {
  name: string;
  comment?: string;
  modTime: Date;
  timestamps: ZipTimestampMode;
  /** If true, set FLAG_DATA_DESCRIPTOR and expect CRC/sizes written later. */
  useDataDescriptor: boolean;
  /** If true, use DEFLATE; else STORE. */
  deflate: boolean;
}

export function resolveZipCompressionMethod(deflate: boolean): number {
  return deflate ? COMPRESSION_DEFLATE : COMPRESSION_STORE;
}

export function resolveZipFlags(useDataDescriptor: boolean): number {
  return useDataDescriptor ? FLAG_UTF8 | FLAG_DATA_DESCRIPTOR : FLAG_UTF8;
}

export function buildZipEntryMetadata(input: ZipEntryMetadataInput): ZipEntryMetadata {
  const nameBytes = encodeUtf8(input.name);
  const commentBytes = encodeUtf8(input.comment ?? "");
  const { dosTime, dosDate } = dateToZipDos(input.modTime);
  const extraField = buildZipTimestampExtraField(input.modTime, input.timestamps);

  return {
    nameBytes,
    commentBytes,
    dosTime,
    dosDate,
    extraField,
    compressionMethod: resolveZipCompressionMethod(input.deflate),
    flags: resolveZipFlags(input.useDataDescriptor)
  };
}
