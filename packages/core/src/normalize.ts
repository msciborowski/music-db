/**
 * Name normalization (spec §8). Pure, deterministic string functions.
 *
 * Normalization is a *hint* for duplicate/version clustering, never proof of
 * identity (proof comes from content hash and acoustic fingerprint).
 */

/** Strip a single trailing file extension (`foo.mp3` -> `foo`). Keeps dotfiles. */
export function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  // dot must exist and not be the leading char (dotfiles like ".DS_Store")
  if (dot > 0) return name.slice(0, dot);
  return name;
}

/** Flatten diacritics to ASCII, including Polish ł/Ł which lack combining forms. */
const COMBINING_MARKS = /[̀-ͯ]/g;

export function flattenDiacritics(input: string): string {
  return input
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .normalize("NFC");
}

// Leading track-number patterns: "01 - ", "01.", "01_", "1) "
const LEADING_TRACK_RE = /^\s*\d{1,3}\s*[-._)]+\s*/;
// Vinyl side+number: "A1 - ", "B2." (sides A–H)
const LEADING_VINYL_RE = /^\s*[a-h]\s*[1-9]\d?\s*[-._)]+\s*/i;

function stripLeadingTrackNumber(s: string): string {
  if (LEADING_TRACK_RE.test(s)) return s.replace(LEADING_TRACK_RE, "");
  if (LEADING_VINYL_RE.test(s)) return s.replace(LEADING_VINYL_RE, "");
  return s;
}

export interface NormalizeOptions {
  /** Remove a trailing file extension first (default: true). */
  stripExt?: boolean;
  /** Remove leading track-number / vinyl-side prefixes (default: true). */
  stripTrackNo?: boolean;
}

/**
 * Core normalization used for the fuzzy clustering key (spec §8 steps 1–6):
 * strip extension, NFC, lowercase, drop leading track numbers, collapse the
 * separator class `[-_.\s]+` to single spaces, trim.
 */
export function normalizeName(input: string, options: NormalizeOptions = {}): string {
  const { stripExt = true, stripTrackNo = true } = options;
  let s = input;
  if (stripExt) s = stripExtension(s);
  s = s.normalize("NFC").toLowerCase();
  if (stripTrackNo) s = stripLeadingTrackNumber(s);
  s = s.replace(/[-_.\s]+/g, " ").trim();
  return s;
}

/** ASCII-flattened variant of {@link normalizeName}. */
export function normalizeNameAscii(input: string, options?: NormalizeOptions): string {
  return flattenDiacritics(normalizeName(input, options));
}

export interface FilenameKeys {
  /** Lowercased original (extension kept). */
  lower: string;
  /** Heavy fuzzy key, diacritics preserved. */
  norm: string;
  /** Fuzzy key, diacritics flattened to ASCII. */
  normAscii: string;
}

/** Produce the three filename keys stored on `File` (spec §6/§8). */
export function filenameKeys(filename: string): FilenameKeys {
  return {
    lower: filename.toLowerCase(),
    norm: normalizeName(filename),
    normAscii: normalizeNameAscii(filename),
  };
}

/**
 * Normalize a tag/title value (no extension, no track-number stripping) for the
 * `normTitle` / `normArtist` keys used in the Analyze phase.
 */
export function normalizeTitle(input: string): string {
  return normalizeName(input, { stripExt: false, stripTrackNo: false });
}

export function normalizeTitleAscii(input: string): string {
  return flattenDiacritics(normalizeTitle(input));
}
