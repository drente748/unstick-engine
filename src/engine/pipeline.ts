/* ============================================================
   pipeline — Phase 3 entry: task text -> ONE validated first step.

   Wires the full v5 chain:
     nlu(graph) -> reason(infer) -> compose(candidates)
       -> validate(cascade) -> first surviving candidate

   Deterministic: same task + same shown-sets -> same step.
   Returns null when every candidate is rejected (safe-NONE).
   ============================================================ */

import { buildTaskGraph } from "./nlu/graph";
import { inferFromGraph } from "./reason/infer";
import { generateCandidates } from "./compose/generator";
import { runCascade } from "./validate/cascade";
import type { CandidateV5, TaskGraph, Verdict } from "./types-v5";

export interface FirstStepResult {
  action: string;
  size: number;
  strategy: string;
  fidelity: CandidateV5["fidelity"];
  /** Why this step won — evidence chain for debugging. */
  trace: {
    subIntent: string;
    archetype: string | null;
    candidatesConsidered: number;
    rejected: Array<{ action: string; gate: string; reason: string }>;
    verdict: Verdict;
  };
}

/**
 * Generate the first step for a task.
 * @param shownSurfaces previously shown exact texts (dedupe)
 * @param shownIntents  previously shown intent fingerprints
 * @param salt          deterministic variety seed
 */
export function generateFirstStep(
  task: string,
  shownSurfaces: string[] = [],
  shownIntents: string[] = [],
  salt = 0,
): FirstStepResult | null {
  const graph: TaskGraph = buildTaskGraph(task);
  const inference = inferFromGraph(graph);
  const candidates = generateCandidates(
    inference.graph,
    inference.beliefs,
    inference.archetype?.archetype ?? null,
    salt,
  );

  const surfaces = new Set(shownSurfaces.map((s) => s.toLowerCase()));
  const intents = new Set(shownIntents);
  const rejected: Array<{ action: string; gate: string; reason: string }> = [];

  for (const c of candidates) {
    const verdict = runCascade(c, inference.graph, surfaces, intents);
    if (verdict.ok) {
      return {
        action: c.action,
        size: c.size,
        strategy: c.strategy,
        fidelity: c.fidelity,
        trace: {
          subIntent: inference.graph.subIntent,
          archetype: inference.archetype?.archetype.id ?? null,
          candidatesConsidered: candidates.length,
          rejected,
          verdict,
        },
      };
    }
    rejected.push({ action: c.action, gate: verdict.gate ?? "?", reason: verdict.reason });
  }

  /* safe-NONE: everything rejected — never fabricate a fallback */
  return rejected.length > 0
    ? null
    : null;
}
