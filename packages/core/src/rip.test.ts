import { describe, expect, it } from "vitest";
import { classifyRip } from "./rip.js";

describe("classifyRip", () => {
  it("flags a long single file with a cue as a rip needing split", () => {
    expect(classifyRip({ durationSec: 2700, dirAudioCount: 1, cueReferencesThisFile: true })).toEqual({
      isAlbumRip: true,
      needsSplit: true,
    });
  });
  it("does not flag an already-split album (many short tracks + cue)", () => {
    expect(classifyRip({ durationSec: 210, dirAudioCount: 12, cueReferencesThisFile: true })).toEqual({
      isAlbumRip: false,
      needsSplit: false,
    });
  });
  it("does not flag a normal long track without a cue", () => {
    expect(classifyRip({ durationSec: 2700, dirAudioCount: 1, cueReferencesThisFile: false })).toEqual({
      isAlbumRip: false,
      needsSplit: false,
    });
  });
});
