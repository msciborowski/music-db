/**
 * File-type classification (spec §7). Pure function over a filename.
 *
 * Hidden and system files are catalogued too (flags + SYSTEM type) so they can
 * be found and removed later. Cover images get a role hint from their name.
 */

export type FileTypeName =
  | "AUDIO"
  | "CUE"
  | "PLAYLIST"
  | "IMAGE"
  | "TEXT"
  | "LOG"
  | "METADATA"
  | "ARCHIVE"
  | "SYSTEM"
  | "OTHER";

export type CoverRole =
  | "front"
  | "back"
  | "cover"
  | "folder"
  | "cd"
  | "disc"
  | "inlay"
  | "booklet";

const EXT_MAP: Record<string, FileTypeName> = {};
const register = (type: FileTypeName, exts: string[]): void => {
  for (const e of exts) EXT_MAP[e] = type;
};

register("AUDIO", [
  "mp3", "flac", "aac", "m4a", "ogg", "opus", "wav", "wma", "ape", "wv",
  "alac", "aiff", "aif", "mpc", "dsf", "dff",
]);
register("CUE", ["cue"]);
register("PLAYLIST", ["m3u", "m3u8", "pls", "wpl", "xspf"]);
register("IMAGE", ["jpg", "jpeg", "png", "gif", "bmp", "webp", "tiff"]);
register("TEXT", ["txt", "nfo", "md"]);
register("LOG", ["log"]);
register("METADATA", ["sfv", "md5", "accurip", "toc"]);
register("ARCHIVE", ["zip", "rar", "7z", "iso", "nrg"]);

// Exact system filenames (case-insensitive) and directory names.
const SYSTEM_EXACT = new Set([
  "thumbs.db",
  "desktop.ini",
  ".ds_store",
  "$recycle.bin",
  "system volume information",
  ".trashes",
  ".localized",
]);
// System name prefixes / patterns.
const SYSTEM_PREFIXES = [".spotlight-", ".fseventsd", ".temporaryitems", ".apdisk"];

const COVER_ROLE_ORDER: CoverRole[] = [
  "front", "back", "booklet", "inlay", "folder", "cover", "disc", "cd",
];

/** Lowercased extension without the leading dot (empty string if none). */
export function getExtension(filename: string): string {
  const base = basename(filename);
  const dot = base.lastIndexOf(".");
  if (dot > 0) return base.slice(dot + 1).toLowerCase();
  return "";
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] ?? p;
}

export function detectCoverRole(filename: string): CoverRole | undefined {
  const lower = basename(filename).toLowerCase();
  for (const role of COVER_ROLE_ORDER) {
    if (lower.includes(role)) return role;
  }
  return undefined;
}

export interface Classification {
  fileType: FileTypeName;
  extension: string;
  isHidden: boolean;
  isSystem: boolean;
  coverRole?: CoverRole;
}

export function isSystemName(filename: string): boolean {
  const lower = basename(filename).toLowerCase();
  if (SYSTEM_EXACT.has(lower)) return true;
  if (lower.startsWith("._")) return true; // AppleDouble
  return SYSTEM_PREFIXES.some((p) => lower.startsWith(p));
}

/** Dotfiles (leading ".") and AppleDouble files are hidden. */
export function isHiddenName(filename: string): boolean {
  const base = basename(filename);
  return base.startsWith(".");
}

export function classifyFile(filename: string): Classification {
  const extension = getExtension(filename);
  const system = isSystemName(filename);
  const hidden = isHiddenName(filename) || system;

  let fileType: FileTypeName;
  if (system) {
    fileType = "SYSTEM";
  } else {
    fileType = EXT_MAP[extension] ?? "OTHER";
  }

  const result: Classification = {
    fileType,
    extension,
    isHidden: hidden,
    isSystem: system,
  };

  if (fileType === "IMAGE") {
    const role = detectCoverRole(filename);
    if (role) result.coverRole = role;
  }

  return result;
}
