"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Board from "@/components/Board";
import {
  BoardState,
  ParsedMessage,
  cmd,
  createEmptyBoard,
  parseMessage,
  placeToken,
} from "@/lib/protocol";

type ConnStatus = "idle" | "connecting" | "connected" | "disconnected";
type GamePhase =
  | "idle"        // not connected or connected but no game
  | "connected"   // connected, awaiting ready
  | "ready"       // sent READY, waiting for match
  | "playing"     // in a match
  | "game-over";  // match finished

type GameResult = "win" | "loss" | "draw" | "terminated";

const DEFAULT_URL = "wss://connect4.abunchofknowitalls.com";

export default function PlayPage() {
  const [wsUrl, setWsUrl] = useState(DEFAULT_URL);
  const [username, setUsername] = useState("");
  const [connStatus, setConnStatus] = useState<ConnStatus>("idle");
  const [gamePhase, setGamePhase] = useState<GamePhase>("idle");

  const [myColor, setMyColor] = useState<1 | 2 | null>(null); // 1=red, 2=yellow
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [board, setBoard] = useState<BoardState>(createEmptyBoard());
  const [lastMove, setLastMove] = useState<{ column: number; row: number } | null>(null);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [moveCount, setMoveCount] = useState(0);
  const [statusMessages, setStatusMessages] = useState<string[]>([]);
  const [tournamentMode, setTournamentMode] = useState(false);
  const [waitingForNextRound, setWaitingForNextRound] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const myColorRef = useRef<1 | 2 | null>(null);
  const isMyTurnRef = useRef(false);

  const addStatus = (msg: string) =>
    setStatusMessages((prev) => [
      `[${new Date().toLocaleTimeString()}] ${msg}`,
      ...prev.slice(0, 29),
    ]);

  const send = useCallback((msg: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(msg);
  }, []);

  const resetGame = useCallback(() => {
    setBoard(createEmptyBoard());
    setLastMove(null);
    setMoveCount(0);
    setMyColor(null);
    myColorRef.current = null;
    setIsMyTurn(false);
    isMyTurnRef.current = false;
    setGameResult(null);
  }, []);

  const handleColumnClick = useCallback(
    (col: number) => {
      if (!isMyTurnRef.current || gamePhase !== "playing") return;
      // Optimistically place the piece; server validates and replies
      const color = myColorRef.current!;
      setBoard((prev) => {
        const { board: next, row } = placeToken(prev, color, col);
        if (row === -1) return prev; // column full, ignore
        setLastMove({ column: col, row });
        return next;
      });
      setIsMyTurn(false);
      isMyTurnRef.current = false;
      setMoveCount((n) => n + 1);
      send(cmd.play(col));
      addStatus(`You played column ${col}`);
    },
    [gamePhase, send]
  );

  const handleMessage = useCallback(
    (raw: string) => {
      const msg: ParsedMessage = parseMessage(raw);
      switch (msg.type) {
        case "CONNECT_ACK":
          setConnStatus("connected");
          setGamePhase("connected");
          addStatus(`✅ Connected as "${username}"`);
          break;

        case "ERROR":
          addStatus(`⚠ ${msg.message}`);
          break;

        case "READY_ACK":
          setGamePhase("ready");
          addStatus("⏳ Waiting for an opponent…");
          break;

        case "GAME_START": {
          resetGame();
          const color: 1 | 2 = msg.goesFirst ? 1 : 2;
          setMyColor(color);
          myColorRef.current = color;
          setGamePhase("playing");
          setWaitingForNextRound(false);
          const firstTurn = msg.goesFirst;
          setIsMyTurn(firstTurn);
          isMyTurnRef.current = firstTurn;
          addStatus(
            msg.goesFirst
              ? "🔴 You are Red — you go FIRST!"
              : "🟡 You are Yellow — wait for opponent's first move"
          );
          break;
        }

        case "OPPONENT_MOVE": {
          const opponentColor: 1 | 2 = myColorRef.current === 1 ? 2 : 1;
          setBoard((prev) => {
            const { board: next, row } = placeToken(prev, opponentColor, msg.column);
            setLastMove({ column: msg.column, row });
            return next;
          });
          setMoveCount((n) => n + 1);
          setIsMyTurn(true);
          isMyTurnRef.current = true;
          addStatus(`Opponent played column ${msg.column} — your turn!`);
          break;
        }

        case "GAME_WINS":
          setGameResult("win");
          setGamePhase("game-over");
          setIsMyTurn(false);
          isMyTurnRef.current = false;
          addStatus("🏆 You won!");
          break;

        case "GAME_LOSS":
          setGameResult("loss");
          setGamePhase("game-over");
          setIsMyTurn(false);
          isMyTurnRef.current = false;
          addStatus("💔 You lost");
          break;

        case "GAME_DRAW":
          setGameResult("draw");
          setGamePhase("game-over");
          setIsMyTurn(false);
          isMyTurnRef.current = false;
          addStatus("🤝 Draw!");
          break;

        case "GAME_TERMINATED":
          setGameResult("terminated");
          setGamePhase("game-over");
          setIsMyTurn(false);
          isMyTurnRef.current = false;
          addStatus("⛔ Match terminated");
          break;

        case "TOURNAMENT_START":
          setTournamentMode(true);
          addStatus(`🏆 Tournament started: ${msg.tournamentType}`);
          break;

        case "TOURNAMENT_END":
          addStatus("Round over — sending Ready for next round…");
          setWaitingForNextRound(false);
          setGamePhase("connected");
          resetGame();
          // Auto-ready for next round (mirror the gameloop.py behavior)
          setTimeout(() => send(cmd.ready()), 500);
          setGamePhase("ready");
          addStatus("⏳ Ready for next round…");
          break;

        case "TOURNAMENT_CANCEL":
          setTournamentMode(false);
          setWaitingForNextRound(false);
          setGamePhase("connected");
          resetGame();
          addStatus("Tournament cancelled");
          break;

        default:
          break;
      }
    },
    [username, resetGame, send]
  );

  const connect = useCallback(() => {
    if (!username.trim()) {
      addStatus("⚠ Please enter a username first");
      return;
    }
    if (wsRef.current) wsRef.current.close();

    setConnStatus("connecting");
    setGamePhase("idle");
    resetGame();
    setStatusMessages([]);
    setTournamentMode(false);
    setWaitingForNextRound(false);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => ws.send(cmd.connect(username.trim()));
    ws.onmessage = (e) => handleMessage(e.data as string);
    ws.onclose = () => {
      setConnStatus("disconnected");
      setGamePhase("idle");
      addStatus("Disconnected from server");
    };
    ws.onerror = () => addStatus("WebSocket error");
  }, [username, wsUrl, handleMessage, resetGame]);

  const disconnect = useCallback(() => {
    send(cmd.disconnect());
    setTimeout(() => wsRef.current?.close(), 200);
  }, [send]);

  const sendReady = useCallback(() => {
    send(cmd.ready());
    setGamePhase("ready");
    addStatus("⏳ Waiting for an opponent…");
  }, [send]);

  useEffect(() => () => wsRef.current?.close(), []);

  // Derived display values
  const myColorLabel = myColor === 1 ? "🔴 Red" : myColor === 2 ? "🟡 Yellow" : null;
  const opponentColor: 1 | 2 | null = myColor === 1 ? 2 : myColor === 2 ? 1 : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">🎮 Play Connect4</h1>
          <p className="text-gray-400 text-sm mt-1">
            Connect as a player and compete in matches
          </p>
        </div>
        <PhaseIndicator phase={gamePhase} isMyTurn={isMyTurn} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: controls + status */}
        <div className="flex flex-col gap-4">
          {/* Connection card */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
              Connection
            </h2>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Server URL</label>
              <input
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                value={wsUrl}
                onChange={(e) => setWsUrl(e.target.value)}
                placeholder="wss://..."
                disabled={connStatus === "connected" || connStatus === "connecting"}
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Username</label>
              <input
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                disabled={connStatus === "connected" || connStatus === "connecting"}
                onKeyDown={(e) => e.key === "Enter" && connStatus === "idle" && connect()}
              />
            </div>

            {connStatus !== "connected" ? (
              <button
                onClick={connect}
                disabled={connStatus === "connecting" || !username.trim()}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {connStatus === "connecting" ? "Connecting…" : "Connect"}
              </button>
            ) : (
              <button
                onClick={disconnect}
                className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Disconnect
              </button>
            )}
          </div>

          {/* Game controls */}
          {connStatus === "connected" && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                Match
              </h2>

              {tournamentMode && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-950/50 border border-purple-700 text-purple-300 text-sm">
                  <span>🏆</span>
                  <span>Tournament mode active</span>
                </div>
              )}

              {gamePhase === "connected" && !tournamentMode && (
                <button
                  onClick={sendReady}
                  className="w-full py-2.5 bg-green-700 hover:bg-green-600 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  ✋ Ready to Play
                </button>
              )}

              {gamePhase === "ready" && (
                <div className="text-center py-3 text-yellow-300 text-sm animate-pulse">
                  ⏳ Waiting for opponent…
                </div>
              )}

              {(gamePhase === "playing" || gamePhase === "game-over") && myColor && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-800">
                    <div
                      className={`w-4 h-4 rounded-full ${
                        myColor === 1 ? "bg-red-500" : "bg-yellow-400"
                      }`}
                    />
                    <span className="text-white font-medium text-sm">
                      You are {myColorLabel}
                    </span>
                    {myColor === 1 && (
                      <span className="text-xs text-gray-500">(1st)</span>
                    )}
                  </div>

                  {gamePhase === "playing" && (
                    <div
                      className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-semibold text-sm ${
                        isMyTurn
                          ? "bg-green-900/50 border border-green-600 text-green-300 animate-pulse"
                          : "bg-gray-800 text-gray-400"
                      }`}
                    >
                      {isMyTurn ? "⬆ Your turn — click a column!" : "⏳ Waiting for opponent…"}
                    </div>
                  )}

                  <div className="text-xs text-gray-500 text-center">
                    {moveCount} move{moveCount !== 1 ? "s" : ""} played
                  </div>
                </div>
              )}

              {gamePhase === "game-over" && gameResult && (
                <div className="flex flex-col gap-2">
                  <div
                    className={`text-center py-3 rounded-lg font-bold text-base border ${
                      gameResult === "win"
                        ? "bg-green-900/50 border-green-600 text-green-300"
                        : gameResult === "loss"
                        ? "bg-red-900/50 border-red-600 text-red-300"
                        : gameResult === "draw"
                        ? "bg-blue-900/50 border-blue-600 text-blue-300"
                        : "bg-gray-800 border-gray-600 text-gray-300"
                    }`}
                  >
                    {gameResult === "win"
                      ? "🏆 You Won!"
                      : gameResult === "loss"
                      ? "💔 You Lost"
                      : gameResult === "draw"
                      ? "🤝 Draw"
                      : "⛔ Terminated"}
                  </div>
                  {!tournamentMode && (
                    <button
                      onClick={sendReady}
                      className="w-full py-2 bg-green-700 hover:bg-green-600 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                      Play Again
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Status log */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-2">
              Status Log
            </h2>
            <div className="flex flex-col gap-0.5 max-h-52 overflow-y-auto">
              {statusMessages.length === 0 ? (
                <p className="text-gray-600 text-xs">Connect to start</p>
              ) : (
                statusMessages.map((m, i) => (
                  <p key={i} className="text-xs text-gray-400 font-mono">
                    {m}
                  </p>
                ))
              )}
            </div>
          </div>

          {/* How to play */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-2">
              How to Play
            </h2>
            <ol className="flex flex-col gap-1.5 text-xs text-gray-400">
              <li className="flex gap-2">
                <span className="text-blue-400 font-bold shrink-0">1.</span>
                Enter the server URL and your username, then click <strong className="text-gray-300">Connect</strong>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400 font-bold shrink-0">2.</span>
                Click <strong className="text-gray-300">Ready to Play</strong> to queue for a match
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400 font-bold shrink-0">3.</span>
                When the game starts, click a column number to drop your piece
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400 font-bold shrink-0">4.</span>
                Connect 4 in a row (horizontal, vertical, or diagonal) to win!
              </li>
            </ol>
          </div>
        </div>

        {/* Right: board */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-700 rounded-xl p-6 flex flex-col items-center justify-center gap-4 min-h-96">
          {connStatus !== "connected" || gamePhase === "idle" ? (
            <div className="flex flex-col items-center gap-4 text-center py-8">
              <span className="text-6xl">🎮</span>
              <p className="text-gray-400 text-lg font-medium">Ready to play?</p>
              <p className="text-gray-600 text-sm max-w-xs">
                Enter your username and connect to the server to start a match
              </p>
            </div>
          ) : gamePhase === "ready" ? (
            <div className="flex flex-col items-center gap-4 text-center py-8">
              <div className="text-5xl animate-bounce">⏳</div>
              <p className="text-yellow-300 text-lg font-medium">
                Waiting for an opponent…
              </p>
              <p className="text-gray-500 text-sm">
                The game will start automatically when a match is found
              </p>
            </div>
          ) : (
            <>
              {gameResult && (
                <div
                  className={`w-full max-w-md rounded-xl p-4 text-center font-bold text-xl border ${
                    gameResult === "win"
                      ? "bg-green-900/50 border-green-500 text-green-300"
                      : gameResult === "loss"
                      ? "bg-red-900/50 border-red-500 text-red-300"
                      : gameResult === "draw"
                      ? "bg-blue-900/50 border-blue-500 text-blue-300"
                      : "bg-gray-800 border-gray-600 text-gray-300"
                  }`}
                >
                  {gameResult === "win"
                    ? "🏆 You Won!"
                    : gameResult === "loss"
                    ? "💔 You Lost"
                    : gameResult === "draw"
                    ? "🤝 Draw!"
                    : "⛔ Match Terminated"}
                </div>
              )}

              <Board
                board={board}
                lastMove={lastMove}
                player1={username}
                player2="Opponent"
                currentTurnColor={
                  gamePhase === "playing" && myColor
                    ? isMyTurn
                      ? myColor
                      : opponentColor
                    : null
                }
                onColumnClick={
                  gamePhase === "playing" && isMyTurn ? handleColumnClick : undefined
                }
                disabled={gamePhase !== "playing" || !isMyTurn}
              />

              {gamePhase === "playing" && (
                <p className="text-sm text-gray-400">
                  {isMyTurn ? (
                    <span className="text-green-400 font-semibold animate-pulse">
                      ⬆ Click a column to drop your piece
                    </span>
                  ) : (
                    <span className="text-gray-500">Waiting for opponent…</span>
                  )}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PhaseIndicator({
  phase,
  isMyTurn,
}: {
  phase: GamePhase;
  isMyTurn: boolean;
}) {
  if (phase === "playing" && isMyTurn) {
    return (
      <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-green-900/60 text-green-300 animate-pulse">
        Your Turn!
      </span>
    );
  }
  const config: Record<GamePhase, { label: string; cls: string }> = {
    idle: { label: "Not connected", cls: "bg-gray-700 text-gray-400" },
    connected: { label: "Connected", cls: "bg-blue-900/60 text-blue-300" },
    ready: { label: "Waiting…", cls: "bg-yellow-900/60 text-yellow-300 animate-pulse" },
    playing: { label: "In Game", cls: "bg-green-900/60 text-green-400" },
    "game-over": { label: "Game Over", cls: "bg-gray-700 text-gray-400" },
  };
  const { label, cls } = config[phase];
  return (
    <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${cls}`}>{label}</span>
  );
}
