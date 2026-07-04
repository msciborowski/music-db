/**
 * Multi-disc album detection (spec §12). Recognizes disc-numbered sibling
 * directories (CD1/CD2, Disc 1/2, Płyta 1/2, ...) under a common parent. Pure.
 */

const DISC_RE = /(?:^|[\s._-])(?:cd|dis[ck]|p[łl]yta|volume|vol|part|pt)\s*[-_.]?\s*(\d{1,2})\b/i;
const TRAILING_NUM_RE = /(?:^|[\s._-])(\d{1,2})\s*$/;

/** Extract a disc number from a directory name, or undefined. */
export function detectDiscNumber(dirName: string): number | undefined {
  const m = DISC_RE.exec(dirName);
  if (m) return Number.parseInt(m[1]!, 10);
  return undefined;
}

export interface DiscChild {
  id: string;
  name: string;
}

export interface MultidiscGroup {
  parentIsMultidisc: boolean;
  /** disc number keyed by child directory id (only for children that have one). */
  discByChildId: Map<string, number>;
}

/**
 * Given the child directories of a common parent, decide whether they form a
 * multi-disc set (≥2 children carrying distinct disc numbers).
 */
export function groupMultidisc(children: DiscChild[]): MultidiscGroup {
  const discByChildId = new Map<string, number>();
  for (const child of children) {
    const disc = detectDiscNumber(child.name);
    if (disc !== undefined) discByChildId.set(child.id, disc);
  }
  const distinct = new Set(discByChildId.values());
  return { parentIsMultidisc: discByChildId.size >= 2 && distinct.size >= 2, discByChildId };
}

/** Fallback: a trailing bare number in the name (e.g. "Greatest Hits 2"). */
export function detectTrailingDiscNumber(dirName: string): number | undefined {
  const m = TRAILING_NUM_RE.exec(dirName);
  return m ? Number.parseInt(m[1]!, 10) : undefined;
}
