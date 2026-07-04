/**
 * Volume identity resolver (spec §5). Produces a stable identifier for a
 * physical disk so the same disk matches across machines / mount points:
 *   - Windows: volume serial number (Win32_Volume)
 *   - macOS:   filesystem Volume UUID (diskutil)
 *   - Linux:   filesystem UUID (findmnt/blkid)
 * with a soft-key fallback (label + totalBytes + fsType) when no stable id is
 * available. We never write a marker to the source disk — identity lives in the
 * database. Parsing is split into pure functions (unit-tested); the async
 * dispatch shells out per platform.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface VolumeIdentity {
  serialNumber?: string;
  label?: string;
  fsType?: string;
  totalBytes?: bigint;
}

export type Platform = "win32" | "darwin" | "linux" | (string & {});

// ---------- pure parsers ----------

/** "E:/Muzyka" | "E:\\Muzyka" | "E:" -> "E". Undefined if not a drive path. */
export function driveLetterFromPath(p: string): string | undefined {
  const m = /^([A-Za-z]):/.exec(p);
  return m ? m[1]!.toUpperCase() : undefined;
}

/** Parse `Get-CimInstance Win32_Volume | ConvertTo-Json`. */
export function parseWin32VolumeJson(json: string): VolumeIdentity {
  const raw: unknown = JSON.parse(json);
  const obj = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown>;
  const identity: VolumeIdentity = {};
  const serial = obj?.["SerialNumber"];
  if (serial !== undefined && serial !== null && `${serial}`.length > 0) {
    identity.serialNumber = normalizeWinSerial(`${serial}`);
  }
  const label = obj?.["Label"];
  if (typeof label === "string" && label.length > 0) identity.label = label;
  const fs2 = obj?.["FileSystem"];
  if (typeof fs2 === "string" && fs2.length > 0) identity.fsType = fs2;
  const cap = obj?.["Capacity"];
  const capNum = typeof cap === "string" ? cap : typeof cap === "number" ? String(cap) : undefined;
  if (capNum && /^\d+$/.test(capNum)) identity.totalBytes = BigInt(capNum);
  return identity;
}

/** Win32_Volume SerialNumber is a uint32; render as the familiar XXXX-XXXX hex. */
export function normalizeWinSerial(serial: string): string {
  const trimmed = serial.trim();
  if (/^\d+$/.test(trimmed)) {
    const hex = (Number.parseInt(trimmed, 10) >>> 0).toString(16).toUpperCase().padStart(8, "0");
    return `${hex.slice(0, 4)}-${hex.slice(4)}`;
  }
  return trimmed;
}

/** Parse `diskutil info <mount>` plain-text output. */
export function parseDiskutilInfo(text: string): VolumeIdentity {
  const identity: VolumeIdentity = {};
  const get = (label: string): string | undefined => {
    const re = new RegExp(`^\\s*${label}\\s*:\\s*(.+?)\\s*$`, "m");
    const m = re.exec(text);
    return m ? m[1] : undefined;
  };
  const uuid = get("Volume UUID");
  if (uuid) identity.serialNumber = uuid;
  const name = get("Volume Name");
  if (name && name !== "Not applicable (no file system)") identity.label = name;
  const fsPersonality = get("File System Personality") ?? get("Type \\(Bundle\\)");
  if (fsPersonality) identity.fsType = fsPersonality;
  // "Disk Size: 2.0 TB (2000398934016 Bytes) (...)" — take the byte count.
  const sizeLine = get("Disk Size") ?? get("Volume Total Space") ?? get("Container Total Space");
  if (sizeLine) {
    const bytes = /\(([\d]+)\s*Bytes\)/.exec(sizeLine);
    if (bytes) identity.totalBytes = BigInt(bytes[1]!);
  }
  return identity;
}

interface FindmntNode {
  source?: string;
  fstype?: string;
  size?: string | number;
  uuid?: string;
  label?: string;
  children?: FindmntNode[];
}

/** Parse `findmnt -T <path> -o SOURCE,FSTYPE,SIZE,UUID,LABEL -b --json`. */
export function parseFindmntJson(json: string): VolumeIdentity {
  const parsed = JSON.parse(json) as { filesystems?: FindmntNode[] };
  const node = parsed.filesystems?.[0];
  const identity: VolumeIdentity = {};
  if (!node) return identity;
  if (node.uuid) identity.serialNumber = node.uuid;
  if (node.label) identity.label = node.label;
  if (node.fstype) identity.fsType = node.fstype;
  if (node.size !== undefined && node.size !== null) {
    const s = String(node.size);
    if (/^\d+$/.test(s)) identity.totalBytes = BigInt(s);
  }
  return identity;
}

/** Parse a single `blkid <device>` line: UUID / LABEL / TYPE tokens. */
export function parseBlkid(text: string): VolumeIdentity {
  const identity: VolumeIdentity = {};
  const uuid = /\bUUID="([^"]+)"/.exec(text);
  if (uuid) identity.serialNumber = uuid[1];
  const label = /\bLABEL="([^"]+)"/.exec(text);
  if (label) identity.label = label[1];
  const type = /\bTYPE="([^"]+)"/.exec(text);
  if (type) identity.fsType = type[1];
  return identity;
}

// ---------- async dispatch ----------

async function statfsTotalBytes(mountPath: string): Promise<bigint | undefined> {
  try {
    const s = await fs.promises.statfs(mountPath);
    return BigInt(s.bsize) * BigInt(s.blocks);
  } catch {
    return undefined;
  }
}

async function tryExec(cmd: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout: 15_000, maxBuffer: 8 * 1024 * 1024 });
    return stdout;
  } catch {
    return undefined;
  }
}

async function resolveWindows(mountPath: string): Promise<VolumeIdentity> {
  const letter = driveLetterFromPath(mountPath);
  if (!letter) return {};
  const script =
    `Get-CimInstance -ClassName Win32_Volume -Filter "DriveLetter='${letter}:'" ` +
    `| Select-Object SerialNumber,Label,FileSystem,Capacity | ConvertTo-Json -Compress`;
  const out = await tryExec("powershell", ["-NoProfile", "-NonInteractive", "-Command", script]);
  return out ? parseWin32VolumeJson(out) : {};
}

async function resolveDarwin(mountPath: string): Promise<VolumeIdentity> {
  const out = await tryExec("diskutil", ["info", mountPath]);
  return out ? parseDiskutilInfo(out) : {};
}

async function resolveLinux(mountPath: string): Promise<VolumeIdentity> {
  const out = await tryExec("findmnt", [
    "-T", mountPath, "-o", "SOURCE,FSTYPE,SIZE,UUID,LABEL", "-b", "--json",
  ]);
  if (out) {
    const id = parseFindmntJson(out);
    if (id.serialNumber) return id;
  }
  // fallback: resolve device via findmnt SOURCE then blkid
  const src = await tryExec("findmnt", ["-T", mountPath, "-no", "SOURCE"]);
  const device = src?.trim().split("\n")[0]?.trim();
  if (device) {
    const blk = await tryExec("blkid", [device]);
    if (blk) return parseBlkid(blk);
  }
  return {};
}

/**
 * Resolve the stable identity of the volume that contains `mountPath`. Always
 * fills `totalBytes` (via statfs) even when the platform command yields nothing,
 * so the soft-key fallback has something to work with.
 */
export async function resolveVolumeIdentity(
  mountPath: string,
  platform: Platform = process.platform,
): Promise<VolumeIdentity> {
  let identity: VolumeIdentity = {};
  try {
    if (platform === "win32") identity = await resolveWindows(mountPath);
    else if (platform === "darwin") identity = await resolveDarwin(mountPath);
    else if (platform === "linux") identity = await resolveLinux(mountPath);
  } catch {
    identity = {};
  }
  if (identity.totalBytes === undefined) {
    const bytes = await statfsTotalBytes(mountPath);
    if (bytes !== undefined) identity.totalBytes = bytes;
  }
  return identity;
}

/** Soft matching key used when no stable serial/UUID is available (spec §5). */
export function softKey(identity: VolumeIdentity): string | undefined {
  if (identity.serialNumber) return undefined; // stable id present, no soft key needed
  if (identity.label && identity.totalBytes !== undefined) {
    return `${identity.label}|${identity.totalBytes}|${identity.fsType ?? ""}`;
  }
  return undefined;
}
