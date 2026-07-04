import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { walk, type WalkEntry } from "./walk.js";

async function collect(root: string): Promise<WalkEntry[]> {
  const out: WalkEntry[] = [];
  for await (const e of walk(root)) out.push(e);
  return out;
}

describe("walk", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "mdb-walk-"));
    await writeFile(path.join(dir, "a.txt"), "a");
    await writeFile(path.join(dir, ".hidden"), "h");
    await mkdir(path.join(dir, "sub"));
    await writeFile(path.join(dir, "sub", "b.mp3"), "b");
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("yields all files and dirs incl. hidden, with posix relPaths", async () => {
    const rels = (await collect(dir)).map((e) => e.relPath).sort();
    expect(rels).toEqual([".hidden", "a.txt", "sub", "sub/b.mp3"]);
  });

  it("yields a directory before its children (pre-order)", async () => {
    const entries = await collect(dir);
    const subIdx = entries.findIndex((e) => e.relPath === "sub");
    const childIdx = entries.findIndex((e) => e.relPath === "sub/b.mp3");
    expect(subIdx).toBeGreaterThanOrEqual(0);
    expect(subIdx).toBeLessThan(childIdx);
    expect(entries.find((e) => e.relPath === "sub")?.isDir).toBe(true);
    expect(entries.find((e) => e.relPath === "sub/b.mp3")?.parentRelPath).toBe("sub");
  });

  it("does not loop on a symlink cycle", async () => {
    let supported = true;
    try {
      await symlink(dir, path.join(dir, "sub", "loop"), "dir");
    } catch {
      supported = false;
    }
    if (!supported) return;
    const entries = await collect(dir);
    // terminates, and the loop link is recorded but not recursed into infinitely
    expect(entries.some((e) => e.relPath === "sub/loop")).toBe(true);
    expect(entries.length).toBeLessThan(50);
  });
});
