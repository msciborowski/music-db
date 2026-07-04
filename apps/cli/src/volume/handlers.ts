/**
 * `mdb volume register` / `mdb volume list` handlers (spec §5, §15).
 * The same physical disk mounted under a different letter/path matches the
 * existing Volume via its stable serial/UUID (or the soft-key fallback).
 */
import { db } from "../db.js";
import { logger } from "../logger.js";
import { resolveVolumeIdentity, softKey, type VolumeIdentity } from "./resolver.js";

export interface RegisterOptions {
  label?: string;
  path?: string;
  volume?: string;
}

function describe(v: { id: string; label: string; serialNumber: string | null; fsType: string | null; totalBytes: bigint | null }): string {
  const size = v.totalBytes !== null ? ` ${(Number(v.totalBytes) / 1e9).toFixed(1)} GB` : "";
  return `${v.label} [${v.serialNumber ?? "no-serial"}]${size} (id=${v.id})`;
}

/** Find an existing Volume matching the resolved identity (stable id or soft key). */
async function findMatch(
  prisma: ReturnType<typeof db>,
  identity: VolumeIdentity,
): Promise<{ id: string } | null> {
  if (identity.serialNumber) {
    return prisma.volume.findUnique({ where: { serialNumber: identity.serialNumber }, select: { id: true } });
  }
  const key = softKey(identity);
  if (key && identity.label && identity.totalBytes !== undefined) {
    return prisma.volume.findFirst({
      where: {
        serialNumber: null,
        label: identity.label,
        totalBytes: identity.totalBytes,
        fsType: identity.fsType ?? null,
      },
      select: { id: true },
    });
  }
  return null;
}

export async function registerVolume(opts: RegisterOptions): Promise<{ id: string; label: string }> {
  const prisma = db();

  let identity: VolumeIdentity = {};
  if (opts.path) {
    identity = await resolveVolumeIdentity(opts.path);
    logger.info({ mountPath: opts.path, identity: { ...identity, totalBytes: identity.totalBytes?.toString() } }, "resolved volume identity");
  }

  const label = opts.label ?? identity.label ?? "UNNAMED";

  const existing = await findMatch(prisma, identity);
  if (existing) {
    const v = await prisma.volume.update({
      where: { id: existing.id },
      data: { label, fsType: identity.fsType ?? undefined, totalBytes: identity.totalBytes ?? undefined },
    });
    console.log(`Volume already registered — updated: ${describe(v)}`);
    return { id: v.id, label: v.label };
  }

  if (!identity.serialNumber && !softKey(identity)) {
    logger.warn("no stable volume id and insufficient soft key; registering by label only (use --path on the mounted disk, or re-run when mounted)");
  }

  const created = await prisma.volume.create({
    data: {
      label,
      serialNumber: identity.serialNumber ?? null,
      fsType: identity.fsType ?? null,
      totalBytes: identity.totalBytes ?? null,
    },
  });
  console.log(`Registered volume: ${describe(created)}`);
  return { id: created.id, label: created.label };
}

export async function listVolumes(): Promise<void> {
  const prisma = db();
  const volumes = await prisma.volume.findMany({
    orderBy: { firstSeenAt: "asc" },
    include: { _count: { select: { files: true, directories: true, runs: true } } },
  });
  if (volumes.length === 0) {
    console.log("No volumes registered. Try: mdb volume register --label \"DYSK_...\" --path <mount>");
    return;
  }
  for (const v of volumes) {
    console.log(
      `${describe(v)} — ${v._count.files} files, ${v._count.directories} dirs, ${v._count.runs} runs`,
    );
  }
}
