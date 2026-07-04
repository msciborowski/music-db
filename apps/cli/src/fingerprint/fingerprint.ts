/**
 * Fingerprint orchestrator (spec §2 phase 2, §17 Milestone 2). Generates
 * acoustic fingerprints for the volume's audio files that don't have one yet,
 * with the disk still mounted. Idempotent (only null fingerprints are picked),
 * resumable (re-running continues where it stopped), read-only on the source.
 *
 * Comparison/clustering of fingerprints is a later, offline phase (Analyze).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cliProgress from "cli-progress";
import { db, disconnectPrisma } from "../db.js";
import { bpmCmd, defaultConcurrency, keyCmd } from "../env.js";
import { logger } from "../logger.js";
import { resolveTargetVolume } from "../volume/target.js";
import { FPCALC_INSTALL_HINT, fpcalcAvailable, runFpcalc } from "./fpcalc.js";
import { detectBpm, detectKey } from "./keybpm.js";

export interface FingerprintOptions {
  path: string;
  volume?: string;
  concurrency?: number;
  resume?: boolean;
  dryRun?: boolean;
}

const CHUNK = 200;

async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, size) }, async () => {
    for (;;) {
      const idx = cursor++;
      if (idx >= items.length) break;
      results[idx] = await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function runFingerprint(opts: FingerprintOptions): Promise<void> {
  const prisma = db();
  const rootPath = path.resolve(opts.path);
  const concurrency = opts.concurrency ?? defaultConcurrency();
  const dryRun = opts.dryRun ?? false;

  const rootStat = await fs.promises.stat(rootPath).catch(() => null);
  if (!rootStat?.isDirectory()) throw new Error(`Path is not a directory: ${rootPath}`);

  const doFingerprint = await fpcalcAvailable();
  const kCmd = keyCmd();
  const bCmd = bpmCmd();
  const doKey = !!kCmd;
  const doBpm = !!bCmd;
  if (!doFingerprint && !doKey && !doBpm) {
    throw new Error(
      "Nothing to compute. Install fpcalc for fingerprints, and/or set MDB_KEY_CMD / MDB_BPM_CMD for key/BPM (see .env.example).\n" +
        FPCALC_INSTALL_HINT,
    );
  }

  const volume = await resolveTargetVolume(prisma, { volume: opts.volume, path: rootPath });
  logger.info({ volume: volume.label, rootPath, dryRun, doFingerprint, doKey, doBpm }, "acoustic analysis starting");

  if (!dryRun) {
    await prisma.run.updateMany({
      where: { volumeId: volume.id, kind: "FINGERPRINT", status: "RUNNING" },
      data: { status: "INTERRUPTED", finishedAt: new Date() },
    });
  }
  const run = dryRun
    ? { id: "dry-run" }
    : await prisma.run.create({
        data: {
          kind: "FINGERPRINT",
          status: "RUNNING",
          volumeId: volume.id,
          hostname: os.hostname(),
          mountPath: rootPath,
          rootRelPath: "",
          options: { concurrency },
        },
        select: { id: true },
      });

  const or: Array<Record<string, unknown>> = [];
  if (doFingerprint) or.push({ fingerprint: null });
  if (doKey) or.push({ camelot: null });
  if (doBpm) or.push({ bpm: null });
  const targets = (await prisma.audioFile.findMany({
    where: { file: { volumeId: volume.id }, OR: or },
    select: { fileId: true, fingerprint: true, camelot: true, bpm: true, file: { select: { relPath: true } } },
  })) as Array<{ fileId: string; fingerprint: string | null; camelot: string | null; bpm: number | null; file: { relPath: string } }>;

  logger.info({ toProcess: targets.length }, "audio files needing analysis");

  const bar = process.stdout.isTTY && !dryRun
    ? new cliProgress.SingleBar({ format: "analiza [{bar}] {percentage}% | {value}/{total} | fp {fp} · key {key} · bpm {bpm} · {errors} err" }, cliProgress.Presets.shades_classic)
    : null;
  bar?.start(targets.length, 0, { fp: 0, key: 0, bpm: 0, errors: 0 });

  let errors = 0;
  let fpCount = 0;
  let keyCount = 0;
  let bpmCount = 0;
  let processed = 0;

  for (let i = 0; i < targets.length; i += CHUNK) {
    const chunk = targets.slice(i, i + CHUNK);
    const results = await mapPool(chunk, concurrency, async (t) => {
      const abs = path.join(rootPath, t.file.relPath);
      const data: Record<string, unknown> = {};
      let error: string | null = null;
      let gotFp = false;

      if (doFingerprint && !t.fingerprint) {
        try { const fp = await runFpcalc(abs); data.fingerprint = fp.fingerprint; data.fingerprintDur = fp.duration; gotFp = true; }
        catch (err) { error = err instanceof Error ? err.message : String(err); logger.warn({ err: error, path: abs }, "fpcalc failed"); }
      }
      if (doKey && !t.camelot) {
        try { const k = await detectKey(abs, kCmd!); if (k.musicalKey) { data.musicalKey = k.musicalKey; data.camelot = k.camelot ?? null; data.keyBpmSource = "COMPUTED"; } }
        catch (err) { error ??= err instanceof Error ? err.message : String(err); logger.warn({ err: `${err}`, path: abs }, "key detection failed"); }
      }
      if (doBpm && t.bpm == null) {
        try { const b = await detectBpm(abs, bCmd!); if (b !== undefined) { data.bpm = b; data.keyBpmSource = "COMPUTED"; } }
        catch (err) { error ??= err instanceof Error ? err.message : String(err); logger.warn({ err: `${err}`, path: abs }, "bpm detection failed"); }
      }
      return { fileId: t.fileId, data, error, gotFp };
    });

    if (!dryRun) {
      const updates = results.filter((r) => Object.keys(r.data).length > 0);
      if (updates.length > 0) {
        await prisma.$transaction(updates.map((r) => prisma.audioFile.update({ where: { fileId: r.fileId }, data: r.data as never })));
      }
      const fpIds = results.filter((r) => r.gotFp).map((r) => r.fileId);
      if (fpIds.length > 0) {
        await prisma.file.updateMany({ where: { id: { in: fpIds } }, data: { scanStatus: "FINGERPRINTED" as never } });
      }
    }

    for (const r of results) {
      processed++;
      if (r.gotFp) fpCount++;
      if (r.data.camelot !== undefined || r.data.musicalKey !== undefined) keyCount++;
      if (r.data.bpm !== undefined) bpmCount++;
      if (r.error && Object.keys(r.data).length === 0) errors++;
    }
    bar?.update(processed, { fp: fpCount, key: keyCount, bpm: bpmCount, errors });
  }
  bar?.stop();

  if (!dryRun) {
    await prisma.run.update({
      where: { id: run.id },
      data: { status: "COMPLETED", finishedAt: new Date(), audioSeen: targets.length, errors },
    });
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}Analiza audio: ${processed} plikow | fingerprint ${fpCount}, key ${keyCount}, bpm ${bpmCount}, ${errors} bledow.`,
  );
  await disconnectPrisma();
}
