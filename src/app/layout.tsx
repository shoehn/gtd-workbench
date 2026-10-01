import type { Metadata } from "next";
import { connection } from "next/server";
import * as api from "@/lib/api";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "@/styles/tokens.css";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GTD Workbench",
  description: "Capture, clarify, organise, review.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection(); // the theme is a setting: read it per request
  const { theme } = api.getSettings();
  return (
    // "system" sets no attribute: the prefers-color-scheme block in tokens.css applies, live.
    <html lang="en" data-theme={theme === "system" ? undefined : theme} className={`${plexSans.variable} ${plexMono.variable} h-full`}>
      <body className="min-h-full bg-ground text-ink font-sans text-body antialiased">
        {children}
      </body>
    </html>
  );
}
