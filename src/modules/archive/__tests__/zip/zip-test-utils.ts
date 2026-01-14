export const ZIP64_EOCD_SIG = 0x06064b50;
export const ZIP64_EOCD_LOCATOR_SIG = 0x07064b50;
export const EOCD_SIG = 0x06054b50;
export const CENTRAL_DIR_SIG = 0x02014b50;

export function hasSignature(
  data: Uint8Array,
  signature: number,
  start: number,
  end: number
): boolean {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const min = Math.max(0, start);
  const max = Math.min(data.length - 4, end);
  for (let i = min; i <= max; i++) {
    if (view.getUint32(i, true) === signature) {
      return true;
    }
  }
  return false;
}

export function findSignatureFromEnd(
  data: Uint8Array,
  signature: number,
  maxSearchBytes = 1024 * 1024
): number {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const start = Math.max(0, data.length - 4 - maxSearchBytes);
  for (let i = data.length - 4; i >= start; i--) {
    if (view.getUint32(i, true) === signature) {
      return i;
    }
  }
  return -1;
}

export function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function readUint64LE(view: DataView, offset: number): bigint {
  return view.getBigUint64(offset, true);
}
