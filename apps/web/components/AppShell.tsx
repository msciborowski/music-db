"use client";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import type { ReactNode } from "react";
import { NavBar } from "./NavBar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <NavBar />
      <Container maxWidth="lg" sx={{ py: 3 }}>
        {children}
      </Container>
    </Box>
  );
}
