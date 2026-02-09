/**
 * Node.js Stream - Pipeline
 *
 * Pipeline and stream normalization for Node.js.
 */

import {
  Readable,
  Writable as NodeWritable,
  Transform,
  Duplex,
  pipeline as nodePipeline
} from "stream";
import type { PipelineStreamLike } from "@stream/types";
import type { PipelineOptions, PipelineCallback } from "@stream/common/options";
import { isPipelineOptions } from "@stream/common/options";
import {
  isReadableStream,
  isTransformStream,
  isWritableStream
} from "@stream/internal/type-guards";

// Re-export for consumers
export type { PipelineOptions } from "@stream/common/options";
export { isPipelineOptions } from "@stream/common/options";

// =============================================================================
// Pipeline
// =============================================================================

type PipelineStream = PipelineStreamLike;

export const toNodePipelineStream = (stream: PipelineStream): unknown => {
  // Node native streams (Readable/Transform/Duplex/Writable) are already compatible.
  if (
    stream instanceof Readable ||
    stream instanceof Transform ||
    stream instanceof Duplex ||
    stream instanceof NodeWritable
  ) {
    return stream;
  }

  if (isTransformStream(stream)) {
    return (Transform as any).fromWeb(stream as any);
  }
  if (isReadableStream(stream)) {
    return (Readable as any).fromWeb(stream as any);
  }
  if (isWritableStream(stream)) {
    return (NodeWritable as any).fromWeb(stream as any);
  }

  return stream;
};

/**
 * Pipeline streams together with proper error handling and cleanup.
 * Node.js compatible with support for options and callbacks.
 */
export function pipeline(
  ...args: [...PipelineStream[], PipelineOptions | PipelineCallback] | PipelineStream[]
): Promise<void> {
  let streams: PipelineStream[];
  let options: PipelineOptions | undefined;
  let callback: PipelineCallback | undefined;

  const lastArg = args[args.length - 1] as unknown;

  if (typeof lastArg === "function") {
    callback = lastArg as PipelineCallback;
    streams = args.slice(0, -1) as PipelineStream[];
  } else if (isPipelineOptions(lastArg)) {
    options = lastArg;
    streams = args.slice(0, -1) as PipelineStream[];
  } else {
    streams = args as PipelineStream[];
  }

  const normalizedStreams = streams.map(toNodePipelineStream);

  const promise = new Promise<void>((resolve, reject) => {
    if (streams.length < 2) {
      reject(new Error("Pipeline requires at least 2 streams"));
      return;
    }

    const done = (err?: Error | null): void => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    };

    if (options) {
      (nodePipeline as any)(...normalizedStreams, options, done);
    } else {
      (nodePipeline as any)(...normalizedStreams, done);
    }
  });

  if (callback) {
    promise.then(() => callback!()).catch(err => callback!(err));
  }

  return promise;
}
