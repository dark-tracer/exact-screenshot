import { createServerFn } from "@tanstack/react-start";
import { timerTransition, validDuration, type TimerAction } from "./timer";
import {
  generateRoomCode,
  normalizeCode,
  parseScoreInput,
  validateName,
  validatePin,
} from "./ranking";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

const MAX_ATTEMPTS = 5;
const LOCK_MS = 60_000;

const enc = new TextEncoder();
const toHex = (b: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) => new Uint8Array(h.match(/.{2}/g)!.map((x) => parseInt(x, 16)));

async function pbkdf2(pin: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: 100_000 },
    key,
    256,
  );
  return toHex(bits);
}
async function hashPin(pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${toHex(salt)}$${await pbkdf2(pin, salt)}`;
}
async function checkPin(pin: string, stored: string) {
  const [, salt = "", hash = ""] = stored.split("$");
  const got = await pbkdf2(pin, fromHex(salt));
  let diff = got.length ^ hash.length;
  for (let i = 0; i < Math.min(got.length, hash.length); i++) diff |= got.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}
const sha256 = async (s: string) => toHex(await crypto.subtle.digest("SHA-256", enc.encode(s)));

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function newSession(roomId: string) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const db = await admin();
  const { error } = await db.from("admin_sessions").insert({ room_id: roomId, token_hash: await sha256(token) });
  if (error) throw error;
  return token;
}

/** Returns the room id if the token is a valid admin session for this room code. */
async function authorize(code: string, token: string): Promise<string | null> {
  if (typeof token !== "string" || token.length !== 64) return null;
  const db = await admin();
  const { data: room } = await db.from("rooms").select("id").eq("code", normalizeCode(code)).maybeSingle();
  if (!room) return null;
  const { data: s } = await db
    .from("admin_sessions")
    .select("id, expires_at")
    .eq("room_id", room.id)
    .eq("token_hash", await sha256(token))
    .maybeSingle();
  if (!s || new Date(s.expires_at).getTime() < Date.now()) return null;
  return room.id;
}

async function guarded<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Something went wrong";
    if (!(e instanceof UserError)) console.error(e);
    return { ok: false, error: e instanceof UserError ? msg : "Something went wrong. Please try again." };
  }
}
class UserError extends Error {}
const fail = (m: string): never => {
  throw new UserError(m);
};

type Auth = { code: string; token: string };
const authInput = <T,>(d: T & Auth) => {
  if (!d || typeof d.code !== "string" || typeof d.token !== "string") throw new Error("Bad input");
  return d;
};
async function mustAuth(d: Auth) {
  const roomId = await authorize(d.code, d.token);
  if (!roomId) fail("Your admin session has expired. Please enter the PIN again.");
  return roomId as string;
}

async function existingNames(roomId: string) {
  const db = await admin();
  const { data } = await db.from("contestants").select("id, name").eq("room_id", roomId);
  return data ?? [];
}

export const createRoom = createServerFn({ method: "POST" })
  .inputValidator((d: { title: string; pin: string; timerEnabled?: boolean; timerSeconds?: number }) => d)
  .handler(({ data }) =>
    guarded(async () => {
      const title = String(data.title ?? "").trim().slice(0, 80);
      if (!title) fail("Please give your scoreboard a title");
      const pinErr = validatePin(String(data.pin ?? ""));
      if (pinErr) fail(pinErr);
      const seconds = data.timerSeconds ?? 30;
      if (data.timerEnabled && !validDuration(seconds)) fail("Timer duration must be a whole number from 1 to 86400 seconds.");
      const db = await admin();
      const pin_hash = await hashPin(data.pin);
      for (let i = 0; i < 8; i++) {
        const code = generateRoomCode(() => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32);
        const { data: room, error } = await db.from("rooms").insert({ code, title, pin_hash }).select("id, code").single();
        if (error?.code === "23505") continue;
        if (error) throw error;
        const { error: timerError } = await db.from("room_timers").insert({ room_id: room.id, enabled: data.timerEnabled === true, duration_seconds: data.timerEnabled ? seconds : 30, remaining_ms: (data.timerEnabled ? seconds : 30) * 1000 });
        if (timerError) throw timerError;
        return { code: room.code, token: await newSession(room.id) };
      }
      return fail("Could not create a room code, please try again");
    }),
  );

export const verifyPin = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string; pin: string }) => d)
  .handler(({ data }) =>
    guarded(async () => {
      const db = await admin();
      const { data: room } = await db
        .from("rooms")
        .select("id, pin_hash, failed_attempts, locked_until")
        .eq("code", normalizeCode(String(data.code)))
        .maybeSingle();
      if (!room) fail("Scoreboard not found");
      const r = room!;
      if (r.locked_until && new Date(r.locked_until).getTime() > Date.now()) {
        const s = Math.ceil((new Date(r.locked_until).getTime() - Date.now()) / 1000);
        fail(`Too many attempts. Try again in ${s} seconds.`);
      }
      const ok = /^\d{4,12}$/.test(String(data.pin)) && (await checkPin(String(data.pin), r.pin_hash));
      if (!ok) {
        const attempts = r.failed_attempts + 1;
        if (attempts >= MAX_ATTEMPTS) {
          await db.from("rooms").update({ failed_attempts: 0, locked_until: new Date(Date.now() + LOCK_MS).toISOString() }).eq("id", r.id);
          fail("Too many attempts. Locked for 60 seconds.");
        }
        await db.from("rooms").update({ failed_attempts: attempts }).eq("id", r.id);
        fail(`Wrong PIN. ${MAX_ATTEMPTS - attempts} attempt${MAX_ATTEMPTS - attempts === 1 ? "" : "s"} left.`);
      }
      await db.from("rooms").update({ failed_attempts: 0, locked_until: null }).eq("id", r.id);
      return { token: await newSession(r.id) };
    }),
  );

export const checkSession = createServerFn({ method: "POST" })
  .inputValidator(authInput)
  .handler(({ data }) => guarded(async () => ({ valid: !!(await authorize(data.code, data.token)) })));

export const logoutAdmin = createServerFn({ method: "POST" })
  .inputValidator(authInput)
  .handler(({ data }) =>
    guarded(async () => {
      const db = await admin();
      await db.from("admin_sessions").delete().eq("token_hash", await sha256(data.token));
      return null;
    }),
  );

export const addContestant = createServerFn({ method: "POST" })
  .inputValidator(authInput<{ name: string; type: "individual" | "team" }>)
  .handler(({ data }) =>
    guarded(async () => {
      const roomId = await mustAuth(data);
      const v = validateName(String(data.name ?? ""), (await existingNames(roomId)).map((c) => c.name));
      if (!v.ok) return fail(v.error);
      const type = data.type === "team" ? "team" : "individual";
      const db = await admin();
      const { error } = await db.from("contestants").insert({ room_id: roomId, name: v.name, type });
      if (error?.code === "23505") fail("That name is already taken");
      if (error) throw error;
      return null;
    }),
  );

export const updateContestant = createServerFn({ method: "POST" })
  .inputValidator(authInput<{ id: string; name?: string; type?: "individual" | "team" }>)
  .handler(({ data }) =>
    guarded(async () => {
      const roomId = await mustAuth(data);
      const all = await existingNames(roomId);
      const self = all.find((c) => c.id === data.id);
      if (!self) return fail("Contestant not found");
      const patch: { name?: string; type?: "individual" | "team" } = {};
      if (data.name !== undefined) {
        const v = validateName(data.name, all.filter((c) => c.id !== data.id).map((c) => c.name));
        if (!v.ok) return fail(v.error);
        patch.name = v.name;
      }
      if (data.type) patch.type = data.type === "team" ? "team" : "individual";
      const db = await admin();
      const { error } = await db.from("contestants").update(patch).eq("id", data.id).eq("room_id", roomId);
      if (error?.code === "23505") fail("That name is already taken");
      if (error) throw error;
      return null;
    }),
  );

export const removeContestant = createServerFn({ method: "POST" })
  .inputValidator(authInput<{ id: string }>)
  .handler(({ data }) =>
    guarded(async () => {
      const roomId = await mustAuth(data);
      const db = await admin();
      const { error } = await db.from("contestants").delete().eq("id", data.id).eq("room_id", roomId);
      if (error) throw error;
      return null;
    }),
  );

export const addRound = createServerFn({ method: "POST" })
  .inputValidator(authInput)
  .handler(({ data }) =>
    guarded(async () => {
      const roomId = await mustAuth(data);
      const db = await admin();
      for (let i = 0; i < 3; i++) {
        const { data: last } = await db.from("rounds").select("number").eq("room_id", roomId).order("number", { ascending: false }).limit(1).maybeSingle();
        const { data: r, error } = await db.from("rounds").insert({ room_id: roomId, number: (last?.number ?? 0) + 1 }).select("id").single();
        if (error?.code === "23505") continue;
        if (error) throw error;
        return { id: r.id };
      }
      return fail("Could not add round, please try again");
    }),
  );

export const deleteRound = createServerFn({ method: "POST" })
  .inputValidator(authInput<{ id: string }>)
  .handler(({ data }) =>
    guarded(async () => {
      const roomId = await mustAuth(data);
      const db = await admin();
      const { error } = await db.from("rounds").delete().eq("id", data.id).eq("room_id", roomId);
      if (error) throw error;
      return null;
    }),
  );

export const setScore = createServerFn({ method: "POST" })
  .inputValidator(authInput<{ roundId: string; contestantId: string; value: string }>)
  .handler(({ data }) =>
    guarded(async () => {
      const roomId = await mustAuth(data);
      const p = parseScoreInput(String(data.value ?? ""));
      if (!p.ok) return fail(p.error);
      const db = await admin();
      const [{ data: round }, { data: c }] = await Promise.all([
        db.from("rounds").select("id").eq("id", data.roundId).eq("room_id", roomId).maybeSingle(),
        db.from("contestants").select("id").eq("id", data.contestantId).eq("room_id", roomId).maybeSingle(),
      ]);
      if (!round || !c) return fail("Round or contestant no longer exists");
      if (p.value === null) {
        const { error } = await db.from("scores").delete().eq("round_id", data.roundId).eq("contestant_id", data.contestantId);
        if (error) throw error;
      } else {
        const { error } = await db.from("scores").upsert(
          { room_id: roomId, round_id: data.roundId, contestant_id: data.contestantId, value: p.value, updated_at: new Date().toISOString() },
          { onConflict: "round_id,contestant_id" },
        );
        if (error) throw error;
      }
      return null;
    }),
  );

export const newGame = createServerFn({ method: "POST" })
  .inputValidator(authInput<{ removeContestants: boolean }>)
  .handler(({ data }) =>
    guarded(async () => {
      const roomId = await mustAuth(data);
      const db = await admin();
      const { data: timer } = await db.from("room_timers").select("duration_seconds").eq("room_id", roomId).maybeSingle();
      if (timer) {
        const { error: timerError } = await db.from("room_timers").update({ contestant_id: null, ends_at: null, remaining_ms: timer.duration_seconds * 1000, run_id: crypto.randomUUID() }).eq("room_id", roomId);
        if (timerError) throw timerError;
      }
      const { error } = await db.from("rounds").delete().eq("room_id", roomId);
      if (error) throw error;
      if (data.removeContestants === true) {
        const { error: e2 } = await db.from("contestants").delete().eq("room_id", roomId);
        if (e2) throw e2;
      }
      return null;
    }),
  );

export const controlTimer = createServerFn({ method: "POST" })
  .inputValidator(authInput<{ action: TimerAction; contestantId: string }>)
  .handler(({ data }) => guarded(async () => {
    const roomId = await mustAuth(data);
    if (!["start", "pause", "restart", "reset"].includes(data.action)) return fail("Unknown timer action.");
    const db = await admin();
    const { data: timer, error } = await db.from("room_timers").select("*").eq("room_id", roomId).maybeSingle();
    if (error) throw error;
    if (!timer?.enabled) return fail("This room does not have a timer enabled.");
    const { data: contestant } = await db.from("contestants").select("id").eq("id", data.contestantId).eq("room_id", roomId).maybeSingle();
    if (!contestant) return fail("Please select a participant in this room.");
    if (data.action !== "restart" && data.action !== "reset" && timer.contestant_id && timer.contestant_id !== contestant.id) return fail("Restart the timer to begin another participant's turn.");
    let patch;
    try { patch = timerTransition(timer, data.action, Date.now(), crypto.randomUUID()); }
    catch (e) { return fail(e instanceof Error ? e.message : "Could not control timer."); }
    const { error: updateError } = await db.from("room_timers").update({ ...patch, contestant_id: contestant.id }).eq("room_id", roomId);
    if (updateError) throw updateError;
    return null;
  }));
