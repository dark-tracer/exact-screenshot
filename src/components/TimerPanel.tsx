import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Pause, Play, RotateCcw, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { controlTimer } from "@/lib/scoreboard.functions";
import { useCountdown } from "@/lib/use-countdown";
import { formatTime, type TimerAction } from "@/lib/timer";
import type { RoomState } from "@/lib/use-room";

export function TimerPanel({ state, auth, refresh, onExpired }: {
  state: RoomState; auth: { code: string; token: string }; refresh: () => void; onExpired: () => void;
}) {
  const control = useServerFn(controlTimer);
  const timer = state.timer;
  const { remaining, expired } = useCountdown(timer);
  const [selected, setSelected] = useState(timer?.contestant_id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setSelected(timer?.contestant_id ?? ""); }, [timer?.contestant_id]);
  if (!timer?.enabled) return null;
  const participant = state.contestants.some((c) => c.id === selected) ? selected : "";
  const another = !!timer.contestant_id && timer.contestant_id !== participant;
  const running = !!timer.ends_at && !expired;
  async function act(action: TimerAction) {
    setBusy(true); setError("");
    try {
      const result = await control({ data: { ...auth, action, contestantId: participant } });
      if (!result.ok) {
        setError(result.error);
        if (result.error.includes("session has expired")) onExpired();
      } else refresh();
    } catch { setError("Could not update the timer. Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="border-b border-border py-5" aria-label="Participant timer">
    <h2 className="flex items-center gap-2 text-xl font-bold"><Timer className="size-5 text-primary" /> Participant timer</h2>
    <div className={`my-3 font-display text-5xl font-extrabold tabular ${expired ? "text-destructive" : "text-primary"}`} role="timer">{formatTime(remaining)}</div>
    <p className="mb-3 text-sm text-muted-foreground">{expired ? "TIME IS UP" : running ? "Running" : "Ready / paused"} · {timer.duration_seconds} seconds per turn</p>
    <Label htmlFor="timer-participant">Participant</Label>
    <Select value={participant} onValueChange={setSelected} disabled={busy}>
      <SelectTrigger id="timer-participant" className="mt-2"><SelectValue placeholder="Select participant" /></SelectTrigger>
      <SelectContent>{state.contestants.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
    </Select>
    <div className="mt-3 flex flex-wrap gap-2">
      <Button disabled={busy || !participant || another || expired} onClick={() => act(running ? "pause" : "start")}>
        {running ? <Pause /> : <Play />}{running ? "Pause" : remaining < timer.duration_seconds * 1000 ? "Resume" : "Start"}
      </Button>
      <Button variant="secondary" disabled={busy || !participant} onClick={() => act("restart")}><RotateCcw /> Restart</Button>
      <Button variant="ghost" disabled={busy || !participant} onClick={() => act("reset")}>Reset</Button>
    </div>
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
  </section>;
}