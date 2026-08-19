import { hashStr, normalizeAction } from "./analysis";
import { BARRIER_STRATEGIES, STRATEGIES, STRATEGY_MAP, STRUCTURE_FIT, decompose, renderStrategy } from "./strategies";
import type {
  Barrier,
  CandidateAction,
  CostVector,
  Decision,
  Draft,
  EngineMemory,
  FeedbackKind,
  PreviewStep,
  Profile,
  Rate,
  StrategyId,
  TaskAnalysis,
} from "./types";

/* ============================================================
   Stages 8–12 — size adaptation, candidate generation, scoring,
   guardrails, duplicate checks and final selection.

   Every dimension is normalized to [0, 1] and the weights below
   are the whole policy — readable, tunable, documented:

     + progressValue   .30  real task-state change
     + barrierFit      .20  counters the named/likely barrier
     + preferenceFit   .12  this user's historically-working kind
     + historyFit      .10  completion rate for this structure/size
     + confidence      .10  engine belief it's executable as written
     + novelty         .08  distance from what was already shown
     − effortCost      .18  physical/time work
     − initiationCost  .14  activation energy
     − ambiguity       .10  unclear how-to
     − cognitiveLoad   .08  decisions demanded
     − emotional       .14  dread the action gets close to

   The selection target is NOT "smallest possible" — it is the
   minimum-friction action that still buys MEANINGFUL progress.
   ============================================================ */

const W = {
  progress: 0.3,
  barrierFit: 0.2,
  preferenceFit: 0.12,
  historyFit: 0.1,
  confidence: 0.1,
  novelty: 0.08,
  effort: 0.18,
  initiation: 0.14,
  ambiguity: 0.1,
  cognitive: 0.08,
  emotional: 0.14,
} as const;

const MEM_CAP = 14;
const FAILED_ACTION_CAP = 10;

export function emptyMemory(): EngineMemory {
  return {
    shown: [],
    strategies: [],
    failed: [],
    failedActions: [],
    sizeTrack: { size: -1, worked: 0, failed: 0 },
  };
}

export function remember(mem: EngineMemory, action: string, strategy: StrategyId): EngineMemory {
  const norm = normalizeAction(action);
  return {
    shown: [...mem.shown.filter((s) => s !== norm).slice(-(MEM_CAP - 1)), norm],
    strategies: [...mem.strategies.filter((s) => s !== strategy).slice(-9), strategy],
    failed: mem.failed,
    failedActions: mem.failedActions,
    sizeTrack: mem.sizeTrack,
  };
}

export function markFailed(mem: EngineMemory, strategy: StrategyId | null, action?: string | null): EngineMemory {
  let failedActions = mem.failedActions;
  if (action) {
    const k = normalizeAction(action);
    const existing = failedActions.find((f) => f.k === k);
    failedActions = existing
      ? failedActions.map((f) => (f.k === k ? { k, n: Math.min(4, f.n + 1) } : f))
      : [...failedActions.slice(-(FAILED_ACTION_CAP - 1)), { k, n: 1 }];
  }
  return {
    ...mem,
    failed: strategy ? [...mem.failed.filter((s) => s !== strategy).slice(-5), strategy] : mem.failed,
    failedActions,
  };
}

/* ---------------- stage 8: adaptive task size ---------------- */

interface SizeCtx {
  analysis: TaskAnalysis;
  barrier: Barrier | null;
  durationSec?: number | null;
  profile?: Profile | null;
  lastFeedback?: FeedbackKind | null;
  currentSize?: number | null;
  capacityEnergy?: number | null;
  alreadyStarted?: boolean;
  /** Streak data from memory — the hysteresis source. */
  sizeTrack?: EngineMemory["sizeTrack"];
}

const clampSize = (n: number): number => Math.max(0, Math.min(4, n));

/**
 * Compute the step size the engine should aim for right now (0..4).
 * Uses hysteresis: one conservative move at a time, streaks required
 * before testing a bigger step, so the size never oscillates.
 */
export function sizeFor(ctx: SizeCtx): number {
  const a = ctx.analysis;

  /* base: complexity of the ask */
  let size = a.complexity >= 2 ? 2 : a.complexity === 1 ? 1 : 0;

  /* barrier pushes the entry point lower */
  const barrierBase: Partial<Record<Barrier, number>> = {
    overwhelmed: 3, tired: 2, anxiety: 2, perfectionism: 2, avoiding: 2, unclear: 2, distracted: 1, boring: 1, unknown: 1,
  };
  if (ctx.barrier) size = Math.max(size, barrierBase[ctx.barrier] ?? 1);

  /* low capacity → never start big */
  if (ctx.capacityEnergy != null && ctx.capacityEnergy < 0.5) size = Math.max(size, 2);

  /* available time */
  if (ctx.durationSec != null) {
    if (ctx.durationSec <= 60) size = clampSize(size + 1);
    else if (ctx.durationSec >= 600) size = clampSize(size - 1);
  }

  /* slow starters get a smaller doorway (time-to-start as evidence) */
  const p = ctx.profile ?? null;
  if (p && p.avgTimeToStart != null && p.avgTimeToStart > 90 && !ctx.barrier) size = clampSize(size + 1);

  /* what this user historically starts best — but only ever move ONE step toward it */
  if (p && p.bestSize != null && (p.confidence === "emerging" || p.confidence === "stable") && !ctx.barrier) {
    size = p.bestSize > size ? Math.min(p.bestSize, size + 1) : Math.max(p.bestSize, size - 1);
  }

  /* momentum: hot → allow testing one size bigger (smaller number) */
  if (p?.momentum === "hot" && !ctx.barrier && ctx.lastFeedback === "worked") size = clampSize(size - 1);

  /* explicit feedback, with streak hysteresis */
  const track = ctx.sizeTrack;
  if (ctx.lastFeedback === "tooBig" || ctx.lastFeedback === "stuck") {
    /* one failure is enough evidence to shrink */
    size = clampSize((ctx.currentSize ?? size) + 1);
  } else if (ctx.lastFeedback === "worked") {
    /* two consecutive wins at a size before we test a bigger step (counting this win) */
    const workedStreak = track && track.size === (ctx.currentSize ?? size) ? track.worked + 1 : 1;
    if (workedStreak >= 2) size = clampSize((ctx.currentSize ?? size) - 1);
    else size = ctx.currentSize ?? size;
  }

  /* momentum in flight: already moving → don't shrink under them */
  if (ctx.alreadyStarted && ctx.lastFeedback === "worked") size = Math.min(size, ctx.currentSize ?? size);

  return clampSize(size);
}

/* ---------------- stage 9: candidate generation ---------------- */

export interface GenCtx {
  analysis: TaskAnalysis;
  barrier: Barrier | null;
  size: number;
  memory: EngineMemory;
  profile: Profile | null;
  salt: number;
  capacityEnergy?: number | null;
  /** When set, this strategy must not win (used after failures). */
  avoidStrategy?: StrategyId | null;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Refine a strategy's base costs with this task's measured signals. */
function costsFor(id: StrategyId, a: TaskAnalysis, size: number, profile: Profile | null): CostVector {
  const def = STRATEGY_MAP[id];
  const b = def.base;
  const structureFit = (STRUCTURE_FIT[a.structure][id] ?? 1) / 6;

  /* size shifts the trade-off: smaller steps trade progress for ease */
  const sizeShift = (size - 2) / 4; // -0.5 .. +0.5

  const progress = clamp01(b.progress + structureFit * 0.25 - sizeShift * 0.35);
  const effort = clamp01(b.effort + a.effort * 0.1 - sizeShift * 0.12);
  const initiation = clamp01(
    b.initiation + (a.needsApp ? 0.12 : 0) + (a.dependencies * 0.05) - sizeShift * 0.1,
  );
  const ambiguity = clamp01(
    a.ambiguity * 0.55 + (id === "question" ? -0.15 : 0) + (id === "info" ? -0.1 : 0) + (a.clearFirstStep ? -0.1 : 0),
  );
  const cognitive = clamp01(b.cognitive + a.complexity * 0.06 - sizeShift * 0.08);
  const emotional = clamp01(
    a.emotionalFriction * 0.5 + b.emotional * 0.4 - (id === "permission" ? 0.2 : 0) - sizeShift * 0.1,
  );
  const dependencies = clamp01(a.dependencies * 0.22 + (a.needsApp ? 0.15 : 0) - sizeShift * 0.05);

  /* confidence: how sure we are this can be executed exactly as written */
  let confidence = 0.6 + structureFit * 0.25;
  if (a.clearFirstStep) confidence += 0.08;
  if (id === "tiny" || id === "physical") confidence += 0.08;
  if (profile && profile.bestStrategy === id) confidence += 0.06;
  confidence = clamp01(confidence);

  return { progress, effort, initiation, ambiguity, cognitive, emotional, dependencies, confidence };
}

/* ---------------- stage 10: scoring ---------------- */

function scoreCandidate(c: CandidateAction, ctx: GenCtx): number {
  const a = ctx.analysis;
  const k = c.costs;
  const structureFit = (STRUCTURE_FIT[a.structure][c.strategy] ?? 1) / 6;

  /* barrierFit: position within the barrier's preferred list */
  let barrierFit = 0.35;
  if (ctx.barrier) {
    const pref = BARRIER_STRATEGIES[ctx.barrier];
    const idx = pref.indexOf(c.strategy);
    barrierFit = idx === 0 ? 1 : idx === 1 ? 0.75 : idx === 2 ? 0.5 : idx >= 0 ? 0.3 : 0.1;
  }

  /* preferenceFit: user's historically successful kind */
  let preferenceFit = 0.4;
  const p = ctx.profile;
  if (p && p.confidence !== "none") {
    if (p.bestStrategy === c.strategy) preferenceFit = 1;
    const rate: Rate | undefined = p.rates?.size[String(c.size)];
    if (rate && rate.total >= 2) preferenceFit = Math.max(preferenceFit, rate.kept / rate.total);
  }

  /* historyFit: completion rate for this structure, else neutral */
  let historyFit = 0.45;
  if (p?.rates) {
    const r = p.rates.structure[a.structure];
    if (r && r.total >= 2) historyFit = r.kept / r.total;
  }

  /* novelty: distance from shown actions & recently used strategies */
  const shown = ctx.memory.shown;
  const recency = ctx.memory.strategies.indexOf(c.strategy);
  const strategyFresh = recency < 0 ? 1 : Math.min(1, (ctx.memory.strategies.length - 1 - recency) / 3);
  const textFresh = shown.includes(normalizeAction(c.action)) ? 0 : 0.75 + strategyFresh * 0.25;

  /* failed-history penalties — strong but never permanent */
  const failedAction = ctx.memory.failedActions.find((f) => f.k === normalizeAction(c.action));
  const failedActionPenalty = failedAction ? Math.min(0.5, failedAction.n * 0.16) : 0;
  const failedStrategyPenalty = ctx.memory.failed.includes(c.strategy) ? 0.28 : 0;
  const avoidPenalty = ctx.avoidStrategy === c.strategy ? 0.55 : 0;

  /* energy fit: low capacity → reward cheap starts */
  const energy = ctx.capacityEnergy ?? 0.75;
  const energyFit = energy < 0.55 ? (1 - k.initiation) * 0.12 + (1 - k.effort) * 0.08 : 0;

  const score =
    W.progress * k.progress +
    W.barrierFit * barrierFit +
    W.preferenceFit * preferenceFit +
    W.historyFit * historyFit +
    W.confidence * k.confidence +
    W.novelty * textFresh -
    W.effort * k.effort -
    W.initiation * k.initiation -
    W.ambiguity * k.ambiguity -
    W.cognitive * k.cognitive -
    W.emotional * (k.emotional * (0.6 + 0.4 * structureFit)) -
    failedActionPenalty -
    failedStrategyPenalty -
    avoidPenalty +
    energyFit;

  /* deterministic tie-break: same input state → same output */
  return score + (hashStr(`${a.title}|${c.strategy}|${normalizeAction(c.action)}|${ctx.salt}`) % 97) / 9700;
}

/* ---------------- stage 11: guardrails ---------------- */

const VAGUE_OPENERS = ["just start", "break it into", "be more productive", "focus on your goals", "try harder"];
const JUDGMENTAL = ["lazy", "procrastinat", "you should have", "stop being", "discipline"];

/**
 * Validity rules. Reject anything that is empty, vague filler,
 * judgmental, a disguised multi-step plan, or unrunnable as
 * written. Templates pass by construction; this gate exists for
 * synthesized and (optional) AI-provided steps.
 */
export function passesGuardrails(action: string): boolean {
  const s = action.trim();
  if (s.length < 8 || s.length > 160) return false;
  const lower = s.toLowerCase();
  if (VAGUE_OPENERS.some((v) => lower.startsWith(v))) return false;
  if (JUDGMENTAL.some((v) => lower.includes(v))) return false;
  /* disguised multi-step: chained instructions */
  if (/\bthen\b.*\bthen\b/.test(lower)) return false;
  const sentences = s.split(/[.!?]/).filter((x) => x.trim().length > 0).length;
  if (sentences > 3) return false;
  return true;
}

/* ---------------- stage 12: selection ---------------- */

function buildCandidates(ctx: GenCtx): CandidateAction[] {
  const a = ctx.analysis;
  const out: CandidateAction[] = [];
  const seen = new Set<string>();

  /* rank strategies for this moment */
  const ranked = [...STRATEGIES]
    .map((def) => {
      const probe: CandidateAction = {
        action: "",
        strategy: def.id,
        size: ctx.size,
        costs: costsFor(def.id, a, ctx.size, ctx.profile),
        source: "template",
      };
      return { id: def.id, score: scoreCandidate(probe, ctx) };
    })
    .sort((x, y) => y.score - x.score);

  /* top-3 strategies × 2 wording salts each — enough variety, no explosion */
  for (const cand of ranked.slice(0, 3)) {
    for (let s = 0; s < 2; s++) {
      const action = renderStrategy(cand.id, a, ctx.salt + s * 7 + (cand.id.length % 3));
      const k = normalizeAction(action);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        action,
        strategy: cand.id,
        size: ctx.size,
        costs: costsFor(cand.id, a, ctx.size, ctx.profile),
        source: "template",
      });
    }
  }

  /* always include the task-scoped decomposed rung for this size */
  const rung = decompose(a, ctx.size);
  const rk = normalizeAction(rung);
  if (!seen.has(rk)) {
    const rungStrategy: StrategyId = ctx.size >= 3 ? "tiny" : ctx.size === 2 ? "tiny" : "direct";
    out.push({
      action: rung,
      strategy: rungStrategy,
      size: ctx.size,
      costs: costsFor(rungStrategy, a, ctx.size, ctx.profile),
      source: "decompose",
    });
  }

  return out.filter((c) => passesGuardrails(c.action));
}

const EFFORT_LABELS = ["medium", "medium", "small", "small", "tiny"] as const;

/** Full reasoning pass: candidates → score → select → explain. */
export function selectStep(ctx: GenCtx): Decision {
  const candidates = buildCandidates(ctx);

  /* guaranteed fallback survives any exhaustion */
  const fallback: CandidateAction = {
    action: `Give it exactly ${10 + ((ctx.salt * 13) % 50)} seconds, any way you like — then reassess.`,
    strategy: "timebox",
    size: ctx.size,
    costs: {
      progress: 0.4,
      effort: 0.15,
      initiation: 0.15,
      ambiguity: 0.15,
      cognitive: 0.1,
      emotional: 0.1,
      dependencies: 0,
      confidence: 0.9,
    },
    source: "fallback",
  };

  const pool = candidates.length ? candidates : [fallback];
  const scored = pool.map((c) => ({ c, score: scoreCandidate(c, ctx) })).sort((x, y) => y.score - x.score);

  /* hard anti-repetition: never re-serve a shown action while an unshown one exists */
  const shownSet = new Set(ctx.memory.shown);
  const unshown = scored.filter(({ c }) => !shownSet.has(normalizeAction(c.action)));
  if (unshown.length === 0) {
    /* every candidate exhausted — synthesize an always-fresh time-box */
    const secs = 10 + ((ctx.salt * 13 + ctx.memory.shown.length * 17) % 50);
    return {
      action: `Give it exactly ${secs} seconds, any way you like — then reassess.`,
      strategy: "timebox",
      size: ctx.size,
      note: null,
      reason: `barrier=${ctx.barrier ?? "none"} size=${ctx.size}/4 strategy=timebox (fresh fallback)`,
      confidence: 0.7,
      expectedEffort: EFFORT_LABELS[ctx.size],
      barrierKind: ctx.barrier === "unclear" || ctx.barrier === "overwhelmed" ? "task" : "starting",
    };
  }
  const winner = unshown[0].c;

  /* concise decision metadata — facts, not chain-of-thought */
  const topFactor =
    ctx.barrier && BARRIER_STRATEGIES[ctx.barrier][0] === winner.strategy
      ? `counters ${ctx.barrier}`
      : winner.source === "decompose"
        ? "scoped to this task's own shape"
        : `fits ${ctx.analysis.structure} best`;
  const reason = `barrier=${ctx.barrier ?? "none"} size=${ctx.size}/4 strategy=${winner.strategy} (${topFactor})`;

  return {
    action: winner.action,
    strategy: winner.strategy,
    size: ctx.size,
    note: null,
    reason,
    confidence: Math.round(Math.max(0.2, Math.min(0.95, unshown[0].score + 0.5)) * 100) / 100,
    expectedEffort: EFFORT_LABELS[ctx.size],
    barrierKind:
      ctx.barrier === "unclear" || ctx.barrier === "overwhelmed"
        ? "task"
        : ctx.barrier
          ? "starting"
          : ctx.analysis.ambiguity >= 0.55 || ctx.analysis.complexity >= 2
            ? "task"
            : "starting",
  };
}

/** Full pipeline for a draft: size → select → remember. */
export function nextStep(
  draft: Draft,
  profile: Profile | null,
  opts: { barrier?: Barrier | null; durationSec?: number | null; feedback?: FeedbackKind | null; avoidStrategy?: StrategyId | null; saltBump?: number; capacityEnergy?: number | null },
): Decision & { memory: EngineMemory } {
  const barrier = opts.barrier ?? draft.blocker;
  const size = sizeFor({
    analysis: draft.analysis,
    barrier,
    durationSec: opts.durationSec,
    profile,
    lastFeedback: opts.feedback ?? draft.lastFeedback,
    currentSize: draft.level,
    capacityEnergy: opts.capacityEnergy,
    alreadyStarted: draft.startedAt > 0,
    sizeTrack: draft.memory.sizeTrack,
  });
  const salt = draft.stepsDone * 3 + draft.rescues * 5 + draft.feedbacks * 11 + (opts.saltBump ?? 0);
  const res = selectStep({
    analysis: draft.analysis,
    barrier,
    size,
    memory: draft.memory,
    profile,
    salt,
    capacityEnergy: opts.capacityEnergy,
    avoidStrategy: opts.avoidStrategy,
  });

  /* update hysteresis track from the feedback that drove this step */
  const fb = opts.feedback ?? draft.lastFeedback;
  let track = draft.memory.sizeTrack;
  if (fb === "worked") {
    track = track.size === size ? { size, worked: track.worked + 1, failed: 0 } : { size, worked: 1, failed: 0 };
  } else if (fb === "tooBig" || fb === "stuck" || fb === "irrelevant") {
    track = track.size === size ? { size, worked: 0, failed: track.failed + 1 } : { size, worked: 0, failed: 1 };
  }

  const memory: EngineMemory = {
    ...remember(draft.memory, res.action, res.strategy),
    sizeTrack: track,
  };
  return { ...res, memory };
}

/* ---------------- dynamic preview ladder ---------------- */

/**
 * The Shrinker's "ladder" — generated on the fly: each rung is a
 * smaller size AND a different strategy, all specific to this
 * task, strictly descending toward the floor.
 */
export function previewSteps(draft: Draft, profile: Profile | null, count = 4): PreviewStep[] {
  if (draft.ladderOverride && draft.ladderOverride.length) {
    return draft.ladderOverride
      .filter((a) => passesGuardrails(a))
      .slice(0, count)
      .map((action, i) => ({ action, strategy: "direct", size: Math.min(4, draft.level + i) }));
  }
  const out: PreviewStep[] = [];
  let memory = draft.memory;
  const used = new Set<StrategyId>();
  for (let i = 0; i < count; i++) {
    const size = Math.min(4, draft.level + i);
    const salt = 100 + i * 17 + draft.stepsDone;
    /* every other rung is the task-scoped decomposition — guarantees a meaningful descent */
    if (i % 2 === 1) {
      const rung = decompose(draft.analysis, size);
      out.push({ action: rung, strategy: size >= 2 ? "tiny" : "direct", size });
      memory = remember(memory, rung, "tiny");
      continue;
    }
    const candidates = STRATEGIES.filter((d) => size >= d.sizes[0] && size <= d.sizes[1] + 1 && !used.has(d.id));
    const pool = candidates.length ? candidates : STRATEGIES.filter((d) => !used.has(d.id));
    const scored = pool
      .map((d) => ({
        id: d.id,
        score: scoreCandidate(
          {
            action: renderStrategy(d.id, draft.analysis, salt),
            strategy: d.id,
            size,
            costs: costsFor(d.id, draft.analysis, size, profile),
            source: "template",
          },
          {
            analysis: draft.analysis,
            barrier: draft.blocker,
            size,
            memory,
            profile,
            salt,
          },
        ),
      }))
      .sort((a, b) => b.score - a.score);
    const chosen = scored[0];
    let action = renderStrategy(chosen.id, draft.analysis, salt);
    let bump = 1;
    while (memory.shown.includes(normalizeAction(action)) || out.some((p) => p.action === action)) {
      action = renderStrategy(chosen.id, draft.analysis, salt + bump * 7);
      bump += 1;
      if (bump > 8) break;
    }
    used.add(chosen.id);
    memory = remember(memory, action, chosen.id);
    out.push({ action, strategy: chosen.id, size });
  }
  return out;
}
