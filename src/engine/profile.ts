import type { Barrier, Profile, SessionRecord, StrategyId } from "./types";

/* ============================================================
   Stage 6 — Personal start profile.
   Pure local learning: studies nothing but the user's own
   starts. Which sizes, lengths and strategies most often lead
   to momentum? Sample guards keep it honest — never enough data
   means never a conclusion.
   ============================================================ */

export function emptyProfile(starts: number): Profile {
  return {
    starts,
    kept: 0,
    bestSize: null,
    bestDuration: null,
    bestStrategy: null,
    commonBarrier: null,
    avgTimeToStart: null,
    confidence: starts >= 3 ? "low" : "none",
  };
}

interface Bucket {
  kept: number;
  total: number;
}

function bestOf(buckets: Map<string, Bucket>): string | null {
  let winner: string | null = null;
  let bestRate = -1;
  for (const [k, b] of buckets) {
    if (b.total < 2) continue;
    const r = b.kept / b.total;
    if (r > bestRate || (r === bestRate && winner === null)) {
      bestRate = r;
      winner = k;
    }
  }
  return bestRate > 0 ? winner : null;
}

export function computeProfile(sessions: SessionRecord[]): Profile {
  const starts = sessions.length;
  const done = sessions.filter((s) => s.outcome != null);
  const base = emptyProfile(starts);
  base.kept = done.filter((s) => s.outcome === "kept").length;
  if (done.length < 2) return base;

  const sizes = new Map<string, Bucket>();
  const durations = new Map<string, Bucket>();
  const strategies = new Map<string, Bucket>();
  const barriers = new Map<Barrier, number>();
  const tts: number[] = [];

  const add = (map: Map<string, Bucket>, key: string | null, kept: boolean) => {
    if (key == null) return;
    const b = map.get(key) ?? { kept: 0, total: 0 };
    b.total += 1;
    if (kept) b.kept += 1;
    map.set(key, b);
  };

  for (const s of done) {
    const kept = s.outcome === "kept";
    add(sizes, String(s.size), kept);
    add(durations, String(s.duration), kept);
    add(strategies, s.strategy, kept);
    if (s.barrier) barriers.set(s.barrier, (barriers.get(s.barrier) ?? 0) + 1);
    if (kept && s.timeToStart != null && s.timeToStart > 0 && s.timeToStart < 30 * 60) {
      tts.push(s.timeToStart);
    }
  }

  let commonBarrier: Barrier | null = null;
  let top = 1;
  for (const [k, v] of barriers) {
    if (v >= 2 && v > top) {
      top = v;
      commonBarrier = k;
    }
  }

  const bs = bestOf(sizes);
  const bd = bestOf(durations);
  const bstr = bestOf(strategies);

  return {
    starts,
    kept: base.kept,
    bestSize: bs != null ? Number(bs) : null,
    bestDuration: bd != null ? Number(bd) : null,
    bestStrategy: bstr as StrategyId | null,
    commonBarrier,
    avgTimeToStart: tts.length >= 2 ? Math.round(tts.reduce((a, b) => a + b, 0) / tts.length) : null,
    confidence: done.length >= 5 ? "enough" : "low",
  };
}

export function durationLabel(sec: number): string {
  if (sec <= 10) return "10 seconds";
  if (sec <= 60) return "1 minute";
  const m = Math.round(sec / 60);
  return `${m} minute${m === 1 ? "" : "s"}`;
}

export function secondsLabel(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}
