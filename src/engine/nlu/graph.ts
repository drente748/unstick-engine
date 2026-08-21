/* ============================================================
   nlu/graph — build the TaskGraph: entities + typed relations.

   THE CONSTITUTION (enforced here):
     Never generate from extracted words. Generate from semantic
     relations. The graph is immutable once built; beliefs and
     learning may add hypotheses ABOUT it, never rewrite it.

   English-only, deterministic, evidence-backed.
   ============================================================ */

import { analyzeTask, normalizeTask, PEOPLE, STOPWORDS, stem, tokenize, VERBS } from "../analysis";
import { splitClauses } from "./clauses";
import { extractEntities, TEMPORAL_WORDS, TEMPORAL_MODIFIERS } from "./entities";
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
     parse found one but entity extraction missed it. QUALITY GATE:
     the v4 object is a raw word slice — reject it when it contains
     a person, a temporal word, or a known verb (those mean the
     slice spans roles and is not a clean artifact phrase). ---- */
  let target: TaskEntity | null = entities.find((e) => e.role === "target") ?? null;
  if (!target && analysis.object && analysis.object.toLowerCase() !== title.toLowerCase() && clauses.length === 1) {
    const objWords = tokenize(analysis.object);
    /* TRIM instead of reject: cut the slice at the first polluting
       word (person / temporal / verb) and keep the clean prefix.
       "the dentist appointment next Tuesday" -> "dentist appointment" */
    let cut = objWords.length;
    /* index of the first CONTENT word (stopwords don't count) —
       a person there is a recipient, not a modifier */
    let firstContent = -1;
    for (let i = 0; i < objWords.length; i++) {
      if (!STOPWORDS.has(objWords[i])) {
        firstContent = i;
        break;
      }
    }
    for (let i = 0; i < objWords.length; i++) {
      const w = objWords[i];
      /* a PERSON cuts only when it is the first content word
         (recipient pattern: "email my boss ..." -> boss is not the
         artifact). Mid-slice a person word is a legitimate modifier
         ("dentist appointment" = an appointment WITH a dentist). */
      if (PEOPLE.includes(w) && i === firstContent) {
        cut = i;
        break;
      }
      if (
        TEMPORAL_WORDS.has(w) || TEMPORAL_MODIFIERS.has(w) ||
        Object.prototype.hasOwnProperty.call(VERBS, w) || Object.prototype.hasOwnProperty.call(VERBS, stem(w))
      ) {
        cut = i;
        break;
      }
    }
    const trimmed = objWords.slice(0, cut).filter((w) => !STOPWORDS.has(w));
    if (trimmed.length > 0) {
      const key = trimmed.join(" ");
      entities.push({
        id: `e${entities.length + 1}`,
        role: "target",
        text: trimmed.join(" "),
        key,
        confidence: 0.65,
        evidence: "analysis-object-trimmed",
      });
      target = entities[entities.length - 1];
    }
  }

  /* ---- entities from REMAINING clauses (multi-part tasks) — tagged
     with their clause index, kept OUT of the head relations ---- */
  const secondaryVerbs: string[] = [];
  const secondary: TaskEntity[] = [];
  for (let ci = 1; ci < clauses.length; ci++) {
    const cText = clauses[ci].text;
    const cVerb = findVerbBase(cText);
    if (cVerb) secondaryVerbs.push(cVerb.base);
    const cEnts = extractEntities(cText).map((e) => ({ ...e, clause: ci }));
    secondary.push(...cEnts);
  }

  /* ---- relation edges (typed, evidence-backed) ----
     Edges connect DISTINCT entities; each edge records how one
     entity qualifies another ("Sarah's email ABOUT the deadline"). */
  const relations: RelationEdge[] = [];
  const byRole = (r: string) => entities.filter((e) => e.role === r);

  const link = (from: TaskEntity | undefined, kind: RelationKind, to: TaskEntity | undefined, conf: number, ev: string) => {
    if (!from || !to) return;
    /* never link an entity to itself — by id OR by key (the same
       word can be extracted twice under different roles) */
    if (from.id === to.id || from.key === to.key) return;
    if (relations.some((r) => r.from === from.id && r.kind === kind && r.to === to.id)) return;
    relations.push({ from: from.id, kind, to: to.id, confidence: conf, evidence: ev });
  };

  const commIntents: SubIntent[] = ["reply", "initiate-contact", "follow-up", "cancel-plan", "negotiate"];

  /* ---- dedupe FIRST (before any role lookups): a tool identical to
     the target is the same entity ("reply to John's email" — email IS
     both medium and artifact). Keep the target; drop the redundant
     tool and re-number ids. ---- */
  const toolIdx = entities.findIndex((e) => e.role === "tool");
  if (toolIdx >= 0 && target && entities[toolIdx].key === target.key) {
    entities.splice(toolIdx, 1);
    entities.forEach((e, i) => {
      e.id = `e${i + 1}`;
    });
    target = entities.find((e) => e.role === "target") ?? null;
  }

  /* role lookups AFTER dedupe — stale references are how a time
     entity once got linked as a tool ("via -> Before Friday"). */
  const personE = byRole("person")[0];
  const topicE = byRole("topic")[0];
  const placeE = byRole("place")[0];
  const toolE = byRole("tool")[0];

  /* directed-to / owned-by: person <-> target */
  if (target && personE) {
    if (personE.evidence.startsWith("possessive")) {
      link(personE, "owned-by", target, 0.9, "possessive-owner");
    } else if (commIntents.includes(intent.subIntent)) {
      link(target, "directed-to", personE, 0.85, `comm-intent:${intent.subIntent}`);
    }
  }
  /* about: target -> topic (skip clause-verb metadata entities) */
  if (target && topicE && !topicE.key.startsWith("clause-verb:")) {
    link(target, "about", topicE, 0.9, topicE.evidence);
  }
  /* located-at: target -> place — but NOT when the place IS the target
     ("clean the garage": garage is the thing acted on, not a venue) */
  if (target && placeE && target.key !== placeE.key) {
    link(target, "located-at", placeE, 0.8, "place+target-present");
  }
  /* via: target -> tool */
  if (toolE && target) link(target, "via", toolE, 0.85, toolE.evidence);
  /* due-by: target -> time ("before Friday") */
  const timeE = byRole("time")[0];
  if (target && timeE) link(target, "due-by", timeE, 0.85, timeE.evidence);

  /* ---- graph-level confidence: weakest mandatory slot wins ---- */
  const mandatoryConfidences = [
    action ? 0.9 : 0.3,
    target ? target.confidence : 0.4,
    intent.subIntent === "start-unknown" ? 0.35 : 0.8,
  ];
  const confidence = Math.min(...mandatoryConfidences);

  /* ---- merge secondary-clause entities with contiguous ids ---- */
  const idOffset = entities.length;
  const mergedSecondary = secondary.map((s, i) => ({ ...s, id: `e${idOffset + i + 1}` }));

  return {
    action,
    subIntent: intent.subIntent,
    structure: analysis.structure,
    entities: [...entities, ...mergedSecondary],
    relations,
    primaryTarget: target ?? null,
    recipient: byRole("person")[0] ?? null,
    topic: topicE ?? null,
    clauses: clauses.map((c) => c.text),
    secondaryVerbs,
    confidence,
    evidence: [...intent.evidence, ...entities.map((e) => e.evidence)],
  };
}
