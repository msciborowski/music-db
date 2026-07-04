/**
 * Song version detection (spec §11). Pulls a version descriptor out of a title
 * (radio edit, extended/club mix, instrumental, acapella, remix, dub, live,
 * demo, remaster, edit, original) and returns the base title without it. A
 * heuristic hint — authoritative grouping comes later from MusicBrainz (Enrich).
 */
import { normalizeTitle, normalizeTitleAscii } from "./normalize.js";
import type { VersionType } from "./types.js";

export interface VersionInfo {
  versionType: VersionType;
  /** Raw descriptor as found, e.g. "Extended Club Mix". */
  versionLabel?: string;
  /** Title with the descriptor removed. */
  baseTitle: string;
  baseTitleNorm: string;
  baseTitleNormAscii: string;
}

/** Classify a descriptor string to a VersionType, or undefined if not a version. */
export function classifyDescriptor(descriptor: string): VersionType | undefined {
  const d = descriptor.toLowerCase();
  if (/\bradio\s+(edit|version|mix|cut)\b/.test(d)) return "RADIO_EDIT";
  if (/\bextended\b/.test(d) || /\b12["'′″]/.test(d)) return "EXTENDED";
  if (/\bclub\s+(mix|version|edit)\b/.test(d)) return "CLUB_MIX";
  if (/\binstrumental\b|\binst\.?\b/.test(d)) return "INSTRUMENTAL";
  if (/\ba[\s-]?cappella\b|\bacapella\b|\ba\s?capella\b/.test(d)) return "ACAPELLA";
  if (/\boriginal\s+(mix|version)\b/.test(d)) return "ORIGINAL";
  if (/\bdub\b/.test(d)) return "DUB";
  if (/\bremix\b|\brmx\b|\bre-?mix\b|\bvip\b/.test(d)) return "REMIX";
  if (/\blive\b/.test(d)) return "LIVE";
  if (/\bdemo\b/.test(d)) return "DEMO";
  if (/\bremaster(ed)?\b/.test(d)) return "REMASTER";
  if (/\bedit\b/.test(d)) return "EDIT";
  return undefined;
}

function cleanBase(title: string): string {
  return title
    .replace(/[([{][\s]*[)\]}]/g, "") // empty leftover brackets
    .replace(/\s{2,}/g, " ")
    .replace(/[\s\-–—]+$/g, "")
    .replace(/^[\s\-–—]+/g, "")
    .trim();
}

function build(baseTitle: string, type: VersionType, label: string | undefined): VersionInfo {
  const cleaned = cleanBase(baseTitle);
  return {
    versionType: type,
    versionLabel: label,
    baseTitle: cleaned,
    baseTitleNorm: normalizeTitle(cleaned),
    baseTitleNormAscii: normalizeTitleAscii(cleaned),
  };
}

export function extractVersion(title: string): VersionInfo {
  if (!title) return build("", "UNKNOWN", undefined);

  // 1. Bracketed / parenthesized descriptors, e.g. "Song (Extended Mix)".
  const bracket = /[([{]([^)\]}]+)[)\]}]/g;
  let m: RegExpExecArray | null;
  while ((m = bracket.exec(title)) !== null) {
    const type = classifyDescriptor(m[1]!);
    if (type) {
      const base = title.slice(0, m.index) + title.slice(m.index + m[0].length);
      return build(base, type, m[1]!.trim());
    }
  }

  // 2. Trailing " - descriptor", e.g. "Song - Radio Edit".
  const parts = title.split(/\s[-–—]\s/);
  if (parts.length > 1) {
    const last = parts[parts.length - 1]!;
    const type = classifyDescriptor(last);
    if (type) {
      return build(parts.slice(0, -1).join(" - "), type, last.trim());
    }
  }

  return build(title, "UNKNOWN", undefined);
}
