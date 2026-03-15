"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Board from "@/components/Board";
import {
  BoardState,
  GameEntry,
  ParsedMessage,
  cmd,
  createEmptyBoard,
  parseMessage,
  placeToken,
  replayMoves,
} from "@/lib/protocol";

type ConnStatus = "idle" | "connecting" | "connected" | "disconnected";

interface WatchState {
  matchId: number;
  player1: string; // Red
  player2: string; // Yellow
}

type GameResult =
  | { kind: "win"; winner: string }
  | { kind: "draw" }
  | { kind: "terminated" };

const DEFAULT_URL = "wss://connect4.abunchofknowitalls.com";

export default function SpectatePage() {
  const [wsUrl, setWsUrl] = useState(DEFAULT_URL);
  const [status, setStatus] = useState<ConnStatus>("idle");
  const [log, setLog] = useState<string[]>([]);

  const [gameList, setGameList] = useState<GameEntry[]>([]);
  const [watching, setWatching] = useState<WatchState | null>(null);
  const [board, setBoard] = useState<BoardState>(createEmptyBoard());
  const [lastMove, setLastMove] = useState<{ column: number; row: number } | null>(null);
  const [currentTurnColor, setCurrentTurnColor] = useState<1 | 2>(1);
  const [moveCount, setMoveCount] = useState(0);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchingRef = useRef<WatchState | null>(null);

  const addLog = (msg: string) =>
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 49)]);

  const send = useCallback((msg: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(msg);
    }
  }, []);

  const handleMessage = useCallback(
    (raw: string) => {
      const msg: ParsedMessage = parseMessage(raw);
      switch (msg.type) {
        case "GAME_LIST":
          setGameList(msg.games);
          break;

        case "GAME_WATCH_ACK": {
          const { board: replayed, lastMove: lm } = replayMoves(msg.moves, msg.player1);
          const watchState: WatchState = {
            matchId: msg.matchId,
            player1: msg.player1,
            player2: msg.player2,
          };
          setWatching(watchState);
          watchingRef.current = watchState;
          setBoard(replayed);
          setLastMove(lm);
          setMoveCount(msg.moves.length);
          setCurrentTurnColor(msg.moves.length % 2 === 0 ? 1 : 2);
          setGameResult(null);
          addLog(`Watching match ${msg.matchId}: ${msg.player1} (🔴) vs ${msg.player2} (🟡)`);
          if (msg.moves.length > 0)
            addLog(`Replayed ${msg.moves.length} existing move(s)`);
          break;
        }

        case "GAME_MOVE": {
          const w = watchingRef.current;
          if (!w) break;
          const color: 1 | 2 = msg.username === w.player1 ? 1 : 2;
          setBoard((prev) => {
            const { board: next, row } = placeToken(prev, color, msg.column);
            setLastMove({ column: msg.column, row });
            return next;
          });
          setMoveCount((n) => n + 1);
          setCurrentTurnColor((c) => (c === 1 ? 2 : 1));
          addLog(`${msg.username} played column ${msg.column}`);
          break;
        }

        case "GAME_WIN":
          setGameResult({ kind: "win", winner: msg.winner });
          setCurrentTurnColor(1); // reset
          addLog(`🏆 ${msg.winner} wins!`);
          break;

        case "GAME_DRAW":
          setGameResult({ kind: "draw" });
          addLog("🤝 Draw!");
          break;

        case "GAME_TERMINATED":
          setGameResult({ kind: "terminated" });
          addLog("⛔ Match terminated");
          break;

        case "ERROR":
          addLog(`Error: ${msg.message}`);
          break;

        default:
          break;
      }
    },
    []
  );

  const connect = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    setStatus("connecting");
    setLog([]);
    setGameList([]);
    setWatching(null);
    watchingRef.current = null;
    setBoard(createEmptyBoard());
    setLastMove(null);
    setGameResult(null);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      addLog("Connected as observer");
      ws.send(cmd.gameList());
    };

    ws.onmessage = (e) => handleMessage(e.data as string);

    ws.onclose = () => {
      setStatus("disconnected");
      addLog("Disconnected");
      if (pollRef.current) clearInterval(pollRef.current);
    };

    ws.onerror = () => addLog("WebSocket error");

    // Poll game list every 4s
    pollRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(cmd.gameList());
    }, 4000);
  }, [wsUrl, handleMessage]);

  const disconnect = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    wsRef.current?.close();
  }, []);

  const watchGame = useCallback(
    (id: number) => {
      setBoard(createEmptyBoard());
      setLastMove(null);
      setGameResult(null);
      setMoveCount(0);
      setCurrentTurnColor(1);
      send(cmd.gameWatch(id));
    },
    [send]
  );

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
    wsRef.current?.close();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">👁 Spectate Matches</h1>
          <p className="text-gray-400 text-sm mt-1">
            Watch live Connect4 games in real time
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Connection bar */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-48">
          <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">
            Server URL
          </label>
          <input
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            value={wsUrl}
            onChange={(e) => setWsUrl(e.target.value)}
            placeholder="wss://..."
            disabled={status === "connected" || status === "connecting"}
          />
        </div>
        {status !== "connected" ? (
          <button
            onClick={connect}
            disabled={status === "connecting"}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {status === "connecting" ? "Connecting…" : "Connect"}
          </button>
        ) : (
          <button
            onClick={disconnect}
            className="px-5 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Disconnect
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: game list + log */}
        <div className="flex flex-col gap-4">
          {/* Game list */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                Live Matches
              </h2>
              <span className="text-xs text-gray-500">
                {gameList.length} game{gameList.length !== 1 ? "s" : ""}
              </span>
            </div>
            {status !== "connected" ? (
              <p className="text-gray-600 text-sm text-center py-4">
                Connect to see matches
              </p>
            ) : gameList.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">
                No active matches
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {gameList.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => watchGame(g.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors text-sm ${
                      watching?.matchId === g.id
                        ? "border-blue-500 bg-blue-950/50 text-blue-300"
                        : "border-gray-700 bg-gray-800 hover:border-gray-600 hover:bg-gray-750 text-gray-300"
                    }`}
                  >
                    <div className="font-mono text-xs text-gray-500 mb-0.5">
                      #{g.id}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-red-400">{g.player1}</span>
                      <span className="text-gray-600 text-xs">vs</span>
                      <span className="text-yellow-400">{g.player2}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Event log */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
              Event Log
            </h2>
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
              {log.length === 0 ? (
                <p className="text-gray-600 text-xs">No events yet</p>
              ) : (
                log.map((entry, i) => (
                  <p key={i} className="text-xs text-gray-400 font-mono">
                    {entry}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right: board */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-700 rounded-xl p-6 flex flex-col items-center gap-4">
          {!watching ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <span className="text-5xl">👁</span>
              <p className="text-gray-400">
                {status === "connected"
                  ? "Select a match from the list to start watching"
                  : "Connect to the server to see live matches"}
              </p>
            </div>
          ) : (
            <>
              {/* Game result banner */}
              {gameResult && (
                <div
                  className={`w-full rounded-lg p-3 text-center font-semibold text-lg ${
                    gameResult.kind === "win"
                      ? "bg-green-900/50 border border-green-600 text-green-300"
                      : gameResult.kind === "draw"
                      ? "bg-blue-900/50 border border-blue-600 text-blue-300"
                      : "bg-red-900/50 border border-red-600 text-red-300"
                  }`}
                >
                  {gameResult.kind === "win"
                    ? `🏆 ${gameResult.winner} wins!`
                    : gameResult.kind === "draw"
                    ? "🤝 Draw!"
                    : "⛔ Match Terminated"}
                </div>
              )}

              <Board
                board={board}
                lastMove={lastMove}
                player1={watching.player1}
                player2={watching.player2}
                currentTurnColor={gameResult ? null : currentTurnColor}
                disabled
              />

              <div className="text-xs text-gray-500 font-mono">
                Match #{watching.matchId} · {moveCount} move
                {moveCount !== 1 ? "s" : ""}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ConnStatus }) {
  const colors: Record<ConnStatus, string> = {
    idle: "bg-gray-700 text-gray-400",
    connecting: "bg-yellow-900/60 text-yellow-300 animate-pulse",
    connected: "bg-green-900/60 text-green-300",
    disconnected: "bg-red-900/60 text-red-300",
  };
  const labels: Record<ConnStatus, string> = {
    idle: "Not connected",
    connecting: "Connecting…",
    connected: "Connected",
    disconnected: "Disconnected",
  };
  return (
    <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${colors[status]}`}>
      {labels[status]}
    </span>
  );
}
