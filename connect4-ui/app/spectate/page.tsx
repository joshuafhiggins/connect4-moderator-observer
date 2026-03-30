"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Board from "@/components/Board";
import {
  BoardState,
  GameEntry,
  ParsedMessage,
  PlayerEntry,
  ScoreEntry,
  cmd,
  createEmptyBoard,
  placeToken,
  replayMoves,
} from "@/lib/protocol";
import { useConnection } from "@/lib/connection";

interface LiveGame {
  id: number;
  player1: string;
  player2: string;
  board: BoardState;
  lastMove: { column: number; row: number } | null;
  currentTurnColor: 1 | 2;
  result:
    | { kind: "win"; winner: string }
    | { kind: "draw" }
    | { kind: "terminated" }
    | null;
}

interface KnockoutMatchView {
  key: string;
  roundIndex: number;
  matchIndex: number;
  player1: string | null;
  player2: string | null;
  winner: string | null;
  currentTurnColor: 1 | 2 | null;
  matchId: number | null;
  status: "scheduled" | "live" | "completed";
  resultKind: LiveGame["result"] extends infer T
    ? T extends { kind: infer K }
      ? K
      : null
    : null;
}

interface KnockoutRoundView {
  label: string;
  matches: KnockoutMatchView[];
  projected?: boolean;
}

export default function SpectatePage() {
  const router = useRouter();
  const {
    role,
    status,
    send,
    subscribe,
    disconnect,
    shouldRedirectToConnect,
    clearRedirectFlag,
  } = useConnection();

  const [tournamentActive, setTournamentActive] = useState(false);
  const [tournamentType, setTournamentType] = useState<string | null>(null);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [players, setPlayers] = useState<PlayerEntry[]>([]);
  const [gameList, setGameList] = useState<GameEntry[]>([]);
  const [liveGames, setLiveGames] = useState<Map<number, LiveGame>>(new Map());
  const [selectedGame, setSelectedGame] = useState<number | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [knockoutRawData, setKnockoutRawData] = useState("");
  const [tournamentWinner, setTournamentWinner] = useState<string | null>(null);

  const liveGamesRef = useRef<Map<number, LiveGame>>(new Map());
  const initialBoardSyncPendingRef = useRef(true);

  const addLog = useCallback(
    (msg: string) =>
      setLog((prev) => [
        `[${new Date().toLocaleTimeString()}] ${msg}`,
        ...prev.slice(0, 79),
      ]),
    [],
  );

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

  useEffect(() => {
    if (status === "disconnected" && shouldRedirectToConnect) {
      clearRedirectFlag();
      router.replace("/");
    }

    if (status === "idle") {
      router.replace("/");
    }

    if (role !== "observer" && status !== "idle") {
      router.replace("/play");
      return;
    }
  }, [role, status, shouldRedirectToConnect, clearRedirectFlag, router]);

  useEffect(() => {
    const unsubscribe = subscribe((msg: ParsedMessage, raw: string) => {
      if (
        tournamentType === "KnockoutBracket" &&
        msg.type === "UNKNOWN" &&
        isKnockoutDataMessage(raw)
      ) {
        setKnockoutRawData(raw);
      }

      switch (msg.type) {
        case "TOURNAMENT_START":
          setTournamentActive(true);
          setTournamentType(msg.tournamentType);
          setScores([]);
          setKnockoutRawData("");
          setTournamentWinner(null);
          addLog(`🏆 Tournament started: ${msg.tournamentType}`);
          send(cmd.gameList());
          send(cmd.playerList());
          if (msg.tournamentType === "KnockoutBracket") {
            send(cmd.getData("TOURNAMENT_DATA"));
          }
          break;

        case "TOURNAMENT_CANCEL":
          setTournamentActive(false);
          setTournamentType(null);
          setKnockoutRawData("");
          setTournamentWinner(null);
          addLog("❌ Tournament cancelled");
          break;

        case "TOURNAMENT_SCORES":
          setScores(msg.scores);
          break;

        case "TOURNAMENT_END":
          setTournamentActive(false);
          setTournamentType(null);
          addLog("Round ended");
          send(cmd.gameList());
          send(cmd.playerList());
          break;

        case "TOURNAMENT_WINNER":
          setTournamentWinner(msg.username);
          break;

        case "CONNECT_EVENT":
          addLog(`Player joined: ${msg.username}`);
          send(cmd.playerList());
          break;

        case "DISCONNECT_EVENT":
          addLog(`Player left: ${msg.username}`);
          send(cmd.playerList());
          send(cmd.gameList());
          break;

        case "READY_EVENT": {
          let found = false;
          setPlayers((prev) =>
            prev.map((player) => {
              if (player.username !== msg.username) return player;
              found = true;
              return { ...player, ready: msg.ready };
            }),
          );

          if (!found) {
            send(cmd.playerList());
          }
          break;
        }

        case "GAME_MATCH_START":
          addLog(
            `Match started: #${msg.matchId} ${msg.player1} vs ${msg.player2}`,
          );
          send(cmd.gameList());
          send(cmd.playerList());
          if (tournamentType === "KnockoutBracket" && !knockoutRawData) {
            send(cmd.getData("TOURNAMENT_DATA"));
          }
          break;

        case "GAME_LIST":
          setGameList(msg.games);
          const shouldHydrateWithWatch = initialBoardSyncPendingRef.current;
          for (const g of msg.games) {
            const isNewMatch = !liveGamesRef.current.has(g.id);
            updateGame(g.id, { player1: g.player1, player2: g.player2 });

            if (isNewMatch && shouldHydrateWithWatch) {
              send(cmd.gameWatch(g.id));
            }
          }

          if (shouldHydrateWithWatch) {
            initialBoardSyncPendingRef.current = false;
          }
          break;

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
          break;
        }

        case "GAME_MOVE": {
          if (typeof msg.matchId !== "number") {
            addLog("Protocol error: GAME_MOVE missing matchId");
            break;
          }

          const game = liveGamesRef.current.get(msg.matchId);
          if (!game) break;
          const color: 1 | 2 = msg.username === game.player1 ? 1 : 2;
          const { board: next, row } = placeToken(
            game.board,
            color,
            msg.column,
          );
          updateGame(msg.matchId, {
            board: next,
            lastMove: { column: msg.column, row },
            currentTurnColor: (color === 1 ? 2 : 1) as 1 | 2,
          });
          break;
        }

        case "GAME_WIN": {
          if (typeof msg.matchId !== "number") {
            addLog("Protocol error: GAME_WIN missing matchId");
            break;
          }

          updateGame(msg.matchId, {
            result: { kind: "win", winner: msg.winner },
          });
          setTimeout(() => {
            send(cmd.gameList());
            send(cmd.playerList());
          }, 750);
          break;
        }

        case "GAME_DRAW":
          if (typeof msg.matchId !== "number") {
            addLog("Protocol error: GAME_DRAW missing matchId");
            break;
          }
          updateGame(msg.matchId, { result: { kind: "draw" } });
          break;

        case "GAME_TERMINATED":
          if (typeof msg.matchId !== "number") {
            addLog("Protocol error: GAME_TERMINATED missing matchId");
            break;
          }
          updateGame(msg.matchId, { result: { kind: "terminated" } });
          send(cmd.gameList());
          break;

        case "PLAYER_LIST":
          setPlayers(msg.players);
          break;

        case "GET_DATA":
          if (
            msg.key === "TOURNAMENT_STATUS" &&
            msg.value &&
            msg.value !== "false"
          ) {
            setTournamentActive(true);
            setTournamentType(msg.value);
            if (msg.value === "KnockoutBracket") {
              send(cmd.getData("TOURNAMENT_DATA"));
            }
          } else if (msg.key === "TOURNAMENT_DATA" && msg.value) {
            setKnockoutRawData(msg.value);
          }
          break;

        case "ERROR":
          addLog(`Error: ${msg.message}`);
          break;

        default:
          break;
      }
    });

    return unsubscribe;
  }, [addLog, knockoutRawData, send, subscribe, tournamentType, updateGame]);

  useEffect(() => {
    if (status !== "connected" || role !== "observer") return;

    initialBoardSyncPendingRef.current = true;
    send(cmd.getData("TOURNAMENT_STATUS"));
    send(cmd.gameList());
    send(cmd.playerList());
  }, [role, send, status]);

  const selectedGameData =
    selectedGame !== null ? liveGames.get(selectedGame) : null;
  const showLeaderboard = tournamentType === "RoundRobin";
  const showKnockoutBracket = tournamentType === "KnockoutBracket";
  const knockoutRounds = useMemo(
    () => parseKnockoutRounds(knockoutRawData),
    [knockoutRawData],
  );
  const sortedPlayers = useMemo(
    () =>
      [...players].sort((a, b) =>
        a.username.localeCompare(b.username, undefined, {
          sensitivity: "base",
        }),
      ),
    [players],
  );
  const knockoutBracket = useMemo(
    () => buildKnockoutBracket(knockoutRounds, liveGames, tournamentWinner),
    [knockoutRounds, liveGames, tournamentWinner],
  );

  return (
    <div className="flex flex-col gap-6">
      {status !== "connected" && (
        <div className="rounded-lg border border-yellow-700 bg-yellow-950/30 px-4 py-3 text-sm text-yellow-200">
          Waiting for observer connection...
        </div>
      )}

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
                ? `Tournament Active - ${tournamentType ?? "Unknown Type"}`
                : "No Active Tournament"}
            </div>
            <div className="text-sm text-gray-400">
              {gameList.length} match{gameList.length !== 1 ? "es" : ""} running
              · {players.filter((p) => p.inMatch).length}/{players.length}{" "}
              players in game
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="flex flex-col gap-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3 flex items-center justify-between">
              <span>Players</span>
              <span className="text-xs text-gray-500 font-normal">
                {players.length} connected
              </span>
            </h2>
            {players.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">
                No players connected
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {sortedPlayers.map((p) => (
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

          {showLeaderboard && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
                Leaderboard
              </h2>
              {scores.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">
                  No scores yet
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {scores.map((s, i) => (
                    <div
                      key={s.player}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-800"
                    >
                      <span className="text-sm font-bold w-6 text-gray-300">
                        {i + 1}.
                      </span>
                      <span className="text-white flex-1 font-medium text-sm">
                        {s.player}
                      </span>
                      <span className="text-blue-400 font-bold">{s.score}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
              {showKnockoutBracket ? "Tournament Bracket" : "Active Matches"}
            </h2>
            {showKnockoutBracket ? (
              knockoutBracket.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-700 bg-gray-950/60 px-4 py-6 text-center text-sm text-gray-500">
                  Knockout seeding is still in progress. The bracket will appear
                  once tournament data is available.
                </div>
              ) : (
                <div className="overflow-x-auto pb-2">
                  <div className="flex min-w-max place-content-center items-stretch gap-10">
                    {knockoutBracket.map((round) => (
                      <div
                        key={round.label}
                        className="flex w-60 shrink-0 flex-col"
                      >
                        <div className="mb-3 text-center">
                          <span className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
                            {round.label}
                          </span>
                        </div>
                        <div className="flex flex-1 flex-col justify-center gap-3">
                          {round.matches.map((match) => {
                            const isSelected =
                              match.matchId !== null &&
                              selectedGame === match.matchId;
                            const canSelect = match.matchId !== null;
                            const borderClass =
                              match.status === "completed"
                                ? "border-green-700/80"
                                : "border-gray-700";

                            const Tag = canSelect ? "button" : "div";

                            return (
                              <Tag
                                key={match.key}
                                {...(canSelect
                                  ? {
                                      onClick: () =>
                                        setSelectedGame(
                                          isSelected ? null : match.matchId,
                                        ),
                                      type: "button" as const,
                                    }
                                  : {})}
                                className={`w-full rounded-xl border bg-gray-950/70 p-3 text-left transition-colors ${borderClass} ${
                                  canSelect
                                    ? isSelected
                                      ? "ring-1 ring-blue-400"
                                      : "hover:border-blue-700/80"
                                    : ""
                                }`}
                              >
                                <div className="flex flex-col gap-2">
                                  <BracketPlayerRow
                                    name={match.player1}
                                    playerColor={1}
                                    isActive={match.currentTurnColor === 1}
                                  />
                                  <BracketPlayerRow
                                    name={match.player2}
                                    playerColor={2}
                                    isActive={match.currentTurnColor === 2}
                                  />
                                  <div className="flex items-center justify-between pt-1 text-xs">
                                    <span className="text-gray-500">
                                      {match.matchId !== null
                                        ? `Match #${match.matchId}`
                                        : "Awaiting match"}
                                    </span>
                                    <span
                                      className={`rounded-full px-2 py-0.5 ${
                                        match.status === "completed"
                                          ? "bg-green-950/70 text-green-300"
                                          : match.status === "live"
                                            ? "bg-blue-950/70 text-blue-300"
                                            : "bg-gray-800 text-gray-400"
                                      }`}
                                    >
                                      {match.status === "completed"
                                        ? match.resultKind === "draw"
                                          ? "Tie"
                                          : "Complete"
                                        : match.status === "live"
                                          ? "Live"
                                          : "Pending"}
                                    </span>
                                  </div>
                                </div>
                              </Tag>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ) : gameList.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-3">
                No active matches
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {gameList.map((g) => {
                  const live = liveGames.get(g.id);
                  return (
                    <button
                      key={g.id}
                      onClick={() =>
                        setSelectedGame(selectedGame === g.id ? null : g.id)
                      }
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
                  currentTurnColor={
                    selectedGameData.result
                      ? null
                      : selectedGameData.currentTurnColor
                  }
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

function BracketPlayerRow({
  name,
  playerColor,
  isActive,
}: {
  name: string | null;
  playerColor: 1 | 2;
  isActive: boolean;
}) {
  const isRed = playerColor === 1;

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
        isActive
          ? isRed
            ? "border-red-500 bg-red-950/50 text-red-300"
            : "border-yellow-500 bg-yellow-950/50 text-yellow-300"
          : "border-gray-700 bg-gray-900 text-gray-400"
      }`}
    >
      {name && (
        <div
          className={`h-3.5 w-3.5 shrink-0 rounded-full ${
            isRed ? "bg-red-500" : "bg-yellow-400"
          } ${isActive ? "animate-pulse" : ""}`}
        />
      )}
      <span className={`font-medium ${name ? "" : "text-gray-500"}`}>
        {name ?? "TBD"}
      </span>
    </div>
  );
}

function isKnockoutDataMessage(raw: string) {
  return !raw.includes(":") && (raw.includes(",") || raw.includes("|"));
}

function parseKnockoutRounds(raw: string) {
  if (!raw) return [] as string[][];

  return raw
    .split("|")
    .filter(Boolean)
    .map((round) =>
      round
        .split(",")
        .map((player) => player.trim())
        .filter(Boolean),
    )
    .filter((round) => round.length > 0);
}

function buildKnockoutBracket(
  rounds: string[][],
  liveGames: Map<number, LiveGame>,
  tournamentWinner: string | null,
) {
  if (rounds.length === 0) return [] as KnockoutRoundView[];

  const liveGameEntries = Array.from(liveGames.values()).sort(
    (a, b) => b.id - a.id,
  );
  const displayRounds: Array<{
    label: string;
    players: Array<string | null>;
    projected?: boolean;
  }> = rounds.map((players, index) => ({
    label: knockoutRoundLabel(index, players.length),
    players,
  }));

  while (displayRounds[displayRounds.length - 1]?.players.length > 2) {
    const latestRoundPlayers = displayRounds[displayRounds.length - 1].players;
    const projectedPlayers = latestRoundPlayers.reduce<Array<string | null>>(
      (acc, _, index, source) => {
        if (index % 2 !== 0) return acc;
        const player1 = source[index] ?? null;
        const player2 = source[index + 1] ?? null;
        const liveMatch = findLiveMatch(liveGameEntries, player1, player2);
        acc.push(
          resolveLiveWinner(liveMatch, tournamentWinner, player1, player2),
        );
        return acc;
      },
      [],
    );

    displayRounds.push({
      label: knockoutRoundLabel(displayRounds.length, projectedPlayers.length),
      players: projectedPlayers,
      projected: true,
    });
  }

  return displayRounds.map((round, roundIndex) => ({
    label: round.label,
    projected: round.projected,
    matches: pairPlayers(round.players).map(
      ([player1, player2], matchIndex) => {
        const nextRound = displayRounds[roundIndex + 1];
        const nextRoundPlayer = nextRound?.players[matchIndex] ?? null;
        const liveMatch = findLiveMatch(liveGameEntries, player1, player2);
        const isProjectedRound = Boolean(round.projected);
        const hasKnownPlayers = Boolean(player1 && player2);
        const hasAdvancedPastRound =
          roundIndex < rounds.length - 1 &&
          !displayRounds[roundIndex + 1]?.projected;
        const inferredCompletedRealMatch =
          !isProjectedRound && hasKnownPlayers && !liveMatch;
        const winner =
          nextRoundPlayer &&
          (nextRoundPlayer === player1 || nextRoundPlayer === player2)
            ? nextRoundPlayer
            : resolveLiveWinner(liveMatch, tournamentWinner, player1, player2);
        const status =
          winner || hasAdvancedPastRound || inferredCompletedRealMatch
            ? "completed"
            : liveMatch
              ? "live"
              : "scheduled";

        return {
          key: `${roundIndex}-${matchIndex}-${player1 ?? "tbd"}-${player2 ?? "tbd"}`,
          roundIndex,
          matchIndex,
          player1,
          player2,
          winner,
          currentTurnColor: winner
            ? null
            : (liveMatch?.currentTurnColor ?? null),
          matchId: liveMatch?.id ?? null,
          status,
          resultKind: liveMatch?.result?.kind ?? null,
        } satisfies KnockoutMatchView;
      },
    ),
  }));
}

function pairPlayers(players: Array<string | null>) {
  const pairs: Array<[string | null, string | null]> = [];
  for (let index = 0; index < players.length; index += 2) {
    pairs.push([players[index] ?? null, players[index + 1] ?? null]);
  }
  return pairs;
}

function findLiveMatch(
  liveGames: LiveGame[],
  player1: string | null,
  player2: string | null,
) {
  if (!player1 || !player2) return null;

  return (
    liveGames.find((game) =>
      samePlayers(game.player1, game.player2, player1, player2),
    ) ?? null
  );
}

function resolveLiveWinner(
  liveMatch: LiveGame | null,
  tournamentWinner: string | null,
  player1: string | null,
  player2: string | null,
) {
  if (liveMatch?.result?.kind === "win") {
    return liveMatch.result.winner;
  }

  if (
    tournamentWinner &&
    (tournamentWinner === player1 || tournamentWinner === player2)
  ) {
    return tournamentWinner;
  }

  return null;
}

function samePlayers(
  left1: string,
  left2: string,
  right1: string,
  right2: string,
) {
  return (
    (left1 === right1 && left2 === right2) ||
    (left1 === right2 && left2 === right1)
  );
}

function knockoutRoundLabel(roundIndex: number, playerCount: number) {
  if (playerCount <= 1) return "Champion";
  if (playerCount === 2) return "Final";
  if (playerCount === 4) return "Semifinals";
  if (playerCount === 8) return "Quarterfinals";
  return `Round ${roundIndex + 1}`;
}
