/**
 * Pipeline phase metadata for the wizard (spec §2, §15). Pure + unit-testable.
 * Only Scan is runnable in Milestone 1; the rest are shown with a status hint
 * so the flow reflects the real pipeline (phases have order + dependencies).
 */
export type PhaseId = "SCAN" | "FINGERPRINT" | "ANALYZE" | "ENRICH";

export interface PhaseOption {
  value: PhaseId;
  label: string;
  hint: string;
  available: boolean;
}

export function phaseOptions(): PhaseOption[] {
  return [
    { value: "SCAN", label: "Scan", hint: "katalogowanie dysku do bazy", available: true },
    { value: "FINGERPRINT", label: "Fingerprint", hint: "odciski akustyczne (wymaga fpcalc + skanu)", available: true },
    { value: "ANALYZE", label: "Analyze", hint: "duplikaty, wersje/Work, ripy, wielopłytowe (bez dysku)", available: true },
    { value: "ENRICH", label: "Enrich", hint: "AcoustID/MusicBrainz/Discogs (sieć, wymaga kluczy API)", available: true },
  ];
}

export function isPhaseAvailable(phase: PhaseId): boolean {
  return phaseOptions().find((p) => p.value === phase)?.available ?? false;
}
