import { describe, expect, it } from "vitest";
import { buildFileRecord } from "./record.js";

describe("buildFileRecord", () => {
  it("builds keys + classification for an audio file", () => {
    const r = buildFileRecord("Republika/01 - Żółć.mp3", "01 - Żółć.mp3");
    expect(r).toMatchObject({
      relPath: "Republika/01 - Żółć.mp3",
      filename: "01 - Żółć.mp3",
      filenameLower: "01 - żółć.mp3",
      filenameNorm: "żółć",
      filenameNormAscii: "zolc",
      extension: "mp3",
      fileType: "AUDIO",
      isHidden: false,
      isSystem: false,
    });
  });

  it("flags system files", () => {
    const r = buildFileRecord("sub/.DS_Store", ".DS_Store");
    expect(r).toMatchObject({ fileType: "SYSTEM", isSystem: true, isHidden: true });
  });
});
