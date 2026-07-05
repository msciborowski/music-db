import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { DbSize, Stats } from "@/lib/types";

const toStr = (v: unknown): string => (typeof v === "bigint" ? v.toString() : String(v ?? "0"));

async function dbSize(db: ReturnType<typeof prisma>): Promise<DbSize> {
  const rows = (await db.$queryRaw`
    SELECT c.relname AS name,
           pg_table_size(c.oid)::bigint AS data_bytes,
           pg_indexes_size(c.oid)::bigint AS index_bytes,
           pg_total_relation_size(c.oid)::bigint AS total_bytes
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND n.nspname = 'public'
    ORDER BY pg_total_relation_size(c.oid) DESC
  `) as Array<{ name: string; data_bytes: bigint; index_bytes: bigint; total_bytes: bigint }>;
  const totalRow = (await db.$queryRaw`SELECT pg_database_size(current_database())::bigint AS size`) as Array<{ size: bigint }>;

  const dataSum = rows.reduce((a, r) => a + Number(r.data_bytes), 0);
  const indexSum = rows.reduce((a, r) => a + Number(r.index_bytes), 0);
  return {
    totalBytes: toStr(totalRow[0]?.size),
    dataBytes: String(dataSum),
    indexBytes: String(indexSum),
    tables: rows.map((r) => ({ name: r.name, dataBytes: toStr(r.data_bytes), indexBytes: toStr(r.index_bytes), totalBytes: toStr(r.total_bytes) })),
  };
}

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
    dbSize: await dbSize(db),
  };
  return NextResponse.json(stats);
}
