"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
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
  const [animatingMove, setAnimatingMove] = useState<{
    column: number;
    row: number;
  } | null>(null);
  const isFirstRender = useRef(true);
  const animationTimeoutRef = useRef<number | null>(null);
  const canInteract = !disabled && !!onColumnClick;
  const lastMoveColumn = lastMove?.column ?? null;
  const lastMoveRow = lastMove?.row ?? null;

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (animationTimeoutRef.current !== null) {
      window.clearTimeout(animationTimeoutRef.current);
    }

    if (lastMoveColumn === null || lastMoveRow === null) {
      setAnimatingMove(null);
      return;
    }

    setAnimatingMove({ column: lastMoveColumn, row: lastMoveRow });
    animationTimeoutRef.current = window.setTimeout(() => {
      setAnimatingMove(null);
      animationTimeoutRef.current = null;
    }, 450);

    return () => {
      if (animationTimeoutRef.current !== null) {
        window.clearTimeout(animationTimeoutRef.current);
      }
    };
  }, [lastMoveColumn, lastMoveRow]);

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
                const isAnimatingDrop =
                  animatingMove?.column === col && animatingMove?.row === row;
                const chipScale = isLast ? 1.1 : 1;
                const dropDistance = `${(5 - row) * 56 + 16}px`;
                return (
                  <div
                    key={row}
                    className={`relative w-12 h-12 rounded-full border-2 bg-slate-950 overflow-visible ${
                      cell === 0
                        ? `border-slate-800 ${
                            hoveredCol === col && canInteract
                              ? "border-blue-400/50"
                              : ""
                          }`
                        : isLast
                          ? "border-white"
                          : "border-slate-900"
                    }`}
                  >
                    {cell !== 0 && (
                      <div
                        className={`absolute inset-0 rounded-full border-2 shadow-lg transition-transform duration-150 ${
                          cell === 1
                            ? `bg-red-500 border-red-700 shadow-red-950/60`
                            : `bg-yellow-400 border-yellow-600 shadow-yellow-950/60`
                        } ${isAnimatingDrop ? "chip-drop" : ""}`}
                        style={
                          {
                            "--chip-drop-distance": `-${dropDistance}`,
                            "--chip-scale": chipScale,
                            transform: isAnimatingDrop
                              ? undefined
                              : `scale(${chipScale})`,
                          } as CSSProperties
                        }
                      />
                    )}
                  </div>
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

      <style jsx>{`
        .chip-drop {
          animation: chip-drop 450ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
          will-change: transform;
        }

        @keyframes chip-drop {
          from {
            transform: translateY(var(--chip-drop-distance))
              scale(var(--chip-scale));
          }
          to {
            transform: translateY(0) scale(var(--chip-scale));
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .chip-drop {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
