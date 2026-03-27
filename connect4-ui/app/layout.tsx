import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import { ConnectionProvider } from "@/lib/connection";

export const metadata: Metadata = {
  title: "Connect4 Moderator",
  description: "Watch matches, track tournaments, and play Connect4",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 text-gray-100">
        <ConnectionProvider>
          <Nav />
          <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
        </ConnectionProvider>
      </body>
    </html>
  );
}
