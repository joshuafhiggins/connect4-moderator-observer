import Link from "next/link";

const cards = [
  {
    href: "/spectate",
    icon: "👁",
    title: "Spectate Matches",
    desc: "Watch live Connect4 games in real time. See every move as it happens on an interactive board.",
    color: "border-blue-600 hover:border-blue-400",
    badge: "Observer",
  },
  {
    href: "/tournament",
    icon: "🏆",
    title: "Tournament View",
    desc: "Track tournament standings, scores, and active rounds. Stay updated with live leaderboards.",
    color: "border-purple-600 hover:border-purple-400",
    badge: "Live Stats",
  },
  {
    href: "/play",
    icon: "🎮",
    title: "Play as Human",
    desc: "Join the server as a player. Connect with a username, ready up, and play Connect4 live.",
    color: "border-green-600 hover:border-green-400",
    badge: "Interactive",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col items-center gap-10 py-12">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-3">
          Connect4 Moderator
        </h1>
        <p className="text-gray-400 text-lg max-w-xl">
          Student AI tournament platform — watch games, track standings, or play
          yourself.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
        {cards.map(({ href, icon, title, desc, color, badge }) => (
          <Link
            key={href}
            href={href}
            className={`bg-gray-900 border-2 ${color} rounded-xl p-6 flex flex-col gap-3 transition-all hover:bg-gray-800 hover:shadow-xl group`}
          >
            <div className="flex items-center justify-between">
              <span className="text-4xl">{icon}</span>
              <span className="text-xs font-mono bg-gray-800 text-gray-400 px-2 py-1 rounded-full group-hover:bg-gray-700">
                {badge}
              </span>
            </div>
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
          </Link>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-2xl w-full">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          WebSocket Protocol Reference
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          {[
            ["CONNECT:<name>", "Register as player"],
            ["READY", "Signal ready to play"],
            ["PLAY:<col>", "Drop piece in column 0–6"],
            ["GAME:LIST", "List active matches"],
            ["GAME:WATCH:<id>", "Watch a specific match"],
            ["PLAYER:LIST", "List connected players"],
          ].map(([cmd, desc]) => (
            <div key={cmd} className="flex gap-2">
              <span className="text-blue-400">{cmd}</span>
              <span className="text-gray-500">→ {desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
