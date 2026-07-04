/**
 * Leading track-number extraction and directory-sequence detection (spec §8,
 * and the context-aware track-number handling discussed for Analyze). Pure.
 *
 * Whether a bare leading number (e.g. "13 Eye Of The Tiger") is a track number
 * can't be decided per-file (cf. "50 Cent"), so we decide it with directory
 * context: if the sibling audio files form a numbered sequence, bare leading
 * numbers are track numbers.
 */
import { stripExtension } from "./normalize.js";

export type LeadingKind = "separator" | "bare" | "vinyl";

export interface LeadingNumber {
  number: number;
  /** The remainder after removing the leading number token. */
  rest: string;
  kind: LeadingKind;
}

const SEP_RE = /^\s*(\d{1,3})\s*[-._)]+\s*(.*)$/;
const BARE_RE = /^\s*(\d{1,3})\s+(.+)$/;
const VINYL_RE = /^\s*([a-h])\s*([1-9]\d?)\s*[-._)]*\s+(.*)$/i;

/** Extract a leading track number from a filename (extension stripped first). */
export function leadingTrackNumber(filename: string): LeadingNumber | undefined {
  const base = stripExtension(filename).trim();
  const sep = SEP_RE.exec(base);
  if (sep) return { number: Number.parseInt(sep[1]!, 10), rest: sep[2]!.trim(), kind: "separator" };
  const vinyl = VINYL_RE.exec(base);
  if (vinyl) return { number: Number.parseInt(vinyl[2]!, 10), rest: vinyl[3]!.trim(), kind: "vinyl" };
  const bare = BARE_RE.exec(base);
  if (bare) return { number: Number.parseInt(bare[1]!, 10), rest: bare[2]!.trim(), kind: "bare" };
  return undefined;
}

export interface SequenceInfo {
  hasSequence: boolean;
  /** Extracted leading number per input filename (undefined when none). */
  numbers: Map<string, number | undefined>;
}

/**
 * Decide whether a directory's audio filenames form a numbered track sequence.
 * True when a solid majority carry distinct leading numbers within a plausible
 * range (so "01,02,03…" counts, but a lone "50 Cent - …" does not).
 */
export function detectSequence(filenames: string[]): SequenceInfo {
  const numbers = new Map<string, number | undefined>();
  const found: number[] = [];
  for (const name of filenames) {
    const lead = leadingTrackNumber(name);
    numbers.set(name, lead?.number);
    if (lead) found.push(lead.number);
  }

  const total = filenames.length;
  const distinct = new Set(found);
  const enough = found.length >= 2 && found.length >= Math.ceil(total * 0.6);
  const mostlyUnique = distinct.size >= Math.ceil(found.length * 0.8);
  const max = found.length > 0 ? Math.max(...found) : 0;
  const plausibleRange = max <= Math.max(total + 5, total * 2);

  return { hasSequence: enough && mostlyUnique && plausibleRange, numbers };
}
