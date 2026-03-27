"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_WS_URL } from "@/lib/protocol";
import { useConnection } from "@/lib/connection";

export default function Home() {
  const router = useRouter();
  const {
    connect,
    role,
    status,
    wsUrl: connectedWsUrl,
    shouldRedirectToConnect,
    clearRedirectFlag,
  } = useConnection();

  const [wsUrl, setWsUrl] = useState(DEFAULT_WS_URL);

  useEffect(() => {
    if (shouldRedirectToConnect) {
      clearRedirectFlag();
    }
  }, [shouldRedirectToConnect, clearRedirectFlag]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    connect({ role: "observer", wsUrl });
    router.push("/spectate");
  };

  return (
    <div className="max-w-3xl mx-auto py-10">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 md:p-8 flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold text-white">
            Connect to Moderator Server
          </h1>
          <p className="text-sm text-gray-400 mt-2">
            Connect as an observer to watch live matches and tournaments.
          </p>
        </div>

        {shouldRedirectToConnect && (
          <div className="rounded-lg border border-red-700 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            Connection lost. Please reconnect to continue.
          </div>
        )}

        {status === "connected" && role && (
          <div className="rounded-lg border border-green-700 bg-green-950/30 px-4 py-3 text-sm text-green-200">
            Connected to {connectedWsUrl} as observer.
          </div>
        )}

        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">
              Server URL
            </label>
            <input
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              placeholder="wss://..."
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {status === "connecting" || status === "reconnecting"
                ? "Connecting..."
                : "Connect to Server"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
