export function sumUint8ArrayLengths(arrays: readonly Uint8Array[]): number {
  let totalLength = 0;
  for (let i = 0; i < arrays.length; i++) {
    totalLength += arrays[i].length;
  }
  return totalLength;
}

export function concatUint8Arrays(arrays: readonly Uint8Array[]): Uint8Array {
  const len = arrays.length;
  if (len === 0) {
    return new Uint8Array(0);
  }
  if (len === 1) {
    return arrays[0];
  }

  const totalLength = sumUint8ArrayLengths(arrays);
  const result = new Uint8Array(totalLength);

  let offset = 0;
  for (let i = 0; i < len; i++) {
    const arr = arrays[i];
    result.set(arr, offset);
    offset += arr.length;
  }

  return result;
}

/**
 * Find the first index of `pattern` within `buffer`.
 * Returns -1 when not found.
 */
export function indexOfUint8ArrayPattern(
  buffer: Uint8Array,
  pattern: Uint8Array,
  startIndex = 0
): number {
  const bufLen = buffer.length;
  const patLen = pattern.length;
  if (patLen === 0) {
    return 0;
  }
  if (patLen > bufLen) {
    return -1;
  }

  let start = startIndex | 0;
  if (start < 0) {
    start = 0;
  }
  if (start > bufLen - patLen) {
    return -1;
  }

  // Fast paths for small patterns (very common in ZIP parsing: 2/3/4-byte signatures).
  if (patLen === 1) {
    return buffer.indexOf(pattern[0], start);
  }

  if (patLen === 2) {
    const p0 = pattern[0];
    const p1 = pattern[1];
    const last = bufLen - 2;
    let i = buffer.indexOf(p0, start);
    while (i !== -1 && i <= last) {
      if (buffer[i + 1] === p1) {
        return i;
      }
      i = buffer.indexOf(p0, i + 1);
    }
    return -1;
  }

  if (patLen === 3) {
    const p0 = pattern[0];
    const p1 = pattern[1];
    const p2 = pattern[2];
    const last = bufLen - 3;
    let i = buffer.indexOf(p0, start);
    while (i !== -1 && i <= last) {
      if (buffer[i + 1] === p1 && buffer[i + 2] === p2) {
        return i;
      }
      i = buffer.indexOf(p0, i + 1);
    }
    return -1;
  }

  if (patLen === 4) {
    const p0 = pattern[0];
    const p1 = pattern[1];
    const p2 = pattern[2];
    const p3 = pattern[3];
    const last = bufLen - 4;
    let i = buffer.indexOf(p0, start);
    while (i !== -1 && i <= last) {
      if (buffer[i + 1] === p1 && buffer[i + 2] === p2 && buffer[i + 3] === p3) {
        return i;
      }
      i = buffer.indexOf(p0, i + 1);
    }
    return -1;
  }

  outer: for (let i = start; i <= bufLen - patLen; i++) {
    for (let j = 0; j < patLen; j++) {
      if (buffer[i + j] !== pattern[j]) {
        continue outer;
      }
    }
    return i;
  }
  return -1;
}
