/**
 * Interactive wizard (spec §15). Running `mdb` with no arguments enters this
 * arrow-key flow. It is only a front-end: it collects the same parameters as the
 * flag interface and calls the same handlers (`runScan`, `registerVolume`) — no
 * logic is duplicated here.
 *
 * TTY detection: when stdin/stdout is not a TTY (pipe, CI, redirect) the wizard
 * must not run — the caller falls back to help/flags.
 */
import fs from "node:fs";
import * as p from "@clack/prompts";
import { db } from "./db.js";
import { defaultConcurrency } from "./env.js";
import { runAnalyze } from "./analyze/analyze.js";
import { runEnrich } from "./enrich/enrich.js";
import { runFingerprint } from "./fingerprint/fingerprint.js";
import { searchCatalogue } from "./search.js";
import { showStats } from "./stats.js";
import { phaseOptions, type PhaseId } from "./phases.js";
import { runScan } from "./scan/scan.js";
import { registerVolume } from "./volume/handlers.js";

export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/** Validate a scan path (pure enough to unit-test). Returns an error or undefined. */
export function validateScanPath(value: string | undefined): string | undefined {
  if (!value || value.trim().length === 0) return "Podaj ścieżkę.";
  let stat: fs.Stats;
  try {
    stat = fs.statSync(value);
  } catch {
    return "Ścieżka nie istnieje.";
  }
  if (!stat.isDirectory()) return "To nie jest katalog.";
  return undefined;
}

const cancelled = (v: unknown): boolean => p.isCancel(v);

async function selectVolume(prisma: ReturnType<typeof db>): Promise<{ id: string; label: string } | null> {
  const volumes = (await prisma.volume.findMany({
    orderBy: { firstSeenAt: "asc" },
    select: { id: true, label: true, serialNumber: true },
  })) as Array<{ id: string; label: string; serialNumber: string | null }>;

  const choice = await p.select({
    message: "Wybierz wolumen",
    options: [
      ...volumes.map((v) => ({ value: v.id, label: v.label, hint: v.serialNumber ?? "brak serialu" })),
      { value: "__new__", label: "➕ Zarejestruj nowy wolumen", hint: "" },
    ],
  });
  if (cancelled(choice)) return null;

  if (choice === "__new__") {
    const label = await p.text({ message: "Etykieta wolumenu", placeholder: "DYSK_ROCK", validate: (v) => (v && v.trim() ? undefined : "Podaj etykietę.") });
    if (cancelled(label)) return null;
    const mountPath = await p.text({ message: "Ścieżka montowania (do rozpoznania dysku)", placeholder: "/Volumes/DYSK_ROCK", validate: validateScanPath });
    if (cancelled(mountPath)) return null;
    const s = p.spinner();
    s.start("Rozpoznaję tożsamość wolumenu");
    const v = await registerVolume({ label: String(label), path: String(mountPath) });
    s.stop(`Zarejestrowano: ${v.label}`);
    return v;
  }

  const picked = volumes.find((v) => v.id === choice);
  return picked ? { id: picked.id, label: picked.label } : null;
}

async function fingerprintFlow(prisma: ReturnType<typeof db>, volume: { id: string; label: string }): Promise<void> {
  const pending = (await prisma.audioFile.count({
    where: { fingerprint: null, file: { volumeId: volume.id } },
  })) as number;

  if (pending === 0) {
    p.note("Wszystkie pliki audio tego wolumenu mają już fingerprint (albo brak audio). Najpierw zrób Scan.", "Nic do zrobienia");
    p.outro("Do zobaczenia.");
    return;
  }

  const interrupted = (await prisma.run.findFirst({
    where: { volumeId: volume.id, kind: "FINGERPRINT", status: "INTERRUPTED" },
    orderBy: { startedAt: "desc" },
    select: { mountPath: true },
  })) as { mountPath: string | null } | null;

  const fpPath = await p.text({
    message: "Ścieżka montowania dysku (jak przy skanie)",
    placeholder: "/Volumes/DYSK_ROCK",
    initialValue: interrupted?.mountPath ?? "",
    validate: validateScanPath,
  });
  if (cancelled(fpPath)) {
    p.cancel("Anulowano.");
    return;
  }

  const conc = await p.text({
    message: "Współbieżność",
    placeholder: String(defaultConcurrency()),
    defaultValue: String(defaultConcurrency()),
    validate: (v) => (v && !/^\d+$/.test(v) ? "Podaj liczbę całkowitą." : undefined),
  });
  if (cancelled(conc)) {
    p.cancel("Anulowano.");
    return;
  }
  const concurrency = conc && String(conc).length > 0 ? Number.parseInt(String(conc), 10) : defaultConcurrency();

  p.note(
    [
      `Wolumen:       ${volume.label}`,
      `Ścieżka:       ${String(fpPath)}`,
      `Do odcisku:    ${pending} plików audio`,
      `Współbieżność: ${concurrency}`,
      `Wymaga:        fpcalc (Chromaprint) na PATH`,
    ].join("\n"),
    "Podsumowanie",
  );
  const go = await p.confirm({ message: "Uruchomić fingerprint?" });
  if (cancelled(go) || go !== true) {
    p.cancel("Anulowano.");
    return;
  }

  p.log.step("Generowanie odcisków…");
  await runFingerprint({ path: String(fpPath), volume: volume.id, concurrency });
  p.outro("Gotowe.");
}

async function analyzeFlow(volume: { id: string; label: string }): Promise<void> {
  p.note(
    [
      `Wolumen:  ${volume.label}`,
      "Faza:     Analyze (bez dysku)",
      "Zrobi:    normalizacja + rekoncyliacja (tag/nazwa + kontekst katalogu),",
      "          duplikaty (hash / fingerprint / nazwa), wersje→Work, ripy, wielopłytowe.",
    ].join("\n"),
    "Podsumowanie",
  );
  const go = await p.confirm({ message: "Uruchomić analizę?" });
  if (cancelled(go) || go !== true) {
    p.cancel("Anulowano.");
    return;
  }
  p.log.step("Analiza…");
  await runAnalyze({ volume: volume.id });
  p.outro("Gotowe.");
}

async function enrichFlow(volume: { id: string; label: string }): Promise<void> {
  p.note(
    [
      `Wolumen:  ${volume.label}`,
      "Faza:     Enrich (sieć)",
      "Zrobi:    AcoustID→MusicBrainz (autorytatywny Work) + Discogs (gatunki),",
      "          cache surowych odpowiedzi, rate-limit, per album.",
      "Wymaga:   ACOUSTID_KEY i/lub DISCOGS_TOKEN w .env",
    ].join("\n"),
    "Podsumowanie",
  );
  const go = await p.confirm({ message: "Uruchomić wzbogacanie?" });
  if (cancelled(go) || go !== true) {
    p.cancel("Anulowano.");
    return;
  }
  p.log.step("Odpytywanie zewnętrznych baz…");
  await runEnrich({ volume: volume.id, scope: "album" });
  p.outro("Gotowe.");
}

async function searchFlow(): Promise<void> {
  const query = await p.text({ message: "Czego szukasz?", placeholder: "np. yellow submarine", validate: (v) => (v && v.trim() ? undefined : "Wpisz zapytanie.") });
  if (cancelled(query)) {
    p.cancel("Anulowano.");
    return;
  }
  p.outro("Wyniki poniżej:");
  await searchCatalogue(String(query));
}

export async function runWizard(): Promise<void> {
  p.intro("mdb — Music DB");
  const prisma = db();

  const top = await p.select({
    message: "Co chcesz zrobić?",
    options: [
      { value: "phase", label: "Uruchom fazę", hint: "scan / fingerprint / analyze" },
      { value: "search", label: "Szukaj w katalogu", hint: "z kontekstem katalogu" },
      { value: "stats", label: "Statystyki", hint: "podsumowanie katalogu" },
    ],
  });
  if (cancelled(top)) {
    p.cancel("Anulowano.");
    return;
  }
  if (top === "search") {
    await searchFlow();
    return;
  }
  if (top === "stats") {
    p.outro("Statystyki poniżej:");
    await showStats();
    return;
  }

  const volume = await selectVolume(prisma);
  if (!volume) {
    p.cancel("Anulowano.");
    return;
  }

  const phase = await p.select({
    message: "Wybierz fazę",
    options: phaseOptions().map((o) => ({
      value: o.value,
      label: o.available ? o.label : `${o.label} (niedostępne)`,
      hint: o.hint,
    })),
  });
  if (cancelled(phase)) {
    p.cancel("Anulowano.");
    return;
  }
  if ((phase as PhaseId) === "FINGERPRINT") {
    await fingerprintFlow(prisma, volume);
    return;
  }
  if ((phase as PhaseId) === "ANALYZE") {
    await analyzeFlow(volume);
    return;
  }
  if ((phase as PhaseId) === "ENRICH") {
    await enrichFlow(volume);
    return;
  }
  if ((phase as PhaseId) !== "SCAN") {
    p.note("Nieznana faza.", "Błąd");
    p.outro("Do zobaczenia.");
    return;
  }

  // Offer resume when an interrupted scan exists for this volume.
  const interrupted = (await prisma.run.findFirst({
    where: { volumeId: volume.id, kind: "SCAN", status: "INTERRUPTED" },
    orderBy: { startedAt: "desc" },
    select: { id: true, mountPath: true },
  })) as { id: string; mountPath: string | null } | null;

  let resume = false;
  if (interrupted) {
    const r = await p.confirm({ message: `Wykryto przerwany skan (${interrupted.mountPath ?? "?"}). Wznowić?` });
    if (cancelled(r)) {
      p.cancel("Anulowano.");
      return;
    }
    resume = r === true;
  }

  const scanPath = await p.text({
    message: "Ścieżka do skanu",
    placeholder: "/Volumes/DYSK_ROCK",
    initialValue: interrupted?.mountPath ?? "",
    validate: validateScanPath,
  });
  if (cancelled(scanPath)) {
    p.cancel("Anulowano.");
    return;
  }

  const conc = await p.text({
    message: "Współbieżność",
    placeholder: String(defaultConcurrency()),
    defaultValue: String(defaultConcurrency()),
    validate: (v) => (v && !/^\d+$/.test(v) ? "Podaj liczbę całkowitą." : undefined),
  });
  if (cancelled(conc)) {
    p.cancel("Anulowano.");
    return;
  }

  const doHash = await p.confirm({ message: "Liczyć hash treści (xxhash64)?", initialValue: true });
  if (cancelled(doHash)) {
    p.cancel("Anulowano.");
    return;
  }
  const doMeta = await p.confirm({ message: "Czytać tagi i właściwości audio?", initialValue: true });
  if (cancelled(doMeta)) {
    p.cancel("Anulowano.");
    return;
  }
  const dryRun = await p.confirm({ message: "Tryb próbny (bez zapisu do bazy)?", initialValue: false });
  if (cancelled(dryRun)) {
    p.cancel("Anulowano.");
    return;
  }

  const concurrency = conc && String(conc).length > 0 ? Number.parseInt(String(conc), 10) : defaultConcurrency();

  p.note(
    [
      `Wolumen:       ${volume.label}`,
      `Ścieżka:       ${String(scanPath)}`,
      `Współbieżność: ${concurrency}`,
      `Hash:          ${doHash ? "tak" : "nie"}`,
      `Metadane:      ${doMeta ? "tak" : "nie"}`,
      `Tryb próbny:   ${dryRun ? "tak" : "nie"}`,
      `Wznowienie:    ${resume ? "tak" : "nie"}`,
    ].join("\n"),
    "Podsumowanie",
  );

  const go = await p.confirm({ message: "Uruchomić skan?" });
  if (cancelled(go) || go !== true) {
    p.cancel("Anulowano.");
    return;
  }

  p.log.step("Skanowanie…");
  await runScan({
    path: String(scanPath),
    volume: volume.id,
    concurrency,
    hash: doHash === true,
    metadata: doMeta === true,
    dryRun: dryRun === true,
    resume,
  });
  p.outro("Gotowe.");
}
