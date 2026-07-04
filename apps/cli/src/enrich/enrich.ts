/**
 * Enrich orchestrator (spec §2 phase 4, §11) — network phase. Per album:
 *   fingerprinted track -> AcoustID -> recording MBID
 *                       -> MusicBrainz recording -> Work (authoritative mbWorkId)
 *   album query          -> Discogs -> genres/year (attached as tags)
 * Slow, rate-limited, and cached (raw responses in ExternalMeta jsonb). Only the
 * sources whose keys are present run; missing keys are skipped with a note.
 */
import os from "node:os";
import cliProgress from "cli-progress";
import { db, disconnectPrisma } from "../db.js";
import { acoustidKey, discogsToken, userAgent } from "../env.js";
import { logger } from "../logger.js";
import { resolveTargetVolume } from "../volume/target.js";
import { acoustidLookup, parseAcoustidResponse } from "./acoustid.js";
import { getCached, putCached } from "./cache.js";
import { discogsSearch, parseDiscogsSearch } from "./discogs.js";
import { mbRecordingLookup, parseMbRecording } from "./musicbrainz.js";
import { RateLimiter } from "./ratelimit.js";

export type EnrichSource = "acoustid" | "musicbrainz" | "discogs";

export interface EnrichOptions {
  volume?: string;
  source?: EnrichSource;
  scope?: "album" | "file";
  dryRun?: boolean;
}

interface AlbumDir {
  id: string;
  name: string;
  audio: Array<{
    fileId: string;
    fingerprint: string | null;
    durationSec: number | null;
    resolvedArtist: string | null;
    resolvedTitle: string | null;
    tagAlbum: string | null;
    workId: string | null;
  }>;
}

export async function runEnrich(opts: EnrichOptions): Promise<void> {
  const prisma = db();
  const dryRun = opts.dryRun ?? false;
  const sources = opts.source ? [opts.source] : (["acoustid", "musicbrainz", "discogs"] as EnrichSource[]);

  const key = acoustidKey();
  const token = discogsToken();
  const ua = userAgent();

  const wantAcoustid = sources.includes("acoustid");
  const wantMb = sources.includes("musicbrainz");
  const wantDiscogs = sources.includes("discogs");

  if ((wantAcoustid || wantMb) && !key) {
    logger.warn("ACOUSTID_KEY not set — AcoustID/MusicBrainz lookups (fingerprint-based) will be skipped. See .env.example.");
  }
  if (wantDiscogs && !token) {
    logger.warn("DISCOGS_TOKEN not set — Discogs lookups will be skipped. See .env.example.");
  }
  if (!key && !token) {
    throw new Error("No API credentials configured. Set ACOUSTID_KEY and/or DISCOGS_TOKEN in .env (see .env.example).");
  }

  const volume = opts.volume ? await resolveTargetVolume(prisma, { volume: opts.volume }) : null;
  const run = dryRun
    ? { id: "dry-run" }
    : await prisma.run.create({ data: { kind: "ENRICH", status: "RUNNING", volumeId: volume?.id ?? null, hostname: os.hostname(), options: { sources, scope: opts.scope ?? "album" } }, select: { id: true } });

  const acoustidLimiter = new RateLimiter(350); // ~3 req/s
  const mbLimiter = new RateLimiter(1100); // ~1 req/s (MusicBrainz policy)
  const discogsLimiter = new RateLimiter(1100);

  // Albums = ALBUM / ALBUM_RIP directories in scope.
  const albums = (await prisma.directory.findMany({
    where: { ...(volume ? { volumeId: volume.id } : {}), type: { in: ["ALBUM", "ALBUM_RIP", "MULTIDISC_CHILD"] as never } },
    select: {
      id: true, name: true,
      files: {
        where: { fileType: "AUDIO" as never },
        select: { audio: { select: { fileId: true, fingerprint: true, durationSec: true, resolvedArtist: true, resolvedTitle: true, tagAlbum: true, workId: true } } },
      },
    },
  })) as Array<{ id: string; name: string; files: Array<{ audio: AlbumDir["audio"][number] | null }> }>;

  let acoustidHits = 0;
  let mbWorks = 0;
  let discogsHits = 0;
  let processed = 0;
  let barIdx = 0;

  const bar = process.stdout.isTTY
    ? new cliProgress.SingleBar({ format: "enrich [{bar}] {percentage}% | {value}/{total} albums | AcoustID {ac} · MB {mb} · Discogs {dg}" }, cliProgress.Presets.shades_classic)
    : null;
  bar?.start(albums.length, 0, { ac: 0, mb: 0, dg: 0 });
  const tick = (): void => bar?.update(++barIdx, { ac: acoustidHits, mb: mbWorks, dg: discogsHits });

  for (const album of albums) {
    const audio = album.files.map((f) => f.audio).filter((a): a is AlbumDir["audio"][number] => !!a);
    if (audio.length === 0) {
      tick();
      continue;
    }
    processed++;

    // --- AcoustID + MusicBrainz on a representative fingerprinted track ---
    const rep = audio.find((a) => a.fingerprint && a.durationSec) ?? null;
    if (key && wantAcoustid && rep?.fingerprint && rep.durationSec) {
      try {
        const cacheRef = { scope: "FINGERPRINT" as const, source: "ACOUSTID" as const, refFileId: rep.fileId, queryUsed: rep.fingerprint.slice(0, 64) };
        let raw = await getCached(prisma, cacheRef);
        let recordings;
        if (raw) {
          recordings = parseAcoustidResponse(raw);
        } else {
          const result = await acoustidLookup(key, rep.fingerprint, rep.durationSec, { limiter: acoustidLimiter });
          raw = result.raw;
          recordings = result.recordings;
          if (!dryRun) await putCached(prisma, cacheRef, recordings[0]?.recordingMbid ?? null, raw);
        }
        const best = recordings[0];
        if (best) {
          acoustidHits++;
          if (!dryRun) await prisma.audioFile.update({ where: { fileId: rep.fileId }, data: { acoustId: best.recordingMbid } });

          if (wantMb && rep.workId) {
            const mbRef = { scope: "FINGERPRINT" as const, source: "MUSICBRAINZ" as const, refFileId: rep.fileId, queryUsed: best.recordingMbid };
            let mbRaw = await getCached(prisma, mbRef);
            let info;
            if (mbRaw) {
              info = parseMbRecording(mbRaw);
            } else {
              const mb = await mbRecordingLookup(best.recordingMbid, ua, { limiter: mbLimiter });
              mbRaw = mb.raw;
              info = mb.info;
              if (!dryRun) await putCached(prisma, mbRef, info.workMbid ?? null, mbRaw);
            }
            if (info.workMbid && !dryRun) {
              await prisma.work.update({ where: { id: rep.workId }, data: { mbWorkId: info.workMbid, title: info.workTitle ?? undefined, artist: info.artist ?? undefined, confidence: 0.95 } });
              mbWorks++;
            }
          }
        }
      } catch (err) {
        logger.warn({ err: `${err}`, album: album.name }, "acoustid/musicbrainz enrich failed");
      }
    }

    // --- Discogs album metadata -> genre tags ---
    if (token && wantDiscogs) {
      const artist = rep?.resolvedArtist ?? "";
      const albumName = rep?.tagAlbum ?? album.name;
      const query = `${artist} ${albumName}`.trim();
      if (query.length > 1) {
        try {
          const dRef = { scope: "ALBUM" as const, source: "DISCOGS" as const, refDirId: album.id, queryUsed: query };
          let dRaw = await getCached(prisma, dRef);
          let albumMeta;
          if (dRaw) {
            albumMeta = parseDiscogsSearch(dRaw);
          } else {
            const d = await discogsSearch(token, query, { limiter: discogsLimiter, userAgent: ua });
            dRaw = d.raw;
            albumMeta = d.album;
            if (!dryRun) await putCached(prisma, dRef, albumMeta?.discogsId ? String(albumMeta.discogsId) : null, dRaw);
          }
          if (albumMeta && !dryRun) {
            discogsHits++;
            await attachGenreTags(prisma, audio.map((a) => a.fileId), [...albumMeta.genres, ...albumMeta.styles]);
          }
        } catch (err) {
          logger.warn({ err: `${err}`, album: album.name }, "discogs enrich failed");
        }
      }
    }

    tick();
  }
  bar?.stop();

  if (!dryRun) {
    await prisma.run.update({ where: { id: run.id }, data: { status: "COMPLETED", finishedAt: new Date(), audioSeen: processed } });
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}Enrich complete: ${processed} albums | AcoustID ${acoustidHits}, MB works ${mbWorks}, Discogs ${discogsHits}.`,
  );
  await disconnectPrisma();
}

async function attachGenreTags(prisma: ReturnType<typeof db>, fileIds: string[], names: string[]): Promise<void> {
  for (const name of new Set(names.map((n) => n.trim()).filter(Boolean))) {
    const tag = (await prisma.tag.upsert({
      where: { name_source: { name, source: "discogs" } },
      update: {},
      create: { name, kind: "genre", source: "discogs" },
      select: { id: true },
    })) as { id: string };
    for (const fileId of fileIds) {
      await prisma.fileTag.upsert({
        where: { fileId_tagId: { fileId, tagId: tag.id } },
        update: {},
        create: { fileId, tagId: tag.id, source: "discogs", confidence: 0.8 },
      });
    }
  }
}
