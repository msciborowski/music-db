/**
 * External-response cache (spec §16: jsonb raw responses; §2: cached lookups).
 * Wraps the ExternalMeta table so we never hit an API twice for the same query.
 */
import { db } from "../db.js";

export type MetaScope = "FILE" | "ALBUM" | "FINGERPRINT";
export type ExternalSource = "ACOUSTID" | "MUSICBRAINZ" | "DISCOGS";

export interface CacheRef {
  scope: MetaScope;
  source: ExternalSource;
  refFileId?: string | null;
  refDirId?: string | null;
  queryUsed: string;
}

/** Return a cached raw response for this exact query, or null. */
export async function getCached(prisma: ReturnType<typeof db>, ref: CacheRef): Promise<unknown | null> {
  const hit = (await prisma.externalMeta.findFirst({
    where: { source: ref.source as never, scope: ref.scope as never, queryUsed: ref.queryUsed },
    orderBy: { fetchedAt: "desc" },
    select: { raw: true },
  })) as { raw: unknown } | null;
  return hit ? hit.raw : null;
}

export async function putCached(
  prisma: ReturnType<typeof db>,
  ref: CacheRef,
  externalId: string | null,
  raw: unknown,
): Promise<void> {
  await prisma.externalMeta.create({
    data: {
      scope: ref.scope as never,
      source: ref.source as never,
      refFileId: ref.refFileId ?? null,
      refDirId: ref.refDirId ?? null,
      externalId,
      queryUsed: ref.queryUsed,
      raw: raw as never,
    },
  });
}
