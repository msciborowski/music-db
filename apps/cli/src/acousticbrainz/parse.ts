/**
 * Extract just the fields we need (MBID + BPM + key) from an AcousticBrainz
 * low-level JSON document. Pure + unit-tested; the rest of the ~120 descriptors
 * are ignored so we keep only a compact reference table.
 */
import { abKeyToCamelot } from "@mdb/core";

export interface AbFeatures {
  mbid?: string;
  bpm?: number;
  keyKey?: string;
  keyScale?: string;
  camelot?: string;
}

export function extractAbFeatures(json: unknown): AbFeatures {
  const o = json as {
    metadata?: { tags?: { musicbrainz_recordingid?: string[]; musicbrainz_trackid?: string[] } };
    rhythm?: { bpm?: number };
    tonal?: { key_key?: string; key_scale?: string };
  };
  const mbid = o.metadata?.tags?.musicbrainz_recordingid?.[0] ?? o.metadata?.tags?.musicbrainz_trackid?.[0];
  const bpm = typeof o.rhythm?.bpm === "number" ? o.rhythm.bpm : undefined;
  const keyKey = o.tonal?.key_key;
  const keyScale = o.tonal?.key_scale;
  return { mbid, bpm, keyKey, keyScale, camelot: abKeyToCamelot(keyKey, keyScale) };
}
