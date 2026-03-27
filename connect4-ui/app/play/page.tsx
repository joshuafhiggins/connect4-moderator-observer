"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Board from "@/components/Board";
import {
  BoardState,
  ParsedMessage,
  cmd,
  createEmptyBoard,
  placeToken,
} from "@/lib/protocol";
import { useConnection } from "@/lib/connection";

type GamePhase = "idle" | "connected" | "ready" | "playing" | "game-over";

type GameResult = "win" | "loss" | "draw" | "terminated";

export default function PlayPage() {
  const router = useRouter();
  const {
    role,
    username,
    status,
    send,
    subscribe,
    disconnect,
    reconnectAttempts,
    shouldRedirectToConnect,
    clearRedirectFlag,
  } = useConnection();

  const [gamePhase, setGamePhase] = useState<GamePhase>("idle");
  const [myColor, setMyColor] = useState<1 | 2 | null>(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [board, setBoard] = useState<BoardState>(createEmptyBoard());
  const [lastMove, setLastMove] = useState<{
    column: number;
    row: number;
  } | null>(null);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [moveCount, setMoveCount] = useState(0);
  const [statusMessages, setStatusMessages] = useState<string[]>([]);
  const [tournamentMode, setTournamentMode] = useState(false);

  const myColorRef = useRef<1 | 2 | null>(null);
  const isMyTurnRef = useRef(false);

  const addStatus = useCallback(
    (msg: string) =>
      setStatusMessages((prev) => [
        `[${new Date().toLocaleTimeString()}] ${msg}`,
        ...prev.slice(0, 29),
      ]),
    [],
  );

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

  useEffect(() => {
    if (status === "disconnected" && shouldRedirectToConnect) {
      clearRedirectFlag();
      router.replace("/");
    }

    if (status === "idle") {
      router.replace("/");
    }

    if (role !== "player" && status !== "idle") {
      router.replace("/spectate");
      return;
    }

    if (status === "connected" && gamePhase === "idle") {
      setGamePhase("connected");
    }
  }, [
    role,
    status,
    router,
    gamePhase,
    shouldRedirectToConnect,
    clearRedirectFlag,
  ]);

  useEffect(() => {
    const unsubscribe = subscribe((msg: ParsedMessage) => {
      switch (msg.type) {
        case "CONNECT_ACK":
        case "RECONNECT_ACK":
          setGamePhase((prev) => (prev === "idle" ? "connected" : prev));
          addStatus("Connected to server");
          break;

        case "ERROR":
          addStatus(`⚠ ${msg.message}`);
          break;

        case "READY_ACK":
          setGamePhase("ready");
          addStatus("⏳ Waiting for an opponent...");
          break;

        case "GAME_START": {
          resetGame();
          const color: 1 | 2 = msg.goesFirst ? 1 : 2;
          setMyColor(color);
          myColorRef.current = color;
          setGamePhase("playing");
          const firstTurn = msg.goesFirst;
          setIsMyTurn(firstTurn);
          isMyTurnRef.current = firstTurn;
          addStatus(
            msg.goesFirst
              ? "🔴 You are Red - you go first"
              : "🟡 You are Yellow - wait for opponent's move",
          );
          break;
        }

        case "OPPONENT_MOVE": {
          const opponentColor: 1 | 2 = myColorRef.current === 1 ? 2 : 1;
          setBoard((prev) => {
            const { board: next, row } = placeToken(
              prev,
              opponentColor,
              msg.column,
            );
            setLastMove({ column: msg.column, row });
            return next;
          });
          setMoveCount((n) => n + 1);
          setIsMyTurn(true);
          isMyTurnRef.current = true;
          addStatus(`Opponent played column ${msg.column}`);
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
          addStatus("🤝 Draw");
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
          setGamePhase("connected");
          resetGame();
          send(cmd.ready());
          setGamePhase("ready");
          addStatus("⏳ Ready for next round...");
          break;

        case "TOURNAMENT_CANCEL":
          setTournamentMode(false);
          setGamePhase("connected");
          resetGame();
          addStatus("Tournament cancelled");
          break;

        default:
          break;
      }
    });

    return unsubscribe;
  }, [addStatus, resetGame, send, subscribe]);

  const handleColumnClick = useCallback(
    (col: number) => {
      if (!isMyTurnRef.current || gamePhase !== "playing") return;
      const color = myColorRef.current;
      if (!color) return;

      setBoard((prev) => {
        const { board: next, row } = placeToken(prev, color, col);
        if (row === -1) return prev;
        setLastMove({ column: col, row });
        return next;
      });

      setIsMyTurn(false);
      isMyTurnRef.current = false;
      setMoveCount((n) => n + 1);
      send(cmd.play(col));
      addStatus(`You played column ${col}`);
    },
    [addStatus, gamePhase, send],
  );

  const sendReady = useCallback(() => {
    send(cmd.ready());
    setGamePhase("ready");
    addStatus("⏳ Waiting for an opponent...");
  }, [addStatus, send]);

  const myColorLabel =
    myColor === 1 ? "🔴 Red" : myColor === 2 ? "🟡 Yellow" : null;
  const opponentColor: 1 | 2 | null =
    myColor === 1 ? 2 : myColor === 2 ? 1 : null;
  const redPlayerName = myColor === 1 ? username : "Opponent";
  const yellowPlayerName = myColor === 2 ? username : "Opponent";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">🎮 Play Connect4</h1>
          <p className="text-gray-400 text-sm mt-1">
            Connected as <span className="text-green-300">{username}</span>
          </p>
        </div>
        <PhaseIndicator phase={gamePhase} isMyTurn={isMyTurn} />
      </div>

      {status === "reconnecting" && (
        <div className="rounded-lg border border-yellow-700 bg-yellow-950/30 px-4 py-3 text-sm text-yellow-200">
          Connection lost during a live match. Reconnect attempt #
          {reconnectAttempts}...
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="flex flex-col gap-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
              Session
            </h2>

            <div className="text-xs text-gray-400">
              Status: <span className="text-gray-200">{status}</span>
            </div>
            <div className="text-xs text-gray-400">
              User: <span className="text-gray-200">{username}</span>
            </div>

            <button
              onClick={disconnect}
              className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Disconnect
            </button>
          </div>

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

            {gamePhase === "connected" && (
              <button
                onClick={sendReady}
                className="w-full py-2.5 bg-green-700 hover:bg-green-600 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                ✋ Ready to Play
              </button>
            )}

            {gamePhase === "ready" && (
              <div className="text-center py-3 text-yellow-300 text-sm animate-pulse">
                ⏳ Waiting for opponent...
              </div>
            )}

            {(gamePhase === "playing" || gamePhase === "game-over") &&
              myColor && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-800">
                    <div
                      className={`w-4 h-4 rounded-full ${myColor === 1 ? "bg-red-500" : "bg-yellow-400"}`}
                    />
                    <span className="text-white font-medium text-sm">
                      You are {myColorLabel}
                    </span>
                  </div>

                  {gamePhase === "playing" && (
                    <div
                      className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-semibold text-sm ${
                        isMyTurn
                          ? "bg-green-900/50 border border-green-600 text-green-300 animate-pulse"
                          : "bg-gray-800 text-gray-400"
                      }`}
                    >
                      {isMyTurn
                        ? "⬆ Your turn - click a column"
                        : "⏳ Waiting for opponent..."}
                    </div>
                  )}

                  <div className="text-xs text-gray-500 text-center">
                    {moveCount} move{moveCount !== 1 ? "s" : ""} played
                  </div>
                </div>
              )}

            {gamePhase === "game-over" && gameResult && !tournamentMode && (
              <button
                onClick={sendReady}
                className="w-full py-2 bg-green-700 hover:bg-green-600 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Play Again
              </button>
            )}
          </div>

          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-2">
              Status Log
            </h2>
            <div className="flex flex-col gap-0.5 max-h-52 overflow-y-auto">
              {statusMessages.length === 0 ? (
                <p className="text-gray-600 text-xs">No events yet</p>
              ) : (
                statusMessages.map((m, i) => (
                  <p key={i} className="text-xs text-gray-400 font-mono">
                    {m}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 bg-gray-900 border border-gray-700 rounded-xl p-6 flex flex-col items-center justify-center gap-4 min-h-96">
          {gamePhase === "idle" ? (
            <div className="text-gray-500 text-center py-10">
              Connect from the connection page to start.
            </div>
          ) : gamePhase === "connected" ? (
            <div className="flex flex-col items-center gap-4 text-center py-8">
              <div className="text-5xl">✋</div>
              <p className="text-blue-300 text-lg font-medium">
                Ready up to start
              </p>
              <p className="text-gray-500 text-sm max-w-sm">
                Click the{" "}
                <span className="text-green-300 font-semibold">
                  Ready to Play
                </span>{" "}
                button in the Match panel to enter the queue.
              </p>
            </div>
          ) : gamePhase === "ready" ? (
            <div className="flex flex-col items-center gap-4 text-center py-8">
              <div className="text-5xl animate-bounce">⏳</div>
              <p className="text-yellow-300 text-lg font-medium">
                Waiting for an opponent...
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
                        ? "🤝 Draw"
                        : "⛔ Match Terminated"}
                </div>
              )}

              <Board
                board={board}
                lastMove={lastMove}
                player1={redPlayerName}
                player2={yellowPlayerName}
                currentTurnColor={
                  gamePhase === "playing" && myColor
                    ? isMyTurn
                      ? myColor
                      : opponentColor
                    : null
                }
                onColumnClick={
                  gamePhase === "playing" && isMyTurn
                    ? handleColumnClick
                    : undefined
                }
                disabled={gamePhase !== "playing" || !isMyTurn}
              />
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
    idle: { label: "Not ready", cls: "bg-gray-700 text-gray-400" },
    connected: { label: "Connected", cls: "bg-blue-900/60 text-blue-300" },
    ready: {
      label: "Waiting...",
      cls: "bg-yellow-900/60 text-yellow-300 animate-pulse",
    },
    playing: { label: "In Game", cls: "bg-green-900/60 text-green-400" },
    "game-over": { label: "Game Over", cls: "bg-gray-700 text-gray-400" },
  };

  const { label, cls } = config[phase];
  return (
    <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${cls}`}>
      {label}
    </span>
  );
}
