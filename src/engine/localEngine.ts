/* ============================================================
   Facade over the staged engine.
   Analysis → barriers → strategies → selection (with
   repetition memory) → generation → profile learning.
   Everything here is deterministic and local-first; the remote
   AI provider below is strictly optional decoration.
   ============================================================ */

export { analyzeTask, hashStr, normalizeAction, pick } from "./analysis";
export { computeProfile, durationLabel, emptyProfile, secondsLabel } from "./profile";
export {
  LEVEL_LABELS,
  adaptFromFeedback,
  advanceStep,
  barrierIntervention,
  minimumViable,
  planFirstStep,
  reasonToBarrier,
  rescueIntervention,
  type Intervention,
} from "./engine";
export { emptyMemory, nextStep, previewSteps, selectStep, sizeFor } from "./selector";
export { BARRIER_STRATEGIES, STRATEGIES, STRATEGY_LABEL, STRATEGY_MAP, renderStrategy } from "./strategies";

import type { Barrier, Draft, StrategyId } from "./types";
import { analyzeTask as _analyze } from "./analysis";
import { emptyMemory as _mem, nextStep as _step } from "./selector";
import { planFirstStep as _plan } from "./engine";

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

/* ---------------- dev-only self test ---------------- */

/**
 * Runs in development only: feeds the engine many unrelated tasks
 * (including ones it has never seen) and checks that structure
 * detection spreads out and that repeated negative feedback never
 * reproduces the same recommendation. Results go to the console.
 */
export function runEngineSelfTest(): void {
  /* Only invoked behind an import.meta.env.DEV guard in the store. */
  queueMicrotask(() => {
    {
      const analyze = _analyze;
      const step = _step;
      const mem = _mem;
      const plan = _plan;
      const tasks = [
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
        "water the plants and feed the cat",
        "something vague about my life",
        "untangle the cables behind my desk",
        "knit a scarf for winter",
        "figure out this weird error in my codebase",
      ];

      const structures = new Map<string, number>();
      const table: Array<Record<string, string>> = [];

      for (const t of tasks) {
        const a = analyze(t);
        structures.set(a.structure, (structures.get(a.structure) ?? 0) + 1);

        /* same task, five failed attempts in a row → must stay fresh */
        let draft: Draft = {
          title: a.title,
          analysis: a,
          level: 1,
          stepIndex: 0,
          stepsDone: 0,
          rescues: 0,
          feedbacks: 0,
          startedAt: 0,
          enteredAt: 0,
          sessionId: null,
          kind: "focus" as const,
          override: null as string | null,
          strategy: null as StrategyId | null,
          note: null,
          ladderOverride: null,
          entry: "normal" as const,
          blocker: null,
          lastFeedback: null as "stuck" | null,
          memory: mem(),
        };
        const seen = new Set<string>();
        let repeats = 0;
        const samples: string[] = [];
        for (let i = 0; i < 5; i++) {
          const res = step(draft, null, { feedback: "stuck", avoidStrategy: draft.strategy });
          draft = { ...draft, ...res, feedbacks: i + 1, lastFeedback: "stuck", level: res.size };
          const key = res.action.toLowerCase();
          if (seen.has(key)) repeats += 1;
          seen.add(key);
          if (i < 2) samples.push(`${res.strategy}: ${res.action}`);
        }
        table.push({
          task: t.slice(0, 34),
          structure: a.structure,
          object: a.object.slice(0, 22),
          repeats: String(repeats),
          first: samples[0]?.slice(0, 52) ?? "",
          second: samples[1]?.slice(0, 52) ?? "",
        });
      }

      const freshPlans = new Set(
        tasks.map((t) => plan(analyze(t)).action),
      );

      console.groupCollapsed(`%cunstick engine self-test`, "font-weight:bold;color:#52c08f");
      console.table(table);
      console.log("structure spread:", Object.fromEntries(structures));
      console.log(`unique first steps across ${tasks.length} tasks: ${freshPlans.size}`);
      if (freshPlans.size < tasks.length - 2) console.warn("⚠ first steps look repetitive");
      if (table.some((r) => r.repeats !== "0")) console.warn("⚠ feedback loop repeated a recommendation");
      console.groupEnd();
    }
  });
}
