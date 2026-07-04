import { describe, expect, it } from "vitest";
import { classifyDescriptor, extractVersion } from "./version.js";

describe("classifyDescriptor", () => {
  it("classifies common descriptors", () => {
    expect(classifyDescriptor("Radio Edit")).toBe("RADIO_EDIT");
    expect(classifyDescriptor("Extended Mix")).toBe("EXTENDED");
    expect(classifyDescriptor("Club Mix")).toBe("CLUB_MIX");
    expect(classifyDescriptor("Instrumental")).toBe("INSTRUMENTAL");
    expect(classifyDescriptor("A Cappella")).toBe("ACAPELLA");
    expect(classifyDescriptor("Live")).toBe("LIVE");
    expect(classifyDescriptor("Remastered 2011")).toBe("REMASTER");
    expect(classifyDescriptor("Some Guy Remix")).toBe("REMIX");
  });
  it("returns undefined for non-version text", () => {
    expect(classifyDescriptor("feat. Someone")).toBeUndefined();
    expect(classifyDescriptor("2011")).toBeUndefined();
  });
});

describe("extractVersion", () => {
  it("pulls a bracketed descriptor and computes the base title", () => {
    const v = extractVersion("Titanium (Extended Club Mix)");
    expect(v.versionType).toBe("EXTENDED");
    expect(v.versionLabel).toBe("Extended Club Mix");
    expect(v.baseTitle).toBe("Titanium");
    expect(v.baseTitleNorm).toBe("titanium");
  });
  it("handles a trailing - descriptor", () => {
    const v = extractVersion("Wake Me Up - Radio Edit");
    expect(v.versionType).toBe("RADIO_EDIT");
    expect(v.baseTitle).toBe("Wake Me Up");
  });
  it("returns UNKNOWN with the title unchanged when no descriptor", () => {
    const v = extractVersion("Nieustanne Tango");
    expect(v.versionType).toBe("UNKNOWN");
    expect(v.versionLabel).toBeUndefined();
    expect(v.baseTitle).toBe("Nieustanne Tango");
  });
});
