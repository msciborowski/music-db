# Music DB (`mdb`)

Cataloguing tool for external music archives. Read-only over the source disks —
it scans, analyzes and records everything to a Postgres database, without ever
modifying, moving or deleting the audio files. See `music-db-spec.md` for the
full specification.

Pipeline: **Scan → Fingerprint → Analyze → Enrich**. This repository currently
contains the **Milestone 1 foundation**: the monorepo, the full database schema
with migrations, and the pure domain logic (`@mdb/core`) with unit tests. The
`mdb` CLI, fingerprinting, analysis and enrichment land in the following
milestones.

## Layout

```
apps/
  api/        NestJS REST API for browsing the catalogue      (skeleton)
  cli/        `mdb` binary (commander)                        (skeleton — next step)
  web/        React + Next.js catalogue browser               (skeleton)
packages/
  core/       pure domain logic: normalization, filename parser,
              type classifier, .cue parser, domain types + Zod  ✅ built + tested
  database/   Prisma schema, migrations, client, dev seed       ✅ schema + migration
```

## Requirements

- **Node.js ≥ 22** and **npm 10** (npm workspaces).
- **PostgreSQL** (local or remote).
- **`fpcalc`** (Chromaprint) — *system dependency for the Fingerprint phase
  (Milestone 2)*, not needed yet:
  - macOS: `brew install chromaprint`
  - Debian/Ubuntu: `apt install libchromaprint-tools`

## Setup

```bash
npm install

# configure the database connection
cp .env.example .env      # then edit DATABASE_URL

# generate the Prisma client and apply migrations
npm run db:generate
npm run db:deploy         # applies the committed initial migration
npm run db:seed           # optional: demo data

# build + test
npm run build
npm test                  # runs the @mdb/core unit suite
```

### Working with the schema

The Prisma schema lives in `packages/database/prisma/schema.prisma`. Physical
Postgres names are `snake_case` (via `@map`/`@@map`); Prisma models stay
`PascalCase`/`camelCase`. The connection URL is configured in
`packages/database/prisma.config.ts` (Prisma 7 moved it out of the schema), and
the runtime client connects through the `@prisma/adapter-pg` driver adapter —
see `packages/database/src/index.ts` (`createPrismaClient` / `getPrisma`).

To change the schema and create a new migration against a running database:

```bash
npm run migrate -w @mdb/database    # prisma migrate dev
```

The initial migration `20260702120000_init` is committed so a fresh database can
be provisioned with `npm run db:deploy` alone.

## Using the CLI (`mdb`)

### Interactive wizard (default)

Run `mdb` with no arguments to enter an arrow-key wizard (spec §15): pick a
volume (or register a new one), pick a phase, set scan options, confirm, and
watch the progress bar. It offers to resume an interrupted scan automatically.

```bash
npm run mdb            # -> interactive wizard
```

(The wizard only runs on an interactive terminal; piped/CI input falls back to
flags + help.)

### Flags / subcommands

Phase 1 (Scan) commands are available. During development run via the workspace
(`npm run dev -w @mdb/cli -- <args>` or `npm run mdb -- <args>`); once built, the
`mdb` binary is on the path.

```bash
# 1. Register the disk (resolves a stable serial/UUID from the mounted path)
npm run dev -w @mdb/cli -- volume register --label "DYSK_ROCK" --path /Volumes/DYSK_ROCK
npm run dev -w @mdb/cli -- volume list

# 2. Scan it into the catalogue (read-only, hashes + reads tags + parses .cue)
npm run dev -w @mdb/cli -- scan /Volumes/DYSK_ROCK
npm run dev -w @mdb/cli -- scan /Volumes/DYSK_ROCK --dry-run          # no DB writes
npm run dev -w @mdb/cli -- scan /Volumes/DYSK_ROCK -c 6 --no-hash     # tune
npm run dev -w @mdb/cli -- scan /Volumes/DYSK_ROCK --resume           # continue after interruption

# 3. Acoustic analysis (phase 2, disk mounted): fingerprint + BPM + key (Camelot)
#    fingerprint needs fpcalc; BPM/key need MDB_KEY_CMD / MDB_BPM_CMD in .env
npm run dev -w @mdb/cli -- fingerprint /Volumes/DYSK_ROCK
npm run dev -w @mdb/cli -- fingerprint /Volumes/DYSK_ROCK --resume    # only files still missing data

# 4. Analyze (phase 3, no disk needed): normalize, reconcile, dedup, works, rips
npm run dev -w @mdb/cli -- analyze                 # whole catalogue
npm run dev -w @mdb/cli -- analyze --volume DYSK_ROCK --dry-run

# 5. Enrich from external DBs (phase 4, network; needs API keys in .env)
npm run dev -w @mdb/cli -- enrich --dry-run
npm run dev -w @mdb/cli -- enrich --source discogs

# 6. Browse: search (with directory context) and stats
npm run dev -w @mdb/cli -- search "yellow submarine"
npm run dev -w @mdb/cli -- stats

# 6. Check run history / resume hints
npm run dev -w @mdb/cli -- status
```

The same physical disk mounted under a different letter/path (e.g. `E:\Muzyka`
on Windows vs `/Volumes/...` on macOS) matches the existing volume via its serial
/ UUID, so re-scanning updates rows instead of duplicating them. Scanning is
idempotent (unchanged files are skipped), resumable, and read-only on the source.

## Web browser (`apps/web`)

A Next.js (App Router) + MUI + TanStack Query app for browsing and searching the
catalogue. Route handlers under `app/api/*` read the database via `@mdb/database`.

```bash
npm run web        # -> http://localhost:3000
```

Views: **Dashboard** (stats), **Szukaj** (search with directory context),
**Przeglądaj** (volumes → directory tree → album detail), **Duplikaty** (groups
by kind), **Utwory** (works with their versions).

Cover art is served read-only by fileId from the mounted disk (no audio playback
/ transcoding — spec §18). To show covers, the source disk must be mounted; the
app uses the most recent run's mount path by default, or an explicit override:

```bash
# .env — map a volume (id or label) to its current mount point:
MDB_MOUNTS='{"DYSK_ROCK":"/Volumes/DYSK_ROCK"}'
```

## Tech stack

TypeScript (strict) monorepo on Turborepo + npm workspaces. NestJS (API), Prisma 7 +
PostgreSQL, Zod for domain validation, React + Next.js + MUI (web, later). Exact
dependency versions are pinned (no floating ranges), per the spec.

## Status vs. spec

- **Milestone 1 (foundation)** — done: monorepo, `packages/database` (schema +
  init migration + seed), `packages/core` (normalization, filename parser,
  classifier, `.cue` parser, types — 36 unit tests).
- **Milestone 1 (CLI, scan pipeline)** — done: volume-identity resolver
  (Windows/macOS/Linux + soft-key fallback), `mdb volume register/list`, `mdb
  scan` (hash, tags, technical props, `.cue`, classification, idempotent,
  resumable, read-only, batched, progress bar), `mdb status`, interactive wizard.
- **Milestone 2 (Fingerprint / acoustic analysis)** — done: `mdb fingerprint`
  generates Chromaprint fingerprints (`fpcalc`) and, when configured, computes
  **BPM** and **musical key → Camelot** (e.g. `8A`) via external DSP tools
  (`MDB_KEY_CMD` / `MDB_BPM_CMD`, e.g. keyfinder-cli / aubio). Idempotent per
  field, resumable. Camelot mapping is pure + unit-tested in `@mdb/core`.
- **Milestone 3 (Analyze)** — done: `mdb analyze` (no disk) — normalization +
  context-aware reconciliation (tag/filename + directory track-number sequence,
  junk stripping), version→Work grouping, duplicates (EXACT_HASH /
  AUDIO_FINGERPRINT offline comparison / FUZZY_NAME), rip + needsSplit flags,
  multi-disc links, directory typing. Core logic has 69 unit tests.
- **Milestone 1 complete** — `mdb search <query>` (with directory context —
  sibling files grouped by type) and `mdb stats` are done; the wizard now has a
  top-level menu (run phase / search / stats).
- **Milestone 4 (Enrich)** — done: `mdb enrich` — AcoustID (fingerprint→recording
  MBID) → MusicBrainz (recording→Work, authoritative `mbWorkId`) and Discogs
  (album genres/year → tags). Rate-limited, cached (raw responses in
  `external_meta` jsonb), per album, skips sources without keys. Set
  `ACOUSTID_KEY` / `DISCOGS_TOKEN` in `.env` (see `.env.example`).
- **Next** — `apps/web` (React/Next/MUI catalogue browser), plus optional
  `cleanup` (list junk/system files) and rip splitting (FFmpeg + cue INDEX).
