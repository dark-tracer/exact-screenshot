import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowRight, Monitor, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createRoom } from "@/lib/scoreboard.functions";
import { adminToken } from "@/lib/use-room";
import { normalizeCode, validatePin } from "@/lib/ranking";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Scoreboard Live — realtime scoreboards for any event" },
      { name: "description", content: "Create a live scoreboard, enter scores from your phone, and project the rankings in realtime." },
      { property: "og:title", content: "Scoreboard Live" },
      { property: "og:description", content: "Create a live scoreboard and project rankings in realtime." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const create = useServerFn(createRoom);
  const [title, setTitle] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [codeErr, setCodeErr] = useState<string | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!title.trim()) return setErr("Please give your scoreboard a title");
    const pe = validatePin(pin);
    if (pe) return setErr(pe);
    setBusy(true);
    const res = await create({ data: { title, pin } });
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    adminToken.set(res.data.code, res.data.token);
    navigate({ to: "/room/$code/admin", params: { code: res.data.code } });
  }

  function onOpen(e: React.FormEvent) {
    e.preventDefault();
    const c = normalizeCode(code);
    if (!/^[A-Z0-9]{6}$/.test(c)) return setCodeErr("Room codes are 6 letters or numbers");
    navigate({ to: "/room/$code/display", params: { code: c } });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-5 py-12">
      <header className="mb-12">
        <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-primary" /> Live, in realtime
        </div>
        <h1 className="mt-5 text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-7xl">
          Keep score.<br />
          <span className="text-primary">Show the room.</span>
        </h1>
        <p className="mt-5 max-w-lg text-lg text-muted-foreground">
          Run the scores from your phone. Put the rankings on the big screen.
        </p>
      </header>

      <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
        <form onSubmit={onCreate} className="rounded-2xl border border-border bg-card p-6 sm:p-8" noValidate>
          <h2 className="flex items-center gap-2 text-2xl font-bold"><Trophy className="h-6 w-6 text-primary" /> Create a scoreboard</h2>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Scoreboard title</Label>
              <Input id="title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Friday Pub Quiz" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">Admin PIN (4+ digits)</Label>
              <Input id="pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={12} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" />
              <p className="text-xs text-muted-foreground">You'll need this PIN to edit scores on another device.</p>
            </div>
            {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? "Creating…" : "Create scoreboard"} <ArrowRight />
            </Button>
          </div>
        </form>

        <form onSubmit={onOpen} className="rounded-2xl border border-border bg-secondary/40 p-6 sm:p-8" noValidate>
          <h2 className="flex items-center gap-2 text-2xl font-bold"><Monitor className="h-6 w-6 text-primary" /> Open a display</h2>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Room code</Label>
              <Input id="code" value={code} maxLength={6} onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeErr(null); }} placeholder="ABC234" className="font-display text-xl uppercase tracking-[0.3em]" autoCapitalize="characters" />
            </div>
            {codeErr && <p role="alert" className="text-sm text-destructive">{codeErr}</p>}
            <Button type="submit" variant="secondary" size="lg" className="w-full">Open display</Button>
          </div>
        </form>
      </div>
    </main>
  );
}
