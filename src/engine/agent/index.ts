/* ============================================================
   agent/index — Phase 4-E: the Unstick Agent.

   Wires the full loop:
     task -> graph -> inference -> POLICY -> (program | step)
          -> persona dressing -> output
   and the learning half-loop:
     outcome feedback -> belief revision -> next decision

   The agent is a thin, fully-traced orchestrator: knowledge
   proposes, policy decides, personas dress. Deterministic.

   English-only.
   ============================================================ */

import type { Belief } from "../types-v5";
import { buildTaskGraph } from "../nlu/graph";
import { inferFromGraph } from "../reason/infer";
import { generateFirstStep } from "../pipeline";
import { emptyMemory, recordOutcome, reviseBeliefs, type AgentMemory, type OutcomeFeedback } from "./beliefUpdate";
import { decide, type PolicyDecision } from "./policy";
import { dress } from "./personas";
import { getProgram } from "./programs";

export interface AgentTurn {
  /** The dressed step text shown to the user. */
  display: string;
  /** The bare validated step (what actually passed the cascade). */
  step: string | null;
  persona: string;
  decision: PolicyDecision;
  beliefs: Belief[];
  /** Full reasoning trace — every layer's evidence. */
  trace: {
    subIntent: string;
    archetype: string | null;
    policyRationale: string[];
    rejected: Array<{ action: string; gate: string; reason: string }>;
  };
}

export interface AgentState {
  memory: AgentMemory;
  lastTechniqueId: string | null;
  /** Pending feedback per task — consumed ONCE by the next turn. */
  pendingFeedback: Record<string, OutcomeFeedback>;
}

export function newAgentState(): AgentState {
  return { memory: emptyMemory(), lastTechniqueId: null, pendingFeedback: {} };
}

/** One agent turn: produce the next thing to say/do for a task. */
export function agentNext(
  task: string,
  state: AgentState,
): AgentTurn {
  const taskKey = task.toLowerCase().trim();
  const graph = buildTaskGraph(task);
  const inference = inferFromGraph(graph);
  const beliefs = state.memory.beliefs[taskKey] ?? inference.beliefs;

  /* consume pending feedback exactly once */
  const fb = state.pendingFeedback[taskKey] ?? null;
  delete state.pendingFeedback[taskKey];

  const decision = decide(beliefs, inference.graph, fb, state.lastTechniqueId);
  state.lastTechniqueId = decision.technique?.id ?? state.lastTechniqueId;

  /* program path: a situation protocol replaces the single step */
  if (decision.program) {
    const prog = getProgram(decision.program);
    if (prog) {
      const first = prog.steps[0];
      const dressed = dress(first.text, decision);
      return {
        display: dressed.text,
        step: first.text,
        persona: dressed.persona,
        decision,
        beliefs,
        trace: {
          subIntent: inference.graph.subIntent,
          archetype: inference.archetype?.archetype.id ?? null,
          policyRationale: decision.rationale,
          rejected: [],
        },
      };
    }
  }

  /* clarifying question path: ask instead of guessing */
  if (decision.askInsteadOfAct) {
    const q = `What does "${inference.graph.primaryTarget?.text ?? task}" look like when it's DONE? One sentence is enough.`;
    const dressed = dress(q, decision);
    return {
      display: dressed.text,
      step: q,
      persona: dressed.persona,
      decision,
      beliefs,
      trace: {
        subIntent: inference.graph.subIntent,
        archetype: inference.archetype?.archetype.id ?? null,
        policyRationale: decision.rationale,
        rejected: [],
      },
    };
  }

  /* normal step path */
  const r = generateFirstStep(task);
  const dressed = r ? dress(r.action, decision) : { text: "", persona: "Direct" };
  return {
    display: dressed.text,
    step: r?.action ?? null,
    persona: dressed.persona,
    decision,
    beliefs,
    trace: {
      subIntent: inference.graph.subIntent,
      archetype: inference.archetype?.archetype.id ?? null,
      policyRationale: decision.rationale,
      rejected: r?.trace.rejected ?? [],
    },
  };
}

/** Feed an outcome back; revises beliefs AND queues the signal
 * so the next agentNext() turn reacts to it. */
export function agentFeedback(
  task: string,
  state: AgentState,
  priorBeliefs: Belief[],
  fb: OutcomeFeedback,
): Belief[] {
  const taskKey = task.toLowerCase().trim();
  state.pendingFeedback[taskKey] = fb;
  return recordOutcome(state.memory, taskKey, priorBeliefs, fb);
}
