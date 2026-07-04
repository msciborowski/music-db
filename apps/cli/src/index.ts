#!/usr/bin/env node
/**
 * `mdb` — Music DB CLI (spec §15). Milestone-1 surface: volume register/list,
 * scan, status. (search / stats / fingerprint / analyze / enrich follow.)
 *
 * The flag interface and (later) the interactive wizard are two front-ends over
 * the same handlers — no logic duplicated here.
 */
import { Command, InvalidArgumentError } from "commander";
import { disconnectPrisma } from "./db.js";
import { loadEnv } from "./env.js";
import { logger } from "./logger.js";
import { showStatus } from "./status.js";
import { runAbImport, runAbVerify } from "./acousticbrainz/import.js";
import { searchCatalogue } from "./search.js";
import { showStats } from "./stats.js";
import { runAnalyze } from "./analyze/analyze.js";
import { runEnrich, type EnrichSource } from "./enrich/enrich.js";
import { runFingerprint } from "./fingerprint/fingerprint.js";
import { runScan } from "./scan/scan.js";
import { listVolumes, registerVolume } from "./volume/handlers.js";
import { isInteractive, runWizard } from "./wizard.js";

function parsePositiveInt(value: string): number {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) throw new InvalidArgumentError("Expected a positive integer.");
  return n;
}

/** Wrap an async handler: load env, run, report errors, always disconnect. */
function action<A extends unknown[]>(fn: (...args: A) => Promise<void>): (...args: A) => Promise<void> {
  return async (...args: A) => {
    try {
      loadEnv();
      await fn(...args);
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "command failed");
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    } finally {
      await disconnectPrisma();
    }
  };
}

const program = new Command();
program
  .name("mdb")
  .description("Music DB — catalogue external music archives (read-only)")
  .version("0.1.0");

const volume = program.command("volume").description("Manage volume identities");

volume
  .command("register")
  .description("Register (or match) a physical volume")
  .option("-l, --label <label>", "human label, e.g. DYSK_ROCK")
  .option("-p, --path <path>", "a mounted path on the disk (resolves stable id)")
  .action(action(async (opts: { label?: string; path?: string }) => {
    await registerVolume(opts);
  }));

volume
  .command("list")
  .description("List registered volumes")
  .action(action(async () => {
    await listVolumes();
  }));

program
  .command("scan")
  .argument("<path>", "path to scan (mounted disk or subfolder)")
  .description("Scan a path into the catalogue (phase 1: read-only)")
  .option("--volume <id|label>", "target volume (else resolved from path)")
  .option("-c, --concurrency <n>", "parallel workers", parsePositiveInt)
  .option("--no-hash", "skip content hashing")
  .option("--no-metadata", "skip audio tag/technical reading")
  .option("--dry-run", "do everything except write to the database")
  .option("--resume", "resume: reprocess only DISCOVERED/ERROR files")
  .action(action(async (pathArg: string, opts: { volume?: string; concurrency?: number; hash: boolean; metadata: boolean; dryRun?: boolean; resume?: boolean }) => {
    await runScan({
      path: pathArg,
      volume: opts.volume,
      concurrency: opts.concurrency,
      hash: opts.hash,
      metadata: opts.metadata,
      dryRun: opts.dryRun,
      resume: opts.resume,
    });
  }));

program
  .command("fingerprint")
  .argument("<path>", "the mounted path of the volume (same as scan)")
  .description("Generate acoustic fingerprints for audio files (phase 2, needs fpcalc)")
  .option("--volume <id|label>", "target volume (else resolved from path)")
  .option("-c, --concurrency <n>", "parallel workers", parsePositiveInt)
  .option("--dry-run", "do everything except write to the database")
  .option("--resume", "continue: only files without a fingerprint")
  .action(action(async (pathArg: string, opts: { volume?: string; concurrency?: number; dryRun?: boolean; resume?: boolean }) => {
    await runFingerprint({ path: pathArg, volume: opts.volume, concurrency: opts.concurrency, dryRun: opts.dryRun, resume: opts.resume });
  }));

program
  .command("analyze")
  .description("Analyze the catalogue: normalize, reconcile, dedup, works, rips (phase 3, no disk)")
  .option("--volume <id|label>", "scope per-file passes to one volume (dedup stays global)")
  .option("--dry-run", "compute without writing to the database")
  .action(action(async (opts: { volume?: string; dryRun?: boolean }) => {
    await runAnalyze({ volume: opts.volume, dryRun: opts.dryRun });
  }));

program
  .command("enrich")
  .description("Enrich metadata from external DBs (phase 4, network; needs API keys)")
  .option("--source <acoustid|musicbrainz|discogs>", "limit to one source (default: all available)")
  .option("--scope <album|file>", "query granularity (default: album)")
  .option("--volume <id|label>", "scope to one volume")
  .option("--dry-run", "query + cache but do not write derived fields")
  .action(action(async (opts: { source?: EnrichSource; scope?: "album" | "file"; volume?: string; dryRun?: boolean }) => {
    await runEnrich({ source: opts.source, scope: opts.scope, volume: opts.volume, dryRun: opts.dryRun });
  }));

const ab = program.command("acousticbrainz").description("Cross-verify BPM/key against the offline AcousticBrainz dataset");
ab
  .command("import")
  .argument("<path>", "directory of AcousticBrainz low-level JSON dump")
  .description("Import the dump into the local reference table (by MBID)")
  .action(action(async (dumpPath: string) => {
    await runAbImport(dumpPath);
  }));
ab
  .command("verify")
  .description("Compare computed BPM/key with the reference; set confirmed flags")
  .option("--volume <id|label>", "scope to one volume")
  .action(action(async (opts: { volume?: string }) => {
    await runAbVerify({ volume: opts.volume });
  }));

program
  .command("search")
  .argument("<query>", "text to search for (title, artist, filename)")
  .description("Search the catalogue and show directory context (sibling files)")
  .action(action(async (query: string) => {
    await searchCatalogue(query);
  }));

program
  .command("stats")
  .description("Show catalogue statistics")
  .action(action(async () => {
    await showStats();
  }));

program
  .command("status")
  .description("Show recent runs and resume hints")
  .action(action(async () => {
    await showStatus();
  }));

// No subcommand: enter the interactive wizard on a TTY (spec §15), otherwise
// require flags / a subcommand and show help.
if (process.argv.slice(2).length === 0) {
  if (isInteractive()) {
    await action(runWizard)();
  } else {
    console.error("Non-interactive terminal: pass a command or run in a TTY. See `mdb --help`.");
    program.outputHelp();
    process.exitCode = 1;
  }
} else {
  await program.parseAsync(process.argv);
}
