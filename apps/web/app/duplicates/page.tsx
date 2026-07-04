"use client";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fmtGB, getJson } from "@/lib/fetcher";
import type { DuplicateGroupDto } from "@/lib/types";

const TABS = [
  { value: "", label: "Wszystkie" },
  { value: "EXACT_HASH", label: "Hash" },
  { value: "AUDIO_FINGERPRINT", label: "Fingerprint" },
  { value: "FUZZY_NAME", label: "Nazwa" },
];

export default function DuplicatesPage() {
  const [kind, setKind] = useState("");
  const { data, isLoading, error } = useQuery({ queryKey: ["duplicates", kind], queryFn: () => getJson<DuplicateGroupDto[]>(`/api/duplicates${kind ? `?kind=${kind}` : ""}`) });

  return (
    <Stack spacing={2}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>Duplikaty</Typography>
      <Tabs value={kind} onChange={(_e, v) => setKind(v)} variant="scrollable">
        {TABS.map((t) => <Tab key={t.value} value={t.value} label={t.label} />)}
      </Tabs>

      {isLoading ? <CircularProgress /> : error || !data ? <Typography color="error">Błąd ładowania.</Typography> : data.length === 0 ? (
        <Typography color="text.secondary">Brak grup — uruchom analizę.</Typography>
      ) : (
        <Stack spacing={1.5}>
          {data.map((g) => (
            <Paper key={g.id} sx={{ p: 1.5 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <Chip label={g.kind} size="small" color="warning" variant="outlined" />
                <Typography variant="caption" color="text.disabled">{g.members.length} kopii</Typography>
              </Box>
              <Stack spacing={0.5}>
                {g.members.map((m) => (
                  <Box key={m.fileId} sx={{ display: "flex", gap: 1, alignItems: "baseline" }}>
                    <Chip label={m.volumeLabel} size="small" sx={{ height: 18, fontSize: 10 }} />
                    <Typography variant="body2" noWrap sx={{ flex: 1 }}>{m.relPath}</Typography>
                    <Typography variant="caption" color="text.disabled">{fmtGB(m.sizeBytes)}</Typography>
                  </Box>
                ))}
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
