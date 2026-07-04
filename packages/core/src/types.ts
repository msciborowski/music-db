/**
 * Domain types and Zod schemas (spec §3 — validation lives in core). These
 * mirror the Prisma enums so `core` stays framework- and DB-agnostic while the
 * CLI/API can validate at their boundaries.
 */
import { z } from "zod";

export const FileTypeSchema = z.enum([
  "AUDIO", "CUE", "PLAYLIST", "IMAGE", "TEXT", "LOG", "METADATA", "ARCHIVE", "SYSTEM", "OTHER",
]);
export type FileType = z.infer<typeof FileTypeSchema>;

export const ScanStatusSchema = z.enum([
  "DISCOVERED", "HASHED", "METADATA_READ", "FINGERPRINTED", "ERROR",
]);
export type ScanStatus = z.infer<typeof ScanStatusSchema>;

export const BitrateModeSchema = z.enum(["CBR", "VBR", "ABR", "UNKNOWN"]);
export type BitrateMode = z.infer<typeof BitrateModeSchema>;

export const DirectoryTypeSchema = z.enum([
  "ALBUM", "ALBUM_RIP", "MULTIDISC_PARENT", "MULTIDISC_CHILD", "MIXED", "NON_AUDIO", "UNKNOWN",
]);
export type DirectoryType = z.infer<typeof DirectoryTypeSchema>;

export const RunKindSchema = z.enum(["SCAN", "FINGERPRINT", "ANALYZE", "ENRICH"]);
export type RunKind = z.infer<typeof RunKindSchema>;

export const RunStatusSchema = z.enum(["RUNNING", "COMPLETED", "FAILED", "INTERRUPTED"]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const DuplicateKindSchema = z.enum(["EXACT_HASH", "AUDIO_FINGERPRINT", "FUZZY_NAME"]);
export type DuplicateKind = z.infer<typeof DuplicateKindSchema>;

export const VersionTypeSchema = z.enum([
  "UNKNOWN", "ORIGINAL", "RADIO_EDIT", "EXTENDED", "CLUB_MIX", "INSTRUMENTAL", "ACAPELLA",
  "REMIX", "DUB", "LIVE", "DEMO", "REMASTER", "EDIT", "OTHER",
]);
export type VersionType = z.infer<typeof VersionTypeSchema>;

/**
 * A stable volume identity descriptor produced by the platform-aware resolver
 * (spec §5). `serialNumber` is the Windows volume serial / macOS+Linux FS UUID.
 */
export const VolumeIdentitySchema = z.object({
  label: z.string().min(1),
  serialNumber: z.string().nullish(),
  fsType: z.string().nullish(),
  totalBytes: z.bigint().nullish(),
});
export type VolumeIdentity = z.infer<typeof VolumeIdentitySchema>;

/** Technical audio properties read during Scan (spec §6 AudioFile). */
export const AudioTechnicalSchema = z.object({
  codec: z.string().nullish(),
  durationSec: z.number().nonnegative().nullish(),
  bitrate: z.number().int().nonnegative().nullish(),
  bitrateMode: BitrateModeSchema.default("UNKNOWN"),
  sampleRate: z.number().int().positive().nullish(),
  channels: z.number().int().positive().nullish(),
  lossless: z.boolean().default(false),
});
export type AudioTechnical = z.infer<typeof AudioTechnicalSchema>;
