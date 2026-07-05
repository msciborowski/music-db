/**
 * `mdb stats` (spec §15). A quick overview of the catalogue.
 */
import { db } from "./db.js";

function gb(bytes: bigint | null | undefined): string {
  if (!bytes) return "0";
  return (Number(bytes) / 1e9).toFixed(2);
}

function fmtBytes(v: unknown): string {
  const n = typeof v === "bigint" ? Number(v) : Number(v ?? 0);
  if (!Number.isFinite(n) || n < 1024) return `${Math.round(n)} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export async function showStats(): Promise<void> {
  const prisma = db();

  const [volumes, directories, files, audioFiles, works] = await Promise.all([
    prisma.volume.count(), prisma.directory.count(), prisma.file.count(), prisma.audioFile.count(), prisma.work.count(),
  ]);

  const bytesAgg = (await prisma.file.aggregate({ _sum: { sizeBytes: true } })) as { _sum: { sizeBytes: bigint | null } };
  const byType = (await prisma.file.groupBy({ by: ["fileType"], _count: { _all: true } })) as Array<{ fileType: string; _count: { _all: number } }>;
  const dupByKind = (await prisma.duplicateGroup.groupBy({ by: ["kind"], _count: { _all: true } })) as Array<{ kind: string; _count: { _all: number } }>;
  const [lossless, needsSplit, fingerprinted] = await Promise.all([
    prisma.audioFile.count({ where: { lossless: true } }),
    prisma.audioFile.count({ where: { needsSplit: true } }),
    prisma.audioFile.count({ where: { fingerprint: { not: null } } }),
  ]);

  const [acoustidMatched, mbWorks] = await Promise.all([
    prisma.audioFile.count({ where: { acoustId: { not: null } } }),
    prisma.work.count({ where: { mbWorkId: { not: null } } }),
  ]);
  const metaBySource = (await prisma.externalMeta.groupBy({ by: ["source"], _count: { _all: true } })) as Array<{ source: string; _count: { _all: number } }>;
  const topGenres = (await prisma.tag.findMany({
    where: { source: "discogs" },
    select: { name: true, _count: { select: { files: true } } },
    orderBy: { files: { _count: "desc" } },
    take: 8,
  })) as Array<{ name: string; _count: { files: number } }>;

  console.log("Music DB — stats\n");
  console.log(`Volumes:      ${volumes}`);
  console.log(`Directories:  ${directories}`);
  console.log(`Files:        ${files}  (${gb(bytesAgg._sum.sizeBytes)} GB)`);
  console.log(`Audio files:  ${audioFiles}  (lossless ${lossless}, fingerprinted ${fingerprinted}, needs split ${needsSplit})`);
  console.log(`Works:        ${works}`);

  if (byType.length > 0) {
    console.log("\nBy file type:");
    for (const t of [...byType].sort((a, b) => b._count._all - a._count._all)) {
      console.log(`  ${t.fileType.padEnd(10)} ${t._count._all}`);
    }
  }

  console.log("\nDuplicate groups:");
  if (dupByKind.length === 0) {
    console.log("  (none — run analyze)");
  } else {
    for (const d of dupByKind) console.log(`  ${d.kind.padEnd(18)} ${d._count._all}`);
  }

  console.log("\nEnrichment:");
  console.log(`  AcoustID matched:   ${acoustidMatched} audio`);
  console.log(`  MusicBrainz works:  ${mbWorks}`);
  if (metaBySource.length > 0) {
    console.log(`  Cached responses:   ${metaBySource.map((m) => `${m.source} ${m._count._all}`).join(", ")}`);
  } else {
    console.log("  Cached responses:   (none — run enrich)");
  }
  const genres = topGenres.filter((g) => g._count.files > 0);
  if (genres.length > 0) {
    console.log(`  Top genres (Discogs): ${genres.map((g) => `${g.name} (${g._count.files})`).join(", ")}`);
  }

  const sizeRows = (await prisma.$queryRaw`
    SELECT c.relname AS name,
           pg_table_size(c.oid)::bigint AS data_bytes,
           pg_indexes_size(c.oid)::bigint AS index_bytes,
           pg_total_relation_size(c.oid)::bigint AS total_bytes
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND n.nspname = 'public'
    ORDER BY pg_total_relation_size(c.oid) DESC
  `) as Array<{ name: string; data_bytes: bigint; index_bytes: bigint; total_bytes: bigint }>;
  const totalRow = (await prisma.$queryRaw`SELECT pg_database_size(current_database())::bigint AS size`) as Array<{ size: bigint }>;
  const dataSum = sizeRows.reduce((a, r) => a + Number(r.data_bytes), 0);
  const indexSum = sizeRows.reduce((a, r) => a + Number(r.index_bytes), 0);

  console.log(`\nDatabase size: ${fmtBytes(totalRow[0]?.size)}  (dane ${fmtBytes(dataSum)}, indeksy ${fmtBytes(indexSum)})`);
  for (const r of sizeRows.filter((r) => Number(r.total_bytes) > 0).slice(0, 12)) {
    console.log(`  ${r.name.padEnd(20)} dane ${fmtBytes(r.data_bytes).padStart(9)} · idx ${fmtBytes(r.index_bytes).padStart(9)} · razem ${fmtBytes(r.total_bytes).padStart(9)}`);
  }
}
