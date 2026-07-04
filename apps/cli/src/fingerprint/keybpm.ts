/**
 * BPM + musical-key detection via configurable sidecar tools (computed from
 * audio, spec-adjacent to the Fingerprint disk phase). We can't bundle a DSP
 * engine, so the command is user-configured (MDB_KEY_CMD / MDB_BPM_CMD) and we
 * only parse its output here. The parsers + Camelot mapping are unit-tested.
 *
 * Recommended tools:
 *   key:  keyfinder-cli "{file}"            (libKeyFinder, Camelot-friendly)
 *   bpm:  aubio tempo -v "{file}"  | ...     (or essentia); prints a BPM number
 * `{file}` is substituted as its own argv token (no shell, so paths with spaces
 * and injection are safe).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { toCamelot } from "@mdb/core";

const execFileAsync = promisify(execFile);

/** keyfinder-cli and similar print the key on the last line (e.g. "Am"). */
export function parseKeyOutput(stdout: string): string | undefined {
  const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  return lines.length > 0 ? lines[lines.length - 1] : undefined;
}

/** Extract a plausible BPM (20–400) from a tool's stdout, else the last number. */
export function parseBpmOutput(stdout: string): number | undefined {
  const nums = (stdout.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return undefined;
  const inRange = nums.filter((n) => n >= 20 && n <= 400);
  const value = (inRange.length > 0 ? inRange : nums)[inRange.length > 0 ? inRange.length - 1 : nums.length - 1]!;
  return Math.round(value * 10) / 10;
}

async function runCmd(template: string, absPath: string): Promise<string> {
  const parts = template.trim().split(/\s+/);
  const cmd = parts[0]!;
  let substituted = false;
  const args = parts.slice(1).map((a) => {
    if (a === "{file}") {
      substituted = true;
      return absPath;
    }
    return a;
  });
  if (!substituted) args.push(absPath);
  const { stdout } = await execFileAsync(cmd, args, { timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
  return stdout;
}

export interface KeyResult {
  musicalKey?: string;
  camelot?: string;
}

export async function detectKey(absPath: string, keyCmd: string): Promise<KeyResult> {
  const raw = parseKeyOutput(await runCmd(keyCmd, absPath));
  if (!raw) return {};
  return { musicalKey: raw, camelot: toCamelot(raw) };
}

export async function detectBpm(absPath: string, bpmCmd: string): Promise<number | undefined> {
  return parseBpmOutput(await runCmd(bpmCmd, absPath));
}
