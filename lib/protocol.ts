// ─── Types ───────────────────────────────────────────────────────────────────

export interface GameEntry {
  id: number;
  player1: string;
  player2: string;
}

export interface PlayerEntry {
  username: string;
  ready: boolean;
  inMatch: boolean;
}

export interface ScoreEntry {
  player: string;
  score: number;
}

export interface MoveEntry {
  username: string;
  column: number;
}

export interface ReservationEntry {
  player1: string;
  player2: string;
}

export const DEFAULT_WS_URL =
  process.env.NODE_ENV === "development"
    ? "ws://localhost:8080"
    : "wss://connect4.abunchofknowitalls.com/ws";
export const RECONNECT_INTERVAL_MS = 5000;
export const RECONNECT_TIMEOUT_MS = 60000;

// ─── Parsed message union ────────────────────────────────────────────────────

export type ParsedMessage =
  | { type: "CONNECT_ACK" }
  | { type: "CONNECT_EVENT"; username: string }
  | { type: "RECONNECT_ACK" }
  | { type: "DISCONNECT_ACK" }
  | { type: "DISCONNECT_EVENT"; username: string }
  | { type: "OBSERVE_ACK"; enabled: boolean }
  | { type: "READY_ACK" }
  | { type: "READY_EVENT"; username: string; ready: boolean }
  | { type: "GAME_START"; goesFirst: boolean }
  | {
      type: "GAME_MATCH_START";
      matchId: number;
      player1: string;
      player2: string;
    }
  | { type: "GAME_WINS" }
  | { type: "GAME_LOSS" }
  | { type: "GAME_DRAW"; matchId?: number }
  | { type: "GAME_TERMINATED"; matchId?: number }
  | { type: "OPPONENT_MOVE"; column: number }
  | { type: "GAME_LIST"; games: GameEntry[] }
  | {
      type: "GAME_WATCH_ACK";
      matchId: number;
      player1: string;
      player2: string;
      moves: MoveEntry[];
    }
  | { type: "GAME_MOVE"; matchId?: number; username: string; column: number }
  | { type: "GAME_WIN"; matchId?: number; winner: string }
  | { type: "PLAYER_LIST"; players: PlayerEntry[] }
  | { type: "TOURNAMENT_START"; tournamentType: string }
  | { type: "TOURNAMENT_CANCEL" }
  | { type: "TOURNAMENT_SCORES"; scores: ScoreEntry[] }
  | { type: "TOURNAMENT_WINNER"; username: string }
  | { type: "TOURNAMENT_END" }
  | { type: "ADMIN_AUTH_ACK" }
  | { type: "RESERVATION_ADD"; player1: string; player2: string }
  | { type: "RESERVATION_DELETE"; player1: string; player2: string }
  | { type: "RESERVATION_LIST"; reservations: ReservationEntry[] }
  | { type: "GET_DATA"; key: string; value: string }
  | { type: "SET_DATA_ACK"; key: string }
  | { type: "ERROR"; message: string }
  | { type: "UNKNOWN"; raw: string };

// ─── Parser ──────────────────────────────────────────────────────────────────

export function parseMessage(raw: string): ParsedMessage {
  const parts = raw.split(":");

  switch (parts[0]) {
    case "CONNECT":
      if (parts[1] === "ACK") return { type: "CONNECT_ACK" };
      return { type: "CONNECT_EVENT", username: parts[1] ?? "" };
      break;
    case "RECONNECT":
      if (parts[1] === "ACK") return { type: "RECONNECT_ACK" };
      break;
    case "DISCONNECT":
      if (parts[1] === "ACK") return { type: "DISCONNECT_ACK" };
      return { type: "DISCONNECT_EVENT", username: parts[1] ?? "" };
      break;
    case "OBSERVE":
      if (parts[1] === "ACK") {
        return { type: "OBSERVE_ACK", enabled: parts[2] === "1" };
      }
      break;
    case "READY":
      if (parts[1] === "ACK") return { type: "READY_ACK" };
      if (parts.length >= 3) {
        return {
          type: "READY_EVENT",
          username: parts[1],
          ready: parts[2] === "true",
        };
      }
      break;

    case "GAME": {
      const scopedMatchId = parseInt(parts[1], 10);
      if (!Number.isNaN(scopedMatchId)) {
        switch (parts[2]) {
          case "MOVE":
            return {
              type: "GAME_MOVE",
              matchId: scopedMatchId,
              username: parts[3],
              column: parseInt(parts[4], 10),
            };
          case "WIN":
            return {
              type: "GAME_WIN",
              matchId: scopedMatchId,
              winner: parts[3],
            };
          case "DRAW":
            return { type: "GAME_DRAW", matchId: scopedMatchId };
          case "TERMINATED":
            return { type: "GAME_TERMINATED", matchId: scopedMatchId };
        }
      }

      switch (parts[1]) {
        case "START":
          if (parts[2]?.includes(",")) {
            const [matchId, player1, player2] = parts[2].split(",");
            return {
              type: "GAME_MATCH_START",
              matchId: parseInt(matchId, 10),
              player1,
              player2,
            };
          }
          return { type: "GAME_START", goesFirst: parts[2] === "1" };
        case "WINS":
          return { type: "GAME_WINS" };
        case "LOSS":
          return { type: "GAME_LOSS" };
        case "DRAW":
          return { type: "GAME_DRAW" };
        case "TERMINATED":
          return { type: "GAME_TERMINATED" };

        case "LIST": {
          const data = parts[2] ?? "";
          if (!data) return { type: "GAME_LIST", games: [] };
          const games: GameEntry[] = data.split("|").map((g) => {
            const [id, player1, player2] = g.split(",");
            return { id: parseInt(id), player1, player2 };
          });
          return { type: "GAME_LIST", games };
        }

        case "WATCH": {
          if (parts[2] === "ACK") {
            // GAME:WATCH:ACK:<id>,<p1>,<p2>|<username>,<col>|...
            const data = parts.slice(3).join(":");
            const segments = data.split("|");
            const [idStr, player1, player2] = segments[0].split(",");
            const moves: MoveEntry[] = segments
              .slice(1)
              .filter(Boolean)
              .map((m) => {
                const lastComma = m.lastIndexOf(",");
                return {
                  username: m.substring(0, lastComma),
                  column: parseInt(m.substring(lastComma + 1)),
                };
              });
            return {
              type: "GAME_WATCH_ACK",
              matchId: parseInt(idStr),
              player1,
              player2,
              moves,
            };
          }
          break;
        }
      }
      break;
    }

    case "OPPONENT":
      return {
        type: "OPPONENT_MOVE",
        column: parseInt(parts[parts.length - 1], 10),
      };

    case "PLAYER": {
      if (parts[1] === "LIST") {
        const data = parts[2] ?? "";
        if (!data) return { type: "PLAYER_LIST", players: [] };
        const players: PlayerEntry[] = data.split("|").map((p) => {
          const [username, ready, inMatch] = p.split(",");
          return {
            username,
            ready: ready === "true",
            inMatch: inMatch === "true",
          };
        });
        return { type: "PLAYER_LIST", players };
      }
      break;
    }

    case "TOURNAMENT": {
      switch (parts[1]) {
        case "START":
          return { type: "TOURNAMENT_START", tournamentType: parts[2] };
        case "CANCEL":
          return { type: "TOURNAMENT_CANCEL" };
        case "SCORES": {
          const data = parts[2] ?? "";
          if (!data) return { type: "TOURNAMENT_SCORES", scores: [] };
          const scores: ScoreEntry[] = data.split("|").map((s) => {
            const lastComma = s.lastIndexOf(",");
            return {
              player: s.substring(0, lastComma),
              score: parseInt(s.substring(lastComma + 1)),
            };
          });
          return { type: "TOURNAMENT_SCORES", scores };
        }
        case "WINNER":
          return { type: "TOURNAMENT_WINNER", username: parts[2] ?? "" };
        case "END":
          return { type: "TOURNAMENT_END" };
      }
      break;
    }

    case "ADMIN":
      if (parts[1] === "AUTH" && parts[2] === "ACK")
        return { type: "ADMIN_AUTH_ACK" };
      break;

    case "GET":
      return {
        type: "GET_DATA",
        key: parts[1],
        value: parts.slice(2).join(":"),
      };

    case "SET":
      if (parts[2] === "ACK") return { type: "SET_DATA_ACK", key: parts[1] };
      break;

    case "RESERVATION": {
      const payload = parts[2] ?? "";

      if (parts[1] === "ADD" || parts[1] === "DELETE") {
        const [player1, player2] = payload.split(",");
        if (player1 && player2) {
          return {
            type: parts[1] === "ADD" ? "RESERVATION_ADD" : "RESERVATION_DELETE",
            player1,
            player2,
          };
        }
      }

      if (parts[1] === "LIST") {
        const reservations =
          payload.length === 0
            ? []
            : payload
                .split("|")
                .map((entry) => {
                  const [player1, player2] = entry.split(",");
                  return player1 && player2 ? { player1, player2 } : null;
                })
                .filter((entry): entry is ReservationEntry => entry !== null);
        return { type: "RESERVATION_LIST", reservations };
      }
      break;
    }

    case "ERROR":
      return { type: "ERROR", message: raw };
  }

  return { type: "UNKNOWN", raw };
}

// ─── Command builders ────────────────────────────────────────────────────────

export const cmd = {
  connect: (username: string) => `CONNECT:${username}`,
  reconnect: (username: string) => `RECONNECT:${username}`,
  disconnect: () => "DISCONNECT",
  observe: () => "OBSERVE",
  ready: () => "READY",
  play: (column: number) => `PLAY:${column}`,
  playerList: () => "PLAYER:LIST",
  gameList: () => "GAME:LIST",
  gameWatch: (matchId: number) => `GAME:WATCH:${matchId}`,
  gameTerminate: (matchId: number) => `GAME:TERMINATE:${matchId}`,
  gameAward: (matchId: number, winner: string) =>
    `GAME:AWARD:${matchId}:${winner}`,
  adminAuth: (password: string) => `ADMIN:AUTH:${password}`,
  adminKick: (username: string) => `ADMIN:KICK:${username}`,
  tournamentStart: (type = "RoundRobin") => `TOURNAMENT:START:${type}`,
  tournamentCancel: () => "TOURNAMENT:CANCEL",
  getData: (key: string) => `GET:${key}`,
  setData: (key: string, value: string) => `SET:${key}:${value}`,
  reservationAdd: (p1: string, p2: string) => `RESERVATION:ADD:${p1},${p2}`,
  reservationDelete: (p1: string, p2: string) =>
    `RESERVATION:DELETE:${p1},${p2}`,
  reservationGet: () => "RESERVATION:GET",
};

// ─── Board helpers ────────────────────────────────────────────────────────────

// 0 = empty, 1 = red (player1 / goes first), 2 = yellow (player2)
export type CellColor = 0 | 1 | 2;
export type BoardState = CellColor[][]; // board[col][row], 7 cols × 6 rows

export function createEmptyBoard(): BoardState {
  return Array.from({ length: 7 }, () => Array(6).fill(0)) as BoardState;
}

/** Place a token and return the new board plus the row it landed in (-1 if column full). */
export function placeToken(
  board: BoardState,
  color: 1 | 2,
  column: number,
): { board: BoardState; row: number } {
  const newBoard = board.map((col) => [...col]) as BoardState;
  let placedRow = -1;
  for (let row = 0; row < 6; row++) {
    if (newBoard[column][row] === 0) {
      newBoard[column][row] = color;
      placedRow = row;
      break;
    }
  }
  return { board: newBoard, row: placedRow };
}

/** Replay a move list onto an empty board. */
export function replayMoves(
  moves: MoveEntry[],
  player1: string,
): { board: BoardState; lastMove: { column: number; row: number } | null } {
  let board = createEmptyBoard();
  let lastMove: { column: number; row: number } | null = null;
  for (const move of moves) {
    const color: 1 | 2 = move.username === player1 ? 1 : 2;
    const result = placeToken(board, color, move.column);
    board = result.board;
    lastMove = { column: move.column, row: result.row };
  }
  return { board, lastMove };
}
