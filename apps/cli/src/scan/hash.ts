/**
 * Content hashing (spec §6/§13). xxhash64 via hash-wasm — no native build, so
 * the same code runs identically on PC and Mac. Streamed so we never load a
 * whole (possibly multi-GB) file into memory.
 */
import { createReadStream } from "node:fs";
import { createXXHash64 } from "hash-wasm";

export const HASH_ALGO = "xxhash64";

export async function hashFile(absPath: string): Promise<string> {
  const hasher = await createXXHash64();
  hasher.init();
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(absPath);
    stream.on("data", (chunk) => hasher.update(chunk as Uint8Array));
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
  return hasher.digest("hex");
}

/** Hash an in-memory buffer/string (used in tests and for small inputs). */
export async function hashBuffer(data: Uint8Array | string): Promise<string> {
  const hasher = await createXXHash64();
  hasher.init();
  hasher.update(data);
  return hasher.digest("hex");
}
