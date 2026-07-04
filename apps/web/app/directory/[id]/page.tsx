"use client";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import FolderIcon from "@mui/icons-material/Folder";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CoverImage } from "@/components/CoverImage";
import { fmtDuration, getJson } from "@/lib/fetcher";
import type { DirectoryDetail } from "@/lib/types";

export default function DirectoryPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data, isLoading, error } = useQuery({ queryKey: ["directory", id], queryFn: () => getJson<DirectoryDetail>(`/api/directories/${id}`) });

  if (isLoading) return <CircularProgress />;
  if (error || !data) return <Typography color="error">Nie udało się załadować katalogu.</Typography>;

  return (
    <Stack spacing={2}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {data.parentId ? (
          <Link href={`/directory/${data.parentId}`} style={{ color: "inherit", display: "inline-flex" }}><ArrowBackIcon fontSize="small" /></Link>
        ) : null}
        <Typography variant="caption" color="text.disabled">{data.volumeLabel} · {data.relPath || "/"}</Typography>
      </Box>

      <Box sx={{ display: "flex", gap: 2 }}>
        <CoverImage fileId={data.coverFileId} size={120} />
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>{data.name}</Typography>
          <Chip label={data.type} size="small" sx={{ mt: 0.5 }} />
          {data.genres.length > 0 ? (
            <Stack direction="row" useFlexGap spacing={0.5} sx={{ flexWrap: "wrap", mt: 1 }}>
              {data.genres.map((g) => <Chip key={g} label={g} size="small" color="primary" variant="outlined" />)}
            </Stack>
          ) : null}
        </Box>
      </Box>

      {data.children.length > 0 ? (
        <Box>
          <Typography variant="subtitle2" gutterBottom>Podkatalogi</Typography>
          <Stack spacing={0.5}>
            {data.children.map((c) => (
              <Link key={c.id} href={`/directory/${c.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                <Paper sx={{ p: 1, display: "flex", alignItems: "center", gap: 1, "&:hover": { bgcolor: "action.hover" } }}>
                  <FolderIcon fontSize="small" color="action" />
                  <Typography sx={{ flex: 1 }}>{c.name}</Typography>
                  <Typography variant="caption" color="text.disabled">{c.audioCount} audio · {c.type}</Typography>
                </Paper>
              </Link>
            ))}
          </Stack>
        </Box>
      ) : null}

      {data.tracks.length > 0 ? (
        <Box>
          <Typography variant="subtitle2" gutterBottom>Ścieżki ({data.tracks.length})</Typography>
          <Paper>
            {data.tracks.map((t, i) => (
              <Box key={t.fileId}>
                {i > 0 ? <Divider /> : null}
                <Box sx={{ px: 1.5, py: 0.75, display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Typography variant="caption" color="text.disabled" sx={{ width: 24, textAlign: "right" }}>{t.trackNo ?? "–"}</Typography>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography noWrap>{t.title}{t.artist ? <Typography component="span" variant="body2" color="text.secondary">{"  ·  "}{t.artist}</Typography> : null}</Typography>
                  </Box>
                  {t.versionType !== "UNKNOWN" ? <Chip label={t.versionLabel ?? t.versionType} size="small" variant="outlined" sx={{ height: 20 }} /> : null}
                  {t.needsSplit ? <Chip label="do splitu" size="small" color="warning" variant="outlined" sx={{ height: 20 }} /> : null}
                  {t.camelot ? <Chip label={t.camelot} size="small" color="success" sx={{ height: 20, fontWeight: 700 }} /> : null}
                  {t.bpm ? <Typography variant="caption" color="text.disabled">{Math.round(t.bpm)} BPM</Typography> : null}
                  <Typography variant="caption" color="text.disabled">{t.codec}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ width: 42, textAlign: "right" }}>{fmtDuration(t.durationSec)}</Typography>
                </Box>
              </Box>
            ))}
          </Paper>
        </Box>
      ) : null}

      {data.cueTracks.length > 0 ? (
        <Box>
          <Typography variant="subtitle2" gutterBottom>.cue ({data.cueTracks.length} ścieżek)</Typography>
          <Stack direction="row" useFlexGap spacing={0.5} sx={{ flexWrap: "wrap" }}>
            {data.cueTracks.map((c) => <Chip key={c.trackNo} label={`${c.trackNo}. ${c.title ?? ""}`} size="small" variant="outlined" />)}
          </Stack>
        </Box>
      ) : null}

      {data.otherFiles.length > 0 ? (
        <Box>
          <Typography variant="subtitle2" gutterBottom>Inne pliki</Typography>
          <Stack direction="row" useFlexGap spacing={0.5} sx={{ flexWrap: "wrap" }}>
            {data.otherFiles.map((f) => <Chip key={f.fileId} label={`${f.filename}${f.coverRole ? ` (${f.coverRole})` : ""}`} size="small" variant="outlined" />)}
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
}
