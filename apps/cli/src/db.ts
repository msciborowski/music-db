/**
 * Thin database access for the CLI. Isolated here so the pure I/O modules
 * (walk / hash / metadata / record / resolver) never transitively import Prisma.
 */
import { disconnectPrisma, getPrisma } from "@mdb/database";
import { loadEnv, requireDatabaseUrl } from "./env.js";

export function db(): ReturnType<typeof getPrisma> {
  loadEnv();
  requireDatabaseUrl();
  return getPrisma();
}

export { disconnectPrisma };
