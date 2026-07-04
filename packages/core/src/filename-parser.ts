/**
 * Filename parser (spec §8). Recognizes common patterns and records a best
 * guess plus an `ambiguous` flag. Keeps the raw casing — reconciliation between
 * filename and tags happens later (Analyze phase), so we don't over-interpret.
 *
 * Patterns handled:
 *   Artist - Title
 *   01 - Artist - Title
 *   01 - Title            (artist comes from folder/tag)
 *   01. Title
 *   Artist - Album - 01 - Title
 *   01_Title
 *   A1 / B2               (vinyl side + number)
 */
import { stripExtension } from "./normalize.js";

export interface ParsedFilename {
  artist?: string;
  title?: string;
  trackNo?: number;
  /** True when the structure was unclear and the guess may be wrong. */
  ambiguous: boolean;
}

const LEADING_TRACK_RE = /^\s*(\d{1,3})\s*[-._)]+\s*/;
const LEADING_VINYL_RE = /^\s*([a-h])\s*([1-9]\d?)\s*[-._)]+\s*/i;
const SPACED_DASH_RE = /\s+-\s+/;

export function parseFilename(filename: string): ParsedFilename {
  let base = stripExtension(filename).trim();
  let trackNo: number | undefined;
  let ambiguous = false;

  const numeric = LEADING_TRACK_RE.exec(base);
  if (numeric) {
    trackNo = Number.parseInt(numeric[1]!, 10);
    base = base.slice(numeric[0].length).trim();
  } else {
    const vinyl = LEADING_VINYL_RE.exec(base);
    if (vinyl) {
      trackNo = Number.parseInt(vinyl[2]!, 10);
      base = base.slice(vinyl[0].length).trim();
    }
  }

  const parts = base.split(SPACED_DASH_RE).map((p) => p.trim()).filter((p) => p.length > 0);

  let artist: string | undefined;
  let title: string | undefined;

  if (parts.length === 0) {
    // nothing but a track number, or empty
    title = base.length > 0 ? base : undefined;
  } else if (parts.length === 1) {
    title = parts[0];
  } else if (parts.length === 2) {
    artist = parts[0];
    title = parts[1];
  } else {
    // e.g. "Artist - Album - 01 - Title": artist first, title last.
    artist = parts[0];
    title = parts[parts.length - 1];
    const midNumber = parts.slice(1, -1).find((p) => /^\d{1,3}$/.test(p));
    if (midNumber && trackNo === undefined) trackNo = Number.parseInt(midNumber, 10);
    ambiguous = true;
  }

  return { artist, title, trackNo, ambiguous };
}
