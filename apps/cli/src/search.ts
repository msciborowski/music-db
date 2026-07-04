/**
 * `mdb search <query>` (spec §15, §19.5). Finds matches and — crucially — shows
 * the *directory context*: the sibling files in the same folder, grouped into
 * other audio and non-audio. So searching "yellow submarine" also surfaces the
 * rest of that album folder and its cover/info files.
 */
import { flattenDiacritics } from "@mdb/core";
import { db } from "./db.js";

interface MatchFile {
  id: string;
  filename: string;
  relPath: string;
  directoryId: string;
  fileType: string;
  title?: string | null;
  artist?: string | null;
  durationSec?: number | null;
}

interface SiblingFile {
  id: string;
  filename: string;
  fileType: string;
  directoryId: string;
  audio: { resolvedTitle: string | null } | null;
}

function fmtDuration(sec?: number | null): string {
  if (!sec || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return ` [${m}:${s.toString().padStart(2, "0")}]`;
}

export async function searchCatalogue(query: string, limit = 15): Promise<void> {
  const q = query.trim();
  if (q.length === 0) {
    console.log("Empty query.");
    return;
  }
  const prisma = db();
  const qAscii = flattenDiacritics(q.toLowerCase());
  const ci = { contains: q, mode: "insensitive" as const };

  const audioMatches = (await prisma.audioFile.findMany({
    where: {
      OR: [
        { resolvedTitle: ci }, { tagTitle: ci }, { resolvedArtist: ci }, { tagArtist: ci },
        { normTitleAscii: { contains: qAscii } }, { normArtistAscii: { contains: qAscii } },
      ],
    },
    select: {
      resolvedTitle: true, tagTitle: true, resolvedArtist: true, tagArtist: true, durationSec: true,
      file: { select: { id: true, filename: true, relPath: true, directoryId: true, fileType: true } },
    },
    take: 100,
  })) as Array<{ resolvedTitle: string | null; tagTitle: string | null; resolvedArtist: string | null; tagArtist: string | null; durationSec: number | null; file: { id: string; filename: string; relPath: string; directoryId: string; fileType: string } }>;

  const fileMatches = (await prisma.file.findMany({
    where: { OR: [{ filenameLower: { contains: q.toLowerCase() } }, { filenameNormAscii: { contains: qAscii } }] },
    select: { id: true, filename: true, relPath: true, directoryId: true, fileType: true },
    take: 100,
  })) as Array<{ id: string; filename: string; relPath: string; directoryId: string; fileType: string }>;

  const byId = new Map<string, MatchFile>();
  for (const a of audioMatches) {
    byId.set(a.file.id, { ...a.file, title: a.resolvedTitle ?? a.tagTitle, artist: a.resolvedArtist ?? a.tagArtist, durationSec: a.durationSec });
  }
  for (const f of fileMatches) if (!byId.has(f.id)) byId.set(f.id, f);

  const matches = [...byId.values()].slice(0, limit);
  if (matches.length === 0) {
    console.log(`No matches for "${q}".`);
    return;
  }

  const dirIds = [...new Set(matches.map((m) => m.directoryId))];
  const [dirs, siblings] = await Promise.all([
    prisma.directory.findMany({ where: { id: { in: dirIds } }, select: { id: true, relPath: true } }) as Promise<Array<{ id: string; relPath: string }>>,
    prisma.file.findMany({ where: { directoryId: { in: dirIds } }, select: { id: true, filename: true, fileType: true, directoryId: true, audio: { select: { resolvedTitle: true } } } }) as Promise<SiblingFile[]>,
  ]);
  const dirRel = new Map(dirs.map((d) => [d.id, d.relPath]));
  const siblingsByDir = new Map<string, SiblingFile[]>();
  for (const s of siblings) (siblingsByDir.get(s.directoryId) ?? siblingsByDir.set(s.directoryId, []).get(s.directoryId)!).push(s);

  console.log(`${byId.size} match(es) for "${q}"${byId.size > matches.length ? ` (showing ${matches.length})` : ""}:\n`);
  for (const m of matches) {
    const label = m.title ? `${m.title}${m.artist ? ` — ${m.artist}` : ""}` : m.filename;
    console.log(`♪ ${label}${fmtDuration(m.durationSec)}`);
    console.log(`  ${m.relPath}`);

    const sibs = (siblingsByDir.get(m.directoryId) ?? []).filter((s) => s.id !== m.id);
    const otherAudio = sibs.filter((s) => s.fileType === "AUDIO");
    const nonAudio = sibs.filter((s) => s.fileType !== "AUDIO");
    console.log(`  dir: ${dirRel.get(m.directoryId) ?? "?"}`);
    if (otherAudio.length > 0) {
      console.log(`    other audio: ${otherAudio.slice(0, 12).map((s) => s.audio?.resolvedTitle ?? s.filename).join(", ")}${otherAudio.length > 12 ? ` … (+${otherAudio.length - 12})` : ""}`);
    }
    if (nonAudio.length > 0) {
      console.log(`    other files: ${nonAudio.slice(0, 12).map((s) => s.filename).join(", ")}${nonAudio.length > 12 ? ` … (+${nonAudio.length - 12})` : ""}`);
    }
    console.log("");
  }

  // Tracks inside unsplit rips (.cue).
  const cueRows = (await prisma.cueTrack.findMany({
    where: { OR: [{ title: ci }, { performer: ci }] },
    select: { trackNo: true, title: true, performer: true, startMs: true, cueSheet: { select: { file: { select: { directory: { select: { name: true } } } } } } },
    take: 20,
  })) as Array<{ trackNo: number; title: string | null; performer: string | null; startMs: number | null; cueSheet: { file: { directory: { name: string } } } }>;
  const cueHits = cueRows.filter((c) => c.title);
  if (cueHits.length > 0) {
    console.log(`W skladankach (.cue) — ${cueHits.length}:`);
    for (const c of cueHits) {
      const start = c.startMs != null ? ` @ ${Math.floor(c.startMs / 60000)}:${Math.round((c.startMs % 60000) / 1000).toString().padStart(2, "0")}` : "";
      console.log(`  ~ ${c.title}${c.performer ? ` — ${c.performer}` : ""}  (na: ${c.cueSheet.file.directory.name}, sciezka ${c.trackNo}${start})`);
    }
  }
}
