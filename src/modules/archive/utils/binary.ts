/**
 * Tiny binary reader for Uint8Array-backed DataView.
 * Shared by ZIP parsers.
 */

import { decodeLatin1, decodeUtf8 } from "./text";

export function writeUint32LE(value: number): Uint8Array {
  const out = new Uint8Array(4);
  const view = new DataView(out.buffer);
  view.setUint32(0, value >>> 0, true);
  return out;
}

export function readUint32LE(data: Uint8Array, offset: number): number {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getUint32(offset, true);
}

export class BinaryReader {
  private view: DataView;
  private offset: number;
  private data: Uint8Array;

  constructor(data: Uint8Array, offset = 0) {
    this.data = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.offset = offset;
  }

  get position(): number {
    return this.offset;
  }

  set position(value: number) {
    this.offset = value;
  }

  get remaining(): number {
    return this.data.length - this.offset;
  }

  readUint8(): number {
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  readUint16(): number {
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  readUint32(): number {
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readBigUint64(): bigint {
    const value = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return value;
  }

  readBytes(length: number): Uint8Array {
    const bytes = this.data.subarray(this.offset, this.offset + length);
    this.offset += length;
    return bytes;
  }

  readString(length: number, utf8 = true): string {
    const bytes = this.readBytes(length);
    return utf8 ? decodeUtf8(bytes) : decodeLatin1(bytes);
  }

  skip(length: number): void {
    this.offset += length;
  }

  slice(start: number, end: number): Uint8Array {
    return this.data.subarray(start, end);
  }

  peekUint32(offset: number): number {
    return this.view.getUint32(offset, true);
  }
}
