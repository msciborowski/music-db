/**
 * Album-rip detection (spec §10). Combine signals — a `.cue` pointing at an
 * audio file in the directory, an unusually long audio file, and few audio
 * files — because time alone is not enough. Pure, per audio file.
 */
export interface RipSignals {
  durationSec?: number | null;
  /** Number of audio files in the same directory. */
  dirAudioCount: number;
  /** A cue sheet in the directory references THIS audio file. */
  cueReferencesThisFile: boolean;
}

export interface RipClassification {
  isAlbumRip: boolean;
  needsSplit: boolean;
}

const LONG_RIP_SECONDS = 20 * 60; // > ~20 min single file

export function classifyRip(s: RipSignals): RipClassification {
  const long = (s.durationSec ?? 0) > LONG_RIP_SECONDS;
  if (s.cueReferencesThisFile && long && s.dirAudioCount <= 2) {
    return { isAlbumRip: true, needsSplit: true };
  }
  // Redundant variant: a .cue is present but the album is already split into
  // many short tracks — catalogue it, but it does not need splitting.
  return { isAlbumRip: false, needsSplit: false };
}
