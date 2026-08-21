/* ============================================================
   reason/beliefs — derive evidence-backed beliefs from the graph.

   Consumes the TaskGraph AS-IS (never re-parses text). Every belief
   is a HYPOTHESIS with confidence + evidence — never a diagnosis.
   Beliefs inform policy; they never mutate the graph.

   English-only, deterministic.
   ============================================================ */

import type { Belief, TaskGraph } from "../types-v5";

/**
 * Derive the belief set for a task graph. Rules read ONLY graph
 * facts (entities, relations, subIntent, structure) — each fired
 * rule is recorded in the belief's evidence array.
 */
export function deriveBeliefs(g: TaskGraph): Belief[] {
  const beliefs: Belief[] = [];
  const ev: string[] = [];

  /* ---- barrier hypothesis ---- */
  const target = g.primaryTarget;
  const targetType = target?.entityType ?? "unclassified";
  const hasRecipient = g.recipient != null;
  const hasDeadline = g.entities.some((e) => e.role === "time");
  const multiPart = g.clauses.length > 1;

  /* communication toward a person -> social friction is plausible */
  if (hasRecipient && ["reply", "initiate-contact", "follow-up", "negotiate", "cancel-plan"].includes(g.subIntent)) {
    beliefs.push({
      kind: "barrier",
      value: "social-friction",
      confidence: 0.7,
      evidence: [`recipient:${g.recipient?.key}`, `subIntent:${g.subIntent}`],
    });
  }

  /* big vague target ("stuff", "things") -> overwhelm plausible */
  if (target && ["stuff", "things", "everything"].includes(target.key)) {
    beliefs.push({
      kind: "barrier",
      value: "overwhelm",
      confidence: 0.65,
      evidence: [`vague-target:${target.key}`],
    });
  }

  /* multi-part task -> overwhelm plausible */
  if (multiPart) {
    beliefs.push({
      kind: "barrier",
      value: "overwhelm",
      confidence: 0.6,
      evidence: [`clauses:${g.clauses.length}`, `secondaryVerbs:${g.secondaryVerbs.join("+") || "none"}`],
    });
  }

  /* deadline present -> time-pressure plausible */
  if (hasDeadline) {
    const t = g.entities.find((e) => e.role === "time");
    beliefs.push({
      kind: "barrier",
      value: "time-pressure",
      confidence: 0.55,
      evidence: [`time:${t?.key}`],
    });
  }

  /* broken-thing fix -> frustration plausible */
  if (g.subIntent === "fix-broken") {
    beliefs.push({
      kind: "barrier",
      value: "frustration-risk",
      confidence: 0.5,
      evidence: [`subIntent:fix-broken`, `targetType:${targetType}`],
    });
  }

  /* avoidance framing: the task itself is about something the user
     has been dodging ("stop avoiding my driving lessons") — the
     barrier is the dodge, not confusion */
  if (g.action === "stop" || g.action === "avoid") {
    beliefs.push({
      kind: "barrier",
      value: "avoiding",
      confidence: 0.8,
      evidence: [`avoidance-verb:${g.action}`, `object:${target?.key ?? "implicit"}`],
    });
  }

  /* no verb at all -> genuine unclear */
  if (!g.action) {
    beliefs.push({
      kind: "barrier",
      value: "unclear-task",
      confidence: 0.75,
      evidence: ["no-verb-in-graph"],
    });
  }

  /* ---- momentum-neutral capacity note (no fabrication) ---- */
  beliefs.push({
    kind: "capacity",
    value: "baseline",
    confidence: 0.5,
    evidence: ["no-session-history-in-phase2"],
  });

  /* ---- fidelity risk: entry steps are legitimate ONLY for
     starting-type barriers on concrete targets ---- */
  if (target && targetType !== "unclassified") {
    beliefs.push({
      kind: "fidelity-risk",
      value: "low",
      confidence: 0.8,
      evidence: [`typed-target:${targetType}`],
    });
  } else {
    beliefs.push({
      kind: "fidelity-risk",
      value: "elevated",
      confidence: 0.6,
      evidence: ["unclassified-target"],
    });
  }

  /* ---- momentum placeholder (updated by feedback in later phases) ---- */
  beliefs.push({
    kind: "momentum",
    value: "cold-start",
    confidence: 0.4,
    evidence: ["first-attempt"],
  });

  void ev;
  return beliefs;
}
