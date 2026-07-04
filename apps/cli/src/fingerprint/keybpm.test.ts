import { describe, expect, it } from "vitest";
import { parseBpmOutput, parseKeyOutput } from "./keybpm.js";

describe("parseKeyOutput", () => {
  it("takes the last non-empty line as the key", () => {
    expect(parseKeyOutput("Am\n")).toBe("Am");
    expect(parseKeyOutput("analyzing...\nA minor\n")).toBe("A minor");
    expect(parseKeyOutput("")).toBeUndefined();
  });
});

describe("parseBpmOutput", () => {
  it("extracts a plausible BPM", () => {
    expect(parseBpmOutput("128.00\n")).toBe(128);
    expect(parseBpmOutput("bpm: 174.5")).toBe(174.5);
  });
  it("prefers values in the 20–400 range", () => {
    expect(parseBpmOutput("file 2024 track: 92 bpm")).toBe(92);
  });
  it("returns undefined when there is no number", () => {
    expect(parseBpmOutput("no beats found")).toBeUndefined();
  });
});
