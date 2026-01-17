import { VERSION_NEEDED } from "@archive/zip-spec/zip-records";

type ZipEntryKind = "file" | "directory" | "symlink";

const ZIP_OS_MSDOS = 0;
const ZIP_OS_UNIX = 3;

function zipVersionMadeBy(os: number, version: number = VERSION_NEEDED): number {
  return ((os & 0xff) << 8) | (version & 0xff);
}

function resolveUnixTypeBits(kind: ZipEntryKind): number {
  switch (kind) {
    case "directory":
      return 0o040000;
    case "symlink":
      return 0o120000;
    default:
      return 0o100000;
  }
}

function clampUint16(n: number): number {
  return (n >>> 0) & 0xffff;
}

interface ZipExternalAttributesInput {
  kind: ZipEntryKind;
  /** Unix mode. May be full `stat.mode`, or just permission bits like `0o755`. */
  mode?: number;
  /** MS-DOS attributes (low 8 bits). E.g. 0x01 read-only, 0x02 hidden, 0x10 directory, 0x20 archive. */
  msDosAttributes?: number;
}

interface ZipExternalAttributesResult {
  externalAttributes: number;
  versionMadeBy: number;
}

function resolveZipEntryKind(name: string, mode?: number): ZipEntryKind {
  const isDirectory = name.endsWith("/") || name.endsWith("\\");
  const isSymlink = mode !== undefined && (mode & 0o170000) === 0o120000;
  return isSymlink ? "symlink" : isDirectory ? "directory" : "file";
}

function buildZipExternalAttributes(
  input: ZipExternalAttributesInput
): ZipExternalAttributesResult {
  const kind = input.kind;

  // Default DOS attributes:
  // - directories: directory flag (0x10)
  // - files/symlinks: archive bit (0x20), matching common ZIP tools
  const defaultDos = kind === "directory" ? 0x10 : 0x20;
  const dosAttrs = (input.msDosAttributes ?? defaultDos) & 0xff;

  let unixMode: number | undefined = input.mode;
  if (unixMode !== undefined) {
    // If the caller passed only permission bits (no type bits), add type bits.
    if ((unixMode & 0o170000) === 0) {
      unixMode = (unixMode & 0o7777) | resolveUnixTypeBits(kind);
    }
    unixMode = clampUint16(unixMode);
  }

  // If no Unix mode specified, keep Unix bits empty.
  const unixBits = unixMode ?? 0;
  const externalAttributes = ((unixBits & 0xffff) << 16) | dosAttrs;

  const os = unixMode !== undefined || kind === "symlink" ? ZIP_OS_UNIX : ZIP_OS_MSDOS;
  const versionMadeBy = zipVersionMadeBy(os);

  return { externalAttributes: externalAttributes >>> 0, versionMadeBy };
}

export function resolveZipExternalAttributesAndVersionMadeBy(input: {
  name: string;
  mode?: number;
  msDosAttributes?: number;
  externalAttributes?: number;
  versionMadeBy?: number;
}): { externalAttributes: number; versionMadeBy?: number } {
  if (input.externalAttributes !== undefined) {
    return { externalAttributes: input.externalAttributes, versionMadeBy: input.versionMadeBy };
  }

  const kind = resolveZipEntryKind(input.name, input.mode);
  const attrs = buildZipExternalAttributes({
    kind,
    mode: input.mode,
    msDosAttributes: input.msDosAttributes
  });

  return {
    externalAttributes: attrs.externalAttributes,
    versionMadeBy: input.versionMadeBy ?? attrs.versionMadeBy
  };
}
