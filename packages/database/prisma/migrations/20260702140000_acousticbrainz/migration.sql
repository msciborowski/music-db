-- Music DB — AcousticBrainz reference table + BPM/key cross-check fields.

-- CreateTable
CREATE TABLE "acousticbrainz_ref" (
    "mbid" TEXT NOT NULL,
    "bpm" DOUBLE PRECISION,
    "key_key" TEXT,
    "key_scale" TEXT,
    "camelot" TEXT,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "acousticbrainz_ref_pkey" PRIMARY KEY ("mbid")
);

-- CreateIndex
CREATE INDEX "acousticbrainz_ref_camelot_idx" ON "acousticbrainz_ref"("camelot");

-- AlterTable
ALTER TABLE "audio_files" ADD COLUMN "ref_bpm" DOUBLE PRECISION;
ALTER TABLE "audio_files" ADD COLUMN "ref_camelot" TEXT;
ALTER TABLE "audio_files" ADD COLUMN "bpm_confirmed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "audio_files" ADD COLUMN "key_confirmed" BOOLEAN NOT NULL DEFAULT false;
