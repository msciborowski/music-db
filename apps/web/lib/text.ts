/**
 * Small text helpers mirrored from @mdb/core (kept intentionally local so the
 * Next bundle doesn't pull the Node-oriented core barrel). Keep in sync with
 * packages/core/src/normalize.ts and classify.ts.
 */
const COMBINING_MARKS = /[̀-ͯ]/g;

export function flattenDiacritics(input: string): string {
  return input
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .normalize("NFC");
}

const COVER_ROLE_ORDER = ["front", "back", "booklet", "inlay", "folder", "cover", "disc", "cd"];

function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] ?? p;
}

export function detectCoverRole(filename: string): string | undefined {
  const lower = basename(filename).toLowerCase();
  for (const role of COVER_ROLE_ORDER) {
    if (lower.includes(role)) return role;
  }
  return undefined;
}
