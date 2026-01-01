/**
 * Example: duplexPair() (cross-platform, objectMode)
 *
 * Demonstrates:
 * - Creating an in-memory pair of connected Duplex streams
 * - Sending messages both directions
 * - A tiny "server" that responds to client messages
 */

import { duplexPair, finished } from "../index";

export async function exampleDuplexPairObjectMode(): Promise<void> {
  const [client, server] = duplexPair({ objectMode: true });

  const clientReceived: unknown[] = [];
  client.on("data", (chunk: unknown) => clientReceived.push(chunk));

  server.on("data", (chunk: unknown) => {
    server.write({ type: "echo", value: chunk });
    if (chunk === "bye") {
      server.end();
    }
  });

  client.write("hello");
  client.write("bye");

  await Promise.all([finished(client), finished(server)]);

  console.log(clientReceived);
}
