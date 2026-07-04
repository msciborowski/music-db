import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isInteractive, validateScanPath } from "./wizard.js";

describe("validateScanPath", () => {
  let dir: string;
  let file: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "mdb-wiz-"));
    file = path.join(dir, "f.txt");
    await writeFile(file, "x");
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("accepts an existing directory", () => {
    expect(validateScanPath(dir)).toBeUndefined();
  });
  it("rejects empty, missing, and non-directory paths", () => {
    expect(validateScanPath("")).toMatch(/ścieżkę/i);
    expect(validateScanPath(path.join(dir, "nope"))).toMatch(/nie istnieje/i);
    expect(validateScanPath(file)).toMatch(/katalog/i);
  });
});

describe("isInteractive", () => {
  it("is false under a non-TTY test runner", () => {
    expect(isInteractive()).toBe(false);
  });
});
