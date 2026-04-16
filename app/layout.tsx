import type { Metadata } from "next";
import "./globals.css";
import Celebration from "@/components/Celebration";
import Nav from "@/components/Nav";
import PageTitleManager from "@/components/PageTitleManager";
import { ConnectionProvider } from "@/lib/connection";
import { CHIP_DROP_SOUND_PATHS } from "@/lib/sfx";

export const metadata: Metadata = {
  title: "Connect4 RPI Minds & Machines",
  description: "Watch matches, track tournaments, and play Connect4",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {CHIP_DROP_SOUND_PATHS.map((path) => (
          <link
            key={path}
            rel="preload"
            href={path}
            as="audio"
            type="audio/ogg"
          />
        ))}
      </head>
      <body className="min-h-screen bg-gray-950 text-gray-100">
        <ConnectionProvider>
          <PageTitleManager />
          <Celebration />
          <Nav />
          <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
        </ConnectionProvider>
      </body>
    </html>
  );
}
