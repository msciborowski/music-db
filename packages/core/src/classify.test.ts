import { describe, expect, it } from "vitest";
import { classifyFile, detectCoverRole, getExtension, isSystemName } from "./classify.js";

describe("getExtension", () => {
  it("lowercases and drops the dot", () => {
    expect(getExtension("Song.FLAC")).toBe("flac");
    expect(getExtension("a/b/c.MP3")).toBe("mp3");
  });
  it("returns empty for no extension / dotfiles", () => {
    expect(getExtension("README")).toBe("");
    expect(getExtension(".DS_Store")).toBe("");
  });
});

describe("classifyFile", () => {
  it("classifies common audio", () => {
    expect(classifyFile("track.mp3").fileType).toBe("AUDIO");
    expect(classifyFile("track.flac").fileType).toBe("AUDIO");
    expect(classifyFile("track.m4a").fileType).toBe("AUDIO");
  });
  it("classifies cue, playlist, image, text, log, metadata, archive", () => {
    expect(classifyFile("album.cue").fileType).toBe("CUE");
    expect(classifyFile("list.m3u8").fileType).toBe("PLAYLIST");
    expect(classifyFile("front.jpg").fileType).toBe("IMAGE");
    expect(classifyFile("info.nfo").fileType).toBe("TEXT");
    expect(classifyFile("rip.log").fileType).toBe("LOG");
    expect(classifyFile("check.sfv").fileType).toBe("METADATA");
    expect(classifyFile("disc.iso").fileType).toBe("ARCHIVE");
  });
  it("falls back to OTHER", () => {
    expect(classifyFile("scan.pdf").fileType).toBe("OTHER");
  });

  it("flags system files and marks them hidden", () => {
    const ds = classifyFile("/Volumes/X/.DS_Store");
    expect(ds).toMatchObject({ fileType: "SYSTEM", isSystem: true, isHidden: true });
    expect(classifyFile("Thumbs.db").isSystem).toBe(true);
    expect(classifyFile("._resource").isSystem).toBe(true);
    expect(classifyFile("desktop.ini").isSystem).toBe(true);
  });

  it("flags dotfiles as hidden but not necessarily system", () => {
    const c = classifyFile(".hiddenconfig");
    expect(c.isHidden).toBe(true);
    expect(c.isSystem).toBe(false);
  });

  it("detects cover role on images", () => {
    expect(classifyFile("coverfront.jpg").coverRole).toBe("front");
    expect(classifyFile("back.png").coverRole).toBe("back");
    expect(classifyFile("folder.jpg").coverRole).toBe("folder");
    expect(classifyFile("random.jpg").coverRole).toBeUndefined();
  });
});

describe("detectCoverRole / isSystemName", () => {
  it("detectCoverRole is name-based", () => {
    expect(detectCoverRole("Booklet-01.jpg")).toBe("booklet");
    expect(detectCoverRole("photo.jpg")).toBeUndefined();
  });
  it("isSystemName matches Spotlight and recycle bin", () => {
    expect(isSystemName(".Spotlight-V100")).toBe(true);
    expect(isSystemName("$RECYCLE.BIN")).toBe(true);
    expect(isSystemName("normal.mp3")).toBe(false);
  });
});
