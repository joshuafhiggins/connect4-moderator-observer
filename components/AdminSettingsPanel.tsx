"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { cmd, ParsedMessage, ReservationEntry } from "@/lib/protocol";
import { useConnection } from "@/lib/connection";

const GETTABLE_DATA_KEYS = [
  "TOURNAMENT_STATUS",
  "TOURNAMENT_DATA",
  "MOVE_WAIT",
  "DEMO_MODE",
  "MAX_TIMEOUT",
  "BRACKET_PAIRINGS",
] as const;

const EDITABLE_DATA_KEYS = ["DEMO_MODE", "MAX_TIMEOUT", "MOVE_WAIT"] as const;
const TOURNAMENT_TYPES = ["RoundRobin", "KnockoutBracket"] as const;
const TOURNAMENT_TYPE_LABELS: Record<
  (typeof TOURNAMENT_TYPES)[number],
  string
> = {
  RoundRobin: "Round Robin",
  KnockoutBracket: "Knockout Bracket",
};
const VARIABLE_LABELS: Record<(typeof EDITABLE_DATA_KEYS)[number], string> = {
  DEMO_MODE: "Demo Mode",
  MAX_TIMEOUT: "Max Timeout",
  MOVE_WAIT: "Move Wait",
};

function parseBracketPairings(value: string): string[] {
  return value
    .split(",")
    .map((username) => username.trim())
    .filter((username) => username.length > 0);
}

function serializeBracketPairings(players: string[]): string {
  return players.join(",");
}

function formatTournamentType(type: string): string {
  if (type === "RoundRobin" || type === "KnockoutBracket") {
    return TOURNAMENT_TYPE_LABELS[type];
  }
  return type;
}

export default function AdminSettingsPanel() {
  const { authenticateAdmin, isAdmin, send, status, subscribe } =
    useConnection();
  const [adminPassword, setAdminPassword] = useState("");
  const [adminFeedback, setAdminFeedback] = useState<string | null>(null);
  const [selectedTournamentType, setSelectedTournamentType] =
    useState<(typeof TOURNAMENT_TYPES)[number]>("RoundRobin");
  const [serverValues, setServerValues] = useState<Record<string, string>>({});
  const [editableValues, setEditableValues] = useState<Record<string, string>>(
    {},
  );
  const [bracketPlayer, setBracketPlayer] = useState("");
  const [bracketPairings, setBracketPairings] = useState<string[]>([]);
  const [reservationPlayer1, setReservationPlayer1] = useState("");
  const [reservationPlayer2, setReservationPlayer2] = useState("");
  const [reservations, setReservations] = useState<ReservationEntry[]>([]);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const pendingAdminAuthRef = useRef(false);
  const pendingSetRef = useRef<Record<string, string>>({});

  const isConnected = status === "connected";
  const adminControlsDisabled = !isConnected || !isAdmin;
  const hasActiveTournament = Boolean(
    serverValues.TOURNAMENT_STATUS &&
    serverValues.TOURNAMENT_STATUS !== "false",
  );
  const hasVariableChanges = EDITABLE_DATA_KEYS.some(
    (key) =>
      editableValues[key] !== undefined &&
      editableValues[key] !== serverValues[key],
  );
  const serializedBracketPairings = serializeBracketPairings(bracketPairings);
  const hasBracketPairingChanges =
    serializedBracketPairings !== (serverValues.BRACKET_PAIRINGS ?? "");

  useEffect(() => {
    const unsubscribe = subscribe((message: ParsedMessage) => {
      switch (message.type) {
        case "ADMIN_AUTH_ACK":
          pendingAdminAuthRef.current = false;
          setAdminFeedback("Admin access granted.");
          break;
        case "GET_DATA":
          setServerValues((prev) => ({
            ...prev,
            [message.key]: message.value,
          }));
          if (
            EDITABLE_DATA_KEYS.includes(
              message.key as (typeof EDITABLE_DATA_KEYS)[number],
            )
          ) {
            setEditableValues((prev) => ({
              ...prev,
              [message.key]: message.value,
            }));
          }
          if (message.key === "BRACKET_PAIRINGS") {
            setBracketPairings(parseBracketPairings(message.value));
          }
          setActionFeedback(`Loaded ${message.key}.`);
          break;
        case "SET_DATA_ACK":
          setServerValues((prev) => ({
            ...prev,
            [message.key]:
              pendingSetRef.current[message.key] ?? prev[message.key] ?? "",
          }));
          setEditableValues((prev) => ({
            ...prev,
            [message.key]:
              pendingSetRef.current[message.key] ?? prev[message.key] ?? "",
          }));
          if (message.key === "BRACKET_PAIRINGS") {
            setBracketPairings(
              parseBracketPairings(pendingSetRef.current[message.key] ?? ""),
            );
          }
          delete pendingSetRef.current[message.key];
          setActionFeedback(`Updated ${message.key}.`);
          break;
        case "TOURNAMENT_START":
          setServerValues((prev) => ({
            ...prev,
            TOURNAMENT_STATUS: message.tournamentType,
          }));
          setActionFeedback(
            `Started ${formatTournamentType(message.tournamentType)}.`,
          );
          break;
        case "TOURNAMENT_CANCEL":
          setServerValues((prev) => ({
            ...prev,
            TOURNAMENT_STATUS: "false",
          }));
          setActionFeedback("Tournament cancelled.");
          break;
        case "TOURNAMENT_END":
          setServerValues((prev) => ({
            ...prev,
            TOURNAMENT_STATUS: "false",
          }));
          break;
        case "RESERVATION_LIST":
          setReservations(message.reservations);
          setActionFeedback("Loaded reservations.");
          break;
        case "RESERVATION_ADD":
          setReservations((prev) => {
            const exists = prev.some(
              (reservation) =>
                reservation.player1 === message.player1 &&
                reservation.player2 === message.player2,
            );
            return exists
              ? prev
              : [
                  ...prev,
                  { player1: message.player1, player2: message.player2 },
                ];
          });
          setActionFeedback(null);
          break;
        case "RESERVATION_DELETE":
          setReservations((prev) =>
            prev.filter(
              (reservation) =>
                !(
                  reservation.player1 === message.player1 &&
                  reservation.player2 === message.player2
                ),
            ),
          );
          setActionFeedback(null);
          break;
        case "ERROR":
          if (pendingAdminAuthRef.current) {
            pendingAdminAuthRef.current = false;
            setAdminFeedback("Admin authentication failed.");
          }
          setActionFeedback(message.message);
          break;
        default:
          break;
      }
    });

    return unsubscribe;
  }, [subscribe]);

  useEffect(() => {
    if (!isAdmin || !isConnected) {
      return;
    }

    GETTABLE_DATA_KEYS.forEach((key) => {
      send(cmd.getData(key));
    });
    send(cmd.reservationGet());
  }, [isAdmin, isConnected, send]);

  const handleAdminAuth = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sent = authenticateAdmin(adminPassword);
    pendingAdminAuthRef.current = sent;
    setAdminFeedback(
      sent
        ? "Authenticating admin session..."
        : "Connect before authenticating.",
    );
    if (sent) {
      setAdminPassword("");
    }
  };

  const handleTournamentStart = () => {
    if (hasActiveTournament) {
      setActionFeedback("A tournament is already active.");
      return;
    }
    if (!send(cmd.tournamentStart(selectedTournamentType))) {
      setActionFeedback("Unable to start tournament while disconnected.");
      return;
    }
    setActionFeedback(
      `Starting ${formatTournamentType(selectedTournamentType)} tournament...`,
    );
  };

  const handleTournamentCancel = () => {
    if (!hasActiveTournament) {
      setActionFeedback("No active tournament to cancel.");
      return;
    }
    if (!send(cmd.tournamentCancel())) {
      setActionFeedback("Unable to cancel tournament while disconnected.");
      return;
    }
    setActionFeedback("Cancelling tournament...");
  };

  const handleEditableValueChange = (key: string, value: string) => {
    setEditableValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSaveVariables = () => {
    const changes = EDITABLE_DATA_KEYS.filter(
      (key) =>
        editableValues[key] !== undefined &&
        editableValues[key] !== serverValues[key],
    );

    if (changes.length === 0) {
      setActionFeedback("No variable changes to save.");
      return;
    }

    for (const key of changes) {
      const value = editableValues[key];
      if (!send(cmd.setData(key, value))) {
        setActionFeedback("Unable to send SET command while disconnected.");
        return;
      }
      pendingSetRef.current[key] = value;
    }

    setActionFeedback(
      `Saving ${changes.length} variable${changes.length === 1 ? "" : "s"}...`,
    );
  };

  const handleReservationAction = (action: "add" | "delete") => {
    const player1 = reservationPlayer1.trim();
    const player2 = reservationPlayer2.trim();
    if (!player1 || !player2) return;

    const message =
      action === "add"
        ? cmd.reservationAdd(player1, player2)
        : cmd.reservationDelete(player1, player2);
    const sent = send(message);
    if (!sent) {
      setActionFeedback(
        "Unable to send reservation command while disconnected.",
      );
      return;
    }

    setActionFeedback(
      `${action === "add" ? "Adding" : "Removing"} reservation for ${player1} vs ${player2}...`,
    );
    setReservationPlayer1("");
    setReservationPlayer2("");
  };

  const handleReservationDeletePair = (player1: string, player2: string) => {
    const sent = send(cmd.reservationDelete(player1, player2));
    if (!sent) {
      setActionFeedback(
        "Unable to send reservation command while disconnected.",
      );
      return;
    }

    setActionFeedback(`Removing reservation for ${player1} vs ${player2}...`);
  };

  const handleRefreshReservations = () => {
    if (!send(cmd.reservationGet())) {
      setActionFeedback("Unable to fetch reservations while disconnected.");
      return;
    }
    setActionFeedback("Fetching reservations...");
  };

  const handleBracketPairingAdd = () => {
    const player = bracketPlayer.trim();
    if (!player) return;

    setBracketPairings((prev) => [...prev, player]);
    setBracketPlayer("");
  };

  const handleBracketPairingDelete = (index: number) => {
    setBracketPairings((prev) =>
      prev.filter((_, pairingIndex) => pairingIndex !== index),
    );
  };

  const handleRefreshBracketPairings = () => {
    if (!send(cmd.getData("BRACKET_PAIRINGS"))) {
      setActionFeedback("Unable to fetch bracket pairings while disconnected.");
      return;
    }
    setActionFeedback("Fetching bracket pairings...");
  };

  const handleSaveBracketPairings = () => {
    if (!hasBracketPairingChanges) {
      setActionFeedback("No bracket pairing changes to save.");
      return;
    }

    if (!send(cmd.setData("BRACKET_PAIRINGS", serializedBracketPairings))) {
      setActionFeedback("Unable to send SET command while disconnected.");
      return;
    }

    pendingSetRef.current.BRACKET_PAIRINGS = serializedBracketPairings;
    setActionFeedback("Saving bracket pairings...");
  };

  return (
    <section className="rounded-xl flex flex-col gap-4">
      {!isAdmin && (
        <div className="rounded-xl border border-gray-700 bg-[#0B111F] p-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            Authenticate
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            Become an admin to manage tournaments, server variables, and
            reservations.
          </p>
          <form className="mt-4 flex flex-col gap-3" onSubmit={handleAdminAuth}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                placeholder="Password"
                disabled={!isConnected}
                className="w-[50%] rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!isConnected}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500"
              >
                Login
              </button>
            </div>
          </form>

          {adminFeedback && (
            <div className="mt-3 rounded-lg border border-blue-800 bg-blue-950/30 px-3 py-2 text-sm text-blue-200">
              {adminFeedback}
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-gray-700 bg-[#0B111F] p-4">
            <h3 className="text-sm font-semibold text-white">Tournaments</h3>
            <p className="mt-1 text-sm text-gray-400">
              Start or cancel tournaments from the live spectator view.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <select
                onChange={(event) =>
                  setSelectedTournamentType(
                    event.target.value as (typeof TOURNAMENT_TYPES)[number],
                  )
                }
                disabled={adminControlsDisabled || hasActiveTournament}
                value={
                  hasActiveTournament &&
                  (serverValues.TOURNAMENT_STATUS === "RoundRobin" ||
                    serverValues.TOURNAMENT_STATUS === "KnockoutBracket")
                    ? (serverValues.TOURNAMENT_STATUS as (typeof TOURNAMENT_TYPES)[number])
                    : selectedTournamentType
                }
                className="rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {TOURNAMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {TOURNAMENT_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleTournamentStart}
                  disabled={adminControlsDisabled || hasActiveTournament}
                  className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500"
                >
                  Start Tournament
                </button>
                <button
                  type="button"
                  onClick={handleTournamentCancel}
                  disabled={adminControlsDisabled || !hasActiveTournament}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500"
                >
                  Cancel
                </button>
              </div>

              <div className="mt-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-white">
                      Bracket Pairings
                    </h4>
                    <p className="mt-1 text-sm text-gray-400">
                      Use custom seeding for knockout bracket.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleRefreshBracketPairings}
                      disabled={adminControlsDisabled}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800 text-gray-400 transition-colors hover:bg-gray-700 hover:text-blue-300 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-600"
                      aria-label="Refresh bracket pairings"
                      title="Refresh bracket pairings"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveBracketPairings}
                      disabled={
                        adminControlsDisabled || !hasBracketPairingChanges
                      }
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800 text-gray-400 transition-colors hover:bg-gray-700 hover:text-blue-300 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-600"
                      aria-label="Save bracket pairings"
                      title="Save bracket pairings"
                    >
                      <Save className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <form
                  className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleBracketPairingAdd();
                  }}
                >
                  <input
                    value={bracketPlayer}
                    onChange={(event) => setBracketPlayer(event.target.value)}
                    disabled={adminControlsDisabled}
                    placeholder="Player"
                    className="rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={adminControlsDisabled}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800 text-gray-400 transition-colors hover:bg-gray-700 hover:text-blue-300 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-600"
                    aria-label="Add bracket player"
                    title="Add bracket player"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </form>

                <div className="mt-4 flex flex-col">
                  {bracketPairings.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No bracket players added.
                    </p>
                  ) : (
                    <div className="border border-gray-800 bg-[#050A16] rounded-lg">
                      {bracketPairings.map((player, index) => (
                        <div
                          key={`${player}-${index}`}
                          className="flex items-center justify-between rounded-lg bg-[#050A16] px-3 py-2 text-sm"
                        >
                          <span className="text-white">{player}</span>
                          <button
                            type="button"
                            onClick={() => handleBracketPairingDelete(index)}
                            disabled={adminControlsDisabled}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-800 hover:text-red-300 disabled:cursor-not-allowed disabled:text-gray-600"
                            aria-label={`Delete bracket player ${player}`}
                            title="Delete bracket player"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-700 bg-[#0B111F] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Server Variables
                </h3>
                <p className="mt-1 text-sm text-gray-400">
                  Modify server settings and variables.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  EDITABLE_DATA_KEYS.forEach((key) => {
                    send(cmd.getData(key));
                  });
                  setActionFeedback("Refreshing server variables...");
                }}
                disabled={adminControlsDisabled}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800 text-gray-400 transition-colors hover:bg-gray-700 hover:text-blue-300 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-600"
                aria-label="Refresh server variables"
                title="Refresh server variables"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-4">
              <div className="rounded-lg border border-gray-800 bg-gray-900/80 px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-gray-400">
                    {VARIABLE_LABELS.DEMO_MODE}
                  </div>
                  <input
                    type="checkbox"
                    checked={editableValues.DEMO_MODE === "true"}
                    onChange={(event) =>
                      handleEditableValueChange(
                        "DEMO_MODE",
                        event.target.checked ? "true" : "false",
                      )
                    }
                    disabled={adminControlsDisabled}
                    className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {(["MAX_TIMEOUT", "MOVE_WAIT"] as const).map((key) => (
                <div
                  key={key}
                  className="rounded-lg border border-gray-800 bg-gray-900/80 px-4 py-3"
                >
                  <div className="flex items-center gap-4">
                    <div className="min-w-32 shrink-0 text-gray-400">
                      {VARIABLE_LABELS[key]}
                    </div>
                    <input
                      value={editableValues[key] ?? ""}
                      onChange={(event) =>
                        handleEditableValueChange(key, event.target.value)
                      }
                      disabled={adminControlsDisabled}
                      className="w-32 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:w-40"
                    />
                    <span className="shrink-0 text-sm text-gray-400">s</span>
                  </div>
                </div>
              ))}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveVariables}
                  disabled={adminControlsDisabled || !hasVariableChanges}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800 text-gray-400 transition-colors hover:bg-gray-700 hover:text-blue-300 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-600"
                  aria-label="Save server variables"
                  title="Save server variables"
                >
                  <Save className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="rounded-xl border border-gray-700 bg-[#0B111F] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Reservations</h3>
              <p className="mt-1 text-sm text-gray-400">
                Create, remove, and review match reservations for specific
                players.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRefreshReservations}
              disabled={adminControlsDisabled}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800 text-gray-400 transition-colors hover:bg-gray-700 hover:text-blue-300 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-600"
              aria-label="Refresh reservations"
              title="Refresh reservations"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <form
            className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              handleReservationAction("add");
            }}
          >
            <input
              value={reservationPlayer1}
              onChange={(event) => setReservationPlayer1(event.target.value)}
              disabled={adminControlsDisabled}
              placeholder="Player 1"
              className="rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            />
            <input
              value={reservationPlayer2}
              onChange={(event) => setReservationPlayer2(event.target.value)}
              disabled={adminControlsDisabled}
              placeholder="Player 2"
              className="rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={adminControlsDisabled}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800 text-gray-400 transition-colors hover:bg-gray-700 hover:text-blue-300 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-600"
              aria-label="Add reservation"
              title="Add reservation"
            >
              <Plus className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-4 flex flex-col gap-2">
            {reservations.length === 0 ? (
              <p className="text-sm text-gray-500">No reservations exist.</p>
            ) : (
              reservations.map((reservation) => (
                <div
                  key={`${reservation.player1}-${reservation.player2}`}
                  className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/80 px-3 py-2 text-sm"
                >
                  <span className="text-white">
                    {reservation.player1} vs {reservation.player2}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleReservationDeletePair(
                        reservation.player1,
                        reservation.player2,
                      )
                    }
                    disabled={adminControlsDisabled}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-800 hover:text-red-300 disabled:cursor-not-allowed disabled:text-gray-600"
                    aria-label={`Delete reservation for ${reservation.player1} versus ${reservation.player2}`}
                    title="Delete reservation"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {actionFeedback && !actionFeedback.startsWith("Loaded ") && (
        <div className="rounded-lg border border-gray-700 bg-gray-950/80 px-3 py-2 text-sm text-gray-200">
          {actionFeedback}
        </div>
      )}
    </section>
  );
}
