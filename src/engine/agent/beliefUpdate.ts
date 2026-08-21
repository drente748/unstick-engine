/* ============================================================
   agent/beliefUpdate — Phase 4-A: belief revision from feedback.

   The agent holds HYPOTHESES about why the user is stuck. Each
   piece of outcome feedback revises them with evidence — always
   deterministically, never guessing beyond the data.

   Feedback vocabulary:
     worked        -> barrier confidence drops, momentum rises
     too-big       -> capacity drops hard, next step must shrink
     too-small     -> step was safe but underpowered; size can rise
     stuck         -> current approach is wrong; rotate technique
     abandoned-at  -> where they quit matters (0% = entry problem,
                      mid = sustain problem)

   English-only, deterministic.
   ============================================================ */

import type { Belief } from "../types-v5";

export type FeedbackKind = "worked" | "too-big" | "too-small" | "stuck" | "abandoned-at";

export interface OutcomeFeedback {
  kind: FeedbackKind;
  /** For abandoned-at: fraction of the step completed before quitting. */
  at?: number;
  /** Optional note from the user (stored in evidence, never parsed). */
  note?: string;
}

/** A persistent agent memory: per-task-key statistics + beliefs. */
export interface AgentMemory {
  /** taskKey -> history of outcomes ("worked", "too-big", ...). */
  outcomes: Record<string, FeedbackKind[]>;
  beliefs: Record<string, Belief[]>;
}

export function emptyMemory(): AgentMemory {
  return { outcomes: {}, beliefs: {} };
}

const clamp01 = (x: number) => Math.max(0.05, Math.min(0.95, x));

/**
 * Revise the belief set for one task after an outcome.
 * Returns NEW beliefs (never mutates the input array).
 */
export function reviseBeliefs(
  taskKey: string,
  prior: Belief[],
  fb: OutcomeFeedback,
): Belief[] {
  const next = prior.map((b) => ({ ...b, evidence: [...b.evidence] }));

  const find = (kind: Belief["kind"]) => next.find((b) => b.kind === kind);
  const bump = (kind: Belief["kind"], value: string, delta: number, ev: string) => {
    const b = find(kind);
    if (b) {
      if (b.value === value || delta < 0) {
        /* same value (or weakening): nudge confidence */
        b.confidence = clamp01(b.confidence + delta);
      } else if (delta > 0) {
        /* evidence for a DIFFERENT value: switch toward it */
        b.value = value;
        b.confidence = clamp01(b.confidence + delta);
      }
      b.evidence.push(ev);
      return;
    }
    /* create the belief when it strengthens into existence */
    if (delta > 0 && value) {
      next.push({ kind, value, confidence: clamp01(0.3 + delta), evidence: [ev] });
    }
  };

  switch (fb.kind) {
    case "worked": {
      /* success lowers every barrier hypothesis a little */
      for (const b of next) {
        if (b.kind === "barrier") {
          b.confidence = clamp01(b.confidence - 0.15);
          b.evidence.push("outcome:worked");
        }
      }
      bump("momentum", "building", +0.2, "outcome:worked");
      break;
    }
    case "too-big": {
      bump("capacity", "low", +0.25, "outcome:too-big");
      for (const b of next) {
        if (b.kind === "barrier" && (b.value === "overwhelm" || b.value === "unclear-task")) {
          b.confidence = clamp01(b.confidence + 0.15);
          b.evidence.push("outcome:too-big");
        }
      }
      break;
    }
    case "too-small": {
      bump("capacity", "ready-for-more", +0.15, "outcome:too-small");
      break;
    }
    case "stuck": {
      /* the approach itself failed — raise uncertainty about the
         barrier and force a technique rotation on the next pick */
      bump("barrier", "", -0.1, "outcome:stuck-rotate");
      bump("momentum", "stalled", +0.15, "outcome:stuck");
      break;
    }
    case "abandoned-at": {
      const at = fb.at ?? 0;
      if (at <= 0.05) {
        /* quit instantly: the ENTRY move was the wall */
        bump("barrier", "overwhelm", +0.2, `abandoned@${at}`);
      } else {
        /* started then quit: a SUSTAIN issue, not initiation */
        bump("barrier", "sustain-risk", +0.2, `abandoned@${at}`);
      }
      bump("momentum", "stalled", +0.1, `abandoned@${at}`);
      break;
    }
  }

  return next;
}

/** Record an outcome into memory and return updated beliefs. */
export function recordOutcome(
  memory: AgentMemory,
  taskKey: string,
  prior: Belief[],
  fb: OutcomeFeedback,
): Belief[] {
  const hist = memory.outcomes[taskKey] ?? [];
  memory.outcomes[taskKey] = [...hist, fb.kind];
  const revised = reviseBeliefs(taskKey, prior, fb);
  memory.beliefs[taskKey] = revised;
  return revised;
}
