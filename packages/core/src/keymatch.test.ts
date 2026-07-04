import { describe, expect, it } from "vitest";
import { abKeyToCamelot, bpmAgrees, camelotAgrees } from "./keymatch.js";

describe("bpmAgrees", () => {
  it("matches within tolerance", () => {
    expect(bpmAgrees(128, 128)).toBe(true);
    expect(bpmAgrees(128, 128.9)).toBe(true);
    expect(bpmAgrees(128, 131)).toBe(false);
  });
  it("tolerates half/double time", () => {
    expect(bpmAgrees(174, 87)).toBe(true);
    expect(bpmAgrees(87, 174)).toBe(true);
  });
  it("rejects nullish/zero", () => {
    expect(bpmAgrees(null, 128)).toBe(false);
    expect(bpmAgrees(0, 0)).toBe(false);
  });
});

describe("camelotAgrees", () => {
  it("exact, case-insensitive", () => {
    expect(camelotAgrees("8A", "8a")).toBe(true);
    expect(camelotAgrees("8A", "9A")).toBe(false);
    expect(camelotAgrees(null, "8A")).toBe(false);
  });
});

describe("abKeyToCamelot", () => {
  it("maps AcousticBrainz key_key + key_scale", () => {
    expect(abKeyToCamelot("A", "minor")).toBe("8A");
    expect(abKeyToCamelot("C", "major")).toBe("8B");
    expect(abKeyToCamelot("F#", "minor")).toBe("11A");
    expect(abKeyToCamelot(null, "minor")).toBeUndefined();
  });
});
