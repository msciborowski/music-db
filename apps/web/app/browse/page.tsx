"use client";
import StorageIcon from "@mui/icons-material/Storage";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { fmtGB, getJson } from "@/lib/fetcher";
import type { VolumeSummary } from "@/lib/types";

export default function BrowsePage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["volumes"], queryFn: () => getJson<VolumeSummary[]>("/api/volumes") });
  if (isLoading) return <CircularProgress />;
  if (error || !data) return <Typography color="error">Nie udało się załadować wolumenów.</Typography>;

  return (
    <Stack spacing={2}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>Wolumeny</Typography>
      {data.length === 0 ? <Typography color="text.secondary">Brak wolumenów — zarejestruj dysk i zeskanuj.</Typography> : null}
      {data.map((v) => {
        const inner = (
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <StorageIcon color="primary" />
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontWeight: 600 }}>{v.label}</Typography>
              <Typography variant="caption" color="text.secondary">
                {v.serialNumber ?? "brak serialu"} · {v.audioCount} audio · {v.fileCount} plików · {v.directoryCount} katalogów · {fmtGB(v.totalBytes)}
              </Typography>
            </Box>
          </Box>
        );
        return (
          <Paper key={v.id} sx={{ p: 2, transition: "background .15s", "&:hover": { bgcolor: "action.hover" } }}>
            {v.rootDirId ? <Link href={`/directory/${v.rootDirId}`} style={{ color: "inherit", textDecoration: "none" }}>{inner}</Link> : inner}
          </Paper>
        );
      })}
    </Stack>
  );
}
