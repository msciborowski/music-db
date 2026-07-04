import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { VolumeSummary } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = prisma();
  const volumes = (await db.volume.findMany({
    orderBy: { firstSeenAt: "asc" },
    select: { id: true, label: true, serialNumber: true, totalBytes: true, _count: { select: { files: true, directories: true } } },
  })) as Array<{ id: string; label: string; serialNumber: string | null; totalBytes: bigint | null; _count: { files: number; directories: number } }>;

  const audioByVolume = (await db.file.groupBy({ by: ["volumeId"], where: { fileType: "AUDIO" }, _count: { _all: true } })) as Array<{ volumeId: string; _count: { _all: number } }>;
  const audioMap = new Map(audioByVolume.map((a) => [a.volumeId, a._count._all]));

  const rootDirs = (await db.directory.findMany({ where: { parentId: null }, select: { id: true, volumeId: true } })) as Array<{ id: string; volumeId: string }>;
  const rootMap = new Map<string, string>();
  for (const d of rootDirs) if (!rootMap.has(d.volumeId)) rootMap.set(d.volumeId, d.id);

  const out: VolumeSummary[] = volumes.map((v) => ({
    id: v.id, label: v.label, serialNumber: v.serialNumber,
    totalBytes: v.totalBytes?.toString() ?? null,
    fileCount: v._count.files, directoryCount: v._count.directories, audioCount: audioMap.get(v.id) ?? 0,
    rootDirId: rootMap.get(v.id) ?? null,
  }));
  return NextResponse.json(out);
}
