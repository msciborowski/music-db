/**
 * Chromaprint `fpcalc` runner (spec §2 phase 2, §11). Generates an acoustic
 * fingerprint for an audio file. `fpcalc` is an external system binary
 * (`brew install chromaprint` / `apt install libchromaprint-tools`).
 *
 * The JSON parser is pure and unit-tested; the runner shells out.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface Fingerprint {
  fingerprint: string;
  duration: number;
}

export class FpcalcError extends Error {}

/** Parse `fpcalc -json <file>` output. Falls back to the plain KEY=VALUE form. */
export function parseFpcalcOutput(output: string): Fingerprint {
  const trimmed = output.trim();
  if (trimmed.startsWith("{")) {
    const obj = JSON.parse(trimmed) as { duration?: number | string; fingerprint?: string };
    const fingerprint = obj.fingerprint;
    const duration = typeof obj.duration === "string" ? Number.parseFloat(obj.duration) : obj.duration;
    if (!fingerprint || duration === undefined || Number.isNaN(duration)) {
      throw new FpcalcError("fpcalc JSON missing fingerprint/duration");
    }
    return { fingerprint, duration };
  }
  // plain output: "DURATION=254\nFINGERPRINT=AQAAA..."
  const dur = /^DURATION=(.+)$/m.exec(trimmed);
  const fp = /^FINGERPRINT=(.+)$/m.exec(trimmed);
  if (!dur || !fp) throw new FpcalcError("could not parse fpcalc output");
  return { fingerprint: fp[1]!.trim(), duration: Number.parseFloat(dur[1]!) };
}

export async function runFpcalc(absPath: string): Promise<Fingerprint> {
  const { stdout } = await execFileAsync("fpcalc", ["-json", absPath], {
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return parseFpcalcOutput(stdout);
}

/** Whether `fpcalc` is on PATH. Used to fail fast with an install hint. */
export async function fpcalcAvailable(): Promise<boolean> {
  try {
    await execFileAsync("fpcalc", ["-version"], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

export const FPCALC_INSTALL_HINT =
  "fpcalc (Chromaprint) not found. Install it:\n" +
  "  macOS:         brew install chromaprint\n" +
  "  Debian/Ubuntu: apt install libchromaprint-tools";
