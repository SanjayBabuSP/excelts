/**
 * Node.js Encryptor - uses native crypto module
 */

import crypto from "crypto";
import { base64ToUint8Array, uint8ArrayToBase64, stringToUtf16Le } from "./utils.base";
import { concatUint8Arrays } from "../modules/stream";

function uint32ToLe(num: number): Uint8Array {
  const arr = new Uint8Array(4);
  arr[0] = num & 0xff;
  arr[1] = (num >> 8) & 0xff;
  arr[2] = (num >> 16) & 0xff;
  arr[3] = (num >> 24) & 0xff;
  return arr;
}

const Encryptor = {
  hash(algorithm: string, ...buffers: Uint8Array[]): Uint8Array {
    const algo = algorithm.toLowerCase().replace(/-/g, "");
    const hash = crypto.createHash(algo);
    hash.update(concatUint8Arrays(buffers));
    return new Uint8Array(hash.digest());
  },

  async convertPasswordToHash(
    password: string,
    hashAlgorithm: string,
    saltValue: string,
    spinCount: number
  ): Promise<string> {
    const passwordBuffer = stringToUtf16Le(password);
    const saltBuffer = base64ToUint8Array(saltValue);

    let key = this.hash(hashAlgorithm, saltBuffer, passwordBuffer);
    for (let i = 0; i < spinCount; i++) {
      key = this.hash(hashAlgorithm, key, uint32ToLe(i));
    }

    return uint8ArrayToBase64(key);
  },

  randomBytes(size: number): Uint8Array {
    return new Uint8Array(crypto.randomBytes(size));
  }
};

export { Encryptor };
