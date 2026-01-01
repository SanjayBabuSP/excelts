/**
 * Example: pipeline() (cross-platform, objectMode)
 *
 * Demonstrates:
 * - Using pipeline() to connect streams with proper error handling
 * - objectMode streams (strings in, strings out)
 *
 * pipeline() is usually preferred over manual pipe() chains when you want
 * a single Promise you can await and centralized error/cleanup handling.
 */

import { createCollector, createReadableFromArray, createTransform, pipeline } from "../index";

export async function examplePipelineObjectMode(): Promise<void> {
  const source = createReadableFromArray(["hello", "world"], { objectMode: true });

  const upper = createTransform<string, string>(s => s.toUpperCase(), {
    objectMode: true
  });

  const collector = createCollector<string>();

  await pipeline(source, upper, collector);

  console.log(collector.chunks);
}
