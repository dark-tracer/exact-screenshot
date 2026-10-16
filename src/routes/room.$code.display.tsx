import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { RoomNotFound } from "@/components/RoomNotFound";
import { computeStandings, formatNumber, type Standing } from "@/lib/ranking";
import { usePrefersReducedMotion, useRoom } from "@/lib/use-room";

export const Route = createFileRoute("/room/$code/display")({
  head: ({ params }) => ({
    meta: [
      { title: `Scoreboard ${params.code.toUpperCase()} — Live display` },
      { name: "description", content: "Live projector view of the scoreboard rankings." },
      { property: "og:title", content: `Scoreboard ${params.code.toUpperCase()}` },
      { property: "og:description", content: "Live rankings, updated in realtime." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Display,
});

type Move = { dir: "up" | "down"; places: number };

function Display() {
  const { code } = Route.useParams();
  const { state, status, connected } = useRoom(code);
  const reduced = usePrefersReducedMotion();
  const [idle, setIdle] = useState(false);

  // hide cursor after 3s idle
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), 3000);
    };
    wake();
    window.addEventListener("mousemove", wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousemove", wake);
    };
  }, []);

  // F toggles fullscreen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "f" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const standings = useMemo(
    () => (state ? computeStandings(state.contestants, state.rounds, state.scores) : []),
    [state],
  );

  if (status === "notfound") return <RoomNotFound code={code.toUpperCase()} />;

  return (
    <main
      className={`fixed inset-0 flex flex-col overflow-hidden bg-display-bg px-[3vw] pb-[2vh] ${idle ? "cursor-none" : ""}`}
    >
      <header className="flex h-[13vh] shrink-0 items-center justify-between gap-6">
        <h1 className="truncate text-[6vh] font-extrabold leading-none tracking-tight">{state?.room.title ?? ""}</h1>
        {state && state.rounds.length > 0 && (
          <span className="shrink-0 font-display text-[2.6vh] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            Round {Math.max(...state.rounds.map((r) => r.number))}
          </span>
        )}
      </header>

      {status === "ready" && standings.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <p className="animate-pulse font-display text-[5vh] font-semibold text-muted-foreground">Waiting for contestants...</p>
        </div>
      )}
      {standings.length > 0 && <Board standings={standings} reduced={reduced} />}

      {!connected && (
        <div className="pointer-events-none fixed bottom-3 right-4 flex items-center gap-2 rounded-full bg-secondary/80 px-3 py-1 text-sm text-muted-foreground">
          <span className="h-2 w-2 animate-pulse rounded-full bg-down" /> Reconnecting…
        </div>
      )}
    </main>
  );
}

function Board({ standings, reduced }: { standings: Standing[]; reduced: boolean }) {
  const n = standings.length;
  const cols = n > 12 ? 2 : 1;
  const rows = Math.max(Math.ceil(n / cols), 5);
  const rowH = `min(13vh, calc((85vh - ${rows - 1} * 0.8vh) / ${rows}))`;

  const els = useRef(new Map<string, HTMLLIElement>());
  const prevRects = useRef(new Map<string, DOMRect>());
  const prevRanks = useRef<Map<string, number> | null>(null);
  const [moves, setMoves] = useState<Record<string, Move>>({});
  const [pulse, setPulse] = useState<string | null>(null);

  // detect rank changes
  useEffect(() => {
    const prev = prevRanks.current;
    const next = new Map(standings.map((s, i) => [s.id, i] as const));
    if (prev) {
      const found: Record<string, Move> = {};
      for (const s of standings) {
        const before = prev.get(s.id);
        const now = next.get(s.id)!;
        if (before === undefined || before === now) continue;
        found[s.id] = { dir: now < before ? "up" : "down", places: Math.abs(now - before) };
      }
      const leader = standings[0];
      const leaderBefore = prev.get(leader.id);
      if (leaderBefore !== undefined && leaderBefore !== 0) setPulse(leader.id + ":" + Date.now());
      if (Object.keys(found).length) {
        setMoves((m) => ({ ...m, ...found }));
        const ids = Object.keys(found);
        setTimeout(() => setMoves((m) => {
          const c = { ...m };
          ids.forEach((id) => { if (c[id] === found[id]) delete c[id]; });
          return c;
        }), 4000);
      }
    }
    prevRanks.current = next;
  }, [standings]);

  // FLIP
  useLayoutEffect(() => {
    const newRects = new Map<string, DOMRect>();
    els.current.forEach((el, id) => newRects.set(id, el.getBoundingClientRect()));
    if (!reduced) {
      newRects.forEach((r, id) => {
        const old = prevRects.current.get(id);
        const el = els.current.get(id);
        if (!old || !el) return;
        const dx = old.left - r.left;
        const dy = old.top - r.top;
        if (!dx && !dy) return;
        el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0,0)" }],
          { duration: 900, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        );
      });
    }
    prevRects.current = newRects;
  });

  return (
    <ol
      className="grid min-h-0 flex-1 gap-x-[2vw] gap-y-[0.8vh]"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, ${rowH})`,
        gridAutoFlow: "column",
        ["--row-h" as string]: rowH,
      }}
    >
      {standings.map((s) => {
        const move = moves[s.id];
        const isPulse = pulse?.startsWith(s.id + ":");
        return (
          <li
            key={s.id}
            ref={(el) => { if (el) els.current.set(s.id, el); else els.current.delete(s.id); }}
            data-move={move?.dir}
            data-leader={s.rank === 1}
            className={`board-row relative flex min-w-0 items-center gap-[0.6em] rounded-[0.3em] bg-display-row px-[0.6em] ${reduced ? "fade-soft" : ""}`}
          >
            <span
              key={isPulse ? pulse! : "r"}
              className={`w-[1.8em] shrink-0 text-center font-display font-extrabold tabular ${s.rank === 1 ? "text-gold" : "text-muted-foreground"} ${isPulse ? "leader-pulse" : ""}`}
            >
              {s.rank}
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-[0.4em]">
              <span className={`truncate font-display font-bold ${s.rank === 1 ? "text-gold" : ""}`}>{s.name}</span>
              {s.type === "team" && (
                <span className="shrink-0 rounded-[0.25em] border border-border px-[0.35em] py-[0.05em] text-[0.4em] font-semibold uppercase tracking-widest text-muted-foreground">Team</span>
              )}
              {move && (
                <span className={`flex shrink-0 items-center text-[0.55em] font-bold ${move.dir === "up" ? "text-up" : "text-down"}`}>
                  {move.dir === "up" ? <ArrowUp className="h-[1em] w-[1em]" /> : <ArrowDown className="h-[1em] w-[1em]" />}
                  {move.places}
                </span>
              )}
            </span>
            {s.lastRound !== null && s.lastRound > 0 && (
              <span className="shrink-0 rounded-full bg-primary/15 px-[0.5em] text-[0.45em] font-semibold text-primary tabular">
                +{formatNumber(s.lastRound)}
              </span>
            )}
            <span className={`shrink-0 text-right font-display font-extrabold ${s.rank === 1 ? "text-gold" : "text-primary"}`}>
              <AnimatedNumber value={s.total} reduced={reduced} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
