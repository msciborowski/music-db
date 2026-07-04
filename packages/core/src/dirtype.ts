/**
 * Directory-type classification (spec §7 note, §12). Computed in Analyze once
 * the tree, rip flags and multi-disc links are known. Pure.
 */
export type DirectoryTypeName =
  | "ALBUM" | "ALBUM_RIP" | "MULTIDISC_PARENT" | "MULTIDISC_CHILD" | "MIXED" | "NON_AUDIO" | "UNKNOWN";

export interface DirectorySummary {
  audioCount: number;
  fileCount: number;
  childDirCount: number;
  isRip: boolean;
  discNumber?: number;
  isMultidiscParent: boolean;
}

export function classifyDirectory(s: DirectorySummary): DirectoryTypeName {
  if (s.isMultidiscParent) return "MULTIDISC_PARENT";
  if (s.discNumber !== undefined) return "MULTIDISC_CHILD";
  if (s.isRip) return "ALBUM_RIP";
  if (s.audioCount === 0) {
    return s.childDirCount > 0 ? "UNKNOWN" : s.fileCount > 0 ? "NON_AUDIO" : "UNKNOWN";
  }
  if (s.childDirCount > 0) return "MIXED";
  return "ALBUM";
}
