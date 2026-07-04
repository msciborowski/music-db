"use client";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { fmtDuration, getJson } from "@/lib/fetcher";
import type { WorkDto } from "@/lib/types";

export default function WorksPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["works"], queryFn: () => getJson<WorkDto[]>("/api/works") });
  if (isLoading) return <CircularProgress />;
  if (error || !data) return <Typography color="error">Nie udało się załadować utworów.</Typography>;

  return (
    <Stack spacing={2}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>Utwory z wieloma wersjami</Typography>
      {data.length === 0 ? <Typography color="text.secondary">Brak utworów z ≥2 wersjami — uruchom analizę.</Typography> : null}
      {data.map((w) => (
        <Paper key={w.id} sx={{ p: 1.5 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <Typography sx={{ fontWeight: 600 }}>{w.title ?? "—"}</Typography>
            {w.artist ? <Typography variant="body2" color="text.secondary">{w.artist}</Typography> : null}
            {w.mbWorkId ? <Chip label="MusicBrainz" size="small" color="primary" variant="outlined" sx={{ height: 18, fontSize: 10 }} /> : null}
            <Typography variant="caption" color="text.disabled" sx={{ ml: "auto" }}>{w.versions.length} wersji</Typography>
          </Box>
          <Stack spacing={0.25} sx={{ mt: 1 }}>
            {w.versions.map((v) => (
              <Box key={v.fileId} sx={{ display: "flex", gap: 1, alignItems: "baseline" }}>
                <Chip label={v.versionLabel ?? v.versionType} size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
                <Typography variant="body2" color="text.secondary" noWrap sx={{ flex: 1 }}>{v.relPath}</Typography>
                <Typography variant="caption" color="text.disabled">{v.codec}</Typography>
                <Typography variant="caption" color="text.disabled">{fmtDuration(v.durationSec)}</Typography>
              </Box>
            ))}
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
