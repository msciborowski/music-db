-- Music DB — initial migration (Milestone 1)
-- Generated to match the Prisma 7 schema. Prisma adopts this as the baseline migration.

-- CreateEnum
CREATE TYPE "file_type" AS ENUM ('AUDIO', 'CUE', 'PLAYLIST', 'IMAGE', 'TEXT', 'LOG', 'METADATA', 'ARCHIVE', 'SYSTEM', 'OTHER');

-- CreateEnum
CREATE TYPE "scan_status" AS ENUM ('DISCOVERED', 'HASHED', 'METADATA_READ', 'FINGERPRINTED', 'ERROR');

-- CreateEnum
CREATE TYPE "bitrate_mode" AS ENUM ('CBR', 'VBR', 'ABR', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "directory_type" AS ENUM ('ALBUM', 'ALBUM_RIP', 'MULTIDISC_PARENT', 'MULTIDISC_CHILD', 'MIXED', 'NON_AUDIO', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "run_kind" AS ENUM ('SCAN', 'FINGERPRINT', 'ANALYZE', 'ENRICH');

-- CreateEnum
CREATE TYPE "run_status" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'INTERRUPTED');

-- CreateEnum
CREATE TYPE "duplicate_kind" AS ENUM ('EXACT_HASH', 'AUDIO_FINGERPRINT', 'FUZZY_NAME');

-- CreateEnum
CREATE TYPE "external_source" AS ENUM ('ACOUSTID', 'MUSICBRAINZ', 'DISCOGS');

-- CreateEnum
CREATE TYPE "meta_scope" AS ENUM ('FILE', 'ALBUM', 'FINGERPRINT');

-- CreateEnum
CREATE TYPE "version_type" AS ENUM ('UNKNOWN', 'ORIGINAL', 'RADIO_EDIT', 'EXTENDED', 'CLUB_MIX', 'INSTRUMENTAL', 'ACAPELLA', 'REMIX', 'DUB', 'LIVE', 'DEMO', 'REMASTER', 'EDIT', 'OTHER');

-- CreateTable
CREATE TABLE "volumes" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "serial_number" TEXT,
    "fs_type" TEXT,
    "total_bytes" BIGINT,
    "notes" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "volumes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runs" (
    "id" TEXT NOT NULL,
    "kind" "run_kind" NOT NULL,
    "status" "run_status" NOT NULL DEFAULT 'RUNNING',
    "volume_id" TEXT,
    "hostname" TEXT,
    "mount_path" TEXT,
    "root_rel_path" TEXT,
    "options" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "dirs_seen" INTEGER NOT NULL DEFAULT 0,
    "files_seen" INTEGER NOT NULL DEFAULT 0,
    "audio_seen" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "bytes_seen" BIGINT NOT NULL DEFAULT '0',
    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "directories" (
    "id" TEXT NOT NULL,
    "volume_id" TEXT NOT NULL,
    "rel_path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" TEXT,
    "depth" INTEGER NOT NULL,
    "file_count" INTEGER NOT NULL DEFAULT 0,
    "audio_count" INTEGER NOT NULL DEFAULT 0,
    "has_cue" BOOLEAN NOT NULL DEFAULT false,
    "type" "directory_type" NOT NULL DEFAULT 'UNKNOWN',
    "multidisc_parent_id" TEXT,
    "first_seen_run_id" TEXT,
    "last_seen_run_id" TEXT,
    CONSTRAINT "directories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "directory_id" TEXT NOT NULL,
    "volume_id" TEXT NOT NULL,
    "rel_path" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "filename_lower" TEXT NOT NULL,
    "filename_norm" TEXT NOT NULL,
    "filename_norm_ascii" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "file_type" "file_type" NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "mtime" TIMESTAMP(3),
    "ctime" TIMESTAMP(3),
    "content_hash" TEXT,
    "hash_algo" TEXT,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "scan_status" "scan_status" NOT NULL DEFAULT 'DISCOVERED',
    "scan_error" TEXT,
    "first_seen_run_id" TEXT,
    "last_seen_run_id" TEXT,
    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audio_files" (
    "file_id" TEXT NOT NULL,
    "codec" TEXT,
    "duration_sec" DOUBLE PRECISION,
    "bitrate" INTEGER,
    "bitrate_mode" "bitrate_mode" NOT NULL DEFAULT 'UNKNOWN',
    "sample_rate" INTEGER,
    "channels" INTEGER,
    "lossless" BOOLEAN NOT NULL DEFAULT false,
    "tag_title" TEXT,
    "tag_artist" TEXT,
    "tag_album" TEXT,
    "tag_album_artist" TEXT,
    "tag_track_no" INTEGER,
    "tag_disc_no" INTEGER,
    "tag_year" INTEGER,
    "tag_genre" TEXT,
    "tag_comment" TEXT,
    "has_id3v1" BOOLEAN NOT NULL DEFAULT false,
    "has_id3v2" BOOLEAN NOT NULL DEFAULT false,
    "id3v2_version" TEXT,
    "encoding_guess" TEXT,
    "raw_tag_bytes" BYTEA,
    "parsed_title" TEXT,
    "parsed_artist" TEXT,
    "parsed_track_no" INTEGER,
    "norm_title" TEXT,
    "norm_title_ascii" TEXT,
    "norm_artist" TEXT,
    "norm_artist_ascii" TEXT,
    "fingerprint" TEXT,
    "fingerprint_dur" DOUBLE PRECISION,
    "acoust_id" TEXT,
    "is_album_rip" BOOLEAN NOT NULL DEFAULT false,
    "needs_split" BOOLEAN NOT NULL DEFAULT false,
    "cue_sheet_id" TEXT,
    "resolved_title" TEXT,
    "resolved_artist" TEXT,
    "resolved_source" TEXT,
    "version_type" "version_type" NOT NULL DEFAULT 'UNKNOWN',
    "version_label" TEXT,
    "base_title_norm" TEXT,
    "work_id" TEXT,
    CONSTRAINT "audio_files_pkey" PRIMARY KEY ("file_id")
);

-- CreateTable
CREATE TABLE "works" (
    "id" TEXT NOT NULL,
    "title_norm" TEXT NOT NULL,
    "artist_norm" TEXT,
    "title" TEXT,
    "artist" TEXT,
    "mb_work_id" TEXT,
    "confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "works_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cue_sheets" (
    "id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "ref_audio_file_id" TEXT,
    "raw_text" TEXT NOT NULL,
    "encoding_guess" TEXT,
    "parse_status" TEXT,
    "parse_error" TEXT,
    CONSTRAINT "cue_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cue_tracks" (
    "id" TEXT NOT NULL,
    "cue_sheet_id" TEXT NOT NULL,
    "track_no" INTEGER NOT NULL,
    "title" TEXT,
    "performer" TEXT,
    "start_ms" INTEGER,
    "end_ms" INTEGER,
    CONSTRAINT "cue_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_meta" (
    "id" TEXT NOT NULL,
    "scope" "meta_scope" NOT NULL,
    "source" "external_source" NOT NULL,
    "ref_file_id" TEXT,
    "ref_dir_id" TEXT,
    "external_id" TEXT,
    "query_used" TEXT,
    "raw" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "external_meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT,
    "source" TEXT,
    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_tags" (
    "file_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "source" TEXT,
    CONSTRAINT "file_tags_pkey" PRIMARY KEY ("file_id", "tag_id")
);

-- CreateTable
CREATE TABLE "duplicate_groups" (
    "id" TEXT NOT NULL,
    "kind" "duplicate_kind" NOT NULL,
    "canonical_file_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "duplicate_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duplicate_members" (
    "group_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    CONSTRAINT "duplicate_members_pkey" PRIMARY KEY ("group_id", "file_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "volumes_serial_number_key" ON "volumes"("serial_number");

-- CreateIndex
CREATE INDEX "runs_volume_id_idx" ON "runs"("volume_id");

-- CreateIndex
CREATE INDEX "runs_kind_idx" ON "runs"("kind");

-- CreateIndex
CREATE INDEX "runs_status_idx" ON "runs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "directories_volume_id_rel_path_key" ON "directories"("volume_id", "rel_path");

-- CreateIndex
CREATE INDEX "directories_parent_id_idx" ON "directories"("parent_id");

-- CreateIndex
CREATE INDEX "directories_has_cue_idx" ON "directories"("has_cue");

-- CreateIndex
CREATE INDEX "directories_multidisc_parent_id_idx" ON "directories"("multidisc_parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "files_volume_id_rel_path_key" ON "files"("volume_id", "rel_path");

-- CreateIndex
CREATE INDEX "files_content_hash_idx" ON "files"("content_hash");

-- CreateIndex
CREATE INDEX "files_filename_lower_idx" ON "files"("filename_lower");

-- CreateIndex
CREATE INDEX "files_filename_norm_idx" ON "files"("filename_norm");

-- CreateIndex
CREATE INDEX "files_file_type_idx" ON "files"("file_type");

-- CreateIndex
CREATE INDEX "files_scan_status_idx" ON "files"("scan_status");

-- CreateIndex
CREATE INDEX "files_directory_id_idx" ON "files"("directory_id");

-- CreateIndex
CREATE INDEX "audio_files_norm_title_idx" ON "audio_files"("norm_title");

-- CreateIndex
CREATE INDEX "audio_files_norm_artist_idx" ON "audio_files"("norm_artist");

-- CreateIndex
CREATE INDEX "audio_files_acoust_id_idx" ON "audio_files"("acoust_id");

-- CreateIndex
CREATE INDEX "audio_files_is_album_rip_idx" ON "audio_files"("is_album_rip");

-- CreateIndex
CREATE INDEX "audio_files_needs_split_idx" ON "audio_files"("needs_split");

-- CreateIndex
CREATE INDEX "audio_files_work_id_idx" ON "audio_files"("work_id");

-- CreateIndex
CREATE INDEX "audio_files_base_title_norm_idx" ON "audio_files"("base_title_norm");

-- CreateIndex
CREATE INDEX "works_title_norm_artist_norm_idx" ON "works"("title_norm", "artist_norm");

-- CreateIndex
CREATE UNIQUE INDEX "cue_sheets_file_id_key" ON "cue_sheets"("file_id");

-- CreateIndex
CREATE INDEX "cue_tracks_cue_sheet_id_idx" ON "cue_tracks"("cue_sheet_id");

-- CreateIndex
CREATE INDEX "external_meta_source_idx" ON "external_meta"("source");

-- CreateIndex
CREATE INDEX "external_meta_ref_file_id_idx" ON "external_meta"("ref_file_id");

-- CreateIndex
CREATE INDEX "external_meta_ref_dir_id_idx" ON "external_meta"("ref_dir_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_source_key" ON "tags"("name", "source");

-- CreateIndex
CREATE INDEX "duplicate_members_file_id_idx" ON "duplicate_members"("file_id");

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_volume_id_fkey" FOREIGN KEY ("volume_id") REFERENCES "volumes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "directories" ADD CONSTRAINT "directories_volume_id_fkey" FOREIGN KEY ("volume_id") REFERENCES "volumes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "directories" ADD CONSTRAINT "directories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "directories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "directories" ADD CONSTRAINT "directories_multidisc_parent_id_fkey" FOREIGN KEY ("multidisc_parent_id") REFERENCES "directories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_directory_id_fkey" FOREIGN KEY ("directory_id") REFERENCES "directories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_volume_id_fkey" FOREIGN KEY ("volume_id") REFERENCES "volumes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_files" ADD CONSTRAINT "audio_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_files" ADD CONSTRAINT "audio_files_cue_sheet_id_fkey" FOREIGN KEY ("cue_sheet_id") REFERENCES "cue_sheets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_files" ADD CONSTRAINT "audio_files_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "works"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cue_sheets" ADD CONSTRAINT "cue_sheets_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cue_tracks" ADD CONSTRAINT "cue_tracks_cue_sheet_id_fkey" FOREIGN KEY ("cue_sheet_id") REFERENCES "cue_sheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_tags" ADD CONSTRAINT "file_tags_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_tags" ADD CONSTRAINT "file_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_members" ADD CONSTRAINT "duplicate_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "duplicate_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_members" ADD CONSTRAINT "duplicate_members_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
