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
  classifyTaskParsed,
  clampLevel,
  diagnoseBarrier,
  estimateCapacity,
  hashStr,
  intentKey,
  normalizeAction,
  normalizeTask,
  parseTask,
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

import { analyzeTask, clampLevel, intentKey, tokenize } from "./analysis";
import { adaptFromFeedback as adaptLocal, barrierIntervention, buildRecoveryStrategy, planFirstStep } from "./engine";
import { emptyMemory, nextStep, passesGuardrails, previewSteps, sizeFor } from "./selector";
import type { Barrier, Draft, Level, Outcome, Profile, SessionRecord, StrategyId, TaskAnalysis } from "./types";
import { getDecisionLog } from "./decisionLog";
import { buildTaskGraph } from "./nlu/graph";
import { inferFromGraph } from "./reason/infer";
import { checkActionFit, sitAtRoomIsRejected } from "./reason/critic";
import { archetypeIds, coveredIntents } from "./reason/archetypes";
import { computeProfile, emptyProfile } from "./profile";

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
export { validLevel };

export function freshDraft(title: string, barrier: Barrier | null = null): Draft {
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
    for (let i = 0; i < 16; i++) {
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

  /* ---------- T-D · scope reduction must PRESERVE the task (TEST D) ---------- */
  {
    const t = "clean my entire apartment";
    const a = analyzeTask(t);
    ok(a.scopeStrength >= 2, "scope/strength-detected", String(a.scopeStrength));
    ok(a.complexity >= 2, "scope/complexity-bumped", String(a.complexity));
    /* dynamic fidelity anchor: the task's OWN object/verb tokens + scope words */
    const ownTokens = [
      ...tokenize(a.object).filter((w) => w.length > 2),
      ...(a.verb ? [a.verb] : []),
      "clean", "clear", "pick", "tidy", "touch", "surface", "item", "object", "one", "hand", "hold",
    ];
    const ANCHOR = new RegExp(ownTokens.join("|"), "i");
    const d = freshDraft(t);
    const ladder = previewSteps({ ...d, level: 0 }, null, 5);
    for (const r of ladder) {
      ok(ANCHOR.test(r.action), "scope/still-about-cleaning", r.action);
      emit(r.action, r.size);
    }
    const plan = planFirstStep(a, {});
    ok(ANCHOR.test(plan.action), "scope/plan-about-cleaning", plan.action);
  }

  /* ---------- T-E · entity preservation (TEST E + §8/§24) ---------- */
  {
    const a = analyzeTask("Reply to John's email");
    ok(/John's/i.test(a.object), "entity/apostrophe-kept", a.object);
    ok(!/johns/i.test(a.object), "entity/no-destructive-fold", a.object);

    const u = analyzeTask("Reply to José's email");
    ok(/José/i.test(u.object), "entity/accented-kept", u.object);
  }

  /* ---------- T-F · multi-level semantic dedupe (TEST F) ---------- */
  {
    const k1 = intentKey("Open John's email.");
    const k2 = intentKey("Open the email from John.");
    const k3 = intentKey("Click John's email.");
    ok(k1 === k2 && k2 === k3, "dedupe/synonym-variants", `${k1} | ${k2} | ${k3}`);
    ok(intentKey("Write one sentence of the reply.") !== k1, "dedupe/distinct-intent-stays-distinct", "collision!");
  }

  /* ---------- T-I · meaningful progress: forbidden filler (TEST I) ---------- */
  {
    const NO_PROGRESS = [
      "get a glass of water", "stare at", "sit near", "stand up and face the",
      "do something", "take action", "be more disciplined", "stop procrastinating",
    ];
    ok(
      allActions.every((s) => !NO_PROGRESS.some((b) => s.toLowerCase().includes(b))),
      "progress/no-filler-anywhere",
      allActions.find((s) => NO_PROGRESS.some((b) => s.toLowerCase().includes(b))) ?? "",
    );
  }

  /* ---------- T-J · remote candidates get zero trust (TEST J + §12) ---------- */
  {
    const t = "Reply to John's email";
    const poisoned = [
      "Get a glass of water.",                                       // filler
      "Stand up and take one step toward where the email happens.", // fabricated location
      "Open your laptop and stretch.",                              // off-task
      "Open the email from John.",                                  // valid — must survive
      "Open the email from John.",                                  // duplicate — must be dropped
    ];
    const d = freshDraft(t);
    const ladder = previewSteps({ ...d, ladderOverride: poisoned }, null, 5);
    ok(ladder.length === 1, "remote/filters-invalid", ladder.map((r) => r.action).join(" || "));
    ok(ladder[0] && intentKey(ladder[0].action) === intentKey("Open the email from John."), "remote/keeps-valid", ladder[0]?.action ?? "∅");
    ladder.forEach((r) => emit(r.action, r.size));
  }

  /* ---------- T-K · recovery preserves every Draft-facing field (§21) ---------- */
  {
    const d = freshDraft("do my taxes");
    const p = planFirstStep(d.analysis, {});
    const seeded: Draft = { ...d, level: p.size, override: p.action, strategy: p.strategy, memory: p.memory, feedbacks: 2, lastFeedback: "worked" };
    const rec = buildRecoveryStrategy(seeded, null, "stuck");
    const checks: Array<[string, boolean]> = [
      ["override", typeof rec.override === "string" && rec.override.length > 0],
      ["level", validLevel(rec.level)],
      ["strategy", rec.strategy != null],
      ["memory", rec.memory != null && Array.isArray(rec.memory.shown)],
      ["note", typeof rec.note === "string"],
      ["decision", rec.decision != null && typeof rec.decision.reason === "string"],
      ["feedbacks", rec.feedbacks === 3],
      ["lastFeedback", rec.lastFeedback === "stuck"],
    ];
    for (const [field, good] of checks) ok(good, `recovery/preserves-${field}`, String(rec[field as keyof typeof rec]));
  }

  /* ---------- T-M · analysis contract fields (§9) ---------- */
  {
    const a = analyzeTask("Build my website");
    ok(typeof a.scopeStrength === "number" && a.scopeStrength >= 0 && a.scopeStrength <= 3, "contract/scopeStrength", String(a.scopeStrength));
    const c = a.analysisConfidence;
    const inRange = [c.structure, c.medium, c.verb, c.object, c.barrier].every((v) => v >= 0 && v <= 1);
    ok(inRange, "contract/confidence-range", JSON.stringify(c));
    ok(typeof a.analysisVersion === "string" && a.analysisVersion.length > 0, "contract/analysisVersion", a.analysisVersion);
    const plan = planFirstStep(a, {});
    const log = getDecisionLog();
    ok(log.length > 0 && log[log.length - 1].policyVersion.length > 0, "contract/policyVersion-traced", String(log.length));
  }

  /* ---------- T-N · learning can be fully disabled (§32.18) ---------- */
  {
    const sessions = Array.from({ length: 8 }, (_, i) => session(i, 3, i < 6 ? "kept" : "stopped"));
    const off = emptyProfile(sessions.length);
    ok(off.bestSize === null && off.bestStrategy === null, "learning/disabled-is-empty", JSON.stringify(off.bestSize));
  }

  /* ---------- T-P · semantic parse & contextual classification (analysis v4) ---------- */
  {
    const a = analyzeTask("email Sarah about the invoice");
    ok(a.recipient === "Sarah", "parse/recipient-sarah", a.recipient ?? "null");
    ok((a.topic ?? "").toLowerCase().includes("invoice"), "parse/topic-invoice", a.topic ?? "null");
    ok(a.structure === "communication", "parse/comm-not-writing", a.structure);
    ok(a.medium === "digital", "parse/comm-digital", a.medium);

    const b = analyzeTask("Reply to John's email");
    ok(b.recipient === "John", "parse/recipient-john", b.recipient ?? "null");
    ok(/John's/i.test(b.object), "parse/object-keeps-possessive", b.object);

    /* a recipient flips “write an email” from writing to communication */
    const c = analyzeTask("write an email to Sarah");
    ok(c.structure === "communication", "parse/recipient-shifts-to-comm", c.structure);

    const e = analyzeTask("don't skip the gym today");
    ok(e.negated === true, "parse/negation", String(e.negated));

    const f = analyzeTask("study for my chemistry exam");
    ok(f.structureEvidence.length > 0, "parse/evidence-recorded", f.structureEvidence.join(","));
    ok(f.analysisConfidence.structure >= 0.6, "parse/confidence-from-margin", String(f.analysisConfidence.structure));
  }

  /* ---------- T-G · v5 semantic graph (Phase 1) ---------- */
  {
    /* Sarah case — the regression that motivated the graph */
    const g = buildTaskGraph("Reply to Sarah's email about the project deadline");
    ok(g.action === "reply", "graph/verb", String(g.action));
    ok(g.subIntent === "reply", "graph/subintent", g.subIntent);
    ok(g.primaryTarget !== null && g.primaryTarget.key === "email", "graph/target", g.primaryTarget?.key ?? "none");
    ok(g.recipient !== null && g.recipient.key === "sarah", "graph/recipient", g.recipient?.key ?? "none");
    ok(g.topic !== null && g.topic.key.includes("deadline"), "graph/topic", g.topic?.key ?? "none");
    ok(
      g.relations.some((r) => r.kind === "owned-by" && r.to === g.primaryTarget?.id),
      "graph/owned-by-edge",
      JSON.stringify(g.relations),
    );
    ok(g.relations.some((r) => r.kind === "about"), "graph/about-edge", JSON.stringify(g.relations));
    ok(g.confidence >= 0.5, "graph/confidence-floor", String(g.confidence));

    /* cleaning task — place-bound target */
    const gc = buildTaskGraph("Clean the kitchen before dinner");
    ok(gc.subIntent === "clean-space", "graph/clean-intent", gc.subIntent);
    ok(gc.entities.some((e) => e.role === "place" && e.key === "kitchen"), "graph/place", JSON.stringify(gc.entities));
    /* the place IS the target here — no located-at edge (that would
       mean the kitchen is a venue where something else happens) */
    ok(gc.primaryTarget !== null && gc.primaryTarget.key === "kitchen", "graph/clean-target", gc.primaryTarget?.key ?? "none");
    ok(gc.relations.every((r) => r.kind !== "located-at"), "graph/no-self-located-at", JSON.stringify(gc.relations));

    /* compound task — clauses preserved */
    const gx = buildTaskGraph("Declutter the garage and sell old stuff online");
    ok(gx.clauses.length === 2, "graph/clauses", JSON.stringify(gx.clauses));
    ok(gx.clauses[0].toLowerCase().includes("garage"), "graph/clause-head", gx.clauses[0]);

    /* noun phrase integrity — "project deadline" is ONE topic, not two */
    ok(g.topic !== null && g.topic.text === "project deadline", "graph/np-integrity", g.topic?.text ?? "");

    /* study task */
    const gs = buildTaskGraph("Study for my chemistry exam");
    ok(gs.subIntent === "study-material", "graph/study-intent", gs.subIntent);
    ok(gs.entities.some((e) => e.role === "topic" && e.key.includes("exam")), "graph/study-topic", JSON.stringify(gs.entities));

    /* pay bill */
    const gp = buildTaskGraph("Pay the electricity bill before friday");
    ok(gp.subIntent === "pay-bill", "graph/pay-intent", gp.subIntent);

    /* fix bug */
    const gf = buildTaskGraph("Fix the bug in the checkout flow");
    ok(gf.subIntent === "fix-broken", "graph/fix-intent", gf.subIntent);
    ok(gf.primaryTarget !== null, "graph/fix-target", String(gf.primaryTarget?.text));

    /* evidence recorded on every entity */
    ok(
      g.entities.every((e) => e.evidence.length > 0),
      "graph/entity-evidence",
      JSON.stringify(g.entities.map((e) => e.evidence)),
    );

    /* determinism: same input -> identical graph */
    const g2 = buildTaskGraph("Reply to Sarah's email about the project deadline");
    ok(JSON.stringify(g) === JSON.stringify(g2), "graph/deterministic", "graphs differ");

    /* immutability contract: graph carries no belief fields */
    ok(!("beliefs" in g), "graph/no-beliefs", "graph must stay belief-free");
  }

  /* ---------- T-R · v5 reasoning layer (Phase 2) ---------- */
  {
    /* THE acceptance case: room must be cleanable-space, not desk */
    const gr = buildTaskGraph("Clean my room");
    const inf = inferFromGraph(gr);
    const roomE = inf.graph.entities.find((e) => e.key === "room");
    ok(roomE != null, "reason/room-exists", JSON.stringify(inf.graph.entities));
    ok(roomE?.entityType === "cleanable-space", "reason/room-nature", String(roomE?.entityType));

    /* desk is NOT a cleanable-space — the distinction Test 7 demanded */
    const gd = buildTaskGraph("Clean my desk");
    inferFromGraph(gd);
    const deskE = gd.entities.find((e) => e.key === "desk");
    ok(deskE?.entityType === "work-surface", "reason/desk-nature", String(deskE?.entityType));

    /* email is a communication artifact */
    const ge = buildTaskGraph("Reply to Sarah's email about the deadline");
    inferFromGraph(ge);
    const emailE = ge.entities.find((e) => e.key === "email" && e.role === "target");
    ok(emailE?.entityType === "communication-artifact", "reason/email-nature", String(emailE?.entityType));

    /* beliefs: every one has evidence + confidence in range */
    ok(inf.beliefs.length > 0, "reason/beliefs-present", String(inf.beliefs.length));
    ok(
      inf.beliefs.every((b) => b.evidence.length > 0 && b.confidence > 0 && b.confidence <= 1),
      "reason/belief-evidence",
      JSON.stringify(inf.beliefs),
    );
    /* barrier beliefs are hypotheses (have evidence), never bare facts */
    const barriers = inf.beliefs.filter((b) => b.kind === "barrier");
    ok(barriers.every((b) => b.evidence.length >= 1), "reason/barrier-hypotheses", JSON.stringify(barriers));

    /* archetype matched for cleaning */
    ok(inf.archetype !== null, "reason/archetype-found", String(inf.archetype?.archetype.id));
    ok(inf.archetype?.archetype.id === "cleaning", "reason/cleaning-archetype", String(inf.archetype?.archetype.id));
    ok((inf.archetype?.score ?? 0) >= 2, "reason/archetype-score", String(inf.archetype?.score));

    /* communication graph matches communication archetype */
    const infE = inferFromGraph(ge);
    ok(infE.archetype?.archetype.id === "communication", "reason/comm-archetype", String(infE.archetype?.archetype.id));

    /* critic: sit-at on cleanable-space REJECTS (Test 7 pinned) */
    ok(sitAtRoomIsRejected(), "reason/sit-at-room-rejected", "must be structurally impossible");
    /* critic: clean on cleanable-space passes */
    const vOk = checkActionFit("clean", "cleanable-space");
    ok(vOk.ok, "reason/clean-on-space-ok", vOk.reason);
    /* critic: read on cleanable-space rejects */
    const vBad = checkActionFit("read", "cleanable-space");
    ok(!vBad.ok && vBad.gate === "semantic", "reason/read-on-space-rejected", vBad.reason);

    /* determinism of the whole reasoning pass */
    const inf2 = inferFromGraph(buildTaskGraph("Clean my room"));
    ok(JSON.stringify(inf.beliefs) === JSON.stringify(inf2.beliefs), "reason/deterministic", "beliefs differ");

    /* archetype coverage sanity: five families registered */
    ok(archetypeIds().length === 5, "reason/five-archetypes", archetypeIds().join(","));
    ok(coveredIntents().includes("fix-broken"), "reason/fix-covered", "fix-broken must be covered");
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
