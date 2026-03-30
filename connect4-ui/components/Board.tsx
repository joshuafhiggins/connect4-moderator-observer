"use client";

import { useState } from "react";
import type { BoardState } from "@/lib/protocol";

interface BoardProps {
  board: BoardState;
  onColumnClick?: (column: number) => void;
  disabled?: boolean;
  lastMove?: { column: number; row: number } | null;
  player1?: string;
  player2?: string;
  currentTurnColor?: 1 | 2 | null;
}

export default function Board({
  board,
  onColumnClick,
  disabled = false,
  lastMove,
  player1,
  player2,
  currentTurnColor,
}: BoardProps) {
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);
  const canInteract = !disabled && !!onColumnClick;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Player legend */}
      {player1 && player2 && (
        <div className="flex items-center gap-6 text-sm">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
              currentTurnColor === 1
                ? "border-red-500 bg-red-950/50 text-red-300"
                : "border-gray-700 bg-gray-900 text-gray-400"
            }`}
          >
            {currentTurnColor === 1 ? (
              <div className="w-3.5 h-3.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
            ) : (
              <div className="w-3.5 h-3.5 rounded-full bg-red-500 shrink-0" />
            )}
            <span className="font-medium">{player1}</span>
          </div>
          <span className="text-gray-600 font-bold">vs</span>
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
              currentTurnColor === 2
                ? "border-yellow-500 bg-yellow-950/50 text-yellow-300"
                : "border-gray-700 bg-gray-900 text-gray-400"
            }`}
          >
            {currentTurnColor === 2 ? (
              <div className="w-3.5 h-3.5 rounded-full bg-yellow-400 shrink-0 animate-pulse" />
            ) : (
              <div className="w-3.5 h-3.5 rounded-full bg-yellow-400 shrink-0" />
            )}
            <span className="font-medium">{player2}</span>
          </div>
        </div>
      )}

      {/* Board */}
      <div className="inline-block bg-blue-800 p-3 rounded-2xl shadow-2xl border-2 border-blue-600">
        <div className="flex gap-2">
          {Array.from({ length: 7 }, (_, col) => (
            <div
              key={col}
              role={canInteract ? "button" : undefined}
              aria-label={canInteract ? `Drop in column ${col}` : undefined}
              className={`flex flex-col gap-2 rounded-xl p-1 transition-colors ${
                canInteract
                  ? "cursor-pointer hover:bg-blue-700/60"
                  : "cursor-default"
              } ${hoveredCol === col && canInteract ? "bg-blue-700/60" : ""}`}
              onClick={() => canInteract && onColumnClick?.(col)}
              onMouseEnter={() => canInteract && setHoveredCol(col)}
              onMouseLeave={() => setHoveredCol(null)}
            >
              {/* Drop arrow indicator */}
              <div
                className={`h-2 flex items-center justify-center transition-opacity ${
                  hoveredCol === col && canInteract
                    ? "opacity-100"
                    : "opacity-0"
                }`}
              >
                <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-white/70" />
              </div>

              {/* Cells (top row first) */}
              {Array.from({ length: 6 }, (_, rowIdx) => {
                const row = 5 - rowIdx;
                const cell = board[col][row];
                const isLast =
                  lastMove?.column === col && lastMove?.row === row;
                return (
                  <div
                    key={row}
                    className={`w-12 h-12 rounded-full border-2 transition-all duration-150 ${
                      cell === 1
                        ? `bg-red-500 shadow-lg shadow-red-950/60 ${
                            isLast ? "border-white scale-110" : "border-red-700"
                          }`
                        : cell === 2
                          ? `bg-yellow-400 shadow-lg shadow-yellow-950/60 ${
                              isLast
                                ? "border-white scale-110"
                                : "border-yellow-600"
                            }`
                          : `bg-slate-950 border-slate-800 ${
                              hoveredCol === col && canInteract
                                ? "border-blue-400/50"
                                : ""
                            }`
                    }`}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {/* Column numbers */}
        <div className="flex gap-2 mt-1">
          {Array.from({ length: 7 }, (_, col) => (
            <div
              key={col}
              className="w-14 p-1 text-center text-xs text-blue-400/70 font-mono"
            >
              {col + 1}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
