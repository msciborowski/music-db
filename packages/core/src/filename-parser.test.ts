import { describe, expect, it } from "vitest";
import { parseFilename } from "./filename-parser.js";

describe("parseFilename", () => {
  it("Artist - Title", () => {
    expect(parseFilename("Republika - Nieustanne Tango.mp3")).toEqual({
      artist: "Republika",
      title: "Nieustanne Tango",
      trackNo: undefined,
      ambiguous: false,
    });
  });

  it("01 - Artist - Title", () => {
    expect(parseFilename("01 - Republika - Fanatycy Ognia.flac")).toEqual({
      artist: "Republika",
      title: "Fanatycy Ognia",
      trackNo: 1,
      ambiguous: false,
    });
  });

  it("01 - Title (artist from folder/tag)", () => {
    expect(parseFilename("03 - Sam Tytuł.mp3")).toEqual({
      artist: undefined,
      title: "Sam Tytuł",
      trackNo: 3,
      ambiguous: false,
    });
  });

  it("01. Title", () => {
    expect(parseFilename("07. Intro.mp3")).toMatchObject({ title: "Intro", trackNo: 7 });
  });

  it("01_Title", () => {
    expect(parseFilename("12_Outro.mp3")).toMatchObject({ title: "Outro", trackNo: 12 });
  });

  it("Artist - Album - 01 - Title (ambiguous)", () => {
    const r = parseFilename("Kult - Posłuchaj to do Ciebie - 05 - Arahja.mp3");
    expect(r.artist).toBe("Kult");
    expect(r.title).toBe("Arahja");
    expect(r.trackNo).toBe(5);
    expect(r.ambiguous).toBe(true);
  });

  it("vinyl side A1", () => {
    expect(parseFilename("A1 - Intro.mp3")).toMatchObject({ title: "Intro", trackNo: 1 });
  });

  it("title only, no structure", () => {
    expect(parseFilename("SomeTrack.mp3")).toEqual({
      artist: undefined,
      title: "SomeTrack",
      trackNo: undefined,
      ambiguous: false,
    });
  });
});
