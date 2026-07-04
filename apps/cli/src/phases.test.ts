import { describe, expect, it } from "vitest";
import { isPhaseAvailable, phaseOptions } from "./phases.js";

describe("phaseOptions", () => {
  it("lists all four pipeline phases", () => {
    expect(phaseOptions().map((o) => o.value)).toEqual(["SCAN", "FINGERPRINT", "ANALYZE", "ENRICH"]);
  });
  it("all four phases are available", () => {
    expect(isPhaseAvailable("SCAN")).toBe(true);
    expect(isPhaseAvailable("FINGERPRINT")).toBe(true);
    expect(isPhaseAvailable("ANALYZE")).toBe(true);
    expect(isPhaseAvailable("ENRICH")).toBe(true);
  });
});
