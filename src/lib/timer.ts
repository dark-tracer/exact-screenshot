export interface RoomTimer {
  enabled: boolean;
  duration_seconds: number;
  remaining_ms: number;
  ends_at: string | null;
  contestant_id: string | null;
  run_id: string;
}

export type TimerAction = "start" | "pause" | "restart" | "reset";

export function remainingTime(timer: RoomTimer, now: number) {
  return timer.ends_at ? Math.max(0, Date.parse(timer.ends_at) - now) : timer.remaining_ms;
}

export function timerTransition(timer: RoomTimer, action: TimerAction, now: number, runId: string) {
  if (!timer.enabled) throw new Error("This room does not have a timer enabled.");
  const remaining = remainingTime(timer, now);
  if (action === "pause") return { remaining_ms: remaining, ends_at: null };
  if (action === "reset") return { remaining_ms: timer.duration_seconds * 1000, ends_at: null, run_id: runId };
  if (action === "restart") return { remaining_ms: timer.duration_seconds * 1000, ends_at: new Date(now + timer.duration_seconds * 1000).toISOString(), run_id: runId };
  if (remaining <= 0) throw new Error("Time is up. Restart the timer for a new turn.");
  return { remaining_ms: remaining, ends_at: new Date(now + remaining).toISOString() };
}

export function validDuration(seconds: number) {
  return Number.isInteger(seconds) && seconds >= 1 && seconds <= 86400;
}

export function formatTime(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}