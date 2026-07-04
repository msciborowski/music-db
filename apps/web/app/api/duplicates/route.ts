import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { DuplicateGroupDto } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get("kind");
  const db = prisma();
  const groups = (await db.duplicateGroup.findMany({
    where: kind ? { kind: kind as never } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true, kind: true,
      members: { select: { file: { select: { id: true, filename: true, relPath: true, sizeBytes: true, volume: { select: { label: true } } } } } },
    },
  })) as Array<{ id: string; kind: string; members: Array<{ file: { id: string; filename: string; relPath: string; sizeBytes: bigint; volume: { label: string } } }> }>;

  const out: DuplicateGroupDto[] = groups.map((g) => ({
    id: g.id, kind: g.kind,
    members: g.members.map((m) => ({ fileId: m.file.id, filename: m.file.filename, relPath: m.file.relPath, volumeLabel: m.file.volume.label, sizeBytes: m.file.sizeBytes.toString() })),
  }));
  return NextResponse.json(out);
}
