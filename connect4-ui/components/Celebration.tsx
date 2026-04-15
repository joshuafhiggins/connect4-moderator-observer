"use client";

import { useEffect, useState } from "react";
import Confetti from "react-confetti";
import { useConnection } from "@/lib/connection";

export default function Celebration() {
  const { subscribe } = useConnection();
  const [winner, setWinner] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

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
    const unsubscribe = subscribe((msg) => {
      if (msg.type !== "TOURNAMENT_WINNER") return;

      setWinner(msg.username || "Unknown player");
    });

    return () => {
      unsubscribe();
    };
  }, [subscribe]);

  if (!winner) return null;

  return (
    <>
      <Confetti
        width={viewport.width}
        height={viewport.height}
        recycle={false}
        numberOfPieces={600}
        gravity={0.2}
        className="pointer-events-none fixed! inset-0! z-90!"
      />
      <div className="pointer-events-none fixed inset-0 z-100 flex items-center justify-center px-4">
        <div className="pointer-events-auto w-full max-w-xl rounded-3xl border border-amber-300/40 bg-linear-to-br from-amber-300 via-yellow-200 to-orange-300 p-1px shadow-2xl shadow-amber-950/60">
          <div className="rounded-[calc(1.5rem-1px)] bg-slate-950/95 px-8 py-10 text-center backdrop-blur">
            <div className="text-5xl">🏆</div>
            <p className="mt-4 text-sm font-semibold uppercase tracking-[0.35em] text-amber-200/80">
              Tournament Winner
            </p>
            <h2 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">
              {winner}
            </h2>
            <p className="mt-4 text-base text-amber-100/85">
              Dominated the bracket and closed out the tournament.
            </p>
            <button
              type="button"
              onClick={() => setWinner(null)}
              className="mt-7 inline-flex items-center justify-center rounded-full border border-amber-200/30 bg-amber-300/15 px-5 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/25"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
