/**
 * Musical key -> Camelot code mapping for harmonic ("in key") mixing.
 * The Camelot wheel (Mixed In Key): minor keys are the "A" ring, major the "B"
 * ring. Pure + fully unit-testable.
 */

const NOTE_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Camelot code by pitch class (0=C .. 11=B).
const MAJOR_CAMELOT = ["8B", "3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B"];
const MINOR_CAMELOT = ["5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A", "8A", "3A", "10A"];

/** Normalize accidental glyphs to ASCII # / b. */
function normAccidental(a: string): string {
  return a.replace(/[♯]/g, "#").replace(/[♭]/g, "b");
}

/**
 * Convert a key in many notations (Am, "A minor", "F# major", Gbm, C#m, and
 * pass-through Camelot like "8A") into a Camelot code, or undefined if unknown.
 */
export function toCamelot(input: string | null | undefined): string | undefined {
  if (!input) return undefined;
  const s = input.trim();
  if (s.length === 0) return undefined;

  // Already a Camelot code? e.g. "8A", "12B", "3a".
  const cam = /^(1[0-2]|[1-9])\s*([ABab])$/.exec(s);
  if (cam) return `${cam[1]}${cam[2]!.toUpperCase()}`;

  const m = /^([A-Ga-g])\s*([#b♯♭]?)\s*(.*)$/.exec(s);
  if (!m) return undefined;

  const letter = m[1]!.toUpperCase();
  const acc = normAccidental(m[2] ?? "");
  const rest = (m[3] ?? "").toLowerCase().replace(/[\s.]/g, "");

  let isMinor: boolean;
  if (rest.startsWith("maj")) isMinor = false;
  else if (rest === "m" || rest.startsWith("min")) isMinor = true;
  else if (rest === "") isMinor = false;
  else if (rest.startsWith("m")) isMinor = true; // "Am", "Amin"
  else isMinor = false;

  let pc = NOTE_PC[letter]!;
  if (acc === "#") pc = (pc + 1) % 12;
  else if (acc === "b") pc = (pc + 11) % 12;

  return isMinor ? MINOR_CAMELOT[pc] : MAJOR_CAMELOT[pc];
}
