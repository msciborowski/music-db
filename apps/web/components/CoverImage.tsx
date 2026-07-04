"use client";
import MusicNoteIcon from "@mui/icons-material/MusicNote";
import Box from "@mui/material/Box";
import { useState } from "react";

export function CoverImage({ fileId, size = 56 }: { fileId: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const placeholder = (
    <Box sx={{ width: size, height: size, borderRadius: 1, bgcolor: "action.hover", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <MusicNoteIcon fontSize="small" sx={{ color: "text.disabled" }} />
    </Box>
  );
  if (!fileId || broken) return placeholder;
  return (
    <Box
      component="img"
      src={`/api/cover/${fileId}`}
      alt=""
      onError={() => setBroken(true)}
      sx={{ width: size, height: size, borderRadius: 1, objectFit: "cover", flexShrink: 0, bgcolor: "action.hover" }}
    />
  );
}
