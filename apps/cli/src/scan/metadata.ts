/**
 * Audio tag + technical property reader (spec §6, §8, §9). Uses `music-metadata`
 * (ESM-only). The mapping from the library's result to our fields is a pure
 * function (`mapMetadata`) so it can be unit-tested without a real audio file.
 */
import { parseFile } from "music-metadata";
import type { IAudioMetadata } from "music-metadata";
import { parseFilename, type BitrateMode } from "@mdb/core";

export interface AudioMeta {
  codec?: string;
  durationSec?: number;
  bitrate?: number;
  bitrateMode: BitrateMode;
  sampleRate?: number;
  channels?: number;
  lossless: boolean;
  tagTitle?: string;
  tagArtist?: string;
  tagAlbum?: string;
  tagAlbumArtist?: string;
  tagTrackNo?: number;
  tagDiscNo?: number;
  tagYear?: number;
  tagGenre?: string;
  tagComment?: string;
  hasId3v1: boolean;
  hasId3v2: boolean;
  id3v2Version?: string;
  encodingGuess?: string;
  parsedTitle?: string;
  parsedArtist?: string;
  parsedTrackNo?: number;
}

function inferBitrateMode(codecProfile: unknown): BitrateMode {
  if (typeof codecProfile !== "string") return "UNKNOWN";
  const p = codecProfile.toUpperCase();
  if (p === "CBR") return "CBR";
  if (p === "ABR") return "ABR";
  if (p === "VBR" || /^V\d/.test(p)) return "VBR";
  return "UNKNOWN";
}

function coerceComment(comment: unknown): string | undefined {
  if (!comment) return undefined;
  if (typeof comment === "string") return comment;
  if (Array.isArray(comment)) {
    const parts = comment
      .map((c) => (typeof c === "string" ? c : (c as { text?: string })?.text))
      .filter((c): c is string => typeof c === "string" && c.length > 0);
    return parts.length > 0 ? parts.join(" / ") : undefined;
  }
  return undefined;
}

// U+FFFD replacement char, plus the classic signature of cp1250/ISO-8859-2 text
// mis-decoded as Latin-1: an uppercase Â-Å (U+00C2..U+00C5) followed by another
// Latin-1/Latin-Extended byte.
const REPLACEMENT_CHAR = "�";
const MOJIBAKE_RE = /[Â-Å][-ɏ]/;

/**
 * Heuristic mojibake detector (spec §9). A hint only — raw bytes are kept
 * elsewhere (`rawTagBytes`) so tags can be re-decoded later without the disk.
 */
export function detectMojibake(...texts: Array<string | undefined>): string | undefined {
  for (const t of texts) {
    if (!t) continue;
    if (t.includes(REPLACEMENT_CHAR)) return "suspected-mojibake";
    if (MOJIBAKE_RE.test(t)) return "suspected-mojibake";
  }
  return undefined;
}

export function mapMetadata(meta: IAudioMetadata, filename: string): AudioMeta {
  const { format, common } = meta;
  const tagTypes: string[] = (format.tagTypes ?? []) as string[];
  const id3v2Type = tagTypes.find((t) => t.startsWith("ID3v2"));
  const parsed = parseFilename(filename);

  const tagTitle = typeof common.title === "string" ? common.title : undefined;
  const tagArtist = typeof common.artist === "string" ? common.artist : undefined;
  const tagAlbum = typeof common.album === "string" ? common.album : undefined;
  const tagAlbumArtist = typeof common.albumartist === "string" ? common.albumartist : undefined;
  const tagComment = coerceComment(common.comment);

  return {
    codec: format.codec ?? format.container ?? undefined,
    durationSec: typeof format.duration === "number" ? format.duration : undefined,
    bitrate: typeof format.bitrate === "number" ? Math.round(format.bitrate) : undefined,
    bitrateMode: inferBitrateMode(format.codecProfile),
    sampleRate: typeof format.sampleRate === "number" ? format.sampleRate : undefined,
    channels: typeof format.numberOfChannels === "number" ? format.numberOfChannels : undefined,
    lossless: format.lossless === true,
    tagTitle,
    tagArtist,
    tagAlbum,
    tagAlbumArtist,
    tagTrackNo: typeof common.track?.no === "number" ? common.track.no : undefined,
    tagDiscNo: typeof common.disk?.no === "number" ? common.disk.no : undefined,
    tagYear: typeof common.year === "number" ? common.year : undefined,
    tagGenre: Array.isArray(common.genre) && common.genre.length > 0 ? common.genre[0] : undefined,
    tagComment,
    hasId3v1: tagTypes.includes("ID3v1"),
    hasId3v2: id3v2Type !== undefined,
    id3v2Version: id3v2Type
      ? id3v2Type.replace("ID3v", "") + (/\.\d+$/.test(id3v2Type) ? ".0" : "")
      : undefined,
    encodingGuess: detectMojibake(tagTitle, tagArtist, tagAlbum, tagAlbumArtist, tagComment),
    parsedTitle: parsed.title,
    parsedArtist: parsed.artist,
    parsedTrackNo: parsed.trackNo,
  };
}

export async function readAudioMetadata(absPath: string, filename: string): Promise<AudioMeta> {
  const meta = await parseFile(absPath, { duration: true });
  return mapMetadata(meta, filename);
}
