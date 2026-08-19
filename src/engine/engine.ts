import { markFailed, nextStep } from "./selector";
import { STRATEGY_LABEL } from "./strategies";
import type {
  Barrier,
  Draft,
  EngineResult,
  FeedbackKind,
  Profile,
  StuckReason,
  TaskAnalysis,
} from "./types";

/* ============================================================
   Stage 5 — Orchestration: feedback adaptation, barrier-driven
   interventions, rescue mapping and first-step planning.
   Feedback changes the STRATEGY, not merely the wording.
   ============================================================ */

export const LEVEL_LABELS = ["full size", "smaller", "tiny", "micro", "the floor"] as const;

const FEEDBACK_NOTES: Record<FeedbackKind, string> = {
  worked: "that worked — so we go slightly bigger",
  tooBig: "too big — dropping down a size",
  stuck: "still stuck — new angle, smaller step",
  irrelevant: "not the right move — different strategy",
};

/** Adapt after explicit feedback: returns the patch for a draft. */
export function adaptFromFeedback(
  draft: Draft,
  profile: Profile | null,
  kind: FeedbackKind,
): { override: string; level: number; strategy: Draft["strategy"]; note: string; memory: Draft["memory"]; feedbacks: number; lastFeedback: FeedbackKind } {
  /* a failed attempt poisons its strategy so we genuinely rotate */
  const memory0 =
    kind === "stuck" || kind === "irrelevant" || kind === "tooBig"
      ? markFailed(draft.memory, draft.strategy)
      : draft.memory;

  const base: Draft = {
    ...draft,
    memory: memory0,
    feedbacks: draft.feedbacks + 1,
    lastFeedback: kind,
    stepsDone: kind === "worked" ? draft.stepsDone + 1 : draft.stepsDone,
  };

  const res = nextStep(base, profile, {
    feedback: kind,
    avoidStrategy: kind === "irrelevant" || kind === "stuck" ? draft.strategy : null,
  });

  return {
    override: res.action,
    level: res.size,
    strategy: res.strategy,
    note: `${FEEDBACK_NOTES[kind]} · ${STRATEGY_LABEL[res.strategy]}`,
    memory: res.memory,
    feedbacks: base.feedbacks,
    lastFeedback: kind,
  };
}

/** Advance after a successful step (the NEXT button / kept-going). */
export function advanceStep(draft: Draft, profile: Profile | null): { override: string; level: number; strategy: Draft["strategy"]; memory: Draft["memory"]; stepsDone: number } {
  const base: Draft = { ...draft, stepsDone: draft.stepsDone + 1, lastFeedback: "worked" };
  const res = nextStep(base, profile, { feedback: "worked" });
  return { override: res.action, level: res.size, strategy: res.strategy, memory: res.memory, stepsDone: base.stepsDone };
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

export interface Intervention extends EngineResult {
  headline: string;
  memory: Draft["memory"];
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
      reset: true,
    };
  }
  const base: Draft = {
    ...draft,
    blocker: barrier,
    memory: markFailed(draft.memory, draft.strategy),
  };
  const res = nextStep(base, profile, { barrier, avoidStrategy: draft.strategy });
  return { ...res, headline: BARRIER_HEADLINES[barrier] };
}

/** Rescue mode entry — a stuck reason becomes a barrier intervention. */
export function rescueIntervention(draft: Draft, reason: StuckReason, profile: Profile | null): Intervention {
  return barrierIntervention(draft, reasonToBarrier(reason), profile);
}

/* ---------------- planning ---------------- */

export interface PlanOpts {
  barrier?: Barrier | null;
  durationSec?: number | null;
  profile?: Profile | null;
  /** Extra shrink for anti-overwhelm / micro entries. */
  extraShrink?: number;
}

/** Plan the single best first step for a fresh task. */
export function planFirstStep(analysis: TaskAnalysis, opts: PlanOpts = {}): EngineResult & { memory: Draft["memory"] } {
  const draft: Draft = {
    title: analysis.title,
    analysis,
    level: 0,
    stepIndex: 0,
    stepsDone: 0,
    rescues: 0,
    feedbacks: 0,
    startedAt: 0,
    enteredAt: Date.now(),
    sessionId: null,
    kind: "focus",
    override: null,
    strategy: null,
    note: null,
    ladderOverride: null,
    entry: "normal",
    blocker: opts.barrier ?? null,
    lastFeedback: null,
    memory: { shown: [], strategies: [], failed: [] },
  };
  const res = nextStep(draft, opts.profile ?? null, {
    barrier: opts.barrier ?? null,
    durationSec: opts.durationSec ?? null,
    saltBump: 1,
  });
  let size = res.size + (opts.extraShrink ?? 0);
  size = Math.max(0, Math.min(4, size));
  if (size !== res.size) {
    /* re-roll at the forced size */
    const res2 = nextStep({ ...draft, level: size, memory: res.memory }, opts.profile ?? null, {
      barrier: opts.barrier ?? null,
      durationSec: opts.durationSec ?? null,
      saltBump: 2,
    });
    return { ...res2, size };
  }
  return res;
}

/** The minimum viable version, phrased from the task's own words. */
export function minimumViable(a: TaskAnalysis): string {
  const o = a.object;
  const v = a.verbPhrase ?? "the first bit";
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
    default: return `Do ${v} for 30 seconds. Stop after.`;
  }
}
