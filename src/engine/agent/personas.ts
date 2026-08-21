/* ============================================================
   agent/personas — Phase 4-C: delivery styles.

   CRITICAL CONTRACT: a persona changes HOW the step is SAID,
   never WHAT the step is or WHICH strategy was chosen. Decision
   logic lives in policy.ts; the persona is presentation only.
   This prevents the failure mode where "nicer wording" silently
   becomes "different treatment".

   English-only, deterministic.
   ============================================================ */

import type { PolicyDecision } from "./policy";

export interface Persona {
  id: string;
  name: string;
  /** When this voice is appropriate (mirrors policy routing). */
  bestFor: string;
  /** Prefix/suffix dressing applied to an already-valid step. */
  wrap: (step: string) => string;
}

export const PERSONAS: Record<string, Persona> = {
  direct: {
    id: "direct",
    name: "Direct",
    bestFor: "clear task, decent momentum — say it straight",
    wrap: (s) => s,
  },
  gentle: {
    id: "gentle",
    name: "Gentle",
    bestFor: "overwhelm, social friction, shame-prone moments",
    wrap: (s) => `No pressure — just this one thing: ${s} That's all. Stopping after is allowed.`,
  },
  socratic: {
    id: "socratic",
    name: "Socratic",
    bestFor: "unclear tasks, stuck loops — one good question beats a guess",
    wrap: (s) => `Quick question first: what's the smallest version of this you can picture? Meanwhile, here's a starting move — ${s}`,
  },
  structured: {
    id: "structured",
    name: "Structured",
    bestFor: "multi-part tasks, time pressure — sequence it visibly",
    wrap: (s) => `Step 1 of your plan: ${s} We'll take the next step after.`,
  },
  momentum: {
    id: "momentum",
    name: "Momentum",
    bestFor: "post-success rides, frustration recovery",
    wrap: (s) => `That last one landed — keep the streak: ${s}`,
  },
};

/** Apply the persona chosen by policy (presentation only). */
export function dress(step: string, decision: PolicyDecision): { text: string; persona: string } {
  const p = PERSONAS[decision.persona] ?? PERSONAS.direct;
  return { text: p.wrap(step), persona: p.name };
}
