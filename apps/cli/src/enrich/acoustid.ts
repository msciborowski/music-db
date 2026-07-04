/**
 * AcoustID client (spec §11). Turns a Chromaprint fingerprint + duration into
 * candidate MusicBrainz recording IDs — the bridge from acoustic identity to a
 * canonical name. Needs a free API key (https://acoustid.org/api-key).
 */
import type { RateLimiter } from "./ratelimit.js";

export const ACOUSTID_ENDPOINT = "https://api.acoustid.org/v2/lookup";

export interface AcoustidRecording {
  recordingMbid: string;
  title?: string;
  artist?: string;
  /** AcoustID match score (0..1) of the parent result. */
  score: number;
}

export function buildAcoustidUrl(apiKey: string, fingerprint: string, durationSec: number): string {
  const params = new URLSearchParams({
    format: "json",
    client: apiKey,
    duration: String(Math.round(durationSec)),
    fingerprint,
    meta: "recordings",
  });
  return `${ACOUSTID_ENDPOINT}?${params.toString()}`;
}

interface AcoustidJson {
  status?: string;
  error?: { message?: string };
  results?: Array<{
    id?: string;
    score?: number;
    recordings?: Array<{ id?: string; title?: string; artists?: Array<{ name?: string }> }>;
  }>;
}

export function parseAcoustidResponse(json: unknown): AcoustidRecording[] {
  const data = json as AcoustidJson;
  if (data.status && data.status !== "ok") return [];
  const out: AcoustidRecording[] = [];
  for (const result of data.results ?? []) {
    const score = typeof result.score === "number" ? result.score : 0;
    for (const rec of result.recordings ?? []) {
      if (!rec.id) continue;
      out.push({
        recordingMbid: rec.id,
        title: rec.title,
        artist: rec.artists?.map((a) => a.name).filter(Boolean).join(", ") || undefined,
        score,
      });
    }
  }
  // Best score first.
  return out.sort((a, b) => b.score - a.score);
}

export interface AcoustidResult {
  recordings: AcoustidRecording[];
  raw: unknown;
}

export async function acoustidLookup(
  apiKey: string,
  fingerprint: string,
  durationSec: number,
  deps: { limiter: RateLimiter; fetchImpl?: typeof fetch },
): Promise<AcoustidResult> {
  const doFetch = deps.fetchImpl ?? fetch;
  await deps.limiter.acquire();
  const res = await doFetch(buildAcoustidUrl(apiKey, fingerprint, durationSec), { signal: AbortSignal.timeout(20_000) });
  const raw = await res.json();
  return { recordings: parseAcoustidResponse(raw), raw };
}
