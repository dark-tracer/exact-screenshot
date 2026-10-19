import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeCode, type Contestant, type Round, type Score } from "./ranking";
import type { RoomTimer } from "./timer";

export interface RoomState {
  room: { id: string; code: string; title: string };
  contestants: Contestant[];
  rounds: Round[];
  scores: Score[];
  timer: RoomTimer | null;
}

export type RoomStatus = "loading" | "notfound" | "ready" | "error";

/** Loads a room by code and keeps it in sync via realtime; resyncs on reconnect. */
export function useRoom(rawCode: string) {
  const code = normalizeCode(rawCode);
  const [state, setState] = useState<RoomState | null>(null);
  const [status, setStatus] = useState<RoomStatus>("loading");
  const [connected, setConnected] = useState(true);
  const roomIdRef = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const { data: room, error } = await supabase
      .from("rooms")
      .select("id, code, title")
      .eq("code", code)
      .maybeSingle();
    if (error) return setStatus((s) => (s === "ready" ? s : "error"));
    if (!room) return setStatus("notfound");
    roomIdRef.current = room.id;
    const [c, r, s, t] = await Promise.all([
      supabase.from("contestants").select("id, name, type").eq("room_id", room.id).order("created_at"),
      supabase.from("rounds").select("id, number").eq("room_id", room.id).order("number"),
      supabase.from("scores").select("id, round_id, contestant_id, value").eq("room_id", room.id),
      supabase.from("room_timers").select("enabled, duration_seconds, remaining_ms, ends_at, contestant_id, run_id").eq("room_id", room.id).maybeSingle(),
    ]);
    if (c.error || r.error || s.error) return;
    setState({
      room,
      timer: t.data,
      contestants: (c.data ?? []) as Contestant[],
      rounds: r.data ?? [],
      scores: (s.data ?? []).map((x) => ({ ...x, value: Number(x.value) })),
    });
    setStatus("ready");
  }, [code]);

  const refresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, 120);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let wasDown = false;
    (async () => {
      await load();
      const roomId = roomIdRef.current;
      if (cancelled || !roomId) return;
      channel = supabase.channel(`room-${roomId}`);
      channel.on("postgres_changes", { event: "*", schema: "public", table: "room_timers", filter: `room_id=eq.${roomId}` }, refresh);
      for (const table of ["contestants", "rounds", "scores"] as const) {
        channel
          .on("postgres_changes", { event: "INSERT", schema: "public", table, filter: `room_id=eq.${roomId}` }, refresh)
          .on("postgres_changes", { event: "UPDATE", schema: "public", table, filter: `room_id=eq.${roomId}` }, refresh)
          .on("postgres_changes", { event: "DELETE", schema: "public", table }, refresh);
      }
      channel.subscribe((s) => {
        if (s === "SUBSCRIBED") {
          setConnected(true);
          if (wasDown) load();
          wasDown = false;
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
          setConnected(false);
          wasDown = true;
        }
      });
    })();
    const onOnline = () => load();
    const onOffline = () => setConnected(false);
    // Reconcile timer state even if realtime is temporarily unavailable.
    const poll = setInterval(load, 2000);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      cancelled = true;
      clearInterval(poll);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (timer.current) clearTimeout(timer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [load, refresh]);

  return { state, status, connected, refresh: load, code };
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const h = () => setReduced(m.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);
  return reduced;
}

const key = (code: string) => `scoreboard-admin:${normalizeCode(code)}`;
export const adminToken = {
  get: (code: string) => (typeof window === "undefined" ? null : localStorage.getItem(key(code))),
  set: (code: string, t: string) => localStorage.setItem(key(code), t),
  clear: (code: string) => localStorage.removeItem(key(code)),
};
