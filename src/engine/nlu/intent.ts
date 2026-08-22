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

/** Find the base verb in a clause using the shared VERBS lexicon.
 * Framing/avoidance auxiliaries ("keep putting off", "keep") are
 * skipped when a REAL verb follows — the task hides behind them:
 * "I keep putting off cleaning the garage" -> clean, not keep. */
const FRAMING_VERBS = new Set(["keep", "keeps", "kept", "putting", "avoid", "avoiding", "postpone", "postponing", "delay", "delaying"]);

/** Phrasal verbs: two words that act as one task verb.
 * Checked BEFORE single-word lookup ("back up my files" -> backup). */
const PHRASAL_VERBS: Record<string, string> = {
  "back up": "backup",
  "set up": "setup",
  "clean up": "clean",
  "wash up": "wash",
  "sign up": "register",
  "follow up": "followup",
  "pick up": "pickup",
  "drop off": "dropoff",
  "check out": "check",
  "fill out": "fill",
  "hand in": "submit",
  "write up": "write",
};

/** Merge phrasal verbs into their single-token form so EVERY layer
 * (verb finder, entity core, object extractor) sees one verb word.
 * "Back up my laptop files" -> "backup my laptop files". */
export function mergePhrasals(text: string): string {
  let out = text;
  for (const [pair, merged] of Object.entries(PHRASAL_VERBS)) {
    out = out.replace(new RegExp(`\\b${pair}\\b`, "gi"), merged);
  }
  return out;
}

export function findVerbBase(clauseText: string): { base: string; index: number } | null {
  const words = tokenize(clauseText);
  /* pass 0: phrasal verbs — two consecutive words mapping to one base */
  for (let i = 0; i < words.length - 1; i++) {
    const pair = `${words[i]} ${words[i + 1]}`;
    const ph = PHRASAL_VERBS[pair];
    if (ph) return { base: ph, index: i };
  }
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    let base = VERBS[w] ? w : null;
    if (!base) {
      const s = stem(w);
      if (VERBS[s]) base = s;
    }
    if (!base) continue;
    /* framing verb with a real verb after it? skip to the real one */
    if (FRAMING_VERBS.has(base)) {
      for (let j = i + 1; j < words.length; j++) {
        const w2 = words[j];
        if (!FRAMING_VERBS.has(w2) && (VERBS[w2] || VERBS[stem(w2)])) {
          return { base: VERBS[w2] ? w2 : stem(w2), index: j };
        }
      }
      /* nothing real after — the framing itself is the signal */
      return { base, index: i };
    }
    return { base, index: i };
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
const FORM_HINTS = /\b(submit|form|application|file (my|the|a) (tax|return|claim)|paperwork|fill out)\b/i;
const BUY_HINTS = /\b(buy|order|purchase|get .* from)\b/i;
const ORGANIZE_HINTS = /\b(organize|organise|sort|declutter|archive|clean up my (files?|desktop|inbox)|clear (my )?(email )?inbox|empty (my )?inbox|clear (my )?emails?)\b/i;

/** Physical refinement. */
const ACTIVITY_HINTS = /\b(walk|run|gym|workout|stretch|exercise|yoga|jog|push-?ups?|situps?|squats?|reps?|plank)\b/i;
const CLEAN_HINTS = /\b(clean|scrub|mop|vacuum|dust|wash the (dishes|laundry))\b/i;
const TIDY_HINTS = /\b(tidy|declutter|organize the|pick up the)\b/i;

/** Tech refinement. */
const FIX_HINTS = /\b(fix|repair|debug|troubleshoot|not working|broken|crashed?|crashing|freez(e|es|ing)|hang(s|ing)|shuts? down|won'?t (start|boot|turn on))\b/i;
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
  /* physical activity: do + reps/exercise noun ("do 10 push-ups") */
  if (verb === "do" && ACTIVITY_HINTS.test(t)) {
    ev.push("verb:do + activity-noun");
    return { subIntent: "physical-activity", evidence: ev };
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
  /* clearing/organizing an inbox or file collection is organizing,
     NOT communication — must precede the message-noun reply rule
     ("clear my email inbox" must never become "write to someone") */
  if ((verb === "clear" || verb === "clean") && ORGANIZE_HINTS.test(t)) {
    ev.push("verb:clear/clean + organize-object");
    return { subIntent: "file-organize", evidence: ev };
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
  if (ACTIVITY_HINTS.test(t) && (verb === "walk" || verb === "run" || verb === "exercise" || verb === "stretch" || verb === "workout" || verb === "go")) {
    ev.push("hint:activity+verb");
    return { subIntent: "physical-activity", evidence: ev };
  }
  /* learning a SKILL (guitar, coding) vs reading material —
     "learn" with a non-document object is practice, not study */
  if ((verb === "learn" || verb === "practice") && !/\b(chapter|book|textbook|article|notes|manual|guide)\b/i.test(t)) {
    ev.push(`verb:${verb} + skill-object`);
    return { subIntent: "practice-skill", evidence: ev };
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
    (hasTargetMsg && ["text", "call", "write"].includes(verb ?? ""))
  ) {
    ev.push(verb ? `verb:${verb}` : "target:message-noun");
    return { subIntent: "reply", evidence: ev };
  }
  if (verb === "send" || verb === "email") {
    /* sending/composing a NEW message — not replying to one */
    ev.push(`verb:${verb} -> new outbound`);
    return { subIntent: "initiate-contact", evidence: ev };
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
  /* exam/test wording implies study even without "study" as the verb
     ("I have a huge history exam tomorrow") */
  if (/\b(exams?|tests?|quiz(zes)?|midterms?|finals?|revision)\b/i.test(t) && (verb === "have" || verb === "start" || verb === "finish" || verb == null)) {
    ev.push("hint:exam -> study-material");
    return { subIntent: "study-material", evidence: ev };
  }
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
    fix: "fix-broken", repair: "fix-broken", debug: "fix-broken", crash: "fix-broken", troubleshoot: "fix-broken",
    refactor: "build-project", backup: "fix-broken", setup: "configure-tool", sync: "fix-broken", install: "configure-tool",
    followup: "follow-up", pickup: "tidy-space", dropoff: "buy-item",
    water: "tidy-space", assemble: "build-project", pack: "file-organize",
    print: "submit-form", scan: "submit-form", upload: "submit-form", download: "gather-options",
    register: "submit-form", reserve: "schedule-appointment", tighten: "fix-broken",
    unpack: "tidy-space", dry: "clean-space", measure: "design-artifact",
    cut: "design-artifact", hang: "design-artifact",
    code: "build-project", build: "build-project", develop: "build-project",
    design: "design-artifact", draw: "design-artifact", paint: "design-artifact",
    organize: "file-organize", organise: "file-organize", sort: "file-organize",
    plan: "clarify-task", research: "gather-options", check: "gather-options",
    prepare: "clarify-task", cook: "clarify-task", practice: "practice-skill",
    review: "study-material", revise: "revise-existing", draft: "draft-new",
    outline: "draft-new",
  };
  return map[verb] ?? "start-unknown";
}
