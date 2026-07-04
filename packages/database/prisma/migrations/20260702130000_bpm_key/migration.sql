-- Music DB — add BPM + key (Camelot) for harmonic mixing (computed from audio).
-- Safe while a scan runs: nullable ADD COLUMN is instant in Postgres, no rewrite.

-- AlterTable
ALTER TABLE "audio_files" ADD COLUMN "bpm" DOUBLE PRECISION;
ALTER TABLE "audio_files" ADD COLUMN "musical_key" TEXT;
ALTER TABLE "audio_files" ADD COLUMN "camelot" TEXT;
ALTER TABLE "audio_files" ADD COLUMN "key_bpm_source" TEXT;

-- CreateIndex
CREATE INDEX "audio_files_camelot_idx" ON "audio_files"("camelot");

-- CreateIndex
CREATE INDEX "audio_files_bpm_idx" ON "audio_files"("bpm");
