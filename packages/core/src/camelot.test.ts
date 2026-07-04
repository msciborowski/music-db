import { describe, expect, it } from "vitest";
import { toCamelot } from "./camelot.js";

describe("toCamelot", () => {
  it("maps minor keys to the A ring", () => {
    expect(toCamelot("Am")).toBe("8A");
    expect(toCamelot("A minor")).toBe("8A");
    expect(toCamelot("Amin")).toBe("8A");
    expect(toCamelot("Em")).toBe("9A");
    expect(toCamelot("Cm")).toBe("5A");
    expect(toCamelot("G#m")).toBe("1A");
    expect(toCamelot("Abm")).toBe("1A"); // enharmonic of G#m
  });

  it("maps major keys to the B ring", () => {
    expect(toCamelot("C")).toBe("8B");
    expect(toCamelot("C major")).toBe("8B");
    expect(toCamelot("G")).toBe("9B");
    expect(toCamelot("A")).toBe("11B");
    expect(toCamelot("F#")).toBe("2B");
    expect(toCamelot("Gb")).toBe("2B"); // enharmonic of F#
    expect(toCamelot("Db")).toBe("3B");
    expect(toCamelot("C#")).toBe("3B"); // enharmonic of Db
  });

  it("passes through existing Camelot codes", () => {
    expect(toCamelot("8A")).toBe("8A");
    expect(toCamelot("12B")).toBe("12B");
    expect(toCamelot("3a")).toBe("3A");
  });

  it("returns undefined for junk / empty", () => {
    expect(toCamelot("")).toBeUndefined();
    expect(toCamelot(null)).toBeUndefined();
    expect(toCamelot("hello")).toBeUndefined();
    expect(toCamelot("H")).toBeUndefined();
  });
});
