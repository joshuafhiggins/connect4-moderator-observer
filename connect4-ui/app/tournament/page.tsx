"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Board from "@/components/Board";
import {
  BoardState,
  GameEntry,
  ParsedMessage,
  PlayerEntry,
  ScoreEntry,
  cmd,
  createEmptyBoard,
  parseMessage,
  placeToken,
  replayMoves,
} from "@/lib/protocol";

type ConnStatus = "idle" | "connecting" | "connected" | "disconnected";

interface LiveGame {
  id: number;
  player1: string;
  player2: string;
  board: BoardState;
  lastMove: { column: number; row: number } | null;
  currentTurnColor: 1 | 2;
  result: { kind: "win"; winner: string } | { kind: "draw" } | { kind: "terminated" } | null;
}

const DEFAULT_URL = "wss://connect4.abunchofknowitalls.com";

export default function TournamentPage() {
  const [wsUrl, setWsUrl] = useState(DEFAULT_URL);
  const [status, setStatus] = useState<ConnStatus>("idle");

  const [tournamentActive, setTournamentActive] = useState(false);
  const [tournamentType, setTournamentType] = useState<string | null>(null);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [players, setPlayers] = useState<PlayerEntry[]>([]);
  const [gameList, setGameList] = useState<GameEntry[]>([]);
  const [liveGames, setLiveGames] = useState<Map<number, LiveGame>>(new Map());
  const [selectedGame, setSelectedGame] = useState<number | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // keep a ref to liveGames for use inside the message handler closure
  const liveGamesRef = useRef<Map<number, LiveGame>>(new Map());

  const addLog = (msg: string) =>
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 79)]);

  const send = useCallback((msg: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(msg);
  }, []);

  /** Merge a partial update into a live game, creating it if new. */
  const updateGame = useCallback((id: number, patch: Partial<LiveGame>) => {
    setLiveGames((prev) => {
      const next = new Map(prev);
      const existing = next.get(id) ?? {
        id,
        player1: "",
        player2: "",
        board: createEmptyBoard(),
        lastMove: null,
        currentTurnColor: 1 as const,
        result: null,
      };
      next.set(id, { ...existing, ...patch });
      liveGamesRef.current = next;
      return next;
    });
  }, []);

  const handleMessage = useCallback(
    (raw: string) => {
      const msg: ParsedMessage = parseMessage(raw);
      switch (msg.type) {
        case "TOURNAMENT_START":
          setTournamentActive(true);
          setTournamentType(msg.tournamentType);
          setScores([]);
          addLog(`🏆 Tournament started: ${msg.tournamentType}`);
          send(cmd.gameList());
          send(cmd.playerList());
          break;

        case "TOURNAMENT_CANCEL":
          setTournamentActive(false);
          setTournamentType(null);
          addLog("❌ Tournament cancelled");
          break;

        case "TOURNAMENT_SCORES":
          setScores(msg.scores);
          addLog(
            `📊 Scores updated: ${msg.scores
              .map((s) => `${s.player} ${s.score}`)
              .join(", ")}`
          );
          break;

        case "TOURNAMENT_END":
          addLog("Round ended");
          send(cmd.gameList());
          send(cmd.playerList());
          break;

        case "GAME_LIST": {
          setGameList(msg.games);
          // Watch any new games we don't have yet
          for (const g of msg.games) {
            if (!liveGamesRef.current.has(g.id)) {
              send(cmd.gameWatch(g.id));
            }
          }
          break;
        }

        case "GAME_WATCH_ACK": {
          const { board, lastMove } = replayMoves(msg.moves, msg.player1);
          const moveCount = msg.moves.length;
          updateGame(msg.matchId, {
            player1: msg.player1,
            player2: msg.player2,
            board,
            lastMove,
            currentTurnColor: (moveCount % 2 === 0 ? 1 : 2) as 1 | 2,
            result: null,
          });
          addLog(`Watching match ${msg.matchId}: ${msg.player1} vs ${msg.player2}`);
          break;
        }

        case "GAME_MOVE": {
          // find the game this player is in
          const gamesSnapshot = liveGamesRef.current;
          for (const [id, game] of gamesSnapshot) {
            if (game.player1 === msg.username || game.player2 === msg.username) {
              const color: 1 | 2 = msg.username === game.player1 ? 1 : 2;
              const { board: next, row } = placeToken(game.board, color, msg.column);
              updateGame(id, {
                board: next,
                lastMove: { column: msg.column, row },
                currentTurnColor: (color === 1 ? 2 : 1) as 1 | 2,
              });
              addLog(`[#${id}] ${msg.username} played column ${msg.column}`);
              break;
            }
          }
          break;
        }

        case "GAME_WIN": {
          const gamesSnapshot = liveGamesRef.current;
          for (const [id, game] of gamesSnapshot) {
            if (game.player1 === msg.winner || game.player2 === msg.winner) {
              updateGame(id, { result: { kind: "win", winner: msg.winner } });
              addLog(`🏆 [#${id}] ${msg.winner} wins!`);
              break;
            }
          }
          // refresh lists after match ends
          setTimeout(() => {
            send(cmd.gameList());
            send(cmd.playerList());
          }, 1000);
          break;
        }

        case "GAME_DRAW": {
          // mark the selected game as draw (we can't easily identify which)
          if (selectedGame !== null) {
            updateGame(selectedGame, { result: { kind: "draw" } });
          }
          addLog("🤝 Draw");
          break;
        }

        case "GAME_TERMINATED": {
          if (selectedGame !== null) {
            updateGame(selectedGame, { result: { kind: "terminated" } });
          }
          addLog("⛔ Match terminated");
          send(cmd.gameList());
          break;
        }

        case "PLAYER_LIST":
          setPlayers(msg.players);
          break;

        case "GET_DATA":
          if (msg.key === "TOURNAMENT_STATUS") {
            if (msg.value && msg.value !== "false") {
              setTournamentActive(true);
              setTournamentType(msg.value);
            }
          }
          break;

        case "ERROR":
          addLog(`Error: ${msg.message}`);
          break;

        default:
          break;
      }
    },
    [send, updateGame, selectedGame]
  );

  const connect = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    setStatus("connecting");
    setLog([]);
    setLiveGames(new Map());
    liveGamesRef.current = new Map();
    setSelectedGame(null);
    setScores([]);
    setPlayers([]);
    setGameList([]);
    setTournamentActive(false);
    setTournamentType(null);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      addLog("Connected as observer");
      ws.send(cmd.getData("TOURNAMENT_STATUS"));
      ws.send(cmd.gameList());
      ws.send(cmd.playerList());
    };

    ws.onmessage = (e) => handleMessage(e.data as string);
    ws.onclose = () => {
      setStatus("disconnected");
      addLog("Disconnected");
      if (pollRef.current) clearInterval(pollRef.current);
    };
    ws.onerror = () => addLog("WebSocket error");

    pollRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(cmd.gameList());
        ws.send(cmd.playerList());
      }
    }, 5000);
  }, [wsUrl, handleMessage]);

  const disconnect = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    wsRef.current?.close();
  }, []);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
    wsRef.current?.close();
  }, []);

  const selectedGameData = selectedGame !== null ? liveGames.get(selectedGame) : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">🏆 Tournament View</h1>
          <p className="text-gray-400 text-sm mt-1">
            Live standings, active matches, and player status
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

      {/* Tournament banner */}
      {status === "connected" && (
        <div
          className={`rounded-xl p-4 border flex items-center gap-4 ${
            tournamentActive
              ? "bg-purple-950/40 border-purple-600"
              : "bg-gray-900 border-gray-700"
          }`}
        >
          <div className="text-3xl">{tournamentActive ? "🏆" : "⏳"}</div>
          <div>
            <div className="font-semibold text-white">
              {tournamentActive
                ? `Tournament Active — ${tournamentType ?? "Unknown Type"}`
                : "No Active Tournament"}
            </div>
            <div className="text-sm text-gray-400">
              {tournamentActive
                ? `${gameList.length} match${gameList.length !== 1 ? "es" : ""} running · ${players.filter((p) => p.inMatch).length}/${players.length} players in game`
                : "Waiting for admin to start a tournament"}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="flex flex-col gap-4">
          {/* Leaderboard */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
              Leaderboard
            </h2>
            {scores.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">
                {status === "connected" ? "No scores yet" : "Connect to see scores"}
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {scores.map((s, i) => (
                  <div
                    key={s.player}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-800"
                  >
                    <span
                      className={`text-sm font-bold w-6 ${
                        i === 0
                          ? "text-yellow-400"
                          : i === 1
                          ? "text-gray-300"
                          : i === 2
                          ? "text-amber-700"
                          : "text-gray-600"
                      }`}
                    >
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}
                    </span>
                    <span className="text-white flex-1 font-medium text-sm">{s.player}</span>
                    <span className="text-blue-400 font-bold">{s.score}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Player list */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3 flex items-center justify-between">
              <span>Players</span>
              <span className="text-xs text-gray-500 font-normal">
                {players.length} connected
              </span>
            </h2>
            {players.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">
                {status === "connected" ? "No players connected" : "Connect to see players"}
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {players.map((p) => (
                  <div
                    key={p.username}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800"
                  >
                    <span className="text-white text-sm flex-1 font-medium">
                      {p.username}
                    </span>
                    {p.inMatch ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/60 text-blue-300 border border-blue-700">
                        In game
                      </span>
                    ) : p.ready ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/60 text-green-300 border border-green-700">
                        Ready
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-500">
                        Idle
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Event log */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-2">
              Event Log
            </h2>
            <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
              {log.slice(0, 20).map((entry, i) => (
                <p key={i} className="text-xs text-gray-400 font-mono">
                  {entry}
                </p>
              ))}
              {log.length === 0 && (
                <p className="text-gray-600 text-xs">No events yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Right: active matches + board */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Active matches */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
              Active Matches
            </h2>
            {gameList.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-3">
                {status === "connected" ? "No active matches" : "Connect to see matches"}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {gameList.map((g) => {
                  const live = liveGames.get(g.id);
                  return (
                    <button
                      key={g.id}
                      onClick={() => setSelectedGame(selectedGame === g.id ? null : g.id)}
                      className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                        selectedGame === g.id
                          ? "border-blue-500 bg-blue-950/50 text-blue-200"
                          : "border-gray-700 bg-gray-800 hover:border-gray-500 text-gray-300"
                      }`}
                    >
                      <span className="text-gray-500 text-xs font-mono mr-1">
                        #{g.id}
                      </span>
                      <span className="text-red-400">{g.player1}</span>
                      <span className="text-gray-500 mx-1">vs</span>
                      <span className="text-yellow-400">{g.player2}</span>
                      {live?.result && (
                        <span className="ml-1 text-xs">
                          {live.result.kind === "win"
                            ? ` 🏆 ${live.result.winner}`
                            : live.result.kind === "draw"
                            ? " 🤝"
                            : " ⛔"}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected game board */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 flex flex-col items-center gap-4 min-h-64">
            {!selectedGameData ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <span className="text-4xl text-gray-700">🎯</span>
                <p className="text-gray-500 text-sm">
                  {gameList.length > 0
                    ? "Click a match above to see the board"
                    : "Active matches will appear here"}
                </p>
              </div>
            ) : (
              <>
                {selectedGameData.result && (
                  <div
                    className={`w-full rounded-lg p-3 text-center font-semibold ${
                      selectedGameData.result.kind === "win"
                        ? "bg-green-900/50 border border-green-600 text-green-300"
                        : selectedGameData.result.kind === "draw"
                        ? "bg-blue-900/50 border border-blue-600 text-blue-300"
                        : "bg-red-900/50 border border-red-600 text-red-300"
                    }`}
                  >
                    {selectedGameData.result.kind === "win"
                      ? `🏆 ${selectedGameData.result.winner} wins!`
                      : selectedGameData.result.kind === "draw"
                      ? "🤝 Draw!"
                      : "⛔ Match Terminated"}
                  </div>
                )}
                <Board
                  board={selectedGameData.board}
                  lastMove={selectedGameData.lastMove}
                  player1={selectedGameData.player1}
                  player2={selectedGameData.player2}
                  currentTurnColor={selectedGameData.result ? null : selectedGameData.currentTurnColor}
                  disabled
                />
              </>
            )}
          </div>
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
