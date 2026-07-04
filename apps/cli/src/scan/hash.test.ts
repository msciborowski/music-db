import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HASH_ALGO, hashBuffer, hashFile } from "./hash.js";

describe("hashBuffer (xxhash64)", () => {
  it("matches known vectors", async () => {
    expect(await hashBuffer("")).toBe("ef46db3751d8e999");
    expect(await hashBuffer("abc")).toBe("44bc2cf5ad770999");
  });
  it("exposes the algorithm name", () => {
    expect(HASH_ALGO).toBe("xxhash64");
  });
});

describe("hashFile", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "mdb-hash-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  it("hashes file contents equal to the buffer hash", async () => {
    const file = path.join(dir, "x.bin");
    await writeFile(file, "abc");
    expect(await hashFile(file)).toBe(await hashBuffer("abc"));
  });
});
