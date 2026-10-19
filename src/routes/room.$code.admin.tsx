import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Link2, LogOut, Plus, RotateCcw, Trash2, Users, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { RoomNotFound } from "@/components/RoomNotFound";
import { TimerPanel } from "@/components/TimerPanel";
import {
  addContestant, addRound, checkSession, deleteRound, logoutAdmin, newGame, removeContestant,
  setScore, updateContestant, verifyPin,
} from "@/lib/scoreboard.functions";
import { computeStandings, formatNumber, MAX_NAME, parseScoreInput, validateName, type Contestant, type ContestantType } from "@/lib/ranking";
import { adminToken, useRoom, type RoomState } from "@/lib/use-room";

export const Route = createFileRoute("/room/$code/admin")({
  head: ({ params }) => ({
    meta: [
      { title: `Admin · ${params.code.toUpperCase()} — Scoreboard Live` },
      { name: "description", content: "Control panel for a live scoreboard." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Scoreboard admin" },
      { property: "og:description", content: "Control panel for a live scoreboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { code } = Route.useParams();
  const room = useRoom(code);
  const check = useServerFn(checkSession);
  const [token, setToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const t = adminToken.get(code);
    if (!t) return setChecked(true);
    check({ data: { code, token: t } }).then((r) => {
      if (r.ok && r.data.valid) setToken(t);
      else adminToken.clear(code);
      setChecked(true);
    });
  }, [code, check]);

  if (room.status === "notfound") return <RoomNotFound code={room.code} />;
  if (!checked || room.status === "loading") return <main className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</main>;
  if (!token) return <PinGate code={room.code} title={room.state?.room.title} onToken={(t) => { adminToken.set(code, t); setToken(t); }} />;
  if (!room.state) return <main className="flex min-h-screen items-center justify-center text-muted-foreground">Couldn't load the scoreboard. Refresh to try again.</main>;

  return (
    <Admin
      state={room.state}
      code={room.code}
      token={token}
      connected={room.connected}
      refresh={room.refresh}
      onExpired={() => { adminToken.clear(code); setToken(null); }}
    />
  );
}

function PinGate({ code, title, onToken }: { code: string; title?: string | undefined; onToken: (t: string) => void }) {
  const verify = useServerFn(verifyPin);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <form
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-7"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          const r = await verify({ data: { code, pin } });
          setBusy(false);
          if (r.ok) onToken(r.data.token);
          else { setErr(r.error); setPin(""); }
        }}
      >
        <p className="font-display text-sm uppercase tracking-[0.3em] text-muted-foreground">Room {code}</p>
        <h1 className="mt-2 truncate text-3xl font-extrabold">{title}</h1>
        <Label htmlFor="pin" className="mt-6 block">Admin PIN</Label>
        <Input id="pin" autoFocus type="password" inputMode="numeric" autoComplete="current-password" maxLength={12} value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="mt-2 text-center font-display text-2xl tracking-[0.4em]" />
        {err && <p role="alert" className="mt-3 text-sm text-destructive">{err}</p>}
        <Button type="submit" size="lg" className="mt-5 w-full" disabled={busy || pin.length < 4}>{busy ? "Checking…" : "Unlock"}</Button>
        <Link to="/room/$code/display" params={{ code }} className="mt-4 block text-center text-sm text-muted-foreground underline-offset-4 hover:underline">Just watching? Open the display</Link>
      </form>
    </main>
  );
}

type Run = <T>(p: Promise<{ ok: true; data: T } | { ok: false; error: string }>) => Promise<T | undefined>;

function Admin({ state, code, token, connected, refresh, onExpired }: {
  state: RoomState; code: string; token: string; connected: boolean; refresh: () => void; onExpired: () => void;
}) {
  const logout = useServerFn(logoutAdmin);
  const run: Run = async (p) => {
    const r = await p;
    if (!r.ok) {
      if (r.error.includes("session has expired")) onExpired();
      toast.error(r.error);
      return undefined;
    }
    refresh();
    return r.data;
  };
  const auth = { code, token };
  const standings = useMemo(() => computeStandings(state.contestants, state.rounds, state.scores), [state]);
  const displayUrl = typeof window !== "undefined" ? `${window.location.origin}/room/${code}/display` : "";

  const copy = async (text: string, msg: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(msg); } catch { toast.error("Couldn't copy"); }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-5 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-extrabold sm:text-4xl">{state.room.title}</h1>
          <button onClick={() => copy(code, "Room code copied")} className="mt-2 inline-flex items-center gap-2 rounded-lg bg-secondary px-3 py-1.5 font-display text-2xl font-bold tracking-[0.3em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Copy room code ${code}`}>
            {code} <Copy className="h-4 w-4 text-muted-foreground" />
          </button>
          {!connected && <span className="ml-3 text-sm text-down">Reconnecting…</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild><a href={`/room/${code}/display`} target="_blank" rel="noopener"><ExternalLink /> Open display</a></Button>
          <Button variant="secondary" onClick={() => copy(displayUrl, "Display link copied")}><Link2 /> Copy link</Button>
          <Button variant="ghost" onClick={async () => { await logout({ data: auth }); onExpired(); }}><LogOut /> Log out of admin</Button>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <ContestantsPanel state={state} auth={auth} run={run} />
          <RoundsPanel state={state} auth={auth} run={run} />
        </div>
        <aside className="space-y-6">
          <TimerPanel state={state} auth={auth} refresh={refresh} onExpired={onExpired} />
          <section className="rounded-2xl border border-border bg-card p-5" aria-label="Standings">
            <h2 className="text-xl font-bold">Standings</h2>
            {standings.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No contestants yet.</p> : (
              <ol className="mt-3 space-y-1">
                {standings.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 even:bg-secondary/40">
                    <span className={`w-6 text-right font-display font-bold tabular ${s.rank === 1 ? "text-gold" : "text-muted-foreground"}`}>{s.rank}</span>
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    <span className="font-display font-bold tabular">{formatNumber(s.total)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <NewGamePanel auth={auth} run={run} />
        </aside>
      </div>
    </main>
  );
}

type Auth = { code: string; token: string };

function ContestantsPanel({ state, auth, run }: { state: RoomState; auth: Auth; run: Run }) {
  const add = useServerFn(addContestant);
  const [name, setName] = useState("");
  const [type, setType] = useState<ContestantType>("individual");
  const [err, setErr] = useState<string | null>(null);
  const names = state.contestants.map((c) => c.name);

  return (
    <section className="rounded-2xl border border-border bg-card p-5" aria-label="Contestants">
      <h2 className="text-xl font-bold">Contestants <span className="text-muted-foreground">({state.contestants.length})</span></h2>
      <form className="mt-4 flex flex-col gap-2 sm:flex-row" noValidate onSubmit={async (e) => {
        e.preventDefault();
        const v = validateName(name, names);
        if (!v.ok) return setErr(v.error);
        setErr(null);
        const r = await run(add({ data: { ...auth, name: v.name, type } }));
        if (r !== undefined) setName("");
      }}>
        <Label htmlFor="new-name" className="sr-only">Contestant name</Label>
        <Input id="new-name" placeholder="Add a name…" value={name} maxLength={MAX_NAME} onChange={(e) => { setName(e.target.value); setErr(null); }} aria-invalid={!!err} className="flex-1" />
        <ToggleGroup type="single" value={type} onValueChange={(v) => v && setType(v as ContestantType)} variant="outline" aria-label="Contestant type">
          <ToggleGroupItem value="individual" aria-label="Individual"><User /> Individual</ToggleGroupItem>
          <ToggleGroupItem value="team" aria-label="Team"><Users /> Team</ToggleGroupItem>
        </ToggleGroup>
        <Button type="submit"><Plus /> Add</Button>
      </form>
      {err && <p role="alert" className="mt-2 text-sm text-destructive">{err}</p>}
      <ul className="mt-4 divide-y divide-border">
        {state.contestants.map((c) => <ContestantRow key={c.id} c={c} names={names} auth={auth} run={run} />)}
      </ul>
    </section>
  );
}

function ContestantRow({ c, names, auth, run }: { c: Contestant; names: string[]; auth: Auth; run: Run }) {
  const update = useServerFn(updateContestant);
  const remove = useServerFn(removeContestant);
  const [val, setVal] = useState(c.name);
  const [err, setErr] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setVal(c.name); }, [c.name, focused]);

  const save = async () => {
    if (val.trim() === c.name) { setErr(null); return; }
    const v = validateName(val, names.filter((n) => n !== c.name));
    if (!v.ok) return setErr(v.error);
    setErr(null);
    const r = await run(update({ data: { ...auth, id: c.id, name: v.name } }));
    if (r === undefined) setVal(c.name);
  };

  return (
    <li className="py-2">
      <div className="flex items-center gap-2">
        <Label htmlFor={`name-${c.id}`} className="sr-only">Rename {c.name}</Label>
        <Input id={`name-${c.id}`} value={val} maxLength={MAX_NAME} aria-invalid={!!err}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); save(); }}
          onChange={(e) => { setVal(e.target.value); setErr(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setVal(c.name); setErr(null); } }}
          className="flex-1 border-transparent bg-transparent hover:border-input focus-visible:border-input" />
        <Button size="sm" variant={c.type === "team" ? "secondary" : "ghost"} className="w-24"
          onClick={() => run(update({ data: { ...auth, id: c.id, type: c.type === "team" ? "individual" : "team" } }))}
          aria-label={`Type: ${c.type}. Click to switch`}>
          {c.type === "team" ? <><Users /> Team</> : <><User /> Solo</>}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="icon" variant="ghost" aria-label={`Remove ${c.name}`}><Trash2 /></Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {c.name}?</AlertDialogTitle>
              <AlertDialogDescription>Their scores from every round will be deleted too.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => run(remove({ data: { ...auth, id: c.id } }))}>Remove</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {err && <p role="alert" className="mt-1 pl-3 text-sm text-destructive">{err}</p>}
    </li>
  );
}

function RoundsPanel({ state, auth, run }: { state: RoomState; auth: Auth; run: Run }) {
  const addR = useServerFn(addRound);
  const delR = useServerFn(deleteRound);
  const rounds = [...state.rounds].sort((a, b) => a.number - b.number);
  const [selected, setSelected] = useState<string | null>(null);
  const current = rounds.find((r) => r.id === selected) ?? rounds[rounds.length - 1];

  return (
    <section className="rounded-2xl border border-border bg-card p-5" aria-label="Rounds and scoring">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Rounds &amp; scoring</h2>
        <Button onClick={async () => { const r = await run(addR({ data: auth })); if (r) setSelected(r.id); }}><Plus /> Add round</Button>
      </div>
      {rounds.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Add a round to start entering scores.</p>
      ) : (
        <>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Rounds">
            {rounds.map((r) => (
              <Button key={r.id} role="tab" aria-selected={current?.id === r.id} size="sm"
                variant={current?.id === r.id ? "default" : "secondary"} onClick={() => setSelected(r.id)}>
                Round {r.number}
              </Button>
            ))}
          </div>
          {current && (
            <div className="mt-4">
              {state.contestants.length === 0 ? <p className="text-sm text-muted-foreground">Add contestants to enter scores.</p> : (
                <ul className="space-y-2">
                  {state.contestants.map((c) => {
                    const s = state.scores.find((x) => x.round_id === current.id && x.contestant_id === c.id);
                    return <ScoreCell key={`${current.id}-${c.id}`} name={c.name} value={s?.value ?? null} roundId={current.id} contestantId={c.id} auth={auth} run={run} />;
                  })}
                </ul>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="mt-4 text-destructive"><Trash2 /> Delete round {current.number}</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete round {current.number}?</AlertDialogTitle>
                    <AlertDialogDescription>All scores entered for this round will be deleted. Totals will update.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => { await run(delR({ data: { ...auth, id: current.id } })); setSelected(null); }}>Delete round</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ScoreCell({ name, value, roundId, contestantId, auth, run }: {
  name: string; value: number | null; roundId: string; contestantId: string; auth: Auth; run: Run;
}) {
  const save = useServerFn(setScore);
  const server = value === null ? "" : String(value);
  const [val, setVal] = useState(server);
  const [focused, setFocused] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (!focused) setVal(server); }, [server, focused]);
  const id = `score-${roundId}-${contestantId}`;

  const commit = async () => {
    if (val.trim() === server) return;
    const p = parseScoreInput(val);
    if (!p.ok) return setErr(p.error);
    setErr(null);
    const r = await run(save({ data: { ...auth, roundId, contestantId, value: val.trim() } }));
    if (r !== undefined) { setSaved(true); setTimeout(() => setSaved(false), 1200); }
  };

  return (
    <li>
      <div className="flex items-center gap-3">
        <Label htmlFor={id} className="min-w-0 flex-1 truncate text-base">{name}</Label>
        {saved && <Check className="h-4 w-4 text-up" aria-label="Saved" />}
        <Input id={id} inputMode="numeric" pattern="[0-9]*" placeholder="0" value={val} aria-invalid={!!err} aria-describedby={err ? `${id}-err` : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); commit(); }}
          onChange={(e) => { setVal(e.target.value); const p = parseScoreInput(e.target.value); setErr(p.ok ? null : p.error); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="w-32 text-right font-display text-lg tabular" />
      </div>
      {err && <p id={`${id}-err`} role="alert" className="mt-1 text-right text-sm text-destructive">{err}</p>}
    </li>
  );
}

function NewGamePanel({ auth, run }: { auth: Auth; run: Run }) {
  const reset = useServerFn(newGame);
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl border border-border bg-card p-5" aria-label="New game">
      <h2 className="text-xl font-bold">New game</h2>
      <p className="mt-1 text-sm text-muted-foreground">Start over with fresh rounds.</p>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" className="mt-4 w-full"><RotateCcw /> New game…</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new game?</AlertDialogTitle>
            <AlertDialogDescription>All rounds and scores will be deleted. Contestants will be kept.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:flex-col sm:space-x-0">
            <AlertDialogAction onClick={() => run(reset({ data: { ...auth, removeContestants: false } }))}>
              Yes, delete rounds &amp; scores
            </AlertDialogAction>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => run(reset({ data: { ...auth, removeContestants: true } }))}>
              Delete everything, including all contestants
            </AlertDialogAction>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
