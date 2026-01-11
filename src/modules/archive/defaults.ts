import type { ZipTimestampMode } from "@archive/utils/timestamps";

export const DEFAULT_DEFLATE_LEVEL = 6;

// Backward-compatible aliases (avoid default drift across modules).
export const DEFAULT_COMPRESS_LEVEL = DEFAULT_DEFLATE_LEVEL;
export const DEFAULT_ZIP_LEVEL = DEFAULT_DEFLATE_LEVEL;

// Prefer reproducible output by default: omit the Info-ZIP UTC mtime extra field.
export const DEFAULT_ZIP_TIMESTAMPS: ZipTimestampMode = "dos";
