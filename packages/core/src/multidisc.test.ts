import { describe, expect, it } from "vitest";
import { detectDiscNumber, groupMultidisc } from "./multidisc.js";

describe("detectDiscNumber", () => {
  it("recognizes common disc-folder names", () => {
    expect(detectDiscNumber("CD1")).toBe(1);
    expect(detectDiscNumber("CD 2")).toBe(2);
    expect(detectDiscNumber("Disc 3")).toBe(3);
    expect(detectDiscNumber("Płyta 2")).toBe(2);
    expect(detectDiscNumber("Album - Disk 1")).toBe(1);
  });
  it("returns undefined for non-disc names", () => {
    expect(detectDiscNumber("Bonus Tracks")).toBeUndefined();
  });
});

describe("groupMultidisc", () => {
  it("groups sibling disc folders", () => {
    const g = groupMultidisc([
      { id: "a", name: "CD1" },
      { id: "b", name: "CD2" },
      { id: "c", name: "Scans" },
    ]);
    expect(g.parentIsMultidisc).toBe(true);
    expect(g.discByChildId.get("a")).toBe(1);
    expect(g.discByChildId.get("b")).toBe(2);
    expect(g.discByChildId.has("c")).toBe(false);
  });
  it("does not group a single disc folder", () => {
    expect(groupMultidisc([{ id: "a", name: "CD1" }]).parentIsMultidisc).toBe(false);
  });
});
