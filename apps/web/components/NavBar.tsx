"use client";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/search", label: "Szukaj" },
  { href: "/browse", label: "Przeglądaj" },
  { href: "/duplicates", label: "Duplikaty" },
  { href: "/works", label: "Utwory" },
];

export function NavBar() {
  const pathname = usePathname();
  return (
    <AppBar position="sticky" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}>
      <Toolbar variant="dense">
        <Typography variant="h6" sx={{ fontWeight: 800, mr: 4, color: "primary.main", letterSpacing: 1 }}>
          mdb
        </Typography>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Button
                key={l.href}
                component={Link}
                href={l.href}
                size="small"
                sx={{ color: active ? "primary.main" : "text.secondary", fontWeight: active ? 700 : 500 }}
              >
                {l.label}
              </Button>
            );
          })}
        </Box>
      </Toolbar>
    </AppBar>
  );
}
