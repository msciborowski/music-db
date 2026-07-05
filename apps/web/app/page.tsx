"use client";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { fmtBytes, fmtGB, getJson } from "@/lib/fetcher";
import type { Stats } from "@/lib/types";

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Paper sx={{ p: 2, minWidth: 150, flex: "1 1 150px" }}>
      <Typography variant="h4" sx={{ fontWeight: 700 }}>{value}</Typography>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      {sub ? <Typography variant="caption" color="text.disabled">{sub}</Typography> : null}
    </Paper>
  );
}

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({ queryKey: ["stats"], queryFn: () => getJson<Stats>("/api/stats") });

  if (isLoading) return <CircularProgress />;
  if (error || !data) return <Typography color="error">Nie udało się załadować statystyk — sprawdź, czy baza działa (DATABASE_URL).</Typography>;

  return (
    <Stack spacing={3}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>Przegląd katalogu</Typography>

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
        <Tile label="Pliki" value={data.files.toLocaleString()} sub={fmtGB(data.totalBytes)} />
        <Tile label="Audio" value={data.audioFiles.toLocaleString()} sub={`${data.lossless} lossless · ${data.fingerprinted} z fingerprintem`} />
        <Tile label="Wolumeny" value={data.volumes} />
        <Tile label="Katalogi" value={data.directories.toLocaleString()} />
        <Tile label="Utwory (Works)" value={data.works.toLocaleString()} sub={`${data.mbWorks} z MusicBrainz`} />
        <Tile label="AcoustID" value={data.acoustidMatched} sub="dopasowanych nagrań" />
      </Box>

      <Box>
        <Typography variant="subtitle2" gutterBottom>Typy plików</Typography>
        <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap" }}>
          {data.byType.map((t) => <Chip key={t.fileType} label={`${t.fileType} · ${t.count}`} size="small" variant="outlined" />)}
        </Stack>
      </Box>

      <Box>
        <Typography variant="subtitle2" gutterBottom>Duplikaty</Typography>
        {data.duplicates.length === 0
          ? <Typography variant="body2" color="text.secondary">Brak — uruchom analizę.</Typography>
          : <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap" }}>{data.duplicates.map((d) => <Chip key={d.kind} label={`${d.kind} · ${d.count}`} size="small" color="warning" variant="outlined" />)}</Stack>}
      </Box>

      {data.topGenres.length > 0 ? (
        <Box>
          <Typography variant="subtitle2" gutterBottom>Top gatunki (Discogs)</Typography>
          <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap" }}>
            {data.topGenres.map((g) => <Chip key={g.name} label={`${g.name} · ${g.count}`} size="small" color="primary" variant="outlined" />)}
          </Stack>
        </Box>
      ) : null}

      <Box>
        <Typography variant="subtitle2" gutterBottom>
          Baza danych — {fmtBytes(data.dbSize.totalBytes)}{" "}
          <Typography component="span" variant="caption" color="text.disabled">
            (dane {fmtBytes(data.dbSize.dataBytes)} · indeksy {fmtBytes(data.dbSize.indexBytes)})
          </Typography>
        </Typography>
        <Paper variant="outlined" sx={{ overflow: "hidden" }}>
          <Box sx={{ display: "flex", px: 1.5, py: 0.5, bgcolor: "action.hover" }}>
            <Typography variant="caption" sx={{ flex: 1 }} color="text.secondary">tabela</Typography>
            <Typography variant="caption" sx={{ width: 90, textAlign: "right" }} color="text.secondary">dane</Typography>
            <Typography variant="caption" sx={{ width: 90, textAlign: "right" }} color="text.secondary">indeksy</Typography>
            <Typography variant="caption" sx={{ width: 90, textAlign: "right" }} color="text.secondary">razem</Typography>
          </Box>
          {data.dbSize.tables.filter((t) => Number(t.totalBytes) > 0).slice(0, 12).map((t) => (
            <Box key={t.name} sx={{ display: "flex", px: 1.5, py: 0.5, borderTop: 1, borderColor: "divider" }}>
              <Typography variant="body2" sx={{ flex: 1 }} noWrap>{t.name}</Typography>
              <Typography variant="body2" sx={{ width: 90, textAlign: "right" }} color="text.secondary">{fmtBytes(t.dataBytes)}</Typography>
              <Typography variant="body2" sx={{ width: 90, textAlign: "right" }} color="text.secondary">{fmtBytes(t.indexBytes)}</Typography>
              <Typography variant="body2" sx={{ width: 90, textAlign: "right" }}>{fmtBytes(t.totalBytes)}</Typography>
            </Box>
          ))}
        </Paper>
      </Box>
    </Stack>
  );
}
