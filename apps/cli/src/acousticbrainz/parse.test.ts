import { describe, expect, it } from "vitest";
import { extractAbFeatures } from "./parse.js";

describe("extractAbFeatures", () => {
  it("pulls mbid, bpm and key (as Camelot)", () => {
    const doc = {
      metadata: { tags: { musicbrainz_recordingid: ["mbid-123"] } },
      rhythm: { bpm: 128.4 },
      tonal: { key_key: "A", key_scale: "minor" },
    };
    expect(extractAbFeatures(doc)).toEqual({ mbid: "mbid-123", bpm: 128.4, keyKey: "A", keyScale: "minor", camelot: "8A" });
  });
  it("handles missing fields", () => {
    expect(extractAbFeatures({})).toEqual({ mbid: undefined, bpm: undefined, keyKey: undefined, keyScale: undefined, camelot: undefined });
  });
});
