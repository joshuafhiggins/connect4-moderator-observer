"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Confetti from "react-confetti";
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
  const [tournamentMode, setTournamentMode] = useState(false);
  const [showWinConfetti, setShowWinConfetti] = useState(false);
  const [winConfettiBurstId, setWinConfettiBurstId] = useState(0);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const myColorRef = useRef<1 | 2 | null>(null);
  const isMyTurnRef = useRef(false);

  const resetGame = useCallback(() => {
    setBoard(createEmptyBoard());
    setLastMove(null);
    setMyColor(null);
    myColorRef.current = null;
    setIsMyTurn(false);
    isMyTurnRef.current = false;
    setGameResult(null);
  }, []);

  useEffect(() => {
    const updateViewport = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
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
          break;

        case "ERROR":
          break;

        case "READY_ACK":
          setGamePhase("ready");
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
          setIsMyTurn(true);
          isMyTurnRef.current = true;
          break;
        }

        case "GAME_WINS":
          setGameResult("win");
          setWinConfettiBurstId((prev) => prev + 1);
          setShowWinConfetti(true);
          setGamePhase("game-over");
          setIsMyTurn(false);
          isMyTurnRef.current = false;
          break;

        case "GAME_LOSS":
          setGameResult("loss");
          setGamePhase("game-over");
          setIsMyTurn(false);
          isMyTurnRef.current = false;
          break;

        case "GAME_DRAW":
          setGameResult("draw");
          setGamePhase("game-over");
          setIsMyTurn(false);
          isMyTurnRef.current = false;
          break;

        case "GAME_TERMINATED":
          setGameResult("terminated");
          setGamePhase("game-over");
          setIsMyTurn(false);
          isMyTurnRef.current = false;
          break;

        case "TOURNAMENT_START":
          setTournamentMode(true);
          break;

        case "TOURNAMENT_END":
          setGamePhase("connected");
          resetGame();
          send(cmd.ready());
          setGamePhase("ready");
          break;

        case "TOURNAMENT_CANCEL":
          setTournamentMode(false);
          setGamePhase("connected");
          resetGame();
          break;

        default:
          break;
      }
    });

    return unsubscribe;
  }, [resetGame, send, subscribe]);

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
      send(cmd.play(col));
    },
    [gamePhase, send],
  );

  const sendReady = useCallback(() => {
    send(cmd.ready());
    setGamePhase("ready");
  }, [send]);

  const myColorLabel =
    myColor === 1 ? "🔴 Red" : myColor === 2 ? "🟡 Yellow" : null;
  const opponentColor: 1 | 2 | null =
    myColor === 1 ? 2 : myColor === 2 ? 1 : null;
  const redPlayerName = myColor === 1 ? username : "Opponent";
  const yellowPlayerName = myColor === 2 ? username : "Opponent";

  return (
    <div className="flex flex-col gap-6">
      {showWinConfetti && (
        <Confetti
          key={winConfettiBurstId}
          width={viewport.width}
          height={viewport.height}
          recycle={false}
          onConfettiComplete={() => setShowWinConfetti(false)}
          numberOfPieces={300}
          gravity={0.28}
          className="pointer-events-none fixed! inset-0! z-40!"
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">🎮 Play Connect4</h1>
          <p className="text-gray-400 text-sm mt-1">
            Connected as <span className="text-green-300">{username}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {gamePhase === "connected" && (
            <button
              onClick={sendReady}
              className="rounded-full border border-green-700 bg-green-900/60 px-3 py-1.5 text-sm font-medium text-green-300 transition-colors hover:bg-green-800/70"
            >
              Ready Up
            </button>
          )}
          <PhaseIndicator phase={gamePhase} isMyTurn={isMyTurn} />
        </div>
      </div>

      {status === "reconnecting" && (
        <div className="rounded-lg border border-yellow-700 bg-yellow-950/30 px-4 py-3 text-sm text-yellow-200">
          Connection lost during a live match. Reconnect attempt #
          {reconnectAttempts}...
        </div>
      )}

      {tournamentMode && (
        <div className="flex items-center gap-2 rounded-lg border border-purple-700 bg-purple-950/50 px-3 py-2 text-sm text-purple-300">
          <span>🏆</span>
          <span>Tournament mode active</span>
        </div>
      )}

      {(gamePhase === "playing" || gamePhase === "game-over") && myColor && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 rounded-lg bg-gray-800 px-3 py-2">
            <span className="text-sm font-medium text-white">
              You are {myColorLabel}
            </span>
          </div>

          {gamePhase === "playing" && (
            <div
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                isMyTurn
                  ? "animate-pulse border border-green-600 bg-green-900/50 text-green-300"
                  : "bg-gray-800 text-gray-400"
              }`}
            >
              {isMyTurn
                ? "⬆ Your turn - click a column"
                : "⏳ Waiting for opponent..."}
            </div>
          )}
        </div>
      )}

      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 flex flex-col items-center justify-center gap-4 min-h-96">
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
                  Ready Up
                </span>{" "}
                button beside your status to enter the queue.
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
      <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-green-900/60 text-green-300">
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
