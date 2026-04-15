"use client";
import Link from "next/link";
import { SubmitEvent, useEffect, useState } from "react";
import { Settings, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import AdminSettingsPanel from "@/components/AdminSettingsPanel";
import { useConnection } from "@/lib/connection";

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    status,
    role,
    username,
    becomePlayer,
    disconnect,
    isAdmin,
    shouldRedirectToConnect,
  } = useConnection();
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [nextUsername, setNextUsername] = useState(username);
  const isConnectionPage = pathname === "/";

  const disableRoleSwitch =
    status === "connecting" || status === "reconnecting";

  useEffect(() => {
    if (isConnectionPage || (status === "disconnected" && shouldRedirectToConnect)) {
      setShowSettingsModal(false);
    }
  }, [isConnectionPage, status, shouldRedirectToConnect]);

  const handleBecomePlayer = (event: SubmitEvent<HTMLFormElement>) => {
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
            <span>Connect4 Observer</span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            {!isConnectionPage && (
              <>
                {role !== "player" && !isAdmin && (
                  <button
                    onClick={() => {
                      setNextUsername(username);
                      setShowPlayerModal(true);
                    }}
                    disabled={disableRoleSwitch}
                    className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white"
                  >
                    Become Player
                  </button>
                )}
                <button
                  onClick={disconnect}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors bg-gray-700 hover:bg-red-600 text-white"
                >
                  Disconnect
                </button>
                {role !== "player" && (
                  <button
                    type="button"
                    onClick={() => setShowSettingsModal(true)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800 text-gray-200 transition-colors hover:bg-gray-700 hover:text-white"
                    aria-label="Open settings"
                    title="Settings"
                  >
                    <Settings className="h-5 w-5" />
                  </button>
                )}
              </>
            )}
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

      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/70 px-4 py-6">
          <div className="mx-auto flex h-full max-w-4xl items-center justify-center">
            <div className="flex max-h-full w-full flex-col overflow-hidden rounded-2xl border border-gray-700 bg-gray-950 shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Settings</h2>
                  <p className="text-sm text-gray-400">
                    Admin tools for tournaments, server values, and reservations.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      isAdmin
                        ? "border border-green-700 bg-green-950/80 text-green-300"
                        : "border border-gray-700 bg-gray-800 text-gray-400"
                    }`}
                  >
                    {isAdmin ? "Admin" : "Observer"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowSettingsModal(false)}
                    className="inline-flex items-center justify-center rounded-lg bg-gray-800 p-2 text-white transition-colors hover:bg-gray-700"
                    aria-label="Close settings"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto p-5">
                <AdminSettingsPanel />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
