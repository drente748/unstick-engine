/* ============================================================
   Facade over the staged reasoning engine.

   normalize → classify → complexity → friction → barrier
   hypothesis → capacity → size → candidates → score →
   guardrails → dedupe → select → explain → learn → profile.

   Everything is deterministic and local-first; the remote AI
   provider below is strictly optional decoration.
   ============================================================ */

export {
  analyzeTask,
  classifyTask,
  diagnoseBarrier,
  estimateCapacity,
  hashStr,
  normalizeAction,
  normalizeTask,
  pick,
  tokenize,
} from "./analysis";
export { computeProfile, durationLabel, emptyProfile, learnFromOutcome, secondsLabel, updateProfile } from "./profile";
export {
  LEVEL_LABELS,
  adaptFromFeedback,
  advanceStep,
  barrierIntervention,
  buildRecoveryStrategy,
  minimumViable,
  planFirstStep,
  reasonToBarrier,
  rescueIntervention,
  type Intervention,
  type PlanOpts,
} from "./engine";
export { emptyMemory, nextStep, passesGuardrails, previewSteps, selectStep, sizeFor } from "./selector";
export {
  BARRIER_STRATEGIES,
  STRATEGIES,
  STRATEGY_LABEL,
  STRATEGY_MAP,
  decompose,
  renderStrategy,
} from "./strategies";

import { analyzeTask } from "./analysis";
import { emptyMemory, nextStep, passesGuardrails } from "./selector";
import { buildRecoveryStrategy, planFirstStep } from "./engine";
import { computeProfile } from "./profile";
import type { Barrier, Draft, Outcome, SessionRecord, StrategyId } from "./types";

/** The nine named blockers offered in the state check. */
export const BLOCKERS: Array<{ v: Barrier; label: string; icon: string; hint: string }> = [
  { v: "overwhelmed", label: "It feels too big", icon: "mountain", hint: "→ we shrink it to one move" },
  { v: "unclear", label: "It's unclear — I don't see the first move", icon: "fog", hint: "→ we find the first physical move" },
  { v: "boring", label: "It's boring", icon: "zzz", hint: "→ we make it a short race" },
  { v: "perfectionism", label: "I want to do it perfectly", icon: "eye", hint: "→ bad on purpose is the plan" },
  { v: "anxiety", label: "I'm anxious I'll do it wrong", icon: "heart", hint: "→ the worst acceptable version" },
  { v: "distracted", label: "My attention keeps wandering", icon: "loop", hint: "→ a 60-second reset" },
  { v: "tired", label: "I'm tired", icon: "battery", hint: "→ minimum viable only" },
  { v: "avoiding", label: "I keep avoiding it", icon: "door", hint: "→ we shrink the doorway" },
  { v: "unknown", label: "I honestly don't know", icon: "question", hint: "→ tiny works without a reason" },
];

export const BLOCKER_LABEL: Record<Barrier, string> = {
  overwhelmed: "the size of it",
  unclear: "not seeing the first move",
  boring: "the boredom",
  perfectionism: "the need to do it perfectly",
  anxiety: "the fear of doing it wrong",
  distracted: "a wandering attention",
  tired: "being tired",
  avoiding: "the avoiding",
  unknown: "the nameless block",
};

/* ---------------- optional remote AI provider ---------------- */

/**
 * The app never depends on this. Any failure returns null and the
 * local engine takes over with a gentle notice — users never see
 * a raw error.
 */
export async function tryRemoteEngine(endpoint: string, task: string): Promise<string[] | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const steps =
      data && typeof data === "object" && Array.isArray((data as { steps?: unknown }).steps)
        ? (data as { steps: unknown[] }).steps.filter((s): s is string => typeof s === "string").slice(0, 6)
        : null;
    return steps && steps.length > 0 ? steps : null;
  } catch {
    return null;
  }
}

/* ---------------- reasoning-system tests ----------------
   Pure & deterministic: no console, no React, no network.
   Covers the 14 required scenarios plus structural invariants.
   `runEngineSelfTest` logs the report in development.
   ---------------------------------------------------------- */

export interface TestResult {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface TestReport {
  pass: number;
  fail: number;
  results: TestResult[];
}

function fakeDraft(title: string, patch: Partial<Draft> = {}): Draft {
  return {
    title,
    analysis: analyzeTask(title),
    level: 1,
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
    blocker: null,
    lastFeedback: null,
    memory: emptyMemory(),
    ...patch,
  };
}

function fakeSession(i: number, patch: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: `t${i}`,
    title: null,
    structure: "writing",
    kind: "focus",
    startedAt: i,
    endedAt: i + 60,
    seconds: 60,
    steps: 1,
    rescues: 0,
    outcome: "kept" as Outcome,
    size: 2,
    duration: 300,
    entry: "normal",
    barrier: null,
    strategy: "tiny" as StrategyId,
    timeToStart: 30,
    ...patch,
  };
}

const DIVERSE_TASKS = [
  "clean the whole apartment",
  "write a complete blog article",
  "do my taxes",
  "reply to my emails",
  "study for my chemistry exam",
  "call the dentist about Thursday",
  "fix the leaking kitchen tap",
  "start learning the guitar",
  "declutter the garage and sell old stuff",
  "decide whether to quit my job",
  "renew my passport before the trip",
  "finish the quarterly report and email it to my boss",
  "organize all my photos from the last ten years",
  "prepare a surprise birthday party for my sister",
  "research which standing desk to buy",
  "untangle the cables behind my desk",
  "knit a scarf for winter",
  "figure out this weird error in my codebase",
  "something vague about my life",
  "rehearse my wedding speech",
];

export function runEngineTests(): TestReport {
  const results: TestResult[] = [];
  const check = (name: string, pass: boolean, detail?: string) => results.push({ name, pass, detail });

  /* 1 — simple task: bounded, low decomposition */
  {
    const a = analyzeTask("reply to John's email");
    check("1. simple task understood", a.complexity <= 1 && a.actionCount === 0 && a.object.includes("email"), `complexity=${a.complexity}`);
  }

  /* 2 — huge task: detected as big, planned small */
  {
    const a = analyzeTask("clean my entire apartment");
    const plan = planFirstStep(a, { hour: 10 });
    check("2. huge task → small plan", a.complexity >= 2 && a.scopeWord != null && plan.size >= 2, `size=${plan.size}`);
  }

  /* 3 — ambiguous task: high ambiguity, task-side hypothesis */
  {
    const a = analyzeTask("sort out stuff about my life somehow");
    check("3. ambiguous task flagged", a.ambiguity >= 0.5, `ambiguity=${a.ambiguity.toFixed(2)}`);
  }

  /* 4 — low-energy scenario: tired → small entry, no big asks */
  {
    const d = fakeDraft("write the report");
    const res = nextStep(d, null, { barrier: "tired", capacityEnergy: 0.3 });
    check("4. low energy → small step", res.size >= 2, `size=${res.size}`);
  }

  /* 5 — repeated failure: five "stuck" never reproduce an action */
  {
    let draft = fakeDraft("do my taxes");
    const seen = new Set<string>();
    let repeats = 0;
    for (let i = 0; i < 5; i++) {
      const res = nextStep(draft, null, { feedback: "stuck", avoidStrategy: draft.strategy });
      const k = res.action.toLowerCase();
      if (seen.has(k)) repeats += 1;
      seen.add(k);
      draft = { ...draft, ...res, level: res.size, feedbacks: i + 1, lastFeedback: "stuck" };
    }
    check("5. repeated failure stays fresh", repeats === 0, `repeats=${repeats}`);
  }

  /* 6 — repeated success: two wins at a size test a bigger step */
  {
    let draft = fakeDraft("study for the exam", { level: 3 });
    const r1 = nextStep(draft, null, { feedback: "worked" });
    draft = { ...draft, ...r1, level: r1.size, lastFeedback: "worked" };
    const r2 = nextStep(draft, null, { feedback: "worked" });
    check("6. repeated success grows step", r2.size <= 2, `size=${r2.size}`);
  }

  /* 7 — unknown user: no profile, still a confident concrete action */
  {
    const plan = planFirstStep(analyzeTask("water the plants and feed the cat"), { hour: 10 });
    check("7. unknown user handled", plan.action.length > 10 && plan.decision.confidence > 0.2, plan.decision.reason);
  }

  /* 8 — experienced user: history pulls size toward the proven one */
  {
    const sessions = Array.from({ length: 12 }, (_, i) =>
      fakeSession(i, { size: i % 3 === 0 ? 3 : 2, outcome: i % 4 === 3 ? "stopped" : "kept" }),
    );
    const profile = computeProfile(sessions);
    const plan = planFirstStep(analyzeTask("write a blog post"), { profile, hour: 10 });
    check(
      "8. experienced user personalized",
      profile.confidence === "stable" && profile.bestSize === 2 && Math.abs(plan.size - 2) <= 1,
      `best=${profile.bestSize} plan=${plan.size}`,
    );
  }

  /* 9 — duplicate candidates: shown actions are never re-served */
  {
    let draft = fakeDraft("clean the kitchen");
    let dup = false;
    for (let i = 0; i < 8; i++) {
      const res = nextStep(draft, null, {});
      if (draft.memory.shown.includes(res.action.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim()) && i > 0) dup = true;
      draft = { ...draft, ...res, level: res.size, memory: res.memory };
    }
    check("9. no duplicate candidates", !dup);
  }

  /* 10 — recovery after failure: new strategy, new action */
  {
    const before = nextStep(fakeDraft("plan the move"), null, {});
    const draft = fakeDraft("plan the move", { strategy: before.strategy, override: before.action, level: before.size });
    const rec = buildRecoveryStrategy(draft, null, "stuck");
    check(
      "10. recovery changes strategy",
      rec.strategy !== before.strategy && rec.override.toLowerCase() !== before.action.toLowerCase(),
      `${before.strategy} → ${rec.strategy}`,
    );
  }

  /* 11 — dynamic level adjustment: tooBig shrinks, bounds respected */
  {
    const d = fakeDraft("renovate the bathroom", { level: 2 });
    const r = nextStep(d, null, { feedback: "tooBig" });
    check("11. feedback adapts size", r.size === 3, `size=${r.size}`);
    const floor = nextStep(fakeDraft("x", { level: 4 }), null, { feedback: "tooBig" });
    check("11b. size bounds respected", floor.size <= 4 && floor.size >= 0);
  }

  /* 12 — time-to-start learning: slow starters get a smaller doorway */
  {
    const slow = Array.from({ length: 6 }, (_, i) => fakeSession(i, { timeToStart: 240, outcome: i % 2 ? "kept" : "stopped" }));
    const fast = Array.from({ length: 6 }, (_, i) => fakeSession(i, { timeToStart: 20, outcome: i % 2 ? "kept" : "stopped" }));
    const ps = computeProfile(slow);
    const pf = computeProfile(fast);
    const a = analyzeTask("file the paperwork");
    const sizeSlow = planFirstStep(a, { profile: ps, hour: 10 }).size;
    const sizeFast = planFirstStep(a, { profile: pf, hour: 10 }).size;
    check("12. time-to-start is evidence", sizeSlow >= sizeFast, `slow=${sizeSlow} fast=${sizeFast}`);
  }

  /* 13 — different domains: structure spreads, first steps vary */
  {
    const structures = new Set(DIVERSE_TASKS.map((t) => analyzeTask(t).structure));
    const plans = new Set(DIVERSE_TASKS.map((t) => planFirstStep(analyzeTask(t), { hour: 10 }).action));
    check("13a. structure detection spreads", structures.size >= 8, `${structures.size} structures`);
    check("13b. first steps are task-specific", plans.size >= DIVERSE_TASKS.length - 3, `${plans.size}/${DIVERSE_TASKS.length} unique`);
  }

  /* 14 — different barriers: genuinely different interventions */
  {
    const barriers: Barrier[] = ["overwhelmed", "unclear", "boring", "perfectionism", "anxiety", "distracted", "tired", "avoiding", "unknown"];
    const d = fakeDraft("start the project");
    const strategies = new Set<StrategyId>();
    const actions = new Set<string>();
    for (const b of barriers) {
      if (b === "distracted") continue;
      const res = nextStep(d, null, { barrier: b });
      strategies.add(res.strategy);
      actions.add(res.action.toLowerCase());
    }
    check("14a. barriers change strategy", strategies.size >= 5, `${strategies.size} distinct strategies`);
    check("14b. barriers change the action", actions.size >= 6, `${actions.size} distinct actions`);
  }

  /* invariants — across many tasks and iterations */
  {
    let emptyAction = false;
    let guardrailFail = false;
    let outOfBounds = false;
    let nonDeterministic = false;
    for (const t of DIVERSE_TASKS) {
      const a = analyzeTask(t);
      const p1 = planFirstStep(a, { hour: 10 });
      const p2 = planFirstStep(a, { hour: 10 });
      if (p1.action !== p2.action) nonDeterministic = true;
      let draft = fakeDraft(t);
      for (let i = 0; i < 6; i++) {
        const res = nextStep(draft, null, { feedback: i % 2 ? "stuck" : "worked" });
        if (!res.action.trim()) emptyAction = true;
        if (!passesGuardrails(res.action)) guardrailFail = true;
        if (res.size < 0 || res.size > 4) outOfBounds = true;
        draft = { ...draft, ...res, level: res.size, memory: res.memory, feedbacks: i + 1 };
      }
    }
    check("INV. actions never empty", !emptyAction);
    check("INV. actions pass guardrails", !guardrailFail);
    check("INV. size stays in bounds", !outOfBounds);
    check("INV. deterministic outputs", !nonDeterministic);

    /* learning must not explode after one event */
    const one = computeProfile([fakeSession(0)]);
    check("INV. one event ≠ conclusion", one.confidence !== "stable" && one.confidence !== "emerging" && one.bestSize === null);
    const none = computeProfile([]);
    check("INV. empty profile valid", none.confidence === "none" && none.starts === 0 && none.momentum === "none");
  }

  const pass = results.filter((r) => r.pass).length;
  return { pass, fail: results.length - pass, results };
}

/** Dev-only console report of the reasoning-system tests. */
export function runEngineSelfTest(): void {
  if (typeof window === "undefined") return;
  queueMicrotask(() => {
    const report = runEngineTests();
    const ok = report.fail === 0;
    console.groupCollapsed(
      `%cunstick engine tests — ${report.pass}/${report.pass + report.fail} passed`,
      `font-weight:bold;color:${ok ? "#52c08f" : "#f09a85"}`,
    );
    console.table(report.results.map((r) => ({ test: r.name, ok: r.pass ? "✓" : "✗", detail: r.detail ?? "" })));
    console.groupEnd();
  });
}
