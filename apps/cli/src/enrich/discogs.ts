/**
 * Discogs client (spec §2 phase 4). Album-level lookup for release metadata —
 * year, genres, styles. Needs a personal access token
 * (https://www.discogs.com/settings/developers). Rate-limited.
 */
import type { RateLimiter } from "./ratelimit.js";

export const DISCOGS_SEARCH = "https://api.discogs.com/database/search";

export interface DiscogsAlbum {
  discogsId?: number;
  title?: string;
  year?: number;
  genres: string[];
  styles: string[];
}

export function buildDiscogsSearchUrl(token: string, query: string): string {
  const params = new URLSearchParams({ type: "release", q: query, token, per_page: "5" });
  return `${DISCOGS_SEARCH}?${params.toString()}`;
}

interface DiscogsJson {
  results?: Array<{ id?: number; title?: string; year?: number | string; genre?: string[]; style?: string[] }>;
}

export function parseDiscogsSearch(json: unknown): DiscogsAlbum | null {
  const first = (json as DiscogsJson).results?.[0];
  if (!first) return null;
  const year = typeof first.year === "string" ? Number.parseInt(first.year, 10) : first.year;
  return {
    discogsId: first.id,
    title: first.title,
    year: Number.isFinite(year) ? (year as number) : undefined,
    genres: first.genre ?? [],
    styles: first.style ?? [],
  };
}

export interface DiscogsResult {
  album: DiscogsAlbum | null;
  raw: unknown;
}

export async function discogsSearch(
  token: string,
  query: string,
  deps: { limiter: RateLimiter; fetchImpl?: typeof fetch; userAgent: string },
): Promise<DiscogsResult> {
  const doFetch = deps.fetchImpl ?? fetch;
  await deps.limiter.acquire();
  const res = await doFetch(buildDiscogsSearchUrl(token, query), { headers: { "User-Agent": deps.userAgent }, signal: AbortSignal.timeout(20_000) });
  const raw = await res.json();
  return { album: parseDiscogsSearch(raw), raw };
}
