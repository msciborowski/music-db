import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Stats } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = prisma();
  const [volumes, directories, files, audioFiles, works, lossless, needsSplit, fingerprinted, acoustidMatched, mbWorks] = await Promise.all([
    db.volume.count(), db.directory.count(), db.file.count(), db.audioFile.count(), db.work.count(),
    db.audioFile.count({ where: { lossless: true } }),
    db.audioFile.count({ where: { needsSplit: true } }),
    db.audioFile.count({ where: { fingerprint: { not: null } } }),
    db.audioFile.count({ where: { acoustId: { not: null } } }),
    db.work.count({ where: { mbWorkId: { not: null } } }),
  ]);

  const bytesAgg = (await db.file.aggregate({ _sum: { sizeBytes: true } })) as { _sum: { sizeBytes: bigint | null } };
  const byType = (await db.file.groupBy({ by: ["fileType"], _count: { _all: true } })) as Array<{ fileType: string; _count: { _all: number } }>;
  const dupByKind = (await db.duplicateGroup.groupBy({ by: ["kind"], _count: { _all: true } })) as Array<{ kind: string; _count: { _all: number } }>;
  const topGenres = (await db.tag.findMany({ where: { source: "discogs" }, select: { name: true, _count: { select: { files: true } } }, orderBy: { files: { _count: "desc" } }, take: 10 })) as Array<{ name: string; _count: { files: number } }>;

  const stats: Stats = {
    volumes, directories, files, audioFiles, works, lossless, needsSplit, fingerprinted, acoustidMatched, mbWorks,
    totalBytes: (bytesAgg._sum.sizeBytes ?? 0n).toString(),
    byType: byType.map((t) => ({ fileType: t.fileType, count: t._count._all })).sort((a, b) => b.count - a.count),
    duplicates: dupByKind.map((d) => ({ kind: d.kind, count: d._count._all })),
    topGenres: topGenres.filter((g) => g._count.files > 0).map((g) => ({ name: g.name, count: g._count.files })),
  };
  return NextResponse.json(stats);
}
