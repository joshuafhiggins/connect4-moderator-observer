"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useConnection } from "@/lib/connection";
import { cmd, DEFAULT_WS_URL } from "@/lib/protocol";

export default function Nav() {
	const pathname = usePathname();
	const router = useRouter();
	const { status, role, username, send, becomePlayer } = useConnection();
	const [showPlayerModal, setShowPlayerModal] = useState(false);
	const [nextUsername, setNextUsername] = useState(username);

	const statusLabel =
		status === "connected"
			? `Connected ${role === "player" ? `as ${username}` : "as observer"}`
			: status === "reconnecting"
				? "Reconnecting..."
				: status === "connecting"
					? "Connecting..."
					: "Not connected";
	const isConnectionPage = pathname === "/";

	const disableRoleSwitch =
		status === "connecting" || status === "reconnecting";

	const handleBecomeObserver = () => {
    send(cmd.disconnect());
		router.push("/spectate");
	};

	const handleBecomePlayer = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const trimmed = nextUsername.trim();
		if (!trimmed) return;

    becomePlayer(trimmed);
		setShowPlayerModal(false);
		router.push("/play");
	};

	return (
		<>
			<nav className="bg-gray-900 border-b border-gray-800 px-4 py-3">
				<div className="max-w-7xl mx-auto flex items-center gap-4 flex-wrap">
					<Link
						href="/"
						className="text-lg font-bold text-white flex items-center gap-2"
					>
						<span className="text-2xl">🔴</span>
						<span>Connect4</span>
						<span className="text-gray-400 text-sm font-normal">Moderator</span>
					</Link>

					<div className="ml-auto flex items-center gap-2">
						{!isConnectionPage && (
							<button
								onClick={
									role === "player"
										? handleBecomeObserver
										: () => {
												setNextUsername(username);
												setShowPlayerModal(true);
											}
								}
								disabled={disableRoleSwitch}
								className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white"
							>
								{role === "player" ? "Become Observer" : "Become Player"}
							</button>
						)}

						<div className="text-xs text-gray-400 bg-gray-800 px-3 py-1 rounded-full">
							{statusLabel}
						</div>
					</div>
				</div>
			</nav>

			{showPlayerModal && (
				<div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
					<form
						onSubmit={handleBecomePlayer}
						className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-xl p-5 flex flex-col gap-3"
					>
						<h2 className="text-lg font-semibold text-white">Become Player</h2>
						<p className="text-sm text-gray-400">
							Enter a username to connect as a player.
						</p>

						<input
							autoFocus
							value={nextUsername}
							onChange={(event) => setNextUsername(event.target.value)}
							className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
							placeholder="Username"
						/>

						<div className="flex justify-end gap-2 pt-1">
							<button
								type="button"
								onClick={() => setShowPlayerModal(false)}
								className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 text-white"
							>
								Cancel
							</button>
							<button
								type="submit"
								className="px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white"
							>
								Continue
							</button>
						</div>
					</form>
				</div>
			)}
		</>
	);
}
