/* ============================================================
   state/agentStore — Phase 5: the UI-facing agent runtime.

   A single module-scoped AgentState (persisted to localStorage)
   that the existing store.tsx can call without restructuring:
     - turnFor(task, difficulty) -> { step, display, persona }
     - sendFeedback(task, beliefs, v4Kind) -> revised beliefs

   v4 FeedbackKind ("tooBig"/"irrelevant") maps onto the v5
   OutcomeFeedback vocabulary here — one translation point.

   English-only, deterministic, local-first (no network).
   ============================================================ */

import type { Belief } from "../engine/types-v5";
import type { FeedbackKind } from "../engine/types";
import { newAgentState, agentNext, agentFeedback, type AgentState } from "../engine/agent";
import type { OutcomeFeedback } from "../engine/agent/beliefUpdate";

const KEY = "unstick:agent:v1";

function load(): AgentState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return newAgentState();
    const parsed = JSON.parse(raw) as Partial<AgentState>;
    return {
      memory: parsed.memory ?? newAgentState().memory,
      lastTechniqueId: parsed.lastTechniqueId ?? null,
      pendingFeedback: parsed.pendingFeedback ?? {},
    };
  } catch {
    return newAgentState();
  }
}

function save(s: AgentState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode — in-memory only */
  }
}

/* module-scoped singleton: survives route changes, persists across reloads */
let agentState: AgentState | null = null;
function state(): AgentState {
  if (!agentState) agentState = load();
  return agentState;
}

export interface AgentUiTurn {
  /** The bare validated step (goes into draft.override). */
  step: string | null;
  /** Persona-dressed text for display. */
  display: string;
  persona: string;
  techniqueId: string | null;
}

/** Declared UI difficulty -> policy hint consumed by agentNext. */
export type UiDifficulty = "easy" | "abit" | "hard" | "impossible" | null;

/**
 * Produce the agent's turn for a task. The declared UI difficulty
 * is folded into the task text as an explicit marker so the
 * policy's declared-difficulty layer sees it ("abit" maps to "hard"
 * with a softer voice).
 */
export function turnFor(task: string, difficulty: UiDifficulty): AgentUiTurn {
  const s = state();
  const marker =
    difficulty === "impossible" ? "Impossible: "
    : difficulty === "hard" ? "Hard: "
    : difficulty === "abit" ? "Hard: "
    : difficulty === "easy" ? "Easy: "
    : "";
  const turn = agentNext(`${marker}${task}`, s);
  save(s);
  return {
    step: turn.step,
    display: turn.display,
    persona: turn.persona,
    techniqueId: turn.decision.technique?.id ?? null,
  };
}

/** Map the v4 feedback vocabulary onto v5 outcome feedback. */
function toOutcome(kind: FeedbackKind): OutcomeFeedback {
  switch (kind) {
    case "worked": return { kind: "worked" };
    case "tooBig": return { kind: "too-big" };
    case "stuck": return { kind: "stuck" };
    /* "not relevant" ≈ wrong approach — rotate */
    case "irrelevant": return { kind: "stuck" };
  }
}

/**
 * Feed an outcome into the agent's beliefs.
 * @param priorBeliefs last turn's beliefs (from draft.agentBeliefs)
 */
export function sendFeedback(task: string, priorBeliefs: Belief[] | undefined, kind: FeedbackKind): Belief[] {
  const s = state();
  const fb = toOutcome(kind);
  const revised = agentFeedback(task, s, priorBeliefs ?? [], fb);
  save(s);
  return revised;
}
