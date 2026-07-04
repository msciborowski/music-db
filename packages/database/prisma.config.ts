import path from "node:path";
import dotenv from "dotenv";
import { defineConfig, env } from "prisma/config";

// Load env from the monorepo root first (single source of truth), then any
// package-local .env override. Prisma runs this config with cwd = package dir.
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

/**
 * Prisma 7 configuration (spec §3, §16).
 *
 * In Prisma 7 the datasource connection URL lives here (not in schema.prisma),
 * and is used by Migrate/introspection. The runtime PrismaClient connects via a
 * driver adapter (see src/index.ts, @prisma/adapter-pg).
 */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
});
