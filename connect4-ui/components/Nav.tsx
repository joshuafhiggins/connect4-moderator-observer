"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/spectate", label: "👁 Spectate", desc: "Watch live matches" },
  { href: "/tournament", label: "🏆 Tournament", desc: "Tournament standings" },
  { href: "/play", label: "🎮 Play", desc: "Join as a player" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center gap-6">
        <Link href="/" className="text-lg font-bold text-white flex items-center gap-2">
          <span className="text-2xl">🔴</span>
          <span>Connect4</span>
          <span className="text-gray-400 text-sm font-normal">Moderator</span>
        </Link>
        <div className="flex gap-1 ml-4">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                path === href
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
