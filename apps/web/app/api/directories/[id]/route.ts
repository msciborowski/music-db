import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pickCover } from "@/lib/cover";
import { detectCoverRole } from "@/lib/text";
import type { AlbumTrack, DirChild, DirectoryDetail } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = prisma();

  const dir = (await db.directory.findUnique({
    where: { id },
    select: { id: true, name: true, relPath: true, type: true, parentId: true, volume: { select: { label: true } } },
  })) as { id: string; name: string; relPath: string; type: string; parentId: string | null; volume: { label: string } } | null;
  if (!dir) return NextResponse.json({ error: "not found" }, { status: 404 });

  const children = (await db.directory.findMany({
    where: { parentId: id },
    orderBy: { name: "asc" },
    select: { id: true, name: true, relPath: true, type: true, audioCount: true, fileCount: true },
  })) as DirChild[];

  const files = (await db.file.findMany({
    where: { directoryId: id },
    select: {
      id: true, filename: true, fileType: true,
      audio: { select: { tagTrackNo: true, parsedTrackNo: true, resolvedTitle: true, tagTitle: true, resolvedArtist: true, tagArtist: true, durationSec: true, codec: true, versionType: true, versionLabel: true, isAlbumRip: true, needsSplit: true, bpm: true, camelot: true } },
    },
  })) as Array<{ id: string; filename: string; fileType: string; audio: null | { tagTrackNo: number | null; parsedTrackNo: number | null; resolvedTitle: string | null; tagTitle: string | null; resolvedArtist: string | null; tagArtist: string | null; durationSec: number | null; codec: string | null; versionType: string; versionLabel: string | null; isAlbumRip: boolean; needsSplit: boolean; bpm: number | null; camelot: string | null } }>;

  const tracks: AlbumTrack[] = files
    .filter((f) => f.fileType === "AUDIO" && f.audio)
    .map((f) => {
      const a = f.audio!;
      return {
        fileId: f.id, trackNo: a.tagTrackNo ?? a.parsedTrackNo ?? null,
        title: a.resolvedTitle ?? a.tagTitle ?? f.filename, artist: a.resolvedArtist ?? a.tagArtist,
        durationSec: a.durationSec, codec: a.codec, versionType: a.versionType, versionLabel: a.versionLabel,
        filename: f.filename, isAlbumRip: a.isAlbumRip, needsSplit: a.needsSplit,
        bpm: a.bpm, camelot: a.camelot,
      };
    })
    .sort((x, y) => (x.trackNo ?? 9999) - (y.trackNo ?? 9999));

  const otherFiles = files
    .filter((f) => f.fileType !== "AUDIO")
    .map((f) => ({ fileId: f.id, filename: f.filename, fileType: f.fileType, coverRole: detectCoverRole(f.filename) ?? null }));

  const fileTags = (await db.fileTag.findMany({ where: { file: { directoryId: id } }, select: { tag: { select: { name: true } } } })) as Array<{ tag: { name: string } }>;
  const genres = [...new Set(fileTags.map((t) => t.tag.name))];

  const cue = (await db.cueSheet.findFirst({ where: { file: { directoryId: id } }, select: { tracks: { select: { trackNo: true, title: true, startMs: true }, orderBy: { trackNo: "asc" } } } })) as { tracks: Array<{ trackNo: number; title: string | null; startMs: number | null }> } | null;

  const detail: DirectoryDetail = {
    id: dir.id, name: dir.name, relPath: dir.relPath, type: dir.type, volumeLabel: dir.volume.label, parentId: dir.parentId,
    coverFileId: pickCover(files),
    children, tracks, otherFiles, genres,
    cueTracks: cue?.tracks ?? [],
  };
  return NextResponse.json(detail);
}
