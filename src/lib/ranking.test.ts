import { describe, expect, it } from "vitest";
import { computeStandings, parseScoreInput, validateName, generateRoomCode, CODE_ALPHABET } from "./ranking";

const c = (id: string, name: string) => ({ id, name, type: "individual" as const });

describe("ranking", () => {
  it("ties share rank (1,2,2,4) and are alphabetical", () => {
    const rounds = [{ id: "r1", number: 1 }];
    const scores = [
      { id: "1", round_id: "r1", contestant_id: "a", value: 10 },
      { id: "2", round_id: "r1", contestant_id: "b", value: 5 },
      { id: "3", round_id: "r1", contestant_id: "c", value: 5 },
      { id: "4", round_id: "r1", contestant_id: "d", value: 1 },
    ];
    const s = computeStandings([c("d", "Dee"), c("c", "Zed"), c("b", "Bob"), c("a", "Al")], rounds, scores);
    expect(s.map((x) => [x.name, x.rank])).toEqual([["Al", 1], ["Bob", 2], ["Zed", 2], ["Dee", 4]]);
  });
  it("totals sum across rounds; missing counts as 0", () => {
    const rounds = [{ id: "r1", number: 1 }, { id: "r2", number: 2 }];
    const scores = [
      { id: "1", round_id: "r1", contestant_id: "a", value: 3 },
      { id: "2", round_id: "r2", contestant_id: "a", value: 4 },
    ];
    const s = computeStandings([c("a", "A"), c("b", "B")], rounds, scores);
    expect(s[0].total).toBe(7);
    expect(s[1].total).toBe(0);
    expect(s[0].lastRound).toBe(4);
  });
});

describe("score input", () => {
  it("rejects negatives, decimals, text, and above MAX_SAFE_INTEGER", () => {
    expect(parseScoreInput("-1").ok).toBe(false);
    expect(parseScoreInput("1.5").ok).toBe(false);
    expect(parseScoreInput("abc").ok).toBe(false);
    expect(parseScoreInput("9007199254740992").ok).toBe(false);
    expect(parseScoreInput("9007199254740991")).toEqual({ ok: true, value: 9007199254740991 });
    expect(parseScoreInput("")).toEqual({ ok: true, value: null });
  });
});

describe("names", () => {
  it("rejects empty, duplicates (case-insensitive), and >40 chars", () => {
    expect(validateName("   ", []).ok).toBe(false);
    expect(validateName("alice", ["Alice"]).ok).toBe(false);
    expect(validateName("x".repeat(41), []).ok).toBe(false);
    expect(validateName("  Bob  ", [])).toEqual({ ok: true, name: "Bob" });
  });
});

describe("room code", () => {
  it("is 6 chars with no ambiguous characters", () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(6);
    expect([...code].every((ch) => CODE_ALPHABET.includes(ch))).toBe(true);
    expect(CODE_ALPHABET).not.toMatch(/[0O1I]/);
  });
});
