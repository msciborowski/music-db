/**
 * BPM/key agreement checks for cross-verifying our computed values against an
 * external reference (e.g. the AcousticBrainz dataset). Pure + unit-tested.
 */
import { toCamelot } from "./camelot.js";

/**
 * True if two BPM values agree within tolerance, tolerating half/double-time
 * (a very common ambiguity: 174 vs 87).
 */
export function bpmAgrees(a: number | null | undefined, b: number | null | undefined, tolerance = 1.5): boolean {
  if (a == null || b == null || a <= 0 || b <= 0) return false;
  const close = (x: number, y: number): boolean => Math.abs(x - y) <= tolerance;
  return close(a, b) || close(a * 2, b) || close(a, b * 2);
}

/** True if two Camelot codes are the same (case-insensitive). */
export function camelotAgrees(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

/** Convert AcousticBrainz `tonal.key_key` + `key_scale` into a Camelot code. */
export function abKeyToCamelot(keyKey: string | null | undefined, keyScale: string | null | undefined): string | undefined {
  if (!keyKey) return undefined;
  const minor = (keyScale ?? "").toLowerCase().startsWith("min");
  return toCamelot(`${keyKey}${minor ? "m" : ""}`);
}
