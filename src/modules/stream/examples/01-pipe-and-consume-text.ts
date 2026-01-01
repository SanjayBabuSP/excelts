/**
 * Example: pipe() + text() consumer (cross-platform)
 *
 * Demonstrates:
 * - Creating a Readable from a string
 * - Transforming Uint8Array chunks
 * - Using pipe() (works with the module's own streams)
 * - Consuming the output as text
 */

import { fromString, text, transform } from "../index";

export async function examplePipeAndConsumeText(): Promise<void> {
  const source = fromString("Hello\nworld\n");

  const upper = transform<Uint8Array, Uint8Array>(chunk => {
    const s = new TextDecoder().decode(chunk);
    return new TextEncoder().encode(s.toUpperCase());
  });

  source.pipe(upper);

  const result = await text(upper);
  console.log(result);
}
