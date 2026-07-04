/**
 * MusicBrainz client (spec §11). Resolves a recording MBID to its Work (the
 * composition) — the authoritative grouping that beats our name heuristics.
 * No API key, but a descriptive User-Agent is required and calls are limited
 * to ~1/second.
 */
import type { RateLimiter } from "./ratelimit.js";

export const MUSICBRAINZ_BASE = "https://musicbrainz.org/ws/2";

export interface MbRecordingInfo {
  recordingMbid: string;
  recordingTitle?: string;
  artist?: string;
  workMbid?: string;
  workTitle?: string;
}

export function buildMbRecordingUrl(mbid: string): string {
  const params = new URLSearchParams({ inc: "artist-credits+work-rels", fmt: "json" });
  return `${MUSICBRAINZ_BASE}/recording/${encodeURIComponent(mbid)}?${params.toString()}`;
}

interface MbJson {
  id?: string;
  title?: string;
  "artist-credit"?: Array<{ name?: string; artist?: { name?: string } }>;
  relations?: Array<{ type?: string; "target-type"?: string; work?: { id?: string; title?: string } }>;
}

export function parseMbRecording(json: unknown): MbRecordingInfo {
  const data = json as MbJson;
  const artist = (data["artist-credit"] ?? [])
    .map((c) => c.name ?? c.artist?.name)
    .filter((s): s is string => !!s)
    .join(", ");
  const workRel = (data.relations ?? []).find((r) => r.type === "performance" && r.work?.id);
  return {
    recordingMbid: data.id ?? "",
    recordingTitle: data.title,
    artist: artist || undefined,
    workMbid: workRel?.work?.id,
    workTitle: workRel?.work?.title,
  };
}

export interface MbResult {
  info: MbRecordingInfo;
  raw: unknown;
}

export async function mbRecordingLookup(
  mbid: string,
  userAgent: string,
  deps: { limiter: RateLimiter; fetchImpl?: typeof fetch },
): Promise<MbResult> {
  const doFetch = deps.fetchImpl ?? fetch;
  await deps.limiter.acquire();
  const res = await doFetch(buildMbRecordingUrl(mbid), { headers: { "User-Agent": userAgent }, signal: AbortSignal.timeout(20_000) });
  const raw = await res.json();
  return { info: parseMbRecording(raw), raw };
}
