import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#1db954" },
    background: { default: "#0f0f10", paper: "#181818" },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  },
});
