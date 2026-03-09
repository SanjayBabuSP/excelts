/**
 * Browser-only Encryptor
 * Uses Web Crypto API (hardware accelerated)
 */

import { base64ToUint8Array, uint8ArrayToBase64, stringToUtf16Le } from "@utils/utils.base";
import { concatUint8Arrays } from "@utils/binary";

// Helper to convert number to little-endian Uint8Array
function uint32ToLe(num: number): Uint8Array {
  const arr = new Uint8Array(4);
  arr[0] = num & 0xff;
  arr[1] = (num >> 8) & 0xff;
  arr[2] = (num >> 16) & 0xff;
  arr[3] = (num >> 24) & 0xff;
  return arr;
}

const Encryptor = {
  /**
   * Calculate hash using Web Crypto API
   */
  async hash(algorithm: string, ...buffers: Uint8Array[]): Promise<Uint8Array> {
    const data = concatUint8Arrays(buffers);
    const hashBuffer = await crypto.subtle.digest(algorithm, new Uint8Array(data));
    return new Uint8Array(hashBuffer);
  },

  /**
   * Convert password to hash
   */
  async convertPasswordToHash(
    password: string,
    hashAlgorithm: string,
    saltValue: string,
    spinCount: number
  ): Promise<string> {
    const passwordBuffer = stringToUtf16Le(password);
    const saltBuffer = base64ToUint8Array(saltValue);

    let key = await this.hash(hashAlgorithm, saltBuffer, passwordBuffer);

    for (let i = 0; i < spinCount; i++) {
      key = await this.hash(hashAlgorithm, key, uint32ToLe(i));
    }

    return uint8ArrayToBase64(key);
  },

  /**
   * Generate cryptographically strong random bytes
   */
  randomBytes(size: number): Uint8Array {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    return bytes;
  }
};

export { Encryptor };
