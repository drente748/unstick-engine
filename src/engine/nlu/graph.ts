/* ============================================================
   nlu/graph — build the TaskGraph: entities + typed relations.

   THE CONSTITUTION (enforced here):
     Never generate from extracted words. Generate from semantic
     relations. The graph is immutable once built; beliefs and
     learning may add hypotheses ABOUT it, never rewrite it.

   English-only, deterministic, evidence-backed.
   ============================================================ */

import { analyzeTask, normalizeTask } from "../analysis";
import { splitClauses } from "./clauses";
import { extractEntities } from "./entities";
import { classifySubIntent, findVerbBase } from "./intent";
import type {
  RelationEdge,
  RelationKind,
  SubIntent,
  TaskEntity,
  TaskGraph,
} from "../types-v5";

/**
 * Build the semantic graph for a task. The FIRST actionable clause
 * heads the graph; later clauses are recorded in `clauses` for
 * multi-part planning (Phase 2 consumes them).
 */
export function buildTaskGraph(rawTitle: string): TaskGraph {
  const title = normalizeTask(rawTitle);
  const analysis = analyzeTask(title);

  const clauses = splitClauses(title);
  const head = clauses[0]?.text ?? title;

  /* ---- verb of the head clause ---- */
  const v = findVerbBase(head);
  const action = v?.base ?? null;

  /* ---- entities from the head clause ---- */
  const entities = extractEntities(head);

  /* ---- sub-intent ---- */
  const intent = classifySubIntent(action, entities, head);

  /* ---- ensure a target exists: derive from object phrase when the
     parse found one but entity extraction missed it ---- */
  let target = entities.find((e) => e.role === "target");
  if (!target && analysis.object && analysis.object.toLowerCase() !== title.toLowerCase()) {
    const key = analysis.object.toLowerCase();
    entities.push({
      id: `e${entities.length + 1}`,
      role: "target",
      text: analysis.object,
      key,
      confidence: 0.6,
      evidence: "analysis-object-fallback",
    });
    target = entities[entities.length - 1];
  }

  /* ---- relation edges (typed, evidence-backed) ----
     Edges connect DISTINCT entities; each edge records how one
     entity qualifies another ("Sarah's email ABOUT the deadline"). */
  const relations: RelationEdge[] = [];
  const byRole = (r: string) => entities.filter((e) => e.role === r);

  const link = (from: TaskEntity | undefined, kind: RelationKind, to: TaskEntity | undefined, conf: number, ev: string) => {
    if (!from || !to || from.id === to.id) return;
    if (relations.some((r) => r.from === from.id && r.kind === kind && r.to === to.id)) return;
    relations.push({ from: from.id, kind, to: to.id, confidence: conf, evidence: ev });
  };

  const personE = byRole("person")[0];
  const topicE = byRole("topic")[0];
  const placeE = byRole("place")[0];
  const toolE = byRole("tool")[0];
  const commIntents: SubIntent[] = ["reply", "initiate-contact", "follow-up", "cancel-plan", "negotiate"];

  /* ---- dedupe: a tool identical to the target is the same entity
     ("reply to John's email" — email IS both medium and artifact).
     Keep the target; drop the redundant tool. ---- */
  const toolIdx = entities.findIndex((e) => e.role === "tool");
  if (toolIdx >= 0 && target && entities[toolIdx].key === target.key) {
    entities.splice(toolIdx, 1);
    /* re-number ids so they stay contiguous */
    entities.forEach((e, i) => {
      e.id = `e${i + 1}`;
    });
    const t = entities.find((e) => e.role === "target");
    if (t) target = t;
  }

  /* directed-to / owned-by: person <-> target */
  if (target && personE) {
    if (personE.evidence.startsWith("possessive")) {
      link(personE, "owned-by", target, 0.9, "possessive-owner");
    } else if (commIntents.includes(intent.subIntent)) {
      link(target, "directed-to", personE, 0.85, `comm-intent:${intent.subIntent}`);
    }
  }
  /* about: target -> topic */
  if (target && topicE) link(target, "about", topicE, 0.9, topicE.evidence);
  /* located-at: target -> place */
  if (target && placeE) link(target, "located-at", placeE, 0.8, "place+target-present");
  /* via: target -> tool */
  if (toolE && target) link(target, "via", toolE, 0.85, toolE.evidence);

  /* ---- graph-level confidence: weakest mandatory slot wins ---- */
  const mandatoryConfidences = [
    action ? 0.9 : 0.3,
    target ? target.confidence : 0.4,
    intent.subIntent === "start-unknown" ? 0.35 : 0.8,
  ];
  const confidence = Math.min(...mandatoryConfidences);

  return {
    action,
    subIntent: intent.subIntent,
    structure: analysis.structure,
    entities,
    relations,
    primaryTarget: target ?? null,
    recipient: byRole("person")[0] ?? null,
    topic: topicE ?? null,
    clauses: clauses.map((c) => c.text),
    confidence,
    evidence: [...intent.evidence, ...entities.map((e) => e.evidence)],
  };
}
