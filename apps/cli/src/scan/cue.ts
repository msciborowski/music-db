/**
 * Read + decode a `.cue` file (spec §9, §10). Encoding is guessed with jschardet
 * (a hint, not gospel) and decoded with the platform TextDecoder; parsing is
 * delegated to the pure core parser.
 */
import fs from "node:fs";
import jschardet from "jschardet";
import { parseCue, type CueParseResult } from "@mdb/core";

const ENCODING_ALIASES: Record<string, string> = {
  "windows-1250": "windows-1250",
  "windows-1252": "windows-1252",
  "iso-8859-2": "iso-8859-2",
  "iso-8859-1": "iso-8859-1",
  "utf-8": "utf-8",
  ascii: "utf-8",
  "utf-16le": "utf-16le",
  "utf-16be": "utf-16be",
};

export function decodeBuffer(buf: Uint8Array): { text: string; encoding: string } {
  const detected = jschardet.detect(Buffer.from(buf));
  const guess = (detected?.encoding ?? "utf-8").toLowerCase();
  const label = ENCODING_ALIASES[guess] ?? "utf-8";
  try {
    const text = new TextDecoder(label).decode(buf);
    return { text, encoding: label };
  } catch {
    return { text: new TextDecoder("utf-8").decode(buf), encoding: "utf-8" };
  }
}

export interface CueFileResult extends CueParseResult {
  rawText: string;
  encodingGuess: string;
}

export async function readCueFile(absPath: string): Promise<CueFileResult> {
  const buf = await fs.promises.readFile(absPath);
  const { text, encoding } = decodeBuffer(buf);
  const parsed = parseCue(text);
  return { ...parsed, rawText: text, encodingGuess: encoding };
}
