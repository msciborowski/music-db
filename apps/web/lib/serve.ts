import path from "node:path";
import { prisma } from "./db";
import { resolveMount } from "./mounts";

export interface ResolvedFile {
  abs: string;
  id: string;
  filename: string;
  extension: string;
  fileType: string;
}

/**
 * Resolve a File row to an absolute path on the currently-mounted disk, with a
 * path-traversal guard. Serving is keyed by fileId (never a raw path) so only
 * catalogued files can be read. Used for cover-art preview only — read-only
 * image display, no audio playback/transcoding (spec §18).
 */
export async function resolveFile(fileId: string): Promise<ResolvedFile | null> {
  const db = prisma();
  const file = (await db.file.findUnique({
    where: { id: fileId },
    select: { id: true, relPath: true, volumeId: true, filename: true, extension: true, fileType: true },
  })) as { id: string; relPath: string; volumeId: string; filename: string; extension: string; fileType: string } | null;
  if (!file) return null;

  const mount = await resolveMount(file.volumeId);
  if (!mount) return null;

  const root = path.resolve(mount);
  const abs = path.resolve(root, file.relPath);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null; // traversal guard

  return { abs, id: file.id, filename: file.filename, extension: file.extension, fileType: file.fileType };
}

export const IMAGE_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", bmp: "image/bmp", tiff: "image/tiff",
};
