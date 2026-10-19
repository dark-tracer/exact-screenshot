import { describe, expect, it } from "vitest";
import { remainingTime, timerTransition, type RoomTimer } from "./timer";

const timer: RoomTimer = { enabled: true, duration_seconds: 30, remaining_ms: 30000, ends_at: null, contestant_id: "participant", run_id: "turn" };

describe("participant timer", () => {
  it("starts a configured 30-second turn", () => {
    expect(timerTransition(timer, "start", 1000, "new").ends_at).toBe(new Date(31000).toISOString());
  });
  it("pause preserves time and resume uses only the remaining time", () => {
    const running = { ...timer, ...timerTransition(timer, "start", 1000, "new") };
    const paused = { ...running, ...timerTransition(running, "pause", 11000, "new") };
    expect(remainingTime(paused, 90000)).toBe(20000);
    expect(timerTransition(paused, "start", 90000, "new").ends_at).toBe(new Date(110000).toISOString());
  });
  it("restart gives the participant a fresh 30 seconds and new alert identity", () => {
    expect(timerTransition({ ...timer, remaining_ms: 0 }, "restart", 1000, "new")).toEqual({ remaining_ms: 30000, ends_at: new Date(31000).toISOString(), run_id: "new" });
  });
  it("expires at zero without going negative", () => {
    expect(remainingTime({ ...timer, ends_at: new Date(31000).toISOString() }, 31000)).toBe(0);
    expect(remainingTime({ ...timer, ends_at: new Date(31000).toISOString() }, 40000)).toBe(0);
  });
  it("does not allow controls for a disabled room timer", () => {
    expect(() => timerTransition({ ...timer, enabled: false }, "restart", 1000, "new")).toThrow();
  });
});