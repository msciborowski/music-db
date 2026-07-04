import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decodeBuffer, readCueFile } from "./cue.js";

describe("decodeBuffer", () => {
  it("decodes UTF-8 and reports an encoding", () => {
    const { text, encoding } = decodeBuffer(new TextEncoder().encode("Żółć"));
    expect(text).toBe("Żółć");
    expect(typeof encoding).toBe("string");
  });
});

describe("readCueFile", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "mdb-cue-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads and parses a .cue", async () => {
    const cue = path.join(dir, "album.cue");
    await writeFile(
      cue,
      'FILE "album.flac" WAVE\n  TRACK 01 AUDIO\n    TITLE "One"\n    INDEX 01 00:00:00\n  TRACK 02 AUDIO\n    TITLE "Two"\n    INDEX 01 03:00:00\n',
    );
    const r = await readCueFile(cue);
    expect(r.fileRef).toBe("album.flac");
    expect(r.parseStatus).toBe("OK");
    expect(r.tracks).toHaveLength(2);
    expect(r.tracks[0]).toMatchObject({ trackNo: 1, title: "One", startMs: 0, endMs: 180000 });
    expect(typeof r.rawText).toBe("string");
    expect(typeof r.encodingGuess).toBe("string");
  });
});
