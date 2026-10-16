// Pure scoreboard logic shared by admin, display, server and tests.

export type ContestantType = "individual" | "team";
export interface Contestant {
  id: string;
  name: string;
  type: ContestantType;
}
export interface Round {
  id: string;
  number: number;
}
export interface Score {
  id: string;
  round_id: string;
  contestant_id: string;
  value: number;
}

export interface Standing {
  id: string;
  name: string;
  type: ContestantType;
  total: number;
  rank: number;
  lastRound: number | null;
}

export const MAX_NAME = 40;
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return out;
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export function computeStandings(
  contestants: Contestant[],
  rounds: Round[],
  scores: Score[],
): Standing[] {
  const latest = rounds.reduce<Round | null>((a, r) => (!a || r.number > a.number ? r : a), null);
  const totals = new Map<string, number>();
  const last = new Map<string, number>();
  for (const s of scores) {
    totals.set(s.contestant_id, (totals.get(s.contestant_id) ?? 0) + Number(s.value));
    if (latest && s.round_id === latest.id) last.set(s.contestant_id, Number(s.value));
  }
  const rows = contestants.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    total: totals.get(c.id) ?? 0,
    rank: 0,
    lastRound: latest ? (last.get(c.id) ?? 0) : null,
  }));
  rows.sort(
    (a, b) =>
      b.total - a.total || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  rows.forEach((r, i) => {
    r.rank = i > 0 && rows[i - 1].total === r.total ? rows[i - 1].rank : i + 1;
  });
  return rows;
}

export type ParseResult = { ok: true; value: number | null } | { ok: false; error: string };

/** Empty string clears the score. Only whole numbers >= 0 are accepted. */
export function parseScoreInput(raw: string): ParseResult {
  const v = raw.trim();
  if (v === "") return { ok: true, value: null };
  if (v.startsWith("-")) return { ok: false, error: "Score can't be negative" };
  if (/^\d*[.,]\d*$/.test(v)) return { ok: false, error: "Whole numbers only" };
  if (!/^\d+$/.test(v)) return { ok: false, error: "Numbers only" };
  const n = Number(v);
  if (!Number.isSafeInteger(n)) return { ok: false, error: "Number is too large" };
  return { ok: true, value: n };
}

export type NameResult = { ok: true; name: string } | { ok: false; error: string };

export function validateName(raw: string, existing: string[], selfName?: string): NameResult {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Name can't be empty" };
  if (name.length > MAX_NAME) return { ok: false, error: `Max ${MAX_NAME} characters` };
  const lower = name.toLowerCase();
  if (existing.some((e) => e.toLowerCase() === lower && e.toLowerCase() !== selfName?.toLowerCase()))
    return { ok: false, error: "That name is already taken" };
  return { ok: true, name };
}

export function validatePin(pin: string): string | null {
  if (!/^\d{4,12}$/.test(pin)) return "PIN must be 4–12 digits";
  return null;
}

export const formatNumber = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
