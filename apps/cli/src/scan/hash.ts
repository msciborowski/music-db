/**
 * Content hashing (spec §6/§13). xxhash64 via hash-wasm — no native build, so
 * the same code runs identically on PC and Mac. Streamed so we never load a
 * whole (possibly multi-GB) file into memory.
 *
 * IMPORTANT: hashers are pooled and REUSED. Creating a new `createXXHash64()`
 * per file allocates a fresh WebAssembly instance each time; over hundreds of
 * thousands of files that leaks gigabytes (GC can't keep up) and OOMs. Reusing
 * a small pool (one per concurrent worker) keeps memory flat.
 */
import { createReadStream } from "node:fs";
import { createXXHash64 } from "hash-wasm";

export const HASH_ALGO = "xxhash64";

type Hasher = Awaited<ReturnType<typeof createXXHash64>>;

const pool: Hasher[] = [];

async function acquireHasher(): Promise<Hasher> {
  return pool.pop() ?? (await createXXHash64());
}

function releaseHasher(hasher: Hasher): void {
  pool.push(hasher);
}

export async function hashFile(absPath: string): Promise<string> {
  const hasher = await acquireHasher();
  try {
    hasher.init();
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(absPath);
      stream.on("data", (chunk) => hasher.update(chunk as Uint8Array));
      stream.on("end", () => resolve());
      stream.on("error", reject);
    });
    return hasher.digest("hex");
  } finally {
    releaseHasher(hasher);
  }
}

/** Hash an in-memory buffer/string (used in tests and for small inputs). */
export async function hashBuffer(data: Uint8Array | string): Promise<string> {
  const hasher = await acquireHasher();
  try {
    hasher.init();
    hasher.update(data);
    return hasher.digest("hex");
  } finally {
    releaseHasher(hasher);
  }
}
