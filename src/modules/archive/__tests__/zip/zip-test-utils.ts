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
