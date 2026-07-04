"use client";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CoverImage } from "@/components/CoverImage";
import { fmtDuration, getJson } from "@/lib/fetcher";
import type { SearchHit } from "@/lib/types";

interface SearchResponse { query: string; total: number; hits: SearchHit[] }

export default function SearchPage() {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const { data, isFetching } = useQuery({
    queryKey: ["search", q],
    queryFn: () => getJson<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`),
    enabled: q.length > 0,
  });

  return (
    <Stack spacing={3}>
      <TextField
        autoFocus
        fullWidth
        placeholder="Szukaj tytułu, artysty, nazwy pliku…"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />

      {q.length === 0 ? (
        <Typography color="text.secondary">Wpisz zapytanie, aby przeszukać katalog.</Typography>
      ) : data && data.hits.length === 0 && !isFetching ? (
        <Typography color="text.secondary">Brak wyników dla „{q}”.</Typography>
      ) : (
        <Stack spacing={1.5}>
          {data ? <Typography variant="caption" color="text.disabled">{data.total} trafień{data.total > data.hits.length ? ` (pokazano ${data.hits.length})` : ""}</Typography> : null}
          {data?.hits.map((h) => (
            <Paper key={h.fileId} sx={{ p: 1.5 }}>
              <Box sx={{ display: "flex", gap: 1.5 }}>
                <CoverImage fileId={h.coverFileId} size={56} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontWeight: 600 }} noWrap>
                    {h.title ?? h.filename}
                    {h.durationSec ? <Typography component="span" variant="caption" color="text.disabled">{"  "}{fmtDuration(h.durationSec)}</Typography> : null}
                  </Typography>
                  {h.artist ? <Typography variant="body2" color="text.secondary" noWrap>{h.artist}</Typography> : null}
                  <Link href={`/directory/${h.directoryId}`} style={{ color: "inherit" }}>
                    <Typography variant="caption" color="text.disabled" noWrap sx={{ display: "block", "&:hover": { textDecoration: "underline" } }}>{h.dirRelPath || "/"}</Typography>
                  </Link>
                  {h.otherAudio.length > 0 ? (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                      inne w katalogu: {h.otherAudio.slice(0, 8).map((s) => s.title).join(", ")}{h.otherAudio.length > 8 ? " …" : ""}
                    </Typography>
                  ) : null}
                  {h.otherFiles.length > 0 ? (
                    <Stack direction="row" useFlexGap spacing={0.5} sx={{ flexWrap: "wrap", mt: 0.5 }}>
                      {h.otherFiles.slice(0, 8).map((f) => <Chip key={f.filename} label={f.filename} size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />)}
                    </Stack>
                  ) : null}
                </Box>
              </Box>
            </Paper>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
