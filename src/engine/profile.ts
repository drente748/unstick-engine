import type { Barrier, ConfidenceTier, Profile, Rate, SessionRecord, StrategyId } from "./types";

/* ============================================================
   Stages 15–16 — learning & profile update.

   The profile is OBSERVED BEHAVIOR ONLY: it is re-derived from
   the persisted SessionRecord list on every dispatch, so it can
   never drift, never stores assumptions, and a single event can
   never redefine it.

   Confidence tiers gate every conclusion:
     none      — <3 sessions: the engine says nothing personal
     low       — ≥3 sessions: hints, treated as weak priors
     emerging  — ≥6 finished: patterns usable with caution
     stable    — ≥10 finished: patterns trusted (still ±1 moves)

   Every "best X" requires ≥2 samples in its bucket, and buckets
   are compared by RATE, so one lucky success never wins.
   ============================================================ */

const MIN_SESSIONS_FOR_LOW: ConfidenceTier = "low";

export function emptyProfile(starts: number): Profile {
  return {
    starts,
    kept: 0,
    bestSize: null,
    bestDuration: null,
    bestStrategy: null,
    commonBarrier: null,
    repeatedBarriers: [],
    avgTimeToStart: null,
    momentum: "none",
    recoveryRate: null,
    rates: null,
    confidence: starts >= 3 ? MIN_SESSIONS_FOR_LOW : "none",
  };
}

interface Bucket {
  kept: number;
  total: number;
}

/** Winner by kept-rate among buckets with ≥2 samples; ties → earlier key. */
function bestOf(buckets: Map<string, Bucket>): string | null {
  let winner: string | null = null;
  let bestRate = -1;
  for (const [k, b] of buckets) {
    if (b.total < 2) continue;
    const r = b.kept / b.total;
    if (r > bestRate) {
      bestRate = r;
      winner = k;
    }
  }
  return bestRate > 0 ? winner : null;
}

function tierFor(finished: number, starts: number): ConfidenceTier {
  if (finished >= 10) return "stable";
  if (finished >= 6) return "emerging";
  if (starts >= 3) return "low";
  return "none";
}

/** Momentum over the last five finished sessions. */
function momentumOf(done: SessionRecord[]): Profile["momentum"] {
  if (done.length === 0) return "none";
  const last = done.slice(-5);
  const kept = last.filter((s) => s.outcome === "kept").length;
  if (last.length >= 3 && kept === last.length) return "hot";
  if (kept >= Math.ceil(last.length * 0.6)) return "warm";
  if (kept === 0 && last.length >= 2) return "cold";
  return "warm";
}

/** learnFromOutcome / updateProfile — sessions are the single source of truth. */
export function computeProfile(sessions: SessionRecord[]): Profile {
  const starts = sessions.length;
  const done = sessions.filter((s) => s.outcome != null);
  const base = emptyProfile(starts);
  base.kept = done.filter((s) => s.outcome === "kept").length;
  base.confidence = tierFor(done.length, starts);
  base.momentum = momentumOf(done);
  if (done.length < 2) return base;

  const sizes = new Map<string, Bucket>();
  const durations = new Map<string, Bucket>();
  const strategies = new Map<string, Bucket>();
  const structures = new Map<string, Bucket>();
  const barriersB = new Map<string, Bucket>();
  const barrierCounts = new Map<Barrier, number>();
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
    add(structures, s.structure, kept);
    add(barriersB, s.barrier, kept);
    if (s.barrier) barrierCounts.set(s.barrier, (barrierCounts.get(s.barrier) ?? 0) + 1);
    /* time-to-start is evidence only when it worked and is plausible */
    if (kept && s.timeToStart != null && s.timeToStart > 0 && s.timeToStart < 30 * 60) {
      tts.push(s.timeToStart);
    }
  }

  /* recurring barriers need ≥3 sightings — a pattern, not an event */
  const repeatedBarriers: Barrier[] = [];
  for (const [k, v] of barrierCounts) {
    if (v >= 3) repeatedBarriers.push(k);
  }
  let commonBarrier: Barrier | null = null;
  let top = 1;
  for (const [k, v] of barrierCounts) {
    if (v >= 2 && v > top) {
      top = v;
      commonBarrier = k;
    }
  }

  /* recovery skill: of the sessions that needed rescuing, how many still kept going? */
  const rescued = done.filter((s) => s.rescues > 0);
  const recoveryRate =
    rescued.length >= 2 ? rescued.filter((s) => s.outcome === "kept").length / rescued.length : null;

  const toRates = (map: Map<string, Bucket>): Record<string, Rate> =>
    Object.fromEntries([...map.entries()].map(([k, v]) => [k, { kept: v.kept, total: v.total }]));

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
    repeatedBarriers,
    avgTimeToStart: tts.length >= 2 ? Math.round(tts.reduce((a, b) => a + b, 0) / tts.length) : null,
    momentum: base.momentum,
    recoveryRate,
    rates: { size: toRates(sizes), structure: toRates(structures), barrier: toRates(barriersB) },
    confidence: base.confidence,
  };
}

/** Alias kept for pipeline readability: learning IS re-deriving the profile. */
export const updateProfile = computeProfile;

/** Alias kept for pipeline readability. */
export const learnFromOutcome = computeProfile;

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
