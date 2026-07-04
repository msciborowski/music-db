/**
 * Resolve which registered Volume a disk-touching run targets (spec §5).
 * Shared by `scan` and `fingerprint`: either an explicit --volume (id or label),
 * or matched from the mounted path's stable identity / soft key.
 */
import type { db } from "../db.js";
import { resolveVolumeIdentity, softKey } from "./resolver.js";

export interface TargetVolume {
  id: string;
  label: string;
}

export async function resolveTargetVolume(
  prisma: ReturnType<typeof db>,
  opts: { volume?: string; path?: string },
): Promise<TargetVolume> {
  if (opts.volume) {
    const byId = (await prisma.volume.findUnique({ where: { id: opts.volume }, select: { id: true, label: true } })) as TargetVolume | null;
    if (byId) return byId;
    const byLabel = (await prisma.volume.findFirst({ where: { label: opts.volume }, select: { id: true, label: true } })) as TargetVolume | null;
    if (byLabel) return byLabel;
    throw new Error(`No volume matches --volume "${opts.volume}". Register it first: mdb volume register`);
  }

  if (opts.path) {
    const identity = await resolveVolumeIdentity(opts.path);
    if (identity.serialNumber) {
      const match = (await prisma.volume.findUnique({ where: { serialNumber: identity.serialNumber }, select: { id: true, label: true } })) as TargetVolume | null;
      if (match) return match;
    }
    const key = softKey(identity);
    if (key && identity.label && identity.totalBytes !== undefined) {
      const match = (await prisma.volume.findFirst({
        where: { serialNumber: null, label: identity.label, totalBytes: identity.totalBytes, fsType: identity.fsType ?? null },
        select: { id: true, label: true },
      })) as TargetVolume | null;
      if (match) return match;
    }
  }

  throw new Error(
    "Could not match this path to a registered volume. Register it first with:\n" +
      `  mdb volume register --label "DYSK_..." --path "${opts.path ?? "<mount>"}"`,
  );
}
