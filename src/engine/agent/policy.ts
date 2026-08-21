/* ============================================================
   agent/policy — Phase 4-B: the decision layer.

   Reads (beliefs + memory + graph) and decides:
     - step size delta for the NEXT step (shrink / hold / grow)
     - whether to ASK a clarifying question or ACT
     - which persona should deliver the step
     - whether a full intervention PROGRAM should run
     - which ADHD technique to rotate in (never repeats the last)

   The policy is deterministic and evidence-driven. It PROPOSES;
   the knowledge layer supplies candidates; personas only dress.

   English-only, deterministic.
   ============================================================ */

import type { Belief, TaskGraph } from "../types-v5";
import type { OutcomeFeedback } from "./beliefUpdate";
import { techniquesForBeliefs, TASK_AFFINITY, type Technique } from "../kb/adhd";

export type PersonaId = "direct" | "gentle" | "socratic" | "structured" | "momentum";

export interface PolicyDecision {
  /** -1 = shrink the next step, 0 = hold, +1 = grow. */
  sizeDelta: -1 | 0 | 1;
  askInsteadOfAct: boolean;
  persona: PersonaId;
  /** Run a named intervention program instead of a single step. */
  program: string | null;
  /** Technique to rotate in (from the ADHD knowledge base). */
  technique: Technique | null;
  /** Why — every decision carries its reasoning chain. */
  rationale: string[];
}

/** Dominant barrier = highest-confidence barrier belief. */
function dominantBarrier(beliefs: Belief[]): Belief | null {
  const bars = beliefs.filter((b) => b.kind === "barrier");
  if (bars.length === 0) return null;
  return [...bars].sort((a, b) => b.confidence - a.confidence)[0];
}

export function decide(
  beliefs: Belief[],
  graph: TaskGraph,
  feedback: OutcomeFeedback | null,
  lastTechniqueId: string | null,
  taskText: string,
): PolicyDecision {
  const why: string[] = [];
  const barrier = dominantBarrier(beliefs);
  const momentum = beliefs.find((b) => b.kind === "momentum");
  const capacity = beliefs.find((b) => b.kind === "capacity");

  /* ---- default stance ---- */
  let sizeDelta: -1 | 0 | 1 = 0;
  let askInsteadOfAct = false;
  let persona: PersonaId = "direct";
  let program: string | null = null;

  /* ---- feedback-driven adjustments (strongest signal) ---- */
  if (feedback) {
    switch (feedback.kind) {
      case "worked":
        sizeDelta = +1;
        persona = "momentum";
        why.push("feedback:worked -> grow next step, momentum persona");
        break;
      case "too-big":
        sizeDelta = -1;
        persona = "gentle";
        program = "rescue-ladder";
        why.push("feedback:too-big -> shrink hard, rescue ladder");
        break;
      case "too-small":
        sizeDelta = +1;
        why.push("feedback:too-small -> grow gently");
        break;
      case "stuck":
        persona = "socratic";
        why.push("feedback:stuck -> rotate approach, socratic probe");
        break;
      case "abandoned-at": {
        const at = feedback.at ?? 0;
        if (at <= 0.05) {
          sizeDelta = -1;
          program = "re-entry-ritual";
          persona = "gentle";
          why.push(`feedback:abandoned@${at} -> entry wall, re-entry ritual`);
        } else {
          program = "transition-buffer";
          why.push(`feedback:abandoned@${at} -> sustain issue, transition buffer`);
        }
        break;
      }
    }
  }

  /* ---- belief-driven stance (when no fresh feedback) ---- */
  if (!feedback) {
    /* self-acknowledged struggle ("I can't...", "I'm so overwhelmed")
       deserves the gentle voice regardless of task type */
    if (/\b(can'?t|cannot|so overwhelmed|too much|don'?t know where)\b/i.test(taskText)) {
      persona = "gentle";
      why.push("self-struggle-framing -> gentle voice");
    }
    if (barrier) {
      why.push(`dominant-barrier:${barrier.value}@${barrier.confidence.toFixed(2)}`);
      switch (barrier.value) {
        case "overwhelm":
          sizeDelta = -1;
          persona = "gentle";
          /* deep overwhelm -> nervous-system-first program. Threshold
             is HIGH on purpose: multi-clause tasks produce mild
             overwhelm that does NOT mean neurological freeze. Only
             strong evidence justifies the somatic protocol. */
          if (barrier.confidence >= 0.7) program = "freeze-thaw";
          break;
        case "unclear-task":
          askInsteadOfAct = graph.primaryTarget == null || graph.primaryTarget.entityType === "unclassified";
          persona = askInsteadOfAct ? "socratic" : "structured";
          break;
        case "social-friction":
          persona = "gentle";
          break;
        case "time-pressure":
          persona = "structured";
          break;
        case "frustration-risk":
          persona = "momentum";
          break;
        case "avoiding":
          persona = "socratic";
          break;
        case "sustain-risk":
          program = "transition-buffer";
          persona = "structured";
          break;
      }
    }
    if (momentum?.value === "building") {
      persona = "momentum";
      why.push("momentum:building -> ride the wave");
    }
    if (capacity?.value === "low") {
      sizeDelta = -1;
      why.push("capacity:low -> shrink");
    }
  }

  /* ---- multi-clause tasks get structure ---- */
  if (graph.clauses.length > 1 && persona === "direct") {
    persona = "structured";
    why.push("multi-clause -> structured persona");
  }

  /* ---- technique selection from the knowledge base ----
     Three scoring dimensions:
       1. barrier match (2 per hit) — what's blocking them
       2. task affinity (3 per hit) — what kind of work it is
       3. persona affinity (+1) + rotation penalty (-3) */
  const pool = techniquesForBeliefs(beliefs);
  const affinity = TASK_AFFINITY[graph.subIntent] ?? [];
  let technique: Technique | null = null;
  if (pool.length > 0) {
    const scored = pool.map((t) => ({
      t,
      score:
        t.bestForBarriers.filter((v) => v === barrier?.value).length * 2 +
        (affinity.includes(t.id) ? 3 : 0) +
        (t.personas.includes(persona) ? 1 : 0) +
        (t.id === lastTechniqueId ? -3 : 0),
    }));
    scored.sort((a, b) => b.score - a.score);
    technique = scored[0].t;
  }
  if (technique) why.push(`technique:${technique.id} (${technique.source})`);

  return { sizeDelta, askInsteadOfAct, persona, program, technique, rationale: why };
}
