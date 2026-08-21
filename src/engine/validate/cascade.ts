/* ============================================================
   validate/cascade — Phase 3: the seven-gate validation cascade.

   Every candidate passes through, in order:
     1. structural      — non-empty, sane length, single sentence
     2. semantic        — action family fits entity nature (critic)
     3. entity-consistency — referenced entities exist in the graph
     4. executability   — ONE concrete action, no plan dump
     5. fidelity        — task-faithful or legitimate doorway
     6. dedupe          — not already shown (all five keys)
     7. critic          — final self-check (the stranger test)

   A failed gate REJECTS the candidate outright — rejected
   candidates never compete on score with valid ones.

   English-only, deterministic.
   ============================================================ */

import type { CandidateV5, TaskGraph, Verdict } from "../types-v5";

const ok = (reason: string): Verdict => ({ ok: true, gate: null, reason });
const reject = (gate: Verdict["gate"], reason: string): Verdict => ({ ok: false, gate, reason });

/** Gate 1 — structural sanity. */
export function checkStructural(c: CandidateV5): Verdict {
  const a = c.action.trim();
  if (a.length < 8) return reject("structural", "too short to be an action");
  if (a.length > 160) return reject("structural", "too long — reads like a plan, not a step");
  if ((a.match(/[.!?]/g) ?? []).length > 2) return reject("structural", "multi-sentence plan dump");
  return ok("structurally sound");
}

/** Gate 2 — semantic: strategy family vs target nature. */
export function checkSemantic(c: CandidateV5, g: TaskGraph): Verdict {
  const t = g.primaryTarget?.entityType ?? "unclassified";
  const verb0 = c.action.split(/\s+/)[0]?.toLowerCase() ?? "";
  /* "do" is an auxiliary — the real action is the next word
     ("do one full sorting pass" -> sorting -> organize family) */
  let verb = verb0;
  if (verb === "do" || verb === "give") {
    const rest = c.action.toLowerCase();
    if (/sort|organiz/.test(rest)) verb = "sort";
    else if (/write|sentence/.test(rest)) verb = "write";
    else if (/read/.test(rest)) verb = "read";
  }
  const FAMILY_BY_VERB: Record<string, string> = {
    enter: "enter", approach: "approach", pick: "pick-up", clear: "clear",
    open: "open", read: "read", write: "write", reply: "reply", draft: "draft",
    send: "send", text: "message", call: "contact", sort: "sort",
    organize: "organize", fix: "fix", set: "arrange", lay: "lay-out",
    walk: "go-to", stand: "approach", sit: "sit-at", say: "ask", find: "open",
    put: "move", gather: "gather", name: "survey", look: "survey",
  };
  const family = FAMILY_BY_VERB[verb];
  if (!family) return ok(`verb "${verb}" has no fit constraint (allowed)`);

  const FIT: Record<string, string[]> = {
    "cleanable-space": ["clean", "tidy", "enter", "approach", "survey", "pick-up", "open"],
    "work-surface": ["clear", "sit-at", "arrange", "wipe", "pick-up"],
    "storage-space": ["organize", "sort", "open", "declutter", "pick-up"],
    "communication-artifact": ["open", "read", "reply", "draft", "send"],
    "person-contact": ["contact", "message", "call", "ask"],
    document: ["write", "edit", "open", "print", "review", "read"],
    "reading-material": ["read", "skim", "open", "annotate"],
    "digital-system": ["open", "fix", "configure", "inspect"],
    "abstract-project": ["start", "plan", "advance", "survey", "open"],
    "physical-object": ["pick-up", "move", "gather", "wash"],
    wearable: ["lay-out", "gather", "put-on"],
    "location-venue": ["go-to", "travel-to", "pack-for"],
    unclassified: ["open", "approach", "survey", "start", "plan", "ask"],
  };
  const allowed = FIT[t] ?? [];
  if (allowed.length === 0 || allowed.includes(family)) {
    return ok(`"${family}" fits ${t}`);
  }
  return reject("semantic", `"${family}" invalid on ${t} (valid: ${allowed.join(", ")})`);
}

/** Gate 3 — every {role} reference resolved to a real graph entity. */
export function checkEntityConsistency(c: CandidateV5, g: TaskGraph): Verdict {
  /* unresolved placeholders would mean fabrication */
  if (/\{(target|recipient|topic)\}/.test(c.action)) {
    return reject("entity-consistency", "unresolved role placeholder in output");
  }
  /* generic-pronoun drift: the step must not invent named entities.
     Only mid-sentence capitalized words count — sentence-initial
     words are imperative verbs ("Look at...", "Sort five..."). */
  const body = c.action.replace(/^[^.!?]*?[.!?]\s*/, (m) => m); /* keep whole text */
  const names = body.match(/(?<![.!?]\s|^)\b[A-Z][a-z]{2,}\b/g) ?? [];
  const graphNames = new Set(
    g.entities.flatMap((e) => e.text.split(/\s+/).map((w) => w.replace(/[^A-Za-z]/g, ""))).filter(Boolean),
  );
  for (const n of names) {
    if (!graphNames.has(n)) return reject("entity-consistency", `invented entity "${n}" not present in graph`);
  }
  return ok("entities consistent");
}

/** Gate 4 — executability: ONE concrete move, not a plan. */
export function checkExecutability(c: CandidateV5): Verdict {
  const a = c.action.toLowerCase();
  /* plan-dump markers: sequenced futures */
  if (/\bthen\b.*\bthen\b/.test(a)) return reject("executability", "chained 'then's — that's a plan");
  if (/\b(first|second|third|next),? (you|we)\b/.test(a)) return reject("executability", "numbered plan language");
  if (c.action.split(",").length > 3) return reject("executability", "too many clauses for one step");
  /* must contain at least one concrete action verb */
  const CONCRETE = /\b(enter|pick|clear|open|read|write|reply|draft|send|text|call|sort|organize|fix|set|lay|walk|stand|sit|say|find|put|gather|do|give|name|look|place|fill|sign|pay|submit|watch|take|wash|empty)\b/;
  if (!CONCRETE.test(a)) return reject("executability", "no concrete action verb");
  return ok("one executable move");
}

/** Gate 5 — fidelity grade + entry rules. */
export function checkFidelity(c: CandidateV5): Verdict {
  if (c.fidelity === "off-task") {
    return reject("fidelity", `doorway move rejected: barrier is task-side or step is not opening`);
  }
  if (c.fidelity === "entry-legitimate") {
    if (!c.entryRules.onlyAsOpeningStep) return reject("fidelity", "doorway step outside opening position");
  }
  return ok(`fidelity=${c.fidelity}`);
}

/** Gate 6 — dedupe against everything already shown (five keys). */
export function checkDedupe(c: CandidateV5, shownSurfaces: Set<string>, shownIntents: Set<string>): Verdict {
  if (shownSurfaces.has(c.keys.surfaceKey)) return reject("dedupe", "exact surface already shown");
  if (shownIntents.has(c.keys.intentKey)) return reject("dedupe", "same intent fingerprint already shown");
  return ok("novel surface and intent");
}

/** Gate 7 — the stranger test: could a stranger do this in 2 minutes? */
export function checkCritic(c: CandidateV5): Verdict {
  const a = c.action.toLowerCase();
  /* vague-only steps with no anchor fail */
  if (/\b(somehow|whatever|stuff|things)\b/.test(a) && !/\b(open|pick|write|read|look|name|say|find)\b/.test(a)) {
    return reject("critic", "vague wording without a concrete anchor");
  }
  /* future/conditional framing defers action */
  if (/\b(you should|you could|maybe|eventually|someday)\b/.test(a)) {
    return reject("critic", "deferring language — not a now-step");
  }
  return ok("stranger-executable");
}

/** Run the full cascade; returns the FIRST verdict failure or final ok. */
export function runCascade(
  c: CandidateV5,
  g: TaskGraph,
  shownSurfaces: Set<string>,
  shownIntents: Set<string>,
): Verdict {
  const gates: Array<() => Verdict> = [
    () => checkStructural(c),
    () => checkSemantic(c, g),
    () => checkEntityConsistency(c, g),
    () => checkExecutability(c),
    () => checkFidelity(c),
    () => checkDedupe(c, shownSurfaces, shownIntents),
    () => checkCritic(c),
  ];
  let last: Verdict = ok("no gates");
  for (const gate of gates) {
    last = gate();
    if (!last.ok) return last;
  }
  return last;
}
