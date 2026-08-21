import { clampLevel, diagnoseBarrier, estimateCapacity } from "./analysis";
import { markFailed, nextStep } from "./selector";
import { STRATEGY_LABEL } from "./strategies";
import type {
  Barrier,
  BarrierKind,
  Capacity,
  DecisionMeta,
  Draft,
  EngineMemory,
  FeedbackKind,
  Level,
  Profile,
  StuckReason,
  TaskAnalysis,
} from "./types";

/* ============================================================
   Orchestrator — runs the explicit reasoning pipeline:

   INPUT → NORMALIZE → CLASSIFY → COMPLEXITY → FRICTION
         → BARRIER HYPOTHESIS → CAPACITY → SIZE
         → CANDIDATES → SCORE → GUARDRAILS → DEDUPE
         → SELECT → EXPLAIN → (learn from result → profile)

   Stages 1–12 live in analysis/strategies/selector; stages
   15–16 in profile. This file adapts the pipeline's output to
   the app's moments: feedback, advance, rescue, recovery, and
   the very first plan. Feedback changes the STRATEGY, never
   merely the wording.
   ============================================================ */

export const LEVEL_LABELS = ["full size", "smaller", "tiny", "micro", "the floor"] as const;

const FEEDBACK_NOTES: Record<FeedbackKind, string> = {
  worked: "that worked — so we test slightly bigger",
  tooBig: "too big — dropping down a size",
  stuck: "still stuck — new angle, smaller step",
  irrelevant: "not the right move — different strategy",
};

interface PipelineOpts {
  barrier?: Barrier | null;
  durationSec?: number | null;
  feedback?: FeedbackKind | null;
  avoidStrategy?: Draft["strategy"];
  saltBump?: number;
  hour?: number;
}

/** Capacity estimate shared by every pipeline entry point. */
function capacityFor(draft: Draft, profile: Profile | null, opts: PipelineOpts): Capacity {
  const hour = opts.hour ?? new Date().getHours();
  return estimateCapacity(hour, opts.barrier ?? draft.blocker, profile?.momentum ?? "none");
}

function withDecision(
  res: { action: string; strategy: Draft["strategy"]; size: Level; note: string | null } & Partial<DecisionMeta> & { memory: EngineMemory },
): { override: string; level: Level; strategy: Draft["strategy"]; note: string | null; memory: EngineMemory; decision: DecisionMeta } {
  return {
    override: res.action,
    level: res.size,
    strategy: res.strategy,
    note: res.note,
    memory: res.memory,
    decision: {
      reason: res.reason ?? "engine-picked start",
      confidence: res.confidence ?? 0.6,
      expectedEffort: res.expectedEffort ?? "small",
      barrierKind: res.barrierKind ?? "starting",
    },
  };
}

/** Adapt after explicit feedback: returns the patch for a draft. */
export function adaptFromFeedback(
  draft: Draft,
  profile: Profile | null,
  kind: FeedbackKind,
): {
  override: string;
  level: Level;
  strategy: Draft["strategy"];
  note: string;
  memory: Draft["memory"];
  feedbacks: number;
  lastFeedback: FeedbackKind;
  decision: DecisionMeta;
} {
  /* a failed attempt poisons its strategy AND its exact action, so we genuinely rotate */
  const memory0 =
    kind === "stuck" || kind === "irrelevant" || kind === "tooBig"
      ? markFailed(draft.memory, draft.strategy, draft.override)
      : draft.memory;

  const base: Draft = {
    ...draft,
    memory: memory0,
    feedbacks: draft.feedbacks + 1,
    lastFeedback: kind,
    stepsDone: kind === "worked" ? draft.stepsDone + 1 : draft.stepsDone,
  };

  const capacity = capacityFor(base, profile, {});
  const res = nextStep(base, profile, {
    feedback: kind,
    avoidStrategy: kind === "irrelevant" || kind === "stuck" ? draft.strategy : null,
    capacityEnergy: capacity.energy,
  });

  return {
    ...withDecision({ ...res, note: `${FEEDBACK_NOTES[kind]} · ${STRATEGY_LABEL[res.strategy]}` }),
    note: `${FEEDBACK_NOTES[kind]} · ${STRATEGY_LABEL[res.strategy]}`,
    feedbacks: base.feedbacks,
    lastFeedback: kind,
  };
}

/** Advance after a successful step (the NEXT button / kept-going). */
export function advanceStep(
  draft: Draft,
  profile: Profile | null,
): { override: string; level: Level; strategy: Draft["strategy"]; memory: Draft["memory"]; stepsDone: number; decision: DecisionMeta } {
  const base: Draft = { ...draft, stepsDone: draft.stepsDone + 1, lastFeedback: "worked" };
  const capacity = capacityFor(base, profile, {});
  const res = nextStep(base, profile, { feedback: "worked", capacityEnergy: capacity.energy });
  return {
    override: res.action,
    level: res.size,
    strategy: res.strategy,
    memory: res.memory,
    stepsDone: base.stepsDone,
    decision: {
      reason: res.reason,
      confidence: res.confidence,
      expectedEffort: res.expectedEffort,
      barrierKind: res.barrierKind,
    },
  };
}

/* ---------------- barriers & rescue ---------------- */

const REASON_TO_BARRIER: Record<StuckReason, Barrier> = {
  "unknown-next": "unclear",
  "too-big": "overwhelmed",
  distracted: "distracted",
  tired: "tired",
  afraid: "anxiety",
  "lost-interest": "boring",
  "dont-want": "avoiding",
  "dont-know": "unknown",
};

export function reasonToBarrier(r: StuckReason): Barrier {
  return REASON_TO_BARRIER[r];
}

export interface Intervention {
  action: string;
  strategy: Draft["strategy"];
  size: Level;
  note: string | null;
  headline: string;
  memory: Draft["memory"];
  decision: DecisionMeta;
  /** True when the right move is the 60-second attention reset. */
  reset?: boolean;
}

const BARRIER_HEADLINES: Record<Barrier, string> = {
  overwhelmed: "Too big → we cut it down to one move.",
  unclear: "Unclear → we find the very first physical move.",
  boring: "Boring → we race it: short, loud, over fast.",
  perfectionism: "Perfect is the enemy → bad on purpose wins.",
  anxiety: "Anxiety → the bar goes to the floor. Bad is allowed.",
  distracted: "Distracted → a quick reset, then one tiny move.",
  tired: "Tired → minimum viable only. Then you're free.",
  avoiding: "Avoiding → we shrink the doorway until it fits.",
  unknown: "No name for it → tiny works even without a reason.",
};

const barrierKindOf = (b: Barrier): BarrierKind => (b === "unclear" || b === "overwhelmed" ? "task" : "starting");

/** Pick a barrier-aware intervention (changes the strategy, not just words). */
export function barrierIntervention(draft: Draft, barrier: Barrier, profile: Profile | null): Intervention {
  if (barrier === "distracted") {
    return {
      headline: BARRIER_HEADLINES.distracted,
      action: "",
      strategy: "physical",
      size: draft.level,
      note: null,
      memory: draft.memory,
      decision: {
        reason: "attention wandered → 60s reset before any action",
        confidence: 0.8,
        expectedEffort: "tiny",
        barrierKind: "starting",
      },
      reset: true,
    };
  }
  const base: Draft = {
    ...draft,
    blocker: barrier,
    memory: markFailed(draft.memory, draft.strategy, draft.override),
  };
  const capacity = capacityFor(base, profile, { barrier });
  const res = nextStep(base, profile, { barrier, avoidStrategy: draft.strategy, capacityEnergy: capacity.energy });
  return {
    action: res.action,
    strategy: res.strategy,
    size: res.size,
    note: null,
    headline: BARRIER_HEADLINES[barrier],
    memory: res.memory,
    decision: {
      reason: res.reason,
      confidence: res.confidence,
      expectedEffort: res.expectedEffort,
      barrierKind: barrierKindOf(barrier),
    },
  };
}

/** Rescue mode entry — a stuck reason becomes a barrier intervention. */
export function rescueIntervention(draft: Draft, reason: StuckReason, profile: Profile | null): Intervention {
  return barrierIntervention(draft, reasonToBarrier(reason), profile);
}

/* ---------------- recovery ---------------- */

/**
 * Stage 13b — recovery reasoning. When momentum broke, infer WHY:
 *   tooBig      → the action outran capacity: shrink one size.
 *   stuck       → wrong angle: different strategy, smaller step.
 *   irrelevant  → misread the task: new decomposition.
 *   drifted     → attention left: one-notch-smaller re-entry.
 * Recovery NEVER repeats the previous action and always hands back
 * the smallest NEXT action — the task is never restarted.
 */
export function buildRecoveryStrategy(
  draft: Draft,
  profile: Profile | null,
  why: FeedbackKind | "drifted" = "drifted",
): {
  override: string;
  level: Level;
  strategy: Draft["strategy"];
  memory: Draft["memory"];
  note: string;
  decision: DecisionMeta;
  feedbacks: number;
  lastFeedback: FeedbackKind;
} {
  const feedback: FeedbackKind = why === "drifted" ? "stuck" : why;
  const res = adaptFromFeedback(draft, profile, feedback);
  const notes: Record<string, string> = {
    tooBig: "recovery → one notch smaller",
    stuck: "recovery → different angle, smaller step",
    irrelevant: "recovery → re-read the task, fresh decomposition",
    drifted: "recovery → gentle re-entry, smaller than before",
  };
  return { ...res, note: notes[why] };
}

/* ---------------- planning ---------------- */

export interface PlanOpts {
  barrier?: Barrier | null;
  durationSec?: number | null;
  profile?: Profile | null;
  /** Extra shrink for anti-overwhelm / micro entries. */
  extraShrink?: number;
  hour?: number;
}

/**
 * Plan the single best first step for a fresh task.
 * Runs the full pipeline once: task understanding (already on the
 * analysis), barrier hypothesis when none was named, capacity,
 * size, candidates, scoring, guardrails, selection, explanation.
 */
export function planFirstStep(
  analysis: TaskAnalysis,
  opts: PlanOpts = {},
): { action: string; strategy: Draft["strategy"]; size: Level; note: string | null; memory: Draft["memory"]; decision: DecisionMeta } {
  const hypo = diagnoseBarrier(analysis, opts.barrier ?? null);
  const barrier = opts.barrier ?? (hypo.kind === "task" ? hypo.barrier : null);
  const hour = opts.hour ?? new Date().getHours();
  const capacity = estimateCapacity(hour, barrier, opts.profile?.momentum ?? "none");

  const draft: Draft = {
    title: analysis.title,
    analysis,
    level: 0,
    stepIndex: 0,
    stepsDone: 0,
    rescues: 0,
    feedbacks: 0,
    startedAt: 0,
    enteredAt: 0,
    sessionId: null,
    kind: "focus",
    override: null,
    strategy: null,
    note: null,
    ladderOverride: null,
    entry: "normal",
    blocker: barrier,
    lastFeedback: null,
    memory: {
      shown: [],
      shownIntents: [],
      strategies: [],
      failed: [],
      failedActions: [],
      sizeTrack: { size: null, worked: 0, failed: 0 },
    },
  };

  const res = nextStep(draft, opts.profile ?? null, {
    barrier,
    durationSec: opts.durationSec ?? null,
    capacityEnergy: capacity.energy,
    saltBump: 1,
  });

  const size = clampLevel(res.size + (opts.extraShrink ?? 0));
  if (size !== res.size) {
    /* re-roll at the forced size */
    const res2 = nextStep({ ...draft, level: size, memory: res.memory }, opts.profile ?? null, {
      barrier,
      durationSec: opts.durationSec ?? null,
      capacityEnergy: capacity.energy,
      saltBump: 2,
    });
    return {
      ...res2,
      size,
      decision: {
        reason: res2.reason,
        confidence: res2.confidence,
        expectedEffort: res2.expectedEffort,
        barrierKind: hypo.kind,
      },
    };
  }
  return {
    ...res,
    decision: {
      reason: `${res.reason}; ${hypo.reason}; capacity=${capacity.reason}`,
      confidence: res.confidence,
      expectedEffort: res.expectedEffort,
      barrierKind: hypo.kind,
    },
  };
}

/** The minimum viable version, phrased from the task's own words. */
export function minimumViable(a: TaskAnalysis): string {
  const o = a.object;
  switch (a.structure) {
    case "writing": return `One terrible paragraph of ${o}.`;
    case "cleaning": return `One surface clear — ${a.place ? `start at the ${a.place}` : "anywhere"}.`;
    case "learning": return `Open it. Read one paragraph. Close it if you must.`;
    case "communication": return a.person ? `One short message to ${a.person}. Two sentences.` : `One short reply. Two sentences.`;
    case "research": return `Read ONE source. Take one line of notes.`;
    case "deciding": return `Pick either option. Ten seconds. Reversible.`;
    case "creating": return `One mark, note or frame. Ugly on purpose.`;
    case "errand": return `Just get to the place or open the page. Nothing more.`;
    case "fixing": return `Reproduce the problem once. Don't fix it yet.`;
    case "organizing": return `One drawer, one folder, one pile. Done is done.`;
    case "prep": return `Lay out the two things you'll need. Stop there.`;
    case "project": return `Open it and find where you left off. That's the task.`;
    /* default stays concrete: always anchor to the object, never a bare
       "the first bit" (which once produced undefined 30-second steps) */
    default:
      return o && o !== "the task"
        ? `Do one tiny piece of ${o} for 30 seconds — one open, one touch, one line.`
        : `Open whatever this task lives in and touch it once. Stop after.`;
  }
}
