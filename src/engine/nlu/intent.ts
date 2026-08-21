/* ============================================================
   nlu/intent — fine-grained SubIntent classification.

   Coarse structures ("communication") hide the difference between
   a reply, a follow-up and a cancellation — moves that differ
   radically. This module resolves the SUB-intent from verb +
   entities + wording signals, always with evidence.

   English-only, deterministic.
   ============================================================ */

import { VERBS, tokenize, stem } from "../analysis";
import type { SubIntent, TaskEntity } from "../types-v5";

/** Find the base verb in a clause using the shared VERBS lexicon. */
export function findVerbBase(clauseText: string): { base: string; index: number } | null {
  const words = tokenize(clauseText);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (VERBS[w]) return { base: w, index: i };
    const s = stem(w);
    if (VERBS[s]) return { base: s, index: i };
  }
  return null;
}

/** Signals that refine communication intents. */
const CANCEL_HINTS = /\b(cancel|call off|postpone|reschedule|move our)\b/i;
const FOLLOWUP_HINTS = /\b(follow up|followup|check (back|in)|nudge|remind)\b/i;
const NEGOTIATE_HINTS = /\b(negotiate|ask for|request|dispute|appeal|lower the price)\b/i;
const INITIATE_HINTS = /\b(reach out|get in touch|introduce myself|contact)\b/i;

/** Creation refinement. */
const REVISE_HINTS = /\b(edit|revise|rewrite|improve|polish|fix (the|my) (draft|essay|report))\b/i;
const DESIGN_HINTS = /\b(design|logo|mockup|wireframe|layout|poster|flyer)\b/i;

/** Learning refinement. */
const PRACTICE_HINTS = /\b(practice|drill|rehearse|run through|reps?)\b/i;

/** Research/decision refinement. */
const COMPARE_HINTS = /\b(compare|versus|\bvs\.?\b|pros and cons|which .* best|decide between)\b/i;
const DECIDE_HINTS = /\b(decide|choose|pick|commit to)\b/i;
const GATHER_HINTS = /\b(find out|look into|research|read up|explore options|shortlist)\b/i;

/** Admin refinement. */
const SCHEDULE_HINTS = /\b(book|schedule|appointment|reserve|make an appointment)\b/i;
const PAY_HINTS = /\b(pay|bill|invoice|rent|fine|subscription)\b/i;
const FORM_HINTS = /\b(submit|form|application|file (my|the|a) (tax|return|claim)|paperwork)\b/i;
const BUY_HINTS = /\b(buy|order|purchase|get .* from)\b/i;
const ORGANIZE_HINTS = /\b(organize|organise|sort|declutter|archive|clean up my (files?|desktop|inbox))\b/i;

/** Physical refinement. */
const ACTIVITY_HINTS = /\b(walk|run|gym|workout|stretch|exercise|yoga|jog)\b/i;
const CLEAN_HINTS = /\b(clean|scrub|mop|vacuum|dust|wash the (dishes|laundry))\b/i;
const TIDY_HINTS = /\b(tidy|declutter|organize the|pick up the)\b/i;

/** Tech refinement. */
const FIX_HINTS = /\b(fix|repair|debug|troubleshoot|not working|broken|crashed)\b/i;
const BUILD_HINTS = /\b(build|develop|code|launch|ship|set up my (site|app))\b/i;
const CONFIGURE_HINTS = /\b(install|configure|set up|migrate|update my)\b/i;

/**
 * Classify the sub-intent of one clause. Priority: specific signals
 * first, generic verbs last. Returns the intent plus evidence.
 */
export function classifySubIntent(
  verb: string | null,
  entities: TaskEntity[],
  clauseText: string,
): { subIntent: SubIntent; evidence: string[] } {
  const ev: string[] = [];
  const t = clauseText;
  const roles = new Set(entities.map((e) => e.role));
  const hasTargetMsg = entities.some(
    (e) => e.role === "target" && ["email", "message", "text", "dm", "letter", "mail", "reply", "call", "voicemail", "whatsapp", "slack", "inbox"].includes(e.key),
  );

  /* ---- tech ---- */
  if (verb === "fix" || FIX_HINTS.test(t)) {
    ev.push(verb === "fix" ? "verb:fix" : "hint:fix-wording");
    return { subIntent: "fix-broken", evidence: ev };
  }
  if ((verb === "build" || verb === "code" || verb === "develop") && !CONFIGURE_HINTS.test(t)) {
    ev.push(`verb:${verb}`);
    return { subIntent: "build-project", evidence: ev };
  }
  if (CONFIGURE_HINTS.test(t) && (roles.has("tool") || verb === "install" || verb === "update")) {
    ev.push("hint:configure + tool");
    return { subIntent: "configure-tool", evidence: ev };
  }

  /* ---- admin / errand (before generic communication so "book a call" is scheduling) ---- */
  if (SCHEDULE_HINTS.test(t)) {
    ev.push("hint:schedule");
    return { subIntent: "schedule-appointment", evidence: ev };
  }
  if (PAY_HINTS.test(t) && (verb === "pay" || roles.has("target"))) {
    ev.push("hint:pay");
    return { subIntent: "pay-bill", evidence: ev };
  }
  if (FORM_HINTS.test(t)) {
    ev.push("hint:form");
    return { subIntent: "submit-form", evidence: ev };
  }
  if ((verb === "buy" || BUY_HINTS.test(t))) {
    ev.push("verb/hint:buy");
    return { subIntent: "buy-item", evidence: ev };
  }
  if (ORGANIZE_HINTS.test(t) && (verb === "organize" || verb === "sort" || verb === "file")) {
    ev.push("hint:organize-files");
    return { subIntent: "file-organize", evidence: ev };
  }

  /* ---- physical ---- */
  if (ACTIVITY_HINTS.test(t) && (verb === "walk" || verb === "run" || verb === "exercise" || verb === "stretch" || verb === "workout")) {
    ev.push("hint:activity+verb");
    return { subIntent: "physical-activity", evidence: ev };
  }
  if (verb === "clean" || CLEAN_HINTS.test(t)) {
    ev.push(verb === "clean" ? "verb:clean" : "hint:clean");
    return { subIntent: "clean-space", evidence: ev };
  }
  if (verb === "tidy" || verb === "declutter" || TIDY_HINTS.test(t)) {
    ev.push("verb/hint:tidy");
    return { subIntent: "tidy-space", evidence: ev };
  }

  /* ---- communication refinements (specific before generic) ---- */
  if (CANCEL_HINTS.test(t)) {
    ev.push("hint:cancel");
    return { subIntent: "cancel-plan", evidence: ev };
  }
  if (FOLLOWUP_HINTS.test(t)) {
    ev.push("hint:follow-up");
    return { subIntent: "follow-up", evidence: ev };
  }
  if (NEGOTIATE_HINTS.test(t)) {
    ev.push("hint:negotiate");
    return { subIntent: "negotiate", evidence: ev };
  }
  if (INITIATE_HINTS.test(t) && !hasTargetMsg) {
    ev.push("hint:initiate");
    return { subIntent: "initiate-contact", evidence: ev };
  }
  if (
    (verb === "reply" || verb === "respond" || verb === "answer") ||
    (hasTargetMsg && ["email", "text", "call", "send", "write"].includes(verb ?? ""))
  ) {
    ev.push(verb ? `verb:${verb}` : "target:message-noun");
    return { subIntent: "reply", evidence: ev };
  }
  if (hasTargetMsg && roles.has("person")) {
    ev.push("target:message + person");
    return { subIntent: "initiate-contact", evidence: ev };
  }

  /* ---- creation refinements ---- */
  if (REVISE_HINTS.test(t)) {
    ev.push("hint:revise");
    return { subIntent: "revise-existing", evidence: ev };
  }
  if (DESIGN_HINTS.test(t)) {
    ev.push("hint:design");
    return { subIntent: "design-artifact", evidence: ev };
  }
  if (verb === "write" || verb === "draft") {
    ev.push(`verb:${verb}`);
    return { subIntent: "draft-new", evidence: ev };
  }

  /* ---- learning ---- */
  if (PRACTICE_HINTS.test(t)) {
    ev.push("hint:practice");
    return { subIntent: "practice-skill", evidence: ev };
  }
  if (verb === "study" || verb === "revise" || verb === "learn") {
    ev.push(`verb:${verb}`);
    return { subIntent: "study-material", evidence: ev };
  }

  /* ---- research / decision ---- */
  if (COMPARE_HINTS.test(t)) {
    ev.push("hint:compare");
    return { subIntent: "compare-options", evidence: ev };
  }
  if (DECIDE_HINTS.test(t)) {
    ev.push("hint:decide");
    return { subIntent: "make-decision", evidence: ev };
  }
  if (GATHER_HINTS.test(t) || verb === "research") {
    ev.push(GATHER_HINTS.test(t) ? "hint:gather" : "verb:research");
    return { subIntent: "gather-options", evidence: ev };
  }

  /* ---- fallback by coarse family ---- */
  if (verb && VERBS[verb]) {
    const fam = fallbackFamily(verb);
    ev.push(`fallback:${verb}->${fam}`);
    return { subIntent: fam, evidence: ev };
  }
  ev.push("no-verb:no-signal");
  return { subIntent: "start-unknown", evidence: ev };
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function fallbackFamily(verb: string): SubIntent {
  const map: Record<string, SubIntent> = {
    write: "draft-new", email: "initiate-contact", text: "initiate-contact",
    call: "initiate-contact", send: "initiate-contact", message: "initiate-contact",
    clean: "clean-space", tidy: "tidy-space", declutter: "tidy-space", wash: "clean-space",
    study: "study-material", read: "gather-options", learn: "practice-skill",
    pay: "pay-bill", file: "submit-form", submit: "submit-form", apply: "submit-form",
    renew: "submit-form", book: "schedule-appointment", schedule: "schedule-appointment",
    cancel: "cancel-plan", order: "buy-item",
    fix: "fix-broken", repair: "fix-broken", debug: "fix-broken",
    code: "build-project", build: "build-project", develop: "build-project",
    design: "design-artifact", draw: "design-artifact", paint: "design-artifact",
    organize: "file-organize", organise: "file-organize", sort: "file-organize",
    plan: "clarify-task", research: "gather-options", check: "gather-options",
  };
  return map[verb] ?? "start-unknown";
}
