import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { WorkDto } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const all = new URL(req.url).searchParams.get("all") === "1";
  const db = prisma();
  const works = (await db.work.findMany({
    orderBy: { audioFiles: { _count: "desc" } },
    take: 200,
    select: {
      id: true, title: true, artist: true, mbWorkId: true,
      audioFiles: { select: { fileId: true, versionType: true, versionLabel: true, durationSec: true, codec: true, file: { select: { relPath: true } } } },
    },
  })) as Array<{ id: string; title: string | null; artist: string | null; mbWorkId: string | null; audioFiles: Array<{ fileId: string; versionType: string; versionLabel: string | null; durationSec: number | null; codec: string | null; file: { relPath: string } }> }>;

  const out: WorkDto[] = works
    .filter((w) => all || w.audioFiles.length >= 2)
    .map((w) => ({
      id: w.id, title: w.title, artist: w.artist, mbWorkId: w.mbWorkId,
      versions: w.audioFiles.map((a) => ({ fileId: a.fileId, versionType: a.versionType, versionLabel: a.versionLabel, durationSec: a.durationSec, codec: a.codec, relPath: a.file.relPath })),
    }));
  return NextResponse.json(out);
}
