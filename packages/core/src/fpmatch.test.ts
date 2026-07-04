import { describe, expect, it } from "vitest";
import { bitErrorRate, clusterByFingerprint } from "./fpmatch.js";

const fp = (arr: number[]): Uint32Array => Uint32Array.from(arr.map((x) => x >>> 0));

describe("bitErrorRate", () => {
  it("is 0 for identical arrays", () => {
    expect(bitErrorRate(fp([1, 2, 3, 4]), fp([1, 2, 3, 4]))).toBe(0);
  });
  it("counts differing bits over aligned prefix", () => {
    // 0b0000 vs 0b0001 -> 1 bit diff over 1 word (32 bits)
    expect(bitErrorRate(fp([0]), fp([1]))).toBeCloseTo(1 / 32, 6);
  });
  it("is 1 for empty", () => {
    expect(bitErrorRate(fp([]), fp([1]))).toBe(1);
  });
});

describe("clusterByFingerprint", () => {
  it("groups near-identical fingerprints of similar duration", () => {
    const groups = clusterByFingerprint([
      { id: "mp3", fingerprint: fp([100, 200, 300, 400]), durationSec: 254 },
      { id: "flac", fingerprint: fp([100, 200, 300, 401]), durationSec: 255 }, // 1 bit off
      { id: "other", fingerprint: fp([~100, ~200, ~300, ~401]), durationSec: 254 }, // bitwise-opposite -> far
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.sort()).toEqual(["flac", "mp3"]);
  });

  it("does not group when durations are far apart", () => {
    const groups = clusterByFingerprint([
      { id: "a", fingerprint: fp([100, 200, 300, 400]), durationSec: 100 },
      { id: "b", fingerprint: fp([100, 200, 300, 400]), durationSec: 400 },
    ]);
    expect(groups).toHaveLength(0);
  });
});
