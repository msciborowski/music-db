/**
 * Metadata reconciliation (spec §8). Combines tag, filename and directory
 * context into resolved title / artist / track number, cleaning junk. Pure.
 *
 * Rule of thumb: trust tags first (they carry structured fields), fall back to
 * the filename, and use directory sequence context to decide whether a bare
 * leading number is a track number.
 */
import { stripExtension } from "./normalize.js";
import { leadingTrackNumber } from "./sequence.js";

// Trailing junk commonly appended to titles/filenames.
const JUNK_PATTERNS: RegExp[] = [
  /\s+by\s+\S.*$/i, // "... by husky40"
  /\s*[([]\s*(official\s+)?(music\s+)?(video|audio|lyric[s]?(\s+video)?|visualizer|clip|hd|hq|4k|full\s+album)\s*[)\]]?\s*$/i,
  /\s*[([]\s*(explicit|clean|remaster(ed)?(\s+\d{4})?)\s*[)\]]\s*$/i,
  /\s*[-–]\s*(official\s+)?(video|audio|lyric[s]?(\s+video)?)\s*$/i,
  /\s*\b(www\.\S+|https?:\/\/\S+)\s*$/i,
];

export function stripJunk(title: string): string {
  let t = title;
  let changed = true;
  while (changed) {
    changed = false;
    for (const re of JUNK_PATTERNS) {
      const next = t.replace(re, "");
      if (next !== t) {
        t = next.trim();
        changed = true;
      }
    }
  }
  return t.trim();
}

export interface ReconcileInput {
  tagTitle?: string | null;
  tagArtist?: string | null;
  tagTrackNo?: number | null;
  parsedTitle?: string | null;
  parsedArtist?: string | null;
  parsedTrackNo?: number | null;
  filename: string;
  /** Whether the containing directory looks like a numbered track sequence. */
  dirHasSequence: boolean;
}

export type ResolvedSource = "TAG" | "FILENAME";

export interface Reconciled {
  resolvedTitle?: string;
  resolvedArtist?: string;
  resolvedTrackNo?: number;
  resolvedSource: ResolvedSource;
}

const nonEmpty = (s: string | null | undefined): s is string => typeof s === "string" && s.trim().length > 0;

/** Derive a clean title from a filename, using sequence context for the number. */
export function titleFromFilename(filename: string, dirHasSequence: boolean): { title: string; trackNo?: number; artist?: string } {
  const lead = leadingTrackNumber(filename);
  let working = stripExtension(filename).trim();
  let trackNo: number | undefined;

  if (lead && (lead.kind !== "bare" || dirHasSequence)) {
    trackNo = lead.number;
    working = lead.rest;
  }

  // "Artist - Title" -> split; keep the last chunk as title, first as artist.
  const chunks = working.split(/\s[-–—]\s/).map((c) => c.trim()).filter((c) => c.length > 0);
  let artist: string | undefined;
  let title = working;
  if (chunks.length >= 2) {
    artist = chunks[0];
    title = chunks[chunks.length - 1]!;
  }

  return { title: stripJunk(title), trackNo, artist };
}

export function reconcile(input: ReconcileInput): Reconciled {
  const fromName = titleFromFilename(input.filename, input.dirHasSequence);

  const resolvedTitle = nonEmpty(input.tagTitle)
    ? stripJunk(input.tagTitle.trim())
    : nonEmpty(fromName.title)
      ? fromName.title
      : undefined;

  const resolvedArtist = nonEmpty(input.tagArtist)
    ? input.tagArtist.trim()
    : nonEmpty(input.parsedArtist)
      ? input.parsedArtist.trim()
      : fromName.artist;

  const resolvedTrackNo =
    typeof input.tagTrackNo === "number" && input.tagTrackNo > 0
      ? input.tagTrackNo
      : fromName.trackNo ?? (typeof input.parsedTrackNo === "number" ? input.parsedTrackNo : undefined);

  const source: ResolvedSource = nonEmpty(input.tagTitle) ? "TAG" : "FILENAME";

  return { resolvedTitle, resolvedArtist, resolvedTrackNo, resolvedSource: source };
}
