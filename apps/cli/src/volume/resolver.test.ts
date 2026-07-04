import { describe, expect, it } from "vitest";
import {
  driveLetterFromPath,
  normalizeWinSerial,
  parseBlkid,
  parseDiskutilInfo,
  parseFindmntJson,
  parseWin32VolumeJson,
  softKey,
} from "./resolver.js";

describe("driveLetterFromPath", () => {
  it("extracts and uppercases the drive letter", () => {
    expect(driveLetterFromPath("E:/Muzyka")).toBe("E");
    expect(driveLetterFromPath("e:\\Muzyka")).toBe("E");
    expect(driveLetterFromPath("/Volumes/Music")).toBeUndefined();
  });
});

describe("normalizeWinSerial", () => {
  it("renders a uint32 serial as XXXX-XXXX hex", () => {
    expect(normalizeWinSerial("1234567890")).toBe("4996-02D2");
    expect(normalizeWinSerial("A1B2-C3D4")).toBe("A1B2-C3D4");
  });
});

describe("parseWin32VolumeJson", () => {
  it("parses the PowerShell JSON", () => {
    const json = JSON.stringify({ SerialNumber: "1234567890", Label: "DYSK_ROCK", FileSystem: "NTFS", Capacity: "2000398934016" });
    expect(parseWin32VolumeJson(json)).toEqual({
      serialNumber: "4996-02D2",
      label: "DYSK_ROCK",
      fsType: "NTFS",
      totalBytes: 2000398934016n,
    });
  });
});

describe("parseDiskutilInfo", () => {
  it("parses UUID, name, fs and size", () => {
    const text = [
      "   Device Identifier:      disk4s1",
      "   Volume Name:            DYSK_ROCK",
      "   Volume UUID:            0A81F3B1-51D9-3335-BE3E-3A0D9C0B0E23",
      "   File System Personality: ExFAT",
      "   Disk Size:              2.0 TB (2000398934016 Bytes) (exactly ...)",
    ].join("\n");
    expect(parseDiskutilInfo(text)).toEqual({
      serialNumber: "0A81F3B1-51D9-3335-BE3E-3A0D9C0B0E23",
      label: "DYSK_ROCK",
      fsType: "ExFAT",
      totalBytes: 2000398934016n,
    });
  });
});

describe("parseFindmntJson", () => {
  it("parses UUID, label, fstype, size", () => {
    const json = JSON.stringify({ filesystems: [{ source: "/dev/sdb1", fstype: "exfat", size: "2000398934016", uuid: "1234-ABCD", label: "DYSK_ROCK" }] });
    expect(parseFindmntJson(json)).toEqual({
      serialNumber: "1234-ABCD",
      label: "DYSK_ROCK",
      fsType: "exfat",
      totalBytes: 2000398934016n,
    });
  });
});

describe("parseBlkid", () => {
  it("parses UUID/LABEL/TYPE tokens", () => {
    const line = '/dev/sdb1: LABEL="DYSK_ROCK" UUID="1234-ABCD" TYPE="exfat"';
    expect(parseBlkid(line)).toEqual({ serialNumber: "1234-ABCD", label: "DYSK_ROCK", fsType: "exfat" });
  });
});

describe("softKey", () => {
  it("returns undefined when a stable serial exists", () => {
    expect(softKey({ serialNumber: "X", label: "L", totalBytes: 1n })).toBeUndefined();
  });
  it("builds a key from label+size+fs when no serial", () => {
    expect(softKey({ label: "DYSK_ROCK", totalBytes: 2000398934016n, fsType: "exfat" })).toBe(
      "DYSK_ROCK|2000398934016|exfat",
    );
  });
  it("returns undefined when insufficient", () => {
    expect(softKey({ label: "DYSK_ROCK" })).toBeUndefined();
  });
});
