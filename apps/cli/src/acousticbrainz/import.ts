/**
 * Import the offline AcousticBrainz dataset into a compact reference table, and
 * cross-verify our computed BPM/key against it (matched by MusicBrainz MBID,
 * which we resolve during Enrich). Local + offline — no network.
 *
 * The live AcousticBrainz API shut down in 2022; only the data dump remains, so
 * `import` reads a directory tree of the dump's low-level `*.json` files.
 */
import fs from "node:fs";
import path from "node:path";
import cliProgress from "cli-progress";
import { bpmAgrees, camelotAgrees } from "@mdb/core";
import { db, disconnectPrisma } from "../db.js";
import { logger } from "../logger.js";
import { resolveTargetVolume } from "../volume/target.js";
import { extractAbFeatures } from "./parse.js";

const CHUNK = 1000;

async function* walkJson(root: string): AsyncGenerator<string> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(root, e.name);
    if (e.isDirectory()) yield* walkJson(p);
    else if (e.isFile() && e.name.toLowerCase().endsWith(".json")) yield p;
  }
}

export async function runAbImport(dumpDir: string): Promise<void> {
  const prisma = db();
  const root = path.resolve(dumpDir);
  const stat = await fs.promises.stat(root).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`Not a directory: ${root}`);

  const bar = process.stdout.isTTY
    ? new cliProgress.SingleBar({ format: "import [{bar}] {value} rekordow | {errors} err" }, cliProgress.Presets.shades_classic)
    : null;
  bar?.start(0, 0, { errors: 0 });

  let buffer: Array<{ mbid: string; bpm: number | null; keyKey: string | null; keyScale: string | null; camelot: string | null }> = [];
  let imported = 0;
  let errors = 0;

  const flush = async (): Promise<void> => {
    if (buffer.length === 0) return;
    await prisma.acousticBrainzRef.createMany({ data: buffer as never, skipDuplicates: true });
    imported += buffer.length;
    buffer = [];
    bar?.update(imported, { errors });
  };

  for await (const file of walkJson(root)) {
    try {
      const json = JSON.parse(await fs.promises.readFile(file, "utf8"));
      const f = extractAbFeatures(json);
      if (!f.mbid) continue;
      buffer.push({ mbid: f.mbid, bpm: f.bpm ?? null, keyKey: f.keyKey ?? null, keyScale: f.keyScale ?? null, camelot: f.camelot ?? null });
      if (buffer.length >= CHUNK) await flush();
    } catch (err) {
      errors++;
      logger.warn({ err: `${err}`, file }, "acousticbrainz parse failed");
    }
  }
  await flush();
  bar?.stop();
  console.log(`AcousticBrainz import: ${imported} rekordow, ${errors} bledow.`);
  await disconnectPrisma();
}

export interface AbVerifyOptions {
  volume?: string;
}

export async function runAbVerify(opts: AbVerifyOptions): Promise<void> {
  const prisma = db();
  const volume = opts.volume ? await resolveTargetVolume(prisma, { volume: opts.volume }) : null;

  const audio = (await prisma.audioFile.findMany({
    where: { acoustId: { not: null }, ...(volume ? { file: { volumeId: volume.id } } : {}) },
    select: { fileId: true, acoustId: true, bpm: true, camelot: true },
  })) as Array<{ fileId: string; acoustId: string; bpm: number | null; camelot: string | null }>;

  if (audio.length === 0) {
    console.log("No audio with an AcoustID/MBID yet — run enrich first.");
    await disconnectPrisma();
    return;
  }

  const mbids = [...new Set(audio.map((a) => a.acoustId))];
  const refByMbid = new Map<string, { bpm: number | null; camelot: string | null }>();
  for (let i = 0; i < mbids.length; i += 1000) {
    const rows = (await prisma.acousticBrainzRef.findMany({
      where: { mbid: { in: mbids.slice(i, i + 1000) } },
      select: { mbid: true, bpm: true, camelot: true },
    })) as Array<{ mbid: string; bpm: number | null; camelot: string | null }>;
    for (const r of rows) refByMbid.set(r.mbid, { bpm: r.bpm, camelot: r.camelot });
  }

  let matched = 0;
  let bpmOk = 0;
  let keyOk = 0;
  const updates: Array<{ fileId: string; data: Record<string, unknown> }> = [];
  for (const a of audio) {
    const ref = refByMbid.get(a.acoustId);
    if (!ref) continue;
    matched++;
    const bpmConfirmed = bpmAgrees(a.bpm, ref.bpm);
    const keyConfirmed = camelotAgrees(a.camelot, ref.camelot);
    if (bpmConfirmed) bpmOk++;
    if (keyConfirmed) keyOk++;
    updates.push({ fileId: a.fileId, data: { refBpm: ref.bpm, refCamelot: ref.camelot, bpmConfirmed, keyConfirmed } });
  }

  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500);
    await prisma.$transaction(chunk.map((u) => prisma.audioFile.update({ where: { fileId: u.fileId }, data: u.data as never })));
  }

  console.log(
    `AcousticBrainz verify: ${matched}/${audio.length} nagran w referencji | BPM zgodne ${bpmOk}, tonacja zgodna ${keyOk}.`,
  );
  await disconnectPrisma();
}
