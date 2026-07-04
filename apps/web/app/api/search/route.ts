import { NextResponse } from "next/server";
import { flattenDiacritics } from "@/lib/text";
import { prisma } from "@/lib/db";
import { pickCover } from "@/lib/cover";
import type { SearchHit } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface FileLite { id: string; filename: string; relPath: string; directoryId: string; fileType: string }

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ query: "", hits: [] });

  const db = prisma();
  const qAscii = flattenDiacritics(q.toLowerCase());
  const ci = { contains: q, mode: "insensitive" as const };

  const audio = (await db.audioFile.findMany({
    where: { OR: [{ resolvedTitle: ci }, { tagTitle: ci }, { resolvedArtist: ci }, { tagArtist: ci }, { normTitleAscii: { contains: qAscii } }, { normArtistAscii: { contains: qAscii } }] },
    select: { resolvedTitle: true, tagTitle: true, resolvedArtist: true, tagArtist: true, durationSec: true, file: { select: { id: true, filename: true, relPath: true, directoryId: true, fileType: true } } },
    take: 60,
  })) as Array<{ resolvedTitle: string | null; tagTitle: string | null; resolvedArtist: string | null; tagArtist: string | null; durationSec: number | null; file: FileLite }>;

  const fileM = (await db.file.findMany({
    where: { OR: [{ filenameLower: { contains: q.toLowerCase() } }, { filenameNormAscii: { contains: qAscii } }] },
    select: { id: true, filename: true, relPath: true, directoryId: true, fileType: true },
    take: 60,
  })) as FileLite[];

  const byId = new Map<string, SearchHit>();
  for (const a of audio) {
    byId.set(a.file.id, {
      fileId: a.file.id, title: a.resolvedTitle ?? a.tagTitle, artist: a.resolvedArtist ?? a.tagArtist,
      filename: a.file.filename, relPath: a.file.relPath, durationSec: a.durationSec,
      directoryId: a.file.directoryId, dirRelPath: "", coverFileId: null, otherAudio: [], otherFiles: [],
    });
  }
  for (const f of fileM) {
    if (byId.has(f.id)) continue;
    byId.set(f.id, { fileId: f.id, title: null, artist: null, filename: f.filename, relPath: f.relPath, durationSec: null, directoryId: f.directoryId, dirRelPath: "", coverFileId: null, otherAudio: [], otherFiles: [] });
  }

  const hits = [...byId.values()].slice(0, 20);
  const dirIds = [...new Set(hits.map((h) => h.directoryId))];

  const dirs = (await db.directory.findMany({ where: { id: { in: dirIds } }, select: { id: true, relPath: true } })) as Array<{ id: string; relPath: string }>;
  const dirRel = new Map(dirs.map((d) => [d.id, d.relPath]));
  const siblings = (await db.file.findMany({
    where: { directoryId: { in: dirIds } },
    select: { id: true, filename: true, fileType: true, directoryId: true, audio: { select: { resolvedTitle: true } } },
  })) as Array<{ id: string; filename: string; fileType: string; directoryId: string; audio: { resolvedTitle: string | null } | null }>;

  const byDir = new Map<string, typeof siblings>();
  for (const s of siblings) (byDir.get(s.directoryId) ?? byDir.set(s.directoryId, []).get(s.directoryId)!).push(s);

  for (const h of hits) {
    h.dirRelPath = dirRel.get(h.directoryId) ?? "";
    const sibs = byDir.get(h.directoryId) ?? [];
    h.coverFileId = pickCover(sibs);
    h.otherAudio = sibs.filter((s) => s.fileType === "AUDIO" && s.id !== h.fileId).slice(0, 20).map((s) => ({ fileId: s.id, title: s.audio?.resolvedTitle ?? s.filename }));
    h.otherFiles = sibs.filter((s) => s.fileType !== "AUDIO" && s.id !== h.fileId).slice(0, 20).map((s) => ({ filename: s.filename, fileType: s.fileType }));
  }

  return NextResponse.json({ query: q, total: byId.size, hits });
}
