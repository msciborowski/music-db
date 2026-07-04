import { describe, expect, it } from "vitest";
import { reconcile, stripJunk, titleFromFilename } from "./reconcile.js";

describe("stripJunk", () => {
  it("removes trailing junk", () => {
    expect(stripJunk("Dni Których Jeszcze Nie Znamy by husky40")).toBe("Dni Których Jeszcze Nie Znamy");
    expect(stripJunk("Song (Official Video)")).toBe("Song");
    expect(stripJunk("Song [Explicit]")).toBe("Song");
  });
  it("leaves clean titles alone", () => {
    expect(stripJunk("Nieustanne Tango")).toBe("Nieustanne Tango");
  });
});

describe("titleFromFilename", () => {
  it("strips a bare leading number only with directory sequence", () => {
    expect(titleFromFilename("13 Eye Of The Tiger.mp3", true)).toMatchObject({ title: "Eye Of The Tiger", trackNo: 13 });
    expect(titleFromFilename("13 Eye Of The Tiger.mp3", false).title).toBe("13 Eye Of The Tiger");
  });
  it("splits Artist - Title", () => {
    expect(titleFromFilename("Bednarek - Dni Których Jeszcze Nie Znamy.mp3", false)).toMatchObject({
      artist: "Bednarek",
      title: "Dni Których Jeszcze Nie Znamy",
    });
  });
});

describe("reconcile", () => {
  it("prefers tags, falling back to filename", () => {
    const r = reconcile({
      tagTitle: "Eye of the Tiger",
      tagArtist: "Survivor",
      tagTrackNo: 13,
      filename: "13 eye of the tiger.mp3",
      dirHasSequence: true,
    });
    expect(r).toMatchObject({ resolvedTitle: "Eye of the Tiger", resolvedArtist: "Survivor", resolvedTrackNo: 13, resolvedSource: "TAG" });
  });

  it("derives from filename with sequence context when no tags", () => {
    const r = reconcile({
      filename: "13 Eye Of The Tiger.mp3",
      dirHasSequence: true,
    });
    expect(r).toMatchObject({ resolvedTitle: "Eye Of The Tiger", resolvedTrackNo: 13, resolvedSource: "FILENAME" });
  });

  it("infers artist/title and strips junk from a messy filename", () => {
    const r = reconcile({
      filename: "Bednarek - Dni Których Jeszcze Nie Znamy by husky40.mp3",
      dirHasSequence: false,
    });
    expect(r.resolvedArtist).toBe("Bednarek");
    expect(r.resolvedTitle).toBe("Dni Których Jeszcze Nie Znamy");
  });
});
