import { describe, expect, it } from "vitest";
import {
  filenameKeys,
  flattenDiacritics,
  normalizeName,
  normalizeNameAscii,
  normalizeTitle,
  stripExtension,
} from "./normalize.js";

describe("stripExtension", () => {
  it("removes a trailing extension", () => {
    expect(stripExtension("song.mp3")).toBe("song");
    expect(stripExtension("a.b.flac")).toBe("a.b");
  });
  it("keeps dotfiles intact", () => {
    expect(stripExtension(".DS_Store")).toBe(".DS_Store");
  });
  it("returns unchanged when no extension", () => {
    expect(stripExtension("README")).toBe("README");
  });
});

describe("flattenDiacritics", () => {
  it("flattens Polish diacritics incl. ł", () => {
    expect(flattenDiacritics("Żółć")).toBe("Zolc");
    expect(flattenDiacritics("Łódź")).toBe("Lodz");
    expect(flattenDiacritics("ąęćńóśź")).toBe("aecnosz");
  });
});

describe("normalizeName", () => {
  it("applies the full §8 pipeline", () => {
    expect(normalizeName("01 - Republika - Nieustanne Tango.mp3")).toBe(
      "republika nieustanne tango",
    );
  });
  it("strips various leading track numbers", () => {
    expect(normalizeName("01. Title.mp3")).toBe("title");
    expect(normalizeName("01_Title.flac")).toBe("title");
    expect(normalizeName("1) Title.mp3")).toBe("title");
  });
  it("strips vinyl side prefixes", () => {
    expect(normalizeName("A1 - Intro.mp3")).toBe("intro");
    expect(normalizeName("B2. Outro.mp3")).toBe("outro");
  });
  it("collapses separators and preserves diacritics", () => {
    expect(normalizeName("Żółć___test.mp3")).toBe("żółć test");
  });
  it("can skip extension and track-number stripping", () => {
    expect(normalizeName("01 - Title", { stripExt: false, stripTrackNo: false })).toBe(
      "01 title",
    );
  });
});

describe("normalizeNameAscii", () => {
  it("produces an ASCII fuzzy key", () => {
    expect(normalizeNameAscii("02 - Żółć - Łódź.mp3")).toBe("zolc lodz");
  });
});

describe("normalizeTitle", () => {
  it("does not strip leading numbers (titles may start with digits)", () => {
    expect(normalizeTitle("1984")).toBe("1984");
    expect(normalizeTitle("99 Luftballons")).toBe("99 luftballons");
  });
});

describe("filenameKeys", () => {
  it("returns lower, norm and normAscii", () => {
    expect(filenameKeys("01 - Żółć.MP3")).toEqual({
      lower: "01 - żółć.mp3",
      norm: "żółć",
      normAscii: "zolc",
    });
  });
});
