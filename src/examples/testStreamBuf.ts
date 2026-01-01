import { StreamBuf } from "../utils/stream-buf";

const sb = new StreamBuf({ bufSize: 64 });
sb.write("Hello, World!");
const chunk = sb.read();
console.log(`Chunk: ${chunk}`);
// Convert to UTF-8 string using TextDecoder (cross-platform)
const text = new TextDecoder().decode(chunk);
console.log(`to UTF8: ${text}`);
