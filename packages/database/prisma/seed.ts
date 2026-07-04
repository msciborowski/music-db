/**
 * Development seed (spec §16). Idempotent — safe to run repeatedly.
 * Creates one demo Volume with a small tree: a normal album directory and an
 * album-rip directory (single FLAC + .cue), so `search` / `stats` have data.
 *
 * Run: npm run seed -w @mdb/database
 */
import path from "node:path";
import dotenv from "dotenv";
import { createPrismaClient } from "../src/index.js";

// Seed runs via `tsx` directly (not through prisma.config.ts), so load .env
// ourselves — monorepo root first, then any package-local override.
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

const prisma = createPrismaClient();

async function main(): Promise<void> {
  const volume = await prisma.volume.upsert({
    where: { serialNumber: "DEMO-VOLUME-0001" },
    update: {},
    create: {
      label: "DYSK_DEMO",
      serialNumber: "DEMO-VOLUME-0001",
      fsType: "exfat",
      totalBytes: 2_000_398_934_016n,
      notes: "Seeded demo volume",
    },
  });

  const run = await prisma.run.create({
    data: {
      kind: "SCAN",
      status: "COMPLETED",
      volumeId: volume.id,
      hostname: "seed-host",
      mountPath: "E:/Muzyka",
      rootRelPath: "",
      startedAt: new Date(),
      finishedAt: new Date(),
    },
  });

  // --- Normal album directory ---
  const albumDir = await prisma.directory.upsert({
    where: { volumeId_relPath: { volumeId: volume.id, relPath: "Republika/1984 - Nieustanne Tango" } },
    update: { lastSeenRunId: run.id },
    create: {
      volumeId: volume.id,
      relPath: "Republika/1984 - Nieustanne Tango",
      name: "1984 - Nieustanne Tango",
      depth: 2,
      fileCount: 3,
      audioCount: 2,
      hasCue: false,
      type: "ALBUM",
      firstSeenRunId: run.id,
      lastSeenRunId: run.id,
    },
  });

  const tracks: Array<{ file: string; title: string; artist: string; no: number; dur: number }> = [
    { file: "01 - Republika - Nieustanne Tango.mp3", title: "Nieustanne Tango", artist: "Republika", no: 1, dur: 254.3 },
    { file: "02 - Republika - Fanatycy Ognia.mp3", title: "Fanatycy Ognia", artist: "Republika", no: 2, dur: 231.9 },
  ];

  for (const t of tracks) {
    const relPath = `${albumDir.relPath}/${t.file}`;
    const file = await prisma.file.upsert({
      where: { volumeId_relPath: { volumeId: volume.id, relPath } },
      update: { lastSeenRunId: run.id },
      create: {
        volumeId: volume.id,
        directoryId: albumDir.id,
        relPath,
        filename: t.file,
        filenameLower: t.file.toLowerCase(),
        filenameNorm: t.title.toLowerCase(),
        filenameNormAscii: t.title.toLowerCase(),
        extension: "mp3",
        fileType: "AUDIO",
        sizeBytes: BigInt(Math.round(t.dur * 128_000 / 8)),
        contentHash: `demohash-${t.no}`,
        hashAlgo: "xxhash64",
        scanStatus: "METADATA_READ",
        firstSeenRunId: run.id,
        lastSeenRunId: run.id,
      },
    });

    await prisma.audioFile.upsert({
      where: { fileId: file.id },
      update: {},
      create: {
        fileId: file.id,
        codec: "mp3",
        durationSec: t.dur,
        bitrate: 320_000,
        bitrateMode: "CBR",
        sampleRate: 44_100,
        channels: 2,
        lossless: false,
        tagTitle: t.title,
        tagArtist: t.artist,
        tagAlbum: "Nieustanne Tango",
        tagTrackNo: t.no,
        tagYear: 1984,
        hasId3v2: true,
        id3v2Version: "2.3.0",
        parsedTitle: t.title,
        parsedArtist: t.artist,
        parsedTrackNo: t.no,
      },
    });
  }

  // A cover image + info text sit next to the audio (search context, spec §15).
  for (const [fname, ftype, ext] of [
    ["coverfront.jpg", "IMAGE", "jpg"],
    ["info.txt", "TEXT", "txt"],
  ] as const) {
    const relPath = `${albumDir.relPath}/${fname}`;
    await prisma.file.upsert({
      where: { volumeId_relPath: { volumeId: volume.id, relPath } },
      update: { lastSeenRunId: run.id },
      create: {
        volumeId: volume.id,
        directoryId: albumDir.id,
        relPath,
        filename: fname,
        filenameLower: fname,
        filenameNorm: fname.replace(/\.[^.]+$/, ""),
        filenameNormAscii: fname.replace(/\.[^.]+$/, ""),
        extension: ext,
        fileType: ftype,
        sizeBytes: 128_000n,
        scanStatus: "HASHED",
        firstSeenRunId: run.id,
        lastSeenRunId: run.id,
      },
    });
  }

  // --- Album rip directory: one big FLAC + a .cue ---
  const ripDir = await prisma.directory.upsert({
    where: { volumeId_relPath: { volumeId: volume.id, relPath: "Kult/1987 - Kult (rip)" } },
    update: { lastSeenRunId: run.id },
    create: {
      volumeId: volume.id,
      relPath: "Kult/1987 - Kult (rip)",
      name: "1987 - Kult (rip)",
      depth: 2,
      fileCount: 2,
      audioCount: 1,
      hasCue: true,
      type: "ALBUM_RIP",
      firstSeenRunId: run.id,
      lastSeenRunId: run.id,
    },
  });

  const flacRel = `${ripDir.relPath}/Kult - Kult.flac`;
  const flacFile = await prisma.file.upsert({
    where: { volumeId_relPath: { volumeId: volume.id, relPath: flacRel } },
    update: { lastSeenRunId: run.id },
    create: {
      volumeId: volume.id,
      directoryId: ripDir.id,
      relPath: flacRel,
      filename: "Kult - Kult.flac",
      filenameLower: "kult - kult.flac",
      filenameNorm: "kult kult",
      filenameNormAscii: "kult kult",
      extension: "flac",
      fileType: "AUDIO",
      sizeBytes: 320_000_000n,
      contentHash: "demohash-rip",
      hashAlgo: "xxhash64",
      scanStatus: "METADATA_READ",
      firstSeenRunId: run.id,
      lastSeenRunId: run.id,
    },
  });

  const cueRel = `${ripDir.relPath}/Kult - Kult.cue`;
  const cueFile = await prisma.file.upsert({
    where: { volumeId_relPath: { volumeId: volume.id, relPath: cueRel } },
    update: { lastSeenRunId: run.id },
    create: {
      volumeId: volume.id,
      directoryId: ripDir.id,
      relPath: cueRel,
      filename: "Kult - Kult.cue",
      filenameLower: "kult - kult.cue",
      filenameNorm: "kult kult",
      filenameNormAscii: "kult kult",
      extension: "cue",
      fileType: "CUE",
      sizeBytes: 1_024n,
      scanStatus: "HASHED",
      firstSeenRunId: run.id,
      lastSeenRunId: run.id,
    },
  });

  const cueSheet = await prisma.cueSheet.upsert({
    where: { fileId: cueFile.id },
    update: {},
    create: {
      fileId: cueFile.id,
      refAudioFileId: flacFile.id,
      rawText: 'FILE "Kult - Kult.flac" WAVE\n  TRACK 01 AUDIO\n    TITLE "Wódka"\n    INDEX 01 00:00:00\n  TRACK 02 AUDIO\n    TITLE "Do Ani"\n    INDEX 01 03:12:00',
      encodingGuess: "cp1250",
      parseStatus: "OK",
      tracks: {
        create: [
          { trackNo: 1, title: "Wódka", performer: "Kult", startMs: 0, endMs: 192_000 },
          { trackNo: 2, title: "Do Ani", performer: "Kult", startMs: 192_000, endMs: 420_000 },
        ],
      },
    },
  });

  await prisma.audioFile.upsert({
    where: { fileId: flacFile.id },
    update: { isAlbumRip: true, needsSplit: true, cueSheetId: cueSheet.id },
    create: {
      fileId: flacFile.id,
      codec: "flac",
      durationSec: 2734.0,
      bitrate: 900_000,
      bitrateMode: "VBR",
      sampleRate: 44_100,
      channels: 2,
      lossless: true,
      tagAlbum: "Kult",
      tagArtist: "Kult",
      isAlbumRip: true,
      needsSplit: true,
      cueSheetId: cueSheet.id,
    },
  });

  const counts = {
    volumes: await prisma.volume.count(),
    directories: await prisma.directory.count(),
    files: await prisma.file.count(),
    audioFiles: await prisma.audioFile.count(),
    cueSheets: await prisma.cueSheet.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e: unknown) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
