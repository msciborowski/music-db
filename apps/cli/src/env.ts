/**
 * Environment loading for the CLI. Walks up from the working directory to find
 * the nearest `.env` (repo root when run from a subfolder), without overriding
 * variables already present in the real environment.
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

let loaded = false;

function findEnvFile(start: string): string | undefined {
  let dir = path.resolve(start);
  for (;;) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export function loadEnv(): void {
  if (loaded) return;
  const envFile = findEnvFile(process.cwd());
  if (envFile) dotenv.config({ path: envFile });
  loaded = true;
}

/** Default scan concurrency (spec §14: moderate 4–6). */
export function defaultConcurrency(): number {
  const raw = process.env.MDB_CONCURRENCY;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 4;
}

/** AcoustID API key (free, https://acoustid.org/api-key). */
export function acoustidKey(): string | undefined {
  return process.env.ACOUSTID_KEY || undefined;
}

/** Discogs personal access token (https://www.discogs.com/settings/developers). */
export function discogsToken(): string | undefined {
  return process.env.DISCOGS_TOKEN || undefined;
}

/** User-Agent for external APIs (MusicBrainz/Discogs require a descriptive one). */
export function userAgent(): string {
  return process.env.MDB_USER_AGENT || "MusicDB/0.1 (music-db; local catalogue tool)";
}

/** Configurable command to detect musical key (e.g. `keyfinder-cli "{file}"`). */
export function keyCmd(): string | undefined {
  return process.env.MDB_KEY_CMD || undefined;
}

/** Configurable command to detect BPM (e.g. `aubio tempo "{file}"`). */
export function bpmCmd(): string | undefined {
  return process.env.MDB_BPM_CMD || undefined;
}

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to your .env (repo root) or environment.",
    );
  }
  return url;
}
