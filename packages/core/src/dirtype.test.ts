import { describe, expect, it } from "vitest";
import { classifyDirectory } from "./dirtype.js";

const base = { audioCount: 0, fileCount: 0, childDirCount: 0, isRip: false, isMultidiscParent: false };

describe("classifyDirectory", () => {
  it("ALBUM for an audio-only leaf", () => {
    expect(classifyDirectory({ ...base, audioCount: 10, fileCount: 12 })).toBe("ALBUM");
  });
  it("ALBUM_RIP when flagged as a rip", () => {
    expect(classifyDirectory({ ...base, audioCount: 1, fileCount: 2, isRip: true })).toBe("ALBUM_RIP");
  });
  it("MULTIDISC_PARENT / MULTIDISC_CHILD", () => {
    expect(classifyDirectory({ ...base, isMultidiscParent: true, childDirCount: 2 })).toBe("MULTIDISC_PARENT");
    expect(classifyDirectory({ ...base, audioCount: 10, discNumber: 1 })).toBe("MULTIDISC_CHILD");
  });
  it("NON_AUDIO and MIXED", () => {
    expect(classifyDirectory({ ...base, audioCount: 0, fileCount: 3 })).toBe("NON_AUDIO");
    expect(classifyDirectory({ ...base, audioCount: 5, fileCount: 6, childDirCount: 2 })).toBe("MIXED");
  });
});
