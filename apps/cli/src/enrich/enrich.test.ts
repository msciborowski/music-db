import { describe, expect, it } from "vitest";
import { buildAcoustidUrl, parseAcoustidResponse } from "./acoustid.js";
import { buildDiscogsSearchUrl, parseDiscogsSearch } from "./discogs.js";
import { buildMbRecordingUrl, parseMbRecording } from "./musicbrainz.js";
import { RateLimiter } from "./ratelimit.js";

describe("RateLimiter", () => {
  it("spaces successive calls by the minimum interval", async () => {
    let clock = 1000;
    const slept: number[] = [];
    const limiter = new RateLimiter(1000, {
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms);
        clock += ms;
      },
    });
    await limiter.acquire(); // first: no wait
    await limiter.acquire(); // second: waits full interval
    await limiter.acquire();
    expect(slept).toEqual([1000, 1000]);
  });
});

describe("AcoustID", () => {
  it("builds a lookup URL", () => {
    const url = buildAcoustidUrl("KEY", "AQADtEmi", 254.6);
    expect(url).toContain("client=KEY");
    expect(url).toContain("duration=255");
    expect(url).toContain("fingerprint=AQADtEmi");
    expect(url).toContain("meta=recordings");
  });
  it("parses recordings sorted by score", () => {
    const json = {
      status: "ok",
      results: [
        { score: 0.7, recordings: [{ id: "rec-low", title: "A", artists: [{ name: "X" }] }] },
        { score: 0.95, recordings: [{ id: "rec-high", title: "B", artists: [{ name: "Y" }] }] },
      ],
    };
    const recs = parseAcoustidResponse(json);
    expect(recs[0]).toMatchObject({ recordingMbid: "rec-high", artist: "Y", score: 0.95 });
    expect(recs).toHaveLength(2);
  });
  it("returns empty on error status", () => {
    expect(parseAcoustidResponse({ status: "error", error: { message: "bad key" } })).toEqual([]);
  });
});

describe("MusicBrainz", () => {
  it("builds a recording URL with work-rels", () => {
    expect(buildMbRecordingUrl("abc-123")).toContain("/recording/abc-123?");
    expect(buildMbRecordingUrl("abc-123")).toContain("inc=artist-credits%2Bwork-rels");
  });
  it("parses recording -> work + artist", () => {
    const json = {
      id: "rec-1",
      title: "Titanium",
      "artist-credit": [{ name: "David Guetta" }],
      relations: [{ type: "performance", "target-type": "work", work: { id: "work-9", title: "Titanium" } }],
    };
    expect(parseMbRecording(json)).toMatchObject({
      recordingMbid: "rec-1",
      artist: "David Guetta",
      workMbid: "work-9",
      workTitle: "Titanium",
    });
  });
});

describe("Discogs", () => {
  it("builds a search URL with token", () => {
    const url = buildDiscogsSearchUrl("TOK", "Republika Nieustanne Tango");
    expect(url).toContain("type=release");
    expect(url).toContain("token=TOK");
    expect(url).toContain("q=Republika+Nieustanne+Tango");
  });
  it("parses the first result", () => {
    const json = { results: [{ id: 42, title: "Republika - Nieustanne Tango", year: "1984", genre: ["Rock"], style: ["New Wave"] }] };
    expect(parseDiscogsSearch(json)).toEqual({ discogsId: 42, title: "Republika - Nieustanne Tango", year: 1984, genres: ["Rock"], styles: ["New Wave"] });
  });
  it("returns null when no results", () => {
    expect(parseDiscogsSearch({ results: [] })).toBeNull();
  });
});
