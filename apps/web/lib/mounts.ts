import { prisma } from "./db";

/** Optional explicit mapping: MDB_MOUNTS='{"<volumeId or label>":"/Volumes/NAME"}'. */
function envMounts(): Record<string, string> {
  try {
    return process.env.MDB_MOUNTS ? (JSON.parse(process.env.MDB_MOUNTS) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/**
 * Where is this volume mounted *right now*? Cover art and audio streaming need
 * the live path. Prefer an explicit MDB_MOUNTS entry, else fall back to the most
 * recent run's mountPath (spec §5: mountPath is a non-persistent snapshot).
 */
export async function resolveMount(volumeId: string): Promise<string | null> {
  const db = prisma();
  const vol = (await db.volume.findUnique({ where: { id: volumeId }, select: { id: true, label: true } })) as { id: string; label: string } | null;
  const mounts = envMounts();
  if (vol) {
    if (mounts[vol.id]) return mounts[vol.id]!;
    if (mounts[vol.label]) return mounts[vol.label]!;
  }
  const run = (await db.run.findFirst({ where: { volumeId, mountPath: { not: null } }, orderBy: { startedAt: "desc" }, select: { mountPath: true } })) as { mountPath: string | null } | null;
  return run?.mountPath ?? null;
}
