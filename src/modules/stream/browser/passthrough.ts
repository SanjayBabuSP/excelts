/**
 * Browser Stream - PassThrough
 */

import type { TransformStreamOptions } from "@stream/types";

import { Transform } from "./transform";

// =============================================================================
// PassThrough Stream
// =============================================================================

/**
 * A passthrough stream that passes data through unchanged
 */
export class PassThrough<T = Uint8Array> extends Transform<T, T> {
  constructor(options?: TransformStreamOptions & { allowHalfOpen?: boolean }) {
    super({
      ...options,
      transform: chunk => chunk
    });
  }
}
