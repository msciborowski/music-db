import { describe, expect, it } from "vitest";
import type { IAudioMetadata } from "music-metadata";
import { detectMojibake, mapMetadata } from "./metadata.js";

describe("detectMojibake", () => {
  it("flags cp1250-as-latin1 mojibake", () => {
    // "Żółć" mis-decoded: Å»Ã³Å‚Ä‡
    expect(detectMojibake("Å»Ã³Å‚Ä‡")).toBe("suspected-mojibake");
    expect(detectMojibake("normal", undefined, "�")).toBe("suspected-mojibake");
  });
  it("does not flag clean Polish text", () => {
    expect(detectMojibake("Żółć", "Główny", "Kraków")).toBeUndefined();
    expect(detectMojibake("Björk", "João")).toBeUndefined();
  });
});

describe("mapMetadata", () => {
  const meta = {
    format: {
      container: "MPEG",
      codec: "MPEG 1 Layer 3",
      duration: 254.3,
      bitrate: 320000,
      sampleRate: 44100,
      numberOfChannels: 2,
      lossless: false,
      tagTypes: ["ID3v2.3", "ID3v1"],
      codecProfile: "CBR",
    },
    common: {
      title: "Nieustanne Tango",
      artist: "Republika",
      album: "Nieustanne Tango",
      albumartist: "Republika",
      track: { no: 1, of: 10 },
      disk: { no: 1, of: 1 },
      year: 1984,
      genre: ["Rock"],
      comment: ["ripped by EAC"],
    },
  } as unknown as IAudioMetadata;

  it("maps technical + tag fields", () => {
    const a = mapMetadata(meta, "01 - Republika - Nieustanne Tango.mp3");
    expect(a).toMatchObject({
      codec: "MPEG 1 Layer 3",
      durationSec: 254.3,
      bitrate: 320000,
      bitrateMode: "CBR",
      sampleRate: 44100,
      channels: 2,
      lossless: false,
      tagArtist: "Republika",
      tagTrackNo: 1,
      tagYear: 1984,
      tagGenre: "Rock",
      tagComment: "ripped by EAC",
      hasId3v1: true,
      hasId3v2: true,
      id3v2Version: "2.3.0",
    });
  });

  it("also parses artist/title/track from the filename", () => {
    const a = mapMetadata(meta, "01 - Republika - Nieustanne Tango.mp3");
    expect(a.parsedArtist).toBe("Republika");
    expect(a.parsedTitle).toBe("Nieustanne Tango");
    expect(a.parsedTrackNo).toBe(1);
  });
});
