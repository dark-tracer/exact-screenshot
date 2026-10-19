import { beforeEach, expect, it, vi } from "vitest";

const { from, read } = vi.hoisted(() => ({ from: vi.fn(), read: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }),
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from } }));
import { controlTimer } from "./scoreboard.functions";

// Call the handler directly to exercise authorization before any timer write.
const invoke = controlTimer as unknown as (input: { data: { code: string; token: string; action: string; contestantId: string } }) => Promise<{ ok: boolean; error?: string }>;

beforeEach(() => {
  vi.clearAllMocks();
  const chain = { select: () => chain, eq: () => chain, maybeSingle: read };
  from.mockReturnValue(chain);
});

it("rejects timer control without a valid admin token", async () => {
  const result = await invoke({ data: { code: "ABC234", token: "", action: "restart", contestantId: "participant" } });
  expect(result.ok).toBe(false);
  expect(from).not.toHaveBeenCalled();
});

it("rejects expired admin sessions before accessing a timer", async () => {
  read.mockResolvedValueOnce({ data: { id: "room" } }).mockResolvedValueOnce({ data: { id: "session", expires_at: "2000-01-01T00:00:00Z" } });
  const result = await invoke({ data: { code: "ABC234", token: "a".repeat(64), action: "pause", contestantId: "participant" } });
  expect(result.ok).toBe(false);
  expect(from.mock.calls.map(([table]) => table)).toEqual(["rooms", "admin_sessions"]);
});

it("rejects a token with no session in the requested room", async () => {
  read.mockResolvedValueOnce({ data: { id: "other-room" } }).mockResolvedValueOnce({ data: null });
  const result = await invoke({ data: { code: "DEF567", token: "a".repeat(64), action: "restart", contestantId: "participant" } });
  expect(result.ok).toBe(false);
  expect(from.mock.calls.map(([table]) => table)).toEqual(["rooms", "admin_sessions"]);
});