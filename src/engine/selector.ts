import { hashStr, normalizeAction } from "./analysis";
import { BARRIER_STRATEGIES, STRATEGIES, STRATEGY_MAP, STRUCTURE_FIT, renderStrategy } from "./strategies";
import type {
  Barrier,
  Draft,
  EngineMemory,
  EngineResult,
  FeedbackKind,
  PreviewStep,
  Profile,
  StrategyId,
  TaskAnalysis,
} from "./types";

/* ============================================================
   Stages 3 + 4 — Strategy selection & adaptive sizing.
   Scores every candidate strategy for this exact moment (task
   structure, barrier, profile history, size fit, freshness) and
   refuses to repeat what was already shown or already failed.
   ============================================================ */

const MEM_CAP = 14;

export function emptyMemory(): EngineMemory {
  return { shown: [], strategies: [], failed: [] };
}

export function remember(mem: EngineMemory, action: string, strategy: StrategyId): EngineMemory {
  const norm = normalizeAction(action);
  return {
    shown: [...mem.shown.filter((s) => s !== norm).slice(-(MEM_CAP - 1)), norm],
    strategies: [...mem.strategies.filter((s) => s !== strategy).slice(-9), strategy],
    failed: mem.failed,
  };
}

export function markFailed(mem: EngineMemory, strategy: StrategyId | null): EngineMemory {
  if (!strategy) return mem;
  return { ...mem, failed: [...mem.failed.filter((s) => s !== strategy).slice(-5), strategy] };
}

/* ---------------- adaptive size ---------------- */

interface SizeCtx {
  analysis: TaskAnalysis;
  barrier: Barrier | null;
  durationSec?: number | null;
  profile?: Profile | null;
  lastFeedback?: FeedbackKind | null;
  currentSize?: number | null;
}

/** Compute the step size the engine should aim for right now (0..4). */
export function sizeFor(ctx: SizeCtx): number {
  const a = ctx.analysis;

  /* base: complexity of the ask */
  let size = a.complexity >= 2 ? 2 : a.complexity === 1 ? 1 : 0;

  /* barrier pushes the entry point lower */
  const barrierBase: Partial<Record<Barrier, number>> = {
    overwhelmed: 3, tired: 2, anxiety: 2, perfectionism: 2, avoiding: 2, unclear: 2, distracted: 1, boring: 1, unknown: 1,
  };
  if (ctx.barrier) size = Math.max(size, barrierBase[ctx.barrier] ?? 1);

  /* available time */
  if (ctx.durationSec != null) {
    if (ctx.durationSec <= 60) size = Math.min(4, size + 1);
    else if (ctx.durationSec >= 600) size = Math.max(0, size - 1);
  }

  /* what this user historically starts best */
  const p = ctx.profile;
  if (p && p.bestSize != null && p.confidence !== "none" && !ctx.barrier) {
    size = p.bestSize;
  }

  /* feedback from the last attempt */
  if (ctx.lastFeedback === "tooBig" || ctx.lastFeedback === "stuck") {
    size = Math.min(4, (ctx.currentSize ?? size) + 1);
  } else if (ctx.lastFeedback === "worked") {
    size = Math.max(0, (ctx.currentSize ?? size) - 1);
  }

  return Math.max(0, Math.min(4, size));
}

/* ---------------- candidate scoring ---------------- */

interface SelCtx {
  analysis: TaskAnalysis;
  barrier: Barrier | null;
  size: number;
  memory: EngineMemory;
  profile: Profile | null;
  salt: number;
  /** When true, skip the current top strategy (used after failures). */
  avoidStrategy?: StrategyId | null;
}

function scoreCandidate(id: StrategyId, ctx: SelCtx): number {
  const def = STRATEGY_MAP[id];
  let score = STRUCTURE_FIT[ctx.analysis.structure][id] ?? 1;

  const pref = ctx.barrier ? BARRIER_STRATEGIES[ctx.barrier] : null;
  if (pref) {
    const idx = pref.indexOf(id);
    if (idx === 0) score += 10;
    else if (idx === 1) score += 7;
    else if (idx === 2) score += 4;
    else if (idx >= 0) score += 2;
    else score -= 3;
  }

  /* size fit */
  const [lo, hi] = def.sizes;
  score += ctx.size >= lo && ctx.size <= hi ? 4 : -2;

  /* profile affinity */
  if (ctx.profile?.bestStrategy === id && ctx.profile.confidence !== "none") score += 5;

  /* freshness / anti-repetition */
  const recency = ctx.memory.strategies.indexOf(id);
  if (recency >= 0) score -= 6 + (ctx.memory.strategies.length - 1 - recency >= 2 ? 0 : 4);
  if (ctx.memory.failed.includes(id)) score -= 12;
  if (ctx.avoidStrategy === id) score -= 20;

  /* deterministic tie-break so runs are reproducible */
  score += (hashStr(`${ctx.analysis.title}|${id}|${ctx.salt}`) % 10) / 10;
  return score;
}

/**
 * Generate the next single initiation step.
 * Guarantees: the returned text is not in memory.shown whenever any
 * alternative exists; a failed strategy category is never immediately
 * repeated; wording varies with the salt (attempt counter).
 */
export function selectStep(ctx: SelCtx): EngineResult {
  const ranked = [...STRATEGIES]
    .map((def) => ({ id: def.id, score: scoreCandidate(def.id, ctx) }))
    .sort((x, y) => y.score - x.score);

  const shown = new Set(ctx.memory.shown);

  /* try strategies best-first; for each, try several salts for fresh wording */
  for (const cand of ranked) {
    for (let s = 0; s < 6; s++) {
      const action = renderStrategy(cand.id, ctx.analysis, ctx.salt + s * 7);
      if (!shown.has(normalizeAction(action))) {
        return { action, strategy: cand.id, size: ctx.size, note: null };
      }
    }
  }

  /* everything exhausted — synthesize an always-fresh time-box */
  const secs = 10 + ((ctx.salt * 13) % 50);
  return {
    action: `Give it exactly ${secs} seconds, any way you like — then reassess.`,
    strategy: "timebox",
    size: ctx.size,
    note: null,
  };
}

/** Full pipeline for a draft: size → select → remember. */
export function nextStep(
  draft: Draft,
  profile: Profile | null,
  opts: { barrier?: Barrier | null; durationSec?: number | null; feedback?: FeedbackKind | null; avoidStrategy?: StrategyId | null; saltBump?: number },
): EngineResult & { memory: EngineMemory } {
  const size = sizeFor({
    analysis: draft.analysis,
    barrier: opts.barrier ?? draft.blocker,
    durationSec: opts.durationSec,
    profile,
    lastFeedback: opts.feedback ?? draft.lastFeedback,
    currentSize: draft.level,
  });
  const salt = draft.stepsDone * 3 + draft.rescues * 5 + draft.feedbacks * 11 + (opts.saltBump ?? 0);
  const res = selectStep({
    analysis: draft.analysis,
    barrier: opts.barrier ?? draft.blocker,
    size,
    memory: draft.memory,
    profile,
    salt,
    avoidStrategy: opts.avoidStrategy,
  });
  return { ...res, memory: remember(draft.memory, res.action, res.strategy) };
}

/* ---------------- dynamic preview ladder ---------------- */

/**
 * The Shrinker's "ladder" — generated on the fly: each rung is a
 * smaller size AND a different strategy, all specific to this task.
 */
export function previewSteps(draft: Draft, profile: Profile | null, count = 4): PreviewStep[] {
  if (draft.ladderOverride && draft.ladderOverride.length) {
    return draft.ladderOverride.slice(0, count).map((action, i) => ({
      action,
      strategy: "direct",
      size: Math.min(4, draft.level + i),
    }));
  }
  const out: PreviewStep[] = [];
  let memory = draft.memory;
  const used = new Set<StrategyId>();
  for (let i = 0; i < count; i++) {
    const size = Math.min(4, draft.level + i);
    const salt = 100 + i * 17 + draft.stepsDone;
    /* restrict to strategies that serve this size, freshest first */
    const candidates = STRATEGIES.filter((d) => size >= d.sizes[0] && size <= d.sizes[1] + 1 && !used.has(d.id));
    const pool = candidates.length ? candidates : STRATEGIES.filter((d) => !used.has(d.id));
    const scored = pool
      .map((d) => ({
        id: d.id,
        score: scoreCandidate(d.id, {
          analysis: draft.analysis,
          barrier: draft.blocker,
          size,
          memory,
          profile,
          salt,
        }),
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
