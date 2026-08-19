/* ============================================================
   Facade over the staged engine + the test suite.

   Pipeline: analysis (understand) → strategies (compatible
   generation) → selector (size / score / guardrails / dedupe) →
   engine (adapt / rescue / recover / plan) → profile (learn).

   Everything is deterministic and local-first; the remote AI
   provider below is strictly optional decoration, and anything it
   returns is validated by the same guardrails as local output.
   ============================================================ */

export {
  analyzeTask,
  classifyMedium,
  classifyTask,
  clampLevel,
  diagnoseBarrier,
  estimateCapacity,
  hashStr,
  intentKey,
  normalizeAction,
  normalizeTask,
  pick,
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
} from "./engine";
export {
  emptyMemory,
  markFailed,
  nextStep,
  passesGuardrails,
  previewSteps,
  remember,
  selectStep,
  sizeFor,
  wasShown,
} from "./selector";
export {
  BARRIER_STRATEGIES,
  STRATEGIES,
  STRATEGY_LABEL,
  STRATEGY_MAP,
  compatibleTemplates,
  decompose,
  renderStrategy,
  strategyFitsTask,
} from "./strategies";

import { analyzeTask, clampLevel, intentKey } from "./analysis";
import { adaptFromFeedback as adaptLocal, barrierIntervention, buildRecoveryStrategy, planFirstStep } from "./engine";
import { emptyMemory, nextStep, passesGuardrails, previewSteps, sizeFor } from "./selector";
import type { Barrier, Draft, Level, Outcome, Profile, SessionRecord, StrategyId, TaskAnalysis } from "./types";
import { computeProfile } from "./profile";

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
 * a raw error. Returned steps are later validated by the same
 * guardrails + dedupe as locally generated ones.
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

/* ============================================================
   ENGINE TEST SUITE — pure, deterministic, no console/network.
   Runs in dev via runEngineSelfTest (and can be asserted on by
   any future test runner). Covers the observed regression and
   the whole equivalence class around it.
   ============================================================ */

export interface TestFailure {
  test: string;
  detail: string;
}
export interface TestResults {
  pass: number;
  failures: TestFailure[];
}

/** Phrases that must never appear for screen-based tasks. */
const BANNED_FOR_DIGITAL = [
  "stand up",
  "walk to",
  "clear a hand",
  "spot where",
  "where it happens",
  "face the mess",
  "sit down at the spot",
];
/** Phrases that must never appear for body/space-based tasks. */
const BANNED_FOR_PHYSICAL = ["cursor", "the app or file for it", "close every tab", "which app"];

const validLevel = (n: unknown): n is Level =>
  typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 4;

function freshDraft(title: string, barrier: Barrier | null = null): Draft {
  const analysis = analyzeTask(title);
  return {
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
    memory: emptyMemory(),
  };
}

function session(
  i: number,
  size: Level,
  outcome: Outcome,
  over: Partial<SessionRecord> = {},
): SessionRecord {
  return {
    id: `s${i}`,
    title: null,
    structure: "cleaning",
    kind: "focus",
    startedAt: 1_700_000_000_000 + i * 60_000,
    endedAt: 1_700_000_000_000 + i * 60_000 + 300_000,
    seconds: 300,
    steps: 2,
    rescues: 0,
    outcome,
    size,
    duration: 600,
    entry: "normal",
    barrier: null,
    strategy: "tiny",
    timeToStart: 20,
    ...over,
  };
}

export function runEngineTests(): TestResults {
  const failures: TestFailure[] = [];
  let pass = 0;
  const ok = (cond: boolean, test: string, detail: string) => {
    if (cond) pass += 1;
    else failures.push({ test, detail });
  };

  /* global invariant collectors — every emitted action/level is checked at the end */
  const allActions: string[] = [];
  const allLevels: unknown[] = [];
  const emit = (action: string, level: unknown) => {
    allActions.push(action);
    allLevels.push(level);
  };
  const leaks = (text: string, banned: string[]) => banned.filter((b) => text.toLowerCase().includes(b));

  /* ---------- 1 · the observed regression: email + overwhelmed ---------- */
  {
    const title = "Reply to John's email";
    const a = analyzeTask(title);
    ok(a.medium === "digital", "observed/medium-digital", `got ${a.medium}`);

    const plan = planFirstStep(a, { barrier: "overwhelmed" });
    ok(validLevel(plan.size), "observed/plan-level", `got ${String(plan.size)}`);
    ok(plan.action.trim().length > 0, "observed/plan-nonempty", plan.action);
    ok(leaks(plan.action, BANNED_FOR_DIGITAL).length === 0, "observed/plan-no-physical", plan.action);
    emit(plan.action, plan.size);

    const d0 = freshDraft(title, "overwhelmed");
    const iv = barrierIntervention({ ...d0, level: plan.size }, "overwhelmed", null);
    ok(validLevel(iv.size), "observed/intervention-level", `got ${String(iv.size)}`);
    ok(leaks(iv.action, BANNED_FOR_DIGITAL).length === 0, "observed/intervention-no-physical", iv.action);
    emit(iv.action, iv.size);

    const d1: Draft = { ...d0, level: plan.size, override: plan.action, strategy: plan.strategy, memory: plan.memory };
    const ladder = previewSteps(d1, null, 4);
    ok(ladder.length >= 3, "observed/ladder-length", `${ladder.length}`);
    const intents = ladder.map((r) => intentKey(r.action));
    ok(
      new Set(intents).size === ladder.length,
      "observed/ladder-no-duplicates",
      ladder.map((r) => r.action).join(" || "),
    );
    for (const r of ladder) {
      ok(validLevel(r.size), "observed/rung-level", `got ${String(r.size)} for “${r.action}”`);
      ok(leaks(r.action, BANNED_FOR_DIGITAL).length === 0, "observed/rung-no-physical", r.action);
      emit(r.action, r.size);
    }
  }

  /* ---------- 2–6 · equivalence classes across media ---------- */
  const classes: Array<{ title: string; medium: string; banned: string[] }> = [
    { title: "Message the team about tomorrow", medium: "digital", banned: BANNED_FOR_DIGITAL },
    { title: "fix this weird error in my codebase", medium: "digital", banned: BANNED_FOR_DIGITAL },
    { title: "clean my room", medium: "physical", banned: BANNED_FOR_PHYSICAL },
    { title: "organize the kitchen drawers", medium: "physical", banned: BANNED_FOR_PHYSICAL },
    { title: "declutter the garage and sell old stuff online", medium: "mixed", banned: [] },
    { title: "deal with that thing somehow", medium: "unknown", banned: ["spot where", "where it happens"] },
  ];
  for (const c of classes) {
    const tag = c.title.slice(0, 24);
    const a = analyzeTask(c.title);
    ok(a.medium === c.medium, `class/${tag}/medium`, `want ${c.medium}, got ${a.medium}`);
    const plan = planFirstStep(a, {});
    ok(validLevel(plan.size), `class/${tag}/level`, String(plan.size));
    ok(passesGuardrails(plan.action), `class/${tag}/guardrails`, plan.action);
    ok(leaks(plan.action, c.banned).length === 0, `class/${tag}/compatible`, plan.action);
    emit(plan.action, plan.size);
    const ladder = previewSteps({ ...freshDraft(c.title), level: plan.size }, null, 4);
    const intents = ladder.map((r) => intentKey(r.action));
    ok(new Set(intents).size === ladder.length, `class/${tag}/ladder-distinct`, ladder.map((r) => r.action).join(" || "));
    for (const r of ladder) {
      ok(validLevel(r.size), `class/${tag}/rung-level`, `${String(r.size)} · ${r.action}`);
      ok(leaks(r.action, c.banned).length === 0, `class/${tag}/rung-compatible`, r.action);
      emit(r.action, r.size);
    }
  }

  /* ---------- 7 · recovery after failure (digital task stays digital) ---------- */
  {
    const d = freshDraft("Reply to John's email");
    const p1 = planFirstStep(d.analysis, {});
    const draft: Draft = { ...d, level: p1.size, override: p1.action, strategy: p1.strategy, memory: p1.memory };
    const rec = buildRecoveryStrategy(draft, null, "stuck");
    ok(validLevel(rec.level), "recovery/level", String(rec.level));
    ok(passesGuardrails(rec.override), "recovery/guardrails", rec.override);
    ok(intentKey(rec.override) !== intentKey(draft.override ?? ""), "recovery/distinct", rec.override);
    ok(leaks(rec.override, BANNED_FOR_DIGITAL).length === 0, "recovery/compatible", rec.override);
    emit(rec.override, rec.level);
  }

  /* ---------- 8 · exhausted pool / repeated failure: fresh every time ---------- */
  {
    let draft = freshDraft("write a blog article");
    const seen = new Set<string>();
    const strategies = new Set<StrategyId | null>();
    for (let i = 0; i < 12; i++) {
      const res = nextStep(draft, null, { feedback: "stuck", avoidStrategy: draft.strategy });
      const k = intentKey(res.action);
      ok(!seen.has(k), "exhausted/no-repeat", res.action);
      ok(passesGuardrails(res.action), "exhausted/guardrails", res.action);
      ok(validLevel(res.size), "exhausted/level", String(res.size));
      seen.add(k);
      strategies.add(res.strategy);
      emit(res.action, res.size);
      draft = {
        ...draft,
        ...res,
        override: res.action,
        strategy: res.strategy,
        level: res.size,
        memory: res.memory,
        feedbacks: i + 1,
        lastFeedback: "stuck",
      };
    }
    ok(strategies.size >= 3, "exhausted/rotates-strategies", `${strategies.size} distinct`);
  }

  /* ---------- 9 · ladder wording variants stay distinct ---------- */
  {
    const t = "study for my chemistry exam";
    const a = analyzeTask(t);
    const ladderA = previewSteps({ ...freshDraft(t), level: 0 }, null, 4);
    const ladderB = previewSteps({ ...freshDraft(t), level: 0, stepsDone: 5 }, null, 4);
    for (const [name, ladder] of [["A", ladderA], ["B", ladderB]] as const) {
      const intents = ladder.map((r) => intentKey(r.action));
      ok(new Set(intents).size === ladder.length, `variants/${name}/distinct`, ladder.map((r) => r.action).join(" || "));
      ladder.forEach((r) => emit(r.action, r.size));
    }
    const same = ladderA.filter((r, i) => intentKey(r.action) === intentKey(ladderB[i]?.action ?? "∅")).length;
    ok(same < ladderA.length, "variants/salt-changes-wording", `${same}/${ladderA.length} identical`);
  }

  /* ---------- 10 · hysteresis: wins shrink gradually, failures shrink at once ---------- */
  {
    const d = freshDraft("clean my entire apartment");
    ok(d.analysis.complexity >= 2, "hysteresis/complexity", `${d.analysis.complexity}`);
    const dAt2: Draft = { ...d, level: 2 };
    const w1 = adaptLocal(dAt2, null, "worked");
    ok(w1.level === 2, "hysteresis/first-win-holds", String(w1.level));
    const d2: Draft = { ...dAt2, override: w1.override, strategy: w1.strategy, memory: w1.memory, level: w1.level, feedbacks: w1.feedbacks, lastFeedback: w1.lastFeedback };
    const w2 = adaptLocal(d2, null, "worked");
    ok(w2.level === 1, "hysteresis/second-win-shrinks", String(w2.level));
    const f1 = adaptLocal({ ...d, level: 2 }, null, "tooBig");
    ok(f1.level === 3, "hysteresis/failure-shrinks-now", String(f1.level));
  }

  /* ---------- 11 · sizeFor unit behavior ---------- */
  {
    const a = analyzeTask("do my taxes");
    const grow = sizeFor({ analysis: a, barrier: null, lastFeedback: "tooBig", currentSize: 2, sizeTrack: { size: 2, worked: 0, failed: 0 } });
    ok(grow === 3, "sizeFor/failure-grows-size-number", String(grow));
    const shrink = sizeFor({ analysis: a, barrier: null, lastFeedback: "worked", currentSize: 2, sizeTrack: { size: 2, worked: 1, failed: 0 } });
    ok(shrink === 1, "sizeFor/streak-shrinks", String(shrink));
    const hold = sizeFor({ analysis: a, barrier: null, lastFeedback: "worked", currentSize: 2, sizeTrack: { size: 2, worked: 0, failed: 0 } });
    ok(hold === 2, "sizeFor/single-win-holds", String(hold));
  }

  /* ---------- 12 · unknown vs experienced user ---------- */
  {
    const plan = planFirstStep(analyzeTask("water the plants"), { profile: null });
    ok(validLevel(plan.size) && plan.action.length > 0, "unknown-user/works", plan.action);

    const sessions = Array.from({ length: 8 }, (_, i) => session(i, 3, i < 6 ? "kept" : "stopped"));
    const prof = computeProfile(sessions);
    ok(prof.bestSize === 3, "experienced/bestSize", String(prof.bestSize));
    ok(prof.confidence === "emerging" || prof.confidence === "stable", "experienced/confidence", prof.confidence);
    const plan2 = planFirstStep(analyzeTask("water the plants"), { profile: prof });
    ok(plan2.size <= 1, "experienced/one-step-toward", String(plan2.size));
    emit(plan2.action, plan2.size);
  }

  /* ---------- 13 · time-to-start as evidence ---------- */
  {
    const base: Profile = {
      starts: 5, kept: 4, bestSize: null, bestDuration: null, bestStrategy: null, commonBarrier: null,
      repeatedBarriers: [], avgTimeToStart: 30, momentum: "none", recoveryRate: null, rates: null, confidence: "low",
    };
    const a = analyzeTask("do my taxes");
    const fast = sizeFor({ analysis: a, barrier: null, profile: base });
    const slow = sizeFor({ analysis: a, barrier: null, profile: { ...base, avgTimeToStart: 200 } });
    ok(slow === clampLevel(fast + 1), "tts/slow-starter-smaller", `${fast} → ${slow}`);
  }

  /* ---------- 14 · one event cannot corrupt the profile ---------- */
  {
    const prof = computeProfile([session(0, 2, "kept")]);
    ok(prof.bestSize === null, "profile/no-overfit-size", String(prof.bestSize));
    ok(prof.confidence === "none" || prof.confidence === "low", "profile/no-overfit-tier", prof.confidence);
  }

  /* ---------- 15 · domain spread over many unseen tasks ---------- */
  {
    const tasks = [
      "clean the whole apartment", "write a complete blog article", "do my taxes", "reply to my emails",
      "study for my chemistry exam", "call the dentist about Thursday", "fix the leaking kitchen tap",
      "start learning the guitar", "declutter the garage and sell old stuff", "decide whether to quit my job",
      "renew my passport before the trip", "organize all my photos", "research which standing desk to buy",
      "knit a scarf for winter",
    ];
    const structures = new Set(tasks.map((t) => analyzeTask(t).structure));
    ok(structures.size >= 7, "domains/spread", `${structures.size} distinct`);
    for (const t of tasks) {
      const plan = planFirstStep(analyzeTask(t), {});
      ok(passesGuardrails(plan.action) && validLevel(plan.size), `domains/${t.slice(0, 20)}`, plan.action);
      emit(plan.action, plan.size);
    }
  }

  /* ---------- 16 · barriers change the strategy, all medium-safe ---------- */
  {
    const d = freshDraft("Reply to John's email");
    const barriers: Barrier[] = ["overwhelmed", "unclear", "boring", "perfectionism", "anxiety", "tired", "avoiding", "unknown"];
    const used = new Set<string>();
    for (const b of barriers) {
      const iv = barrierIntervention(d, b, null);
      ok(validLevel(iv.size), `barrier/${b}/level`, String(iv.size));
      ok(leaks(iv.action, BANNED_FOR_DIGITAL).length === 0, `barrier/${b}/compatible`, iv.action);
      emit(iv.action, iv.size);
      used.add(iv.strategy ?? "?");
    }
    ok(used.size >= 4, "barrier/diverse-strategies", `${used.size} distinct`);
    const distracted = barrierIntervention(d, "distracted", null);
    ok(distracted.reset === true, "barrier/distracted-resets", "expected reset");
  }

  /* ---------- 17 · determinism ---------- */
  {
    const run = () => {
      const a = analyzeTask("Reply to John's email");
      const plan = planFirstStep(a, { barrier: "overwhelmed" });
      const ladder = previewSteps({ ...freshDraft("Reply to John's email"), level: plan.size, memory: plan.memory }, null, 4);
      return JSON.stringify({ plan: { action: plan.action, strategy: plan.strategy, size: plan.size }, ladder });
    };
    ok(run() === run(), "determinism/same-input-same-output", "outputs differed");
  }

  /* ---------- global invariants over everything emitted above ---------- */
  ok(
    allActions.every((s) => s.trim().length > 0 && passesGuardrails(s)),
    "invariant/all-actions-valid",
    allActions.find((s) => !passesGuardrails(s)) ?? "",
  );
  ok(allLevels.every(validLevel), "invariant/all-levels-valid", String(allLevels.find((l) => !validLevel(l))));

  return { pass, failures };
}

/**
 * Dev-only runner: executes the pure suite and prints a human-readable
 * showcase of real engine output for representative tasks, so
 * regressions are visible — not just counted.
 */
export function runEngineSelfTest(): void {
  queueMicrotask(() => {
    const results = runEngineTests();
    const label = `%cunstick engine · ${results.pass} passed · ${results.failures.length} failed`;
    if (results.failures.length === 0) {
      console.groupCollapsed(label, "font-weight:bold;color:#52c08f");
    } else {
      console.group(label, "font-weight:bold;color:#de7f6b");
      console.table(results.failures);
    }

    /* showcase: what the engine actually says for representative tasks */
    const showcase = [
      "Reply to John's email",
      "clean my entire apartment",
      "write a complete blog article",
      "do my taxes",
      "declutter the garage and sell old stuff online",
      "deal with that thing somehow",
    ];
    for (const t of showcase) {
      const a = analyzeTask(t);
      const plan = planFirstStep(a, {});
      const ladder = previewSteps({ ...freshDraft(t), level: plan.size, memory: plan.memory }, null, 4);
      console.log(
        `\n— “${t}” [${a.structure}/${a.medium}] → (${plan.strategy}, size ${plan.size})\n  ${plan.action}\n` +
          ladder.map((r, i) => `  ${i + 1}. [${r.strategy}·${r.size}] ${r.action}`).join("\n"),
      );
    }
    console.groupEnd();
  });
}
