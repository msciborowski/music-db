/**
 * Scan orchestrator (spec §13, §14) — phase 1 of the pipeline.
 *
 * Recursively catalogues a mounted path into the database: every file and
 * directory (incl. hidden/system), sizes, mtime, type classification, content
 * hash, audio tags + technical properties, and parsed `.cue` sheets.
 *
 * Idempotent (stable key `volumeId,relPath`; unchanged files skipped), resumable
 * (per-file `scanStatus`; interrupted runs marked), read-only on the source, and
 * batched (never row-per-transaction). A single bad file is logged and skipped.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cliProgress from "cli-progress";
import { db, disconnectPrisma } from "../db.js";
import { defaultConcurrency } from "../env.js";
import { logger } from "../logger.js";
import { resolveTargetVolume } from "../volume/target.js";
import { readCueFile } from "./cue.js";
import { hashFile, HASH_ALGO } from "./hash.js";
import { readAudioMetadata, type AudioMeta } from "./metadata.js";
import { buildFileRecord, type FileRecordCore } from "./record.js";
import { walk, type WalkEntry } from "./walk.js";

export interface ScanOptions {
  path: string;
  volume?: string;
  concurrency?: number;
  hash?: boolean;
  metadata?: boolean;
  dryRun?: boolean;
  resume?: boolean;
}

type Prisma = ReturnType<typeof db>;

const CHUNK = 500;

/** Ordered progress rank so a later pass never downgrades an earlier one. */
function statusRank(s: string | null | undefined): number {
  return s === "FINGERPRINTED" ? 3 : s === "METADATA_READ" ? 2 : s === "HASHED" ? 1 : 0;
}

async function mapPool<T, R>(items: T[], size: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, size) }, async () => {
    for (;;) {
      const idx = cursor++;
      if (idx >= items.length) break;
      results[idx] = await fn(items[idx]!, idx);
    }
  });
  await Promise.all(workers);
  return results;
}

interface PreparedFile {
  id: string;
  entry: WalkEntry;
  core: FileRecordCore;
  sizeBytes: bigint;
  mtime: Date | null;
  ctime: Date | null;
  isNew: boolean;
  skipHeavy: boolean;
  contentHash: string | null;
  audio: AudioMeta | null;
  scanStatus: string;
  scanError: string | null;
}

export async function runScan(opts: ScanOptions): Promise<void> {
  const prisma = db();
  const rootPath = path.resolve(opts.path);
  const doHash = opts.hash ?? true;
  const doMeta = opts.metadata ?? true;
  const concurrency = opts.concurrency ?? defaultConcurrency();
  const dryRun = opts.dryRun ?? false;

  const rootStat = await fs.promises.stat(rootPath).catch(() => null);
  if (!rootStat?.isDirectory()) {
    throw new Error(`Scan path is not a directory: ${rootPath}`);
  }

  const volume = await resolveTargetVolume(prisma, { volume: opts.volume, path: rootPath });
  logger.info({ volume: volume.label, rootPath, dryRun }, "scan starting");

  // Resumability: any still-RUNNING scan for this volume was interrupted.
  if (!dryRun) {
    await prisma.run.updateMany({
      where: { volumeId: volume.id, kind: "SCAN", status: "RUNNING" },
      data: { status: "INTERRUPTED", finishedAt: new Date() },
    });
  }

  const run = dryRun
    ? { id: "dry-run" }
    : await prisma.run.create({
        data: {
          kind: "SCAN",
          status: "RUNNING",
          volumeId: volume.id,
          hostname: os.hostname(),
          mountPath: rootPath,
          rootRelPath: "",
          options: { hash: doHash, metadata: doMeta, concurrency, resume: opts.resume ?? false },
        },
        select: { id: true },
      });

  // ---- 1. Walk the tree (collect dirs + files) ----
  const dirEntries: WalkEntry[] = [];
  const fileEntries: WalkEntry[] = [];
  let walkErrors = 0;
  const walkTty = process.stdout.isTTY;
  let discovered = 0;
  for await (const entry of walk(rootPath, { onError: (err, p) => { walkErrors++; logger.warn({ err: `${err}`, path: p }, "walk error"); } })) {
    (entry.isDir ? dirEntries : fileEntries).push(entry);
    discovered++;
    if (walkTty && discovered % 200 === 0) {
      process.stdout.write(String.fromCharCode(13) + `  obchodze drzewo: ${dirEntries.length} katalogow, ${fileEntries.length} plikow...`);
    }
  }
  if (walkTty) process.stdout.write(String.fromCharCode(13) + " ".repeat(64) + String.fromCharCode(13));
  logger.info({ dirs: dirEntries.length, files: fileEntries.length, walkErrors }, "walk complete");

  // ---- 2. Existing directories (files are looked up per-batch to bound memory) ----
  const existingDirs = (await prisma.directory.findMany({
    where: { volumeId: volume.id },
    select: { id: true, relPath: true },
  })) as Array<{ id: string; relPath: string }>;
  const dirIdByRel = new Map<string, string>(existingDirs.map((d) => [d.relPath, d.id]));

  // ---- 3. Persist directories (root first, then depth-ascending) ----
  const rootDir = { relPath: "", name: path.basename(rootPath) || rootPath, depth: 0, parentRelPath: null as string | null };
  const dirsToPersist: Array<{ relPath: string; name: string; depth: number; parentRelPath: string | null }> = [rootDir];
  for (const e of [...dirEntries].sort((a, b) => a.depth - b.depth)) {
    dirsToPersist.push({ relPath: e.relPath, name: e.name, depth: e.depth + 1, parentRelPath: e.parentRelPath });
  }
  for (const d of dirsToPersist) {
    const id = dirIdByRel.get(d.relPath) ?? randomUUID();
    dirIdByRel.set(d.relPath, id);
  }
  if (!dryRun) {
    for (let i = 0; i < dirsToPersist.length; i += CHUNK) {
      const chunk = dirsToPersist.slice(i, i + CHUNK);
      await prisma.$transaction(
        chunk.map((d) => {
          const id = dirIdByRel.get(d.relPath)!;
          const parentId = d.parentRelPath === null ? null : dirIdByRel.get(d.parentRelPath) ?? null;
          return prisma.directory.upsert({
            where: { volumeId_relPath: { volumeId: volume.id, relPath: d.relPath } },
            create: { id, volumeId: volume.id, relPath: d.relPath, name: d.name, depth: d.depth, parentId, firstSeenRunId: run.id, lastSeenRunId: run.id },
            update: { name: d.name, depth: d.depth, parentId, lastSeenRunId: run.id },
          });
        }),
      );
    }
  }

  const dirCount = dirsToPersist.length;
  dirEntries.length = 0;
  dirsToPersist.length = 0;

  // ---- 4. Stream files in batches: stat + hash + metadata + PERSIST each batch ----
  // Bounded memory + incremental writes: progress lands in the DB per batch, so
  // it survives a crash/OOM/interrupt and a re-run resumes (spec §13).
  console.log(`Znaleziono ${fileEntries.length} plikow w ${dirCount} katalogach. Przetwarzam${doHash ? " (z hashem)" : ""}...`);
  const bar = process.stdout.isTTY && !dryRun && fileEntries.length > 0
    ? new cliProgress.SingleBar({ format: "scan [{bar}] {percentage}% | {value}/{total} plikow | {errors} err" }, cliProgress.Presets.shades_classic)
    : null;
  bar?.start(fileEntries.length, 0, { errors: 0 });

  const FILE_BATCH = 500;
  let processedCount = 0;
  let audioCount = 0;
  let errorCount = walkErrors;
  let bytesSeen = 0n;
  const dirAgg = new Map<string, { files: number; audio: number; hasCue: boolean }>();
  const cueFiles: Array<{ id: string; absPath: string; parentRelPath: string }> = [];

  for (let i = 0; i < fileEntries.length; i += FILE_BATCH) {
    const batch = fileEntries.slice(i, i + FILE_BATCH);

    const existingRows = (await prisma.file.findMany({
      where: { volumeId: volume.id, relPath: { in: batch.map((e) => e.relPath) } },
      select: { id: true, relPath: true, sizeBytes: true, mtime: true, scanStatus: true, contentHash: true },
    })) as Array<{ id: string; relPath: string; sizeBytes: bigint; mtime: Date | null; scanStatus: string; contentHash: string | null }>;
    const existingByRel = new Map(existingRows.map((r) => [r.relPath, r]));

    const prepared = await mapPool(batch, concurrency, async (entry): Promise<PreparedFile | null> => {
      let stat: fs.Stats;
      try {
        stat = await fs.promises.lstat(entry.absPath);
      } catch (err) {
        errorCount++;
        logger.debug({ err: `${err}`, path: entry.absPath }, "stat failed");
        bar?.increment(1, { errors: errorCount });
        return null;
      }
      const core = buildFileRecord(entry.relPath, entry.name);
      const sizeBytes = BigInt(stat.size);
      const mtime = stat.mtime ?? null;
      const existing = existingByRel.get(entry.relPath);
      const isNew = existing === undefined;
      const changed = existing !== undefined && (existing.sizeBytes !== sizeBytes || existing.mtime?.getTime() !== mtime?.getTime());
      const reprocess = existing?.scanStatus === "ERROR" || existing?.scanStatus === "DISCOVERED";
      const isAudio = core.fileType === "AUDIO";
      const isSystem = core.fileType === "SYSTEM";

      // Compute only what's missing (supports a no-hash pass then a hash pass).
      const needHash = doHash && !isSystem && (isNew || changed || reprocess || existing?.contentHash == null);
      const needMeta = doMeta && isAudio && (isNew || changed || reprocess || statusRank(existing?.scanStatus) < 2);

      let contentHash: string | null = isNew || changed ? null : existing?.contentHash ?? null;
      let audio: AudioMeta | null = null;
      let scanError: string | null = null;
      let hadError = false;

      if (needHash || needMeta) {
        try {
          if (needHash) contentHash = await hashFile(entry.absPath);
          if (needMeta) audio = await readAudioMetadata(entry.absPath, entry.name);
        } catch (err) {
          hadError = true;
          scanError = err instanceof Error ? err.message : String(err);
          errorCount++;
          logger.debug({ err: scanError, path: entry.absPath }, "file processing error");
        }
      }

      // Progress level, never downgrading prior work.
      let level = !isNew && !changed && existing.scanStatus !== "ERROR" ? statusRank(existing.scanStatus) : 0;
      if (contentHash != null) level = Math.max(level, 1);
      if (audio != null) level = Math.max(level, 2);
      const scanStatus = hadError ? "ERROR" : level >= 3 ? "FINGERPRINTED" : level === 2 ? "METADATA_READ" : level === 1 ? "HASHED" : "DISCOVERED";
      const skipHeavy = !isNew && !changed && !reprocess && !needHash && !needMeta;

      bar?.increment(1, { errors: errorCount });
      return {
        id: existing?.id ?? randomUUID(),
        entry,
        core,
        sizeBytes,
        mtime,
        ctime: stat.ctime ?? null,
        isNew,
        skipHeavy,
        contentHash,
        audio,
        scanStatus,
        scanError,
      };
    });

    const valid = prepared.filter((p): p is PreparedFile => p !== null);

    if (!dryRun) {
      // Persist in small sub-batches so no single transaction runs long; a failed
      // sub-batch is logged and retried on the next scan (files stay idempotent).
      const DB_CHUNK = 100;
      for (let j = 0; j < valid.length; j += DB_CHUNK) {
        const sub = valid.slice(j, j + DB_CHUNK);
        const ops = sub.flatMap((f) => {
          const directoryId = dirIdByRel.get(f.entry.parentRelPath) ?? dirIdByRel.get("")!;
          const fileData = {
            directoryId,
            volumeId: volume.id,
            relPath: f.core.relPath,
            filename: f.core.filename,
            filenameLower: f.core.filenameLower,
            filenameNorm: f.core.filenameNorm,
            filenameNormAscii: f.core.filenameNormAscii,
            extension: f.core.extension,
            fileType: f.core.fileType as never,
            sizeBytes: f.sizeBytes,
            mtime: f.mtime,
            ctime: f.ctime,
            contentHash: f.contentHash,
            hashAlgo: f.contentHash ? HASH_ALGO : null,
            isHidden: f.core.isHidden,
            isSystem: f.core.isSystem,
            scanStatus: f.scanStatus as never,
            scanError: f.scanError,
          };
          const upsertFile = prisma.file.upsert({
            where: { volumeId_relPath: { volumeId: volume.id, relPath: f.core.relPath } },
            create: { id: f.id, ...fileData, firstSeenRunId: run.id, lastSeenRunId: run.id },
            update: { ...fileData, lastSeenRunId: run.id },
          });
          const list = [upsertFile];
          if (f.audio) {
            list.push(
              prisma.audioFile.upsert({
                where: { fileId: f.id },
                create: { fileId: f.id, ...audioData(f.audio) },
                update: audioData(f.audio),
              }) as never,
            );
          }
          return list;
        });
        try {
          await prisma.$transaction(ops);
        } catch (err) {
          errorCount += sub.length;
          logger.warn({ err: `${err}` }, "batch persist failed (will retry on next scan)");
        }
      }
    }

    for (const f of valid) {
      processedCount++;
      bytesSeen += f.sizeBytes;
      if (f.core.fileType === "AUDIO") audioCount++;
      if (f.core.fileType === "CUE") cueFiles.push({ id: f.id, absPath: f.entry.absPath, parentRelPath: f.entry.parentRelPath });
      const agg = dirAgg.get(f.entry.parentRelPath) ?? { files: 0, audio: 0, hasCue: false };
      agg.files++;
      if (f.core.fileType === "AUDIO") agg.audio++;
      if (f.core.fileType === "CUE") agg.hasCue = true;
      dirAgg.set(f.entry.parentRelPath, agg);
    }

    if (!dryRun) {
      await prisma.run.update({ where: { id: run.id }, data: { filesSeen: processedCount, audioSeen: audioCount, errors: errorCount, bytesSeen } });
    }
  }
  bar?.stop();
  fileEntries.length = 0;

  // ---- 5. Cue sheets (ref resolved via DB, so nothing is held in memory) ----
  for (const cue of cueFiles) {
    try {
      const parsed = await readCueFile(cue.absPath);
      let refAudioFileId: string | null = null;
      if (parsed.fileRef) {
        const refRel = cue.parentRelPath ? `${cue.parentRelPath}/${parsed.fileRef}` : parsed.fileRef;
        const ref = (await prisma.file.findFirst({ where: { volumeId: volume.id, relPath: refRel }, select: { id: true } })) as { id: string } | null;
        refAudioFileId = ref?.id ?? null;
      }
      if (!dryRun) {
        await prisma.cueSheet.upsert({
          where: { fileId: cue.id },
          create: { fileId: cue.id, refAudioFileId, rawText: parsed.rawText, encodingGuess: parsed.encodingGuess, parseStatus: parsed.parseStatus, parseError: parsed.parseError ?? null },
          update: { refAudioFileId, rawText: parsed.rawText, encodingGuess: parsed.encodingGuess, parseStatus: parsed.parseStatus, parseError: parsed.parseError ?? null },
        });
        const sheet = (await prisma.cueSheet.findUnique({ where: { fileId: cue.id }, select: { id: true } })) as { id: string } | null;
        if (sheet) {
          await prisma.cueTrack.deleteMany({ where: { cueSheetId: sheet.id } });
          if (parsed.tracks.length > 0) {
            await prisma.cueTrack.createMany({ data: parsed.tracks.map((t) => ({ cueSheetId: sheet.id, trackNo: t.trackNo, title: t.title ?? null, performer: t.performer ?? null, startMs: t.startMs ?? null, endMs: t.endMs ?? null })) });
          }
        }
      }
    } catch (err) {
      errorCount++;
      logger.debug({ err: `${err}`, path: cue.absPath }, "cue processing error");
    }
  }

  // ---- 6. Directory aggregates ----
  if (!dryRun) {
    const dirRels = [...dirAgg.keys()];
    for (let i = 0; i < dirRels.length; i += CHUNK) {
      const chunk = dirRels.slice(i, i + CHUNK);
      await prisma.$transaction(
        chunk.map((rel) => {
          const agg = dirAgg.get(rel)!;
          const id = dirIdByRel.get(rel)!;
          return prisma.directory.update({ where: { id }, data: { fileCount: agg.files, audioCount: agg.audio, hasCue: agg.hasCue } });
        }),
      );
    }
  }

  // ---- 7. Finalize run ----
  if (!dryRun) {
    await prisma.run.update({
      where: { id: run.id },
      data: { status: "COMPLETED", finishedAt: new Date(), dirsSeen: dirCount, filesSeen: processedCount, audioSeen: audioCount, errors: errorCount, bytesSeen },
    });
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}Scan complete: ${processedCount} files (${audioCount} audio), ${dirCount} dirs, ${cueFiles.length} cue sheets, ${errorCount} errors, ${(Number(bytesSeen) / 1e9).toFixed(2)} GB.`,
  );
  await disconnectPrisma();
}

function audioData(a: AudioMeta) {
  return {
    codec: a.codec ?? null,
    durationSec: a.durationSec ?? null,
    bitrate: a.bitrate ?? null,
    bitrateMode: a.bitrateMode as never,
    sampleRate: a.sampleRate ?? null,
    channels: a.channels ?? null,
    lossless: a.lossless,
    tagTitle: a.tagTitle ?? null,
    tagArtist: a.tagArtist ?? null,
    tagAlbum: a.tagAlbum ?? null,
    tagAlbumArtist: a.tagAlbumArtist ?? null,
    tagTrackNo: a.tagTrackNo ?? null,
    tagDiscNo: a.tagDiscNo ?? null,
    tagYear: a.tagYear ?? null,
    tagGenre: a.tagGenre ?? null,
    tagComment: a.tagComment ?? null,
    hasId3v1: a.hasId3v1,
    hasId3v2: a.hasId3v2,
    id3v2Version: a.id3v2Version ?? null,
    encodingGuess: a.encodingGuess ?? null,
    parsedTitle: a.parsedTitle ?? null,
    parsedArtist: a.parsedArtist ?? null,
    parsedTrackNo: a.parsedTrackNo ?? null,
  };
}
