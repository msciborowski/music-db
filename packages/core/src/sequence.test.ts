import { describe, expect, it } from "vitest";
import { detectSequence, leadingTrackNumber } from "./sequence.js";

describe("leadingTrackNumber", () => {
  it("reads separator, bare and vinyl forms", () => {
    expect(leadingTrackNumber("01 - Song.mp3")).toMatchObject({ number: 1, kind: "separator", rest: "Song" });
    expect(leadingTrackNumber("13 Eye Of The Tiger.mp3")).toMatchObject({ number: 13, kind: "bare", rest: "Eye Of The Tiger" });
    expect(leadingTrackNumber("A2 Intro.mp3")).toMatchObject({ number: 2, kind: "vinyl" });
  });
  it("returns undefined without a leading number", () => {
    expect(leadingTrackNumber("Song.mp3")).toBeUndefined();
  });
});

describe("detectSequence", () => {
  it("detects a numbered album", () => {
    const names = ["01 A.mp3", "02 B.mp3", "03 C.mp3", "04 D.mp3"];
    expect(detectSequence(names).hasSequence).toBe(true);
  });
  it("does not treat a lone numeric artist as a sequence", () => {
    const names = ["50 Cent - In Da Club.mp3", "Song.mp3"];
    expect(detectSequence(names).hasSequence).toBe(false);
  });
  it("maps names to their leading numbers", () => {
    const info = detectSequence(["05 X.mp3", "Y.mp3"]);
    expect(info.numbers.get("05 X.mp3")).toBe(5);
    expect(info.numbers.get("Y.mp3")).toBeUndefined();
  });
});
