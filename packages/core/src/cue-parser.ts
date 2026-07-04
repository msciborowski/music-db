/**
 * `.cue` sheet parser (spec §10). Deterministic, line-oriented, dependency-free
 * — we need full control over encoding-tolerant parsing, so we roll our own.
 *
 * Extracts the referenced audio FILE and per-track TITLE/PERFORMER/INDEX, and
 * computes `startMs` from `INDEX 01`. `endMs` for each track is the next track's
 * start; the final track's `endMs` is left undefined for the caller to fill from
 * the audio file's duration.
 */

export interface CueTrackParsed {
  trackNo: number;
  title?: string;
  performer?: string;
  startMs?: number;
  endMs?: number;
}

export type CueParseStatus = "OK" | "PARTIAL" | "ERROR";

export interface CueParseResult {
  /** First FILE "..." reference (the audio the cue points at). */
  fileRef?: string;
  albumTitle?: string;
  albumPerformer?: string;
  tracks: CueTrackParsed[];
  parseStatus: CueParseStatus;
  parseError?: string;
}

/** Convert a cue `mm:ss:ff` timestamp (75 frames/sec) to milliseconds. */
export function cueTimeToMs(time: string): number | undefined {
  const m = /^(\d+):(\d{1,2}):(\d{1,2})$/.exec(time.trim());
  if (!m) return undefined;
  const minutes = Number.parseInt(m[1]!, 10);
  const seconds = Number.parseInt(m[2]!, 10);
  const frames = Number.parseInt(m[3]!, 10);
  return minutes * 60_000 + seconds * 1000 + Math.round((frames / 75) * 1000);
}

function unquote(rest: string): string {
  const trimmed = rest.trim();
  const quoted = /^"([^"]*)"/.exec(trimmed);
  if (quoted) return quoted[1]!;
  // unquoted: take up to the first token boundary that looks like a keyword arg
  return trimmed.replace(/\s+(WAVE|MP3|AIFF|FLAC|BINARY|MOTOROLA)\s*$/i, "").trim();
}

export function parseCue(rawText: string): CueParseResult {
  const result: CueParseResult = { tracks: [], parseStatus: "OK" };
  try {
    const lines = rawText.split(/\r?\n/);
    let current: CueTrackParsed | undefined;
    let sawFile = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.length === 0) continue;
      const spaceIdx = line.search(/\s/);
      const keyword = (spaceIdx === -1 ? line : line.slice(0, spaceIdx)).toUpperCase();
      const rest = spaceIdx === -1 ? "" : line.slice(spaceIdx + 1);

      switch (keyword) {
        case "FILE": {
          if (!result.fileRef) result.fileRef = unquote(rest);
          sawFile = true;
          break;
        }
        case "TRACK": {
          const m = /^(\d+)/.exec(rest.trim());
          const trackNo = m ? Number.parseInt(m[1]!, 10) : result.tracks.length + 1;
          current = { trackNo };
          result.tracks.push(current);
          break;
        }
        case "TITLE": {
          if (current) current.title = unquote(rest);
          else result.albumTitle = unquote(rest);
          break;
        }
        case "PERFORMER": {
          if (current) current.performer = unquote(rest);
          else result.albumPerformer = unquote(rest);
          break;
        }
        case "INDEX": {
          // "01 mm:ss:ff" — we key on INDEX 01 (INDEX 00 is pregap).
          const m = /^(\d+)\s+(\d+:\d{1,2}:\d{1,2})/.exec(rest.trim());
          if (m && current) {
            const indexNo = Number.parseInt(m[1]!, 10);
            const ms = cueTimeToMs(m[2]!);
            if (indexNo === 1 || current.startMs === undefined) {
              if (ms !== undefined) current.startMs = ms;
            }
          }
          break;
        }
        default:
          break;
      }
    }

    // Compute endMs = next track's startMs.
    for (let i = 0; i < result.tracks.length - 1; i++) {
      const next = result.tracks[i + 1]!;
      if (next.startMs !== undefined) result.tracks[i]!.endMs = next.startMs;
    }

    if (!sawFile || result.tracks.length === 0) {
      result.parseStatus = "PARTIAL";
    }
    return result;
  } catch (err) {
    result.parseStatus = "ERROR";
    result.parseError = err instanceof Error ? err.message : String(err);
    return result;
  }
}
