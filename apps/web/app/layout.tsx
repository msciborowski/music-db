import type { ReactNode } from "react";
import { Providers } from "./providers";

export const metadata = {
  title: "Music DB",
  description: "Catalogue browser for external music archives",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pl">
      <body style={{ margin: 0 }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
