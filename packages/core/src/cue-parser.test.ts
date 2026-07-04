import { describe, expect, it } from "vitest";
import { cueTimeToMs, parseCue } from "./cue-parser.js";

describe("cueTimeToMs", () => {
  it("converts mm:ss:ff (75 fps)", () => {
    expect(cueTimeToMs("00:00:00")).toBe(0);
    expect(cueTimeToMs("03:12:00")).toBe(192_000);
    expect(cueTimeToMs("00:00:75")).toBe(1000); // 75 frames = 1s (rounded)
    expect(cueTimeToMs("01:30:37")).toBe(90_493);
  });
  it("returns undefined for garbage", () => {
    expect(cueTimeToMs("nope")).toBeUndefined();
  });
});

const SAMPLE = `REM GENRE Rock
PERFORMER "Kult"
TITLE "Kult"
FILE "Kult - Kult.flac" WAVE
  TRACK 01 AUDIO
    TITLE "Wódka"
    PERFORMER "Kult"
    INDEX 01 00:00:00
  TRACK 02 AUDIO
    TITLE "Do Ani"
    INDEX 00 03:10:00
    INDEX 01 03:12:00
`;

describe("parseCue", () => {
  it("parses file ref, album fields and tracks", () => {
    const r = parseCue(SAMPLE);
    expect(r.parseStatus).toBe("OK");
    expect(r.fileRef).toBe("Kult - Kult.flac");
    expect(r.albumTitle).toBe("Kult");
    expect(r.albumPerformer).toBe("Kult");
    expect(r.tracks).toHaveLength(2);
  });

  it("computes startMs from INDEX 01 and endMs from next track", () => {
    const r = parseCue(SAMPLE);
    expect(r.tracks[0]).toMatchObject({ trackNo: 1, title: "Wódka", startMs: 0, endMs: 192_000 });
    expect(r.tracks[1]).toMatchObject({ trackNo: 2, title: "Do Ani", startMs: 192_000 });
    expect(r.tracks[1]?.endMs).toBeUndefined(); // last track filled by caller
  });

  it("prefers INDEX 01 over INDEX 00 pregap", () => {
    const r = parseCue(SAMPLE);
    expect(r.tracks[1]?.startMs).toBe(192_000);
  });

  it("marks PARTIAL when no FILE or no tracks", () => {
    expect(parseCue('TITLE "x"').parseStatus).toBe("PARTIAL");
    expect(parseCue('FILE "a.flac" WAVE').parseStatus).toBe("PARTIAL");
  });
});
