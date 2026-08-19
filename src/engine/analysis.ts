import type { Barrier, BarrierKind, Capacity, Structure, TaskAnalysis } from "./types";

/* ============================================================
   Stages 1–5 of the pipeline: normalize → classify →
   complexity → friction → barrier hypothesis → capacity.
   Pure, deterministic task understanding. The goal is not to
   label the task "correctly" but to extract every signal that
   changes what a good FIRST move looks like.
   ============================================================ */

const VERBS: Record<string, string> = {
  write: "writing", reply: "a reply", email: "an email", text: "a text", call: "a call",
  clean: "cleaning", tidy: "tidying", declutter: "decluttering", wash: "washing",
  study: "studying", read: "reading", revise: "revising", review: "reviewing", learn: "learning",
  pay: "a payment", file: "filing", submit: "submitting", apply: "an application", renew: "renewing",
  book: "booking", schedule: "scheduling", cancel: "canceling", order: "ordering",
  fix: "a fix", repair: "a repair", update: "an update", install: "installing", debug: "debugging",
  code: "coding", build: "building", develop: "developing", design: "designing", draw: "drawing",
  paint: "painting", sketch: "sketching", edit: "editing", film: "filming", practice: "practicing",
  cook: "cooking", prep: "prepping", prepare: "preparing", pack: "packing", plan: "planning",
  organize: "organizing", organise: "organizing", sort: "sorting", budget: "a budget",
  research: "research", check: "checking", finish: "the last bit", start: "the first bit",
  exercise: "exercising", workout: "a workout", run: "a run", stretch: "a stretch",
  message: "a message", contact: "a message", answer: "an answer", send: "sending",
  sell: "a listing", list: "a listing", move: "moving", deliver: "delivering",
};

const STOPWORDS = new Set([
  "the", "a", "an", "my", "our", "your", "his", "her", "their", "some", "for", "to", "on", "in",
  "of", "up", "about", "and", "or", "then", "with", "at", "from", "me", "us", "him", "them",
  "that", "this", "it", "its", "is", "are", "be", "do", "does", "need", "have", "has", "will",
  "should", "can", "must", "really", "finally", "just", "also", "again", "today", "now", "soon",
  "asap", "please", "i", "we", "you", "he", "she", "they", "there", "here", "all", "everything",
]);

const PLACES = [
  "kitchen", "desk", "room", "bedroom", "bathroom", "office", "garage", "gym", "store", "bank",
  "library", "car", "floor", "studio", "lab", "basement", "attic", "balcony", "yard", "garden",
  "classroom", "campus", "clinic", "salon", "laundromat", "post office", "pharmacy", "shop",
];

const TOOLS = [
  "email", "inbox", "emails", "excel", "word", "notion", "google", "docs", "doc", "document",
  "app", "website", "site", "form", "file", "folder", "browser", "phone", "laptop", "computer",
  "spreadsheet", "slides", "canvas", "figma", "vscode", "editor", "terminal", "calendar",
  "portal", "account", "dashboard", "notebook", "textbook", "notes", "camera", "guitar",
  "piano", "sketchbook", "repo", "codebase", "printer", "sewing machine", "banking",
];

const PEOPLE = [
  "mom", "dad", "mother", "father", "boss", "client", "clients", "dentist", "doctor", "teacher",
  "professor", "landlord", "recruiter", "friend", "colleague", "coworker", "mechanic", "vet",
  "agent", "accountant", "therapist", "coach", "team", "hr", "neighbor", "neighbour", "sister",
  "brother", "partner", "wife", "husband", "kids", "customer", "customers", "advisor",
];

const STRUCTURE_RULES: Array<[Structure, string[]]> = [
  ["cleaning", ["clean", "tidy", "declutter", "laundry", "wash", "dishes", "mess", "vacuum", "scrub", "sweep", "mop", "dust", "trash"]],
  ["writing", ["write", "writing", "essay", "article", "blog", "post", "draft", "paper", "report", "thesis", "dissertation", "letter", "caption", "novel", "story", "script", "copy", "summary"]],
  ["communication", ["reply", "replies", "email", "emails", "inbox", "message", "messages", "call", "phone", "text", "slack", "dm", "contact", "reach out", "respond", "follow up", "followup", "meeting"]],
  ["research", ["research", "compare", "look into", "find out", "investigate", "analyze", "analyse", "read up", "survey", "options", "which", "best "]],
  ["deciding", ["decide", "decision", "choose", "choice", "whether", "pick", "select", "commit", "cancel or", "quit"]],
  ["learning", ["study", "revise", "revision", "exam", "test", "homework", "course", "lecture", "learn", "flashcards", "textbook", "chapter", "practice "]],
  ["creating", ["draw", "paint", "design", "sketch", "compose", "song", "music", "video", "photo", "film", "edit a", "create", "make a", "build a", "craft", "sew", "knit", "bake"]],
  ["errand", ["buy", "groceries", "grocery", "pick up", "drop off", "post", "mail", "return", "renew", "book", "appointment", "schedule", "reserve", "bank", "pharmacy", "store", "shop for", "order"]],
  ["fixing", ["fix", "repair", "broken", "bug", "error", "leak", "crack", "debug", "troubleshoot", "mend", "not working"]],
  ["organizing", ["organize", "organise", "sort", "file", "arrange", "catalog", "inventory", "paperwork", "folders", "documents", "archive"]],
  ["prep", ["prepare", "prep", "pack", "set up", "setup", "ready", "before", "plan for", "get ready"]],
];

const PROJECT_WORDS = ["project", "website", "web site", "app", "business", "startup", "portfolio", "thesis", "renovation", "move ", "launch", "campaign", "channel"];

const VAGUE_WORDS = ["stuff", "things", "thing", "everything", "my life", "somehow", "somewhere", "whatever", "it all"];
const BIG_WORDS = ["entire", "whole", "all ", "every", "complete", "everything", "whole house", "from scratch", "all of"];
const DEADLINE_WORDS = ["today", "tonight", "tomorrow", "deadline", "due", "asap", "urgent", "this week", "friday", "monday", "sunday", "morning", "evening"];
const PHYSICAL_WORDS = ["clean", "tidy", "walk", "run", "gym", "laundry", "dishes", "pack", "move", "cook", "stretch", "exercise", "vacuum", "garden", "paint", "repair", "fix", "groceries", "store"];
const DIGITAL_WORDS = ["email", "inbox", "doc", "document", "file", "website", "site", "app", "form", "code", "codebase", "repo", "spreadsheet", "excel", "notion", "slides", "portal", "account", "blog", "article", "text", "message", "slack", "online"];
const APP_WORDS = ["email", "inbox", "doc", "document", "file", "website", "site", "app", "form", "code", "codebase", "repo", "spreadsheet", "excel", "notion", "slides", "portal", "account", "calendar", "banking", "browser", "editor", "vscode"];
const STAKE_WORDS = ["exam", "test", "interview", "boss", "client", "taxes", "tax", "deadline", "due", "urgent", "important", "presentation", "thesis", "visa", "contract", "rent"];
const FIRSTSTEP_WORDS = ["open", "call", "email", "text", "walk", "stand", "sit", "grab", "put on", "pick up", "find", "check"];

/** Stage 1 — normalize: trim, cap, de-quote, collapse whitespace. */
export function normalizeTask(raw: string): string {
  return raw.replace(/^[\s"'“”`]+|[\s"'“”`]+$/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
}

export const tokenize = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

function findFirst(words: string[], list: string[]): string | null {
  const joined = words.join(" ");
  for (const item of list) {
    if (joined.includes(item)) return item.trim();
  }
  return null;
}

/** Stage 2 — classify the task structure from its own words. */
export function classifyTask(words: string[], title: string): Structure {
  const joined = words.join(" ");
  let best: Structure = "generic";
  let bestScore = 0;
  for (const [structure, keys] of STRUCTURE_RULES) {
    let score = 0;
    for (const k of keys) {
      if (k.includes(" ")) {
        if (joined.includes(k)) score += 3;
      } else if (words.includes(k.replace(/ $/, ""))) {
        score += 2;
      } else if (joined.includes(k)) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = structure;
    }
  }
  if (bestScore === 0) {
    for (const p of PROJECT_WORDS) {
      if (joined.includes(p)) return "project";
    }
  }
  const multi = /\band\b|,|;|\+/.test(title) || words.length > 9;
  if (bestScore <= 2 && multi) return "project";
  return best;
}

function extractVerb(words: string[]): { verb: string; phrase: string } | null {
  for (const w of words) {
    const base = w.replace(/(ing|s|ed)$/, "");
    if (VERBS[w]) return { verb: w, phrase: VERBS[w] };
    if (VERBS[base]) return { verb: base, phrase: VERBS[base] };
    if (w.endsWith("ing") && VERBS[base]) return { verb: base, phrase: VERBS[base] };
  }
  return null;
}

function extractObject(title: string, words: string[], verb: string | null): string {
  const lower = title.toLowerCase();
  let start = 0;
  if (verb) {
    const idx = lower.indexOf(verb);
    if (idx >= 0) start = idx + verb.length;
  }
  let rest = title.slice(start).trim().replace(/^[:\-–—\s]+/, "");
  const tokens = tokenize(rest).filter((t) => !STOPWORDS.has(t));
  if (tokens.length === 0) tokens.push(...words.filter((t) => !STOPWORDS.has(t)));
  const kept = tokens.slice(0, 4);
  if (kept.length === 0) return title.trim().slice(0, 32) || "it";
  const phrase = kept.join(" ");
  const startsWithThe = /^(the|my|our|a|an|your)\b/.test(phrase.toLowerCase());
  return startsWithThe ? phrase : `the ${phrase}`;
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Stages 3–4 — complexity, friction and everything that shapes initiation. */
export function analyzeTask(rawTitle: string): TaskAnalysis {
  const title = normalizeTask(rawTitle);
  const words = tokenize(title);
  const v = extractVerb(words);
  const lower = title.toLowerCase();

  const multiPart = /\band\b|,|;/.test(lower) || words.length > 9;
  const scopeWord = BIG_WORDS.find((b) => lower.includes(b)) ?? null;
  const vague = VAGUE_WORDS.some((b) => lower.includes(b));
  const hasDeadline = DEADLINE_WORDS.some((b) => lower.includes(b));

  const actionCount = Math.min(3, (lower.match(/\band\b|,/g) ?? []).length + (words.length > 9 ? 1 : 0));
  const dependencies = Math.min(
    3,
    (["before", "after", "once", "when", "waiting", "need"].filter((d) => lower.includes(d)).length +
      (multiPart ? 1 : 0)),
  );
  const digital = DIGITAL_WORDS.some((d) => lower.includes(d));
  const physical = PHYSICAL_WORDS.some((p) => words.includes(p));
  const needsApp = APP_WORDS.some((p) => lower.includes(p));
  const clearFirstStep = FIRSTSTEP_WORDS.some((f) => words[0] === f) || lower.includes("open ");
  const stakes = STAKE_WORDS.filter((s) => lower.includes(s)).length;
  const person = findFirst(words, PEOPLE);

  /* effort: length of ask + scope + structure hints */
  let effort = words.length > 7 ? 1 : 0;
  if (scopeWord) effort += 1;
  if (["project", "organizing", "cleaning", "research"].includes(classifyTask(words, title))) effort += 1;
  effort = Math.min(3, effort);

  /* complexity: how big/abstract the ask is */
  const STRONG_SCOPE = ["entire", "whole", "all of", "everything", "from scratch", "complete", "whole house"];
  let complexity = 0;
  if (multiPart) complexity += 1;
  if (scopeWord || vague) complexity += 1;
  if (words.length > 8 || PROJECT_WORDS.some((p) => lower.includes(p))) complexity += 1;
  if (scopeWord && STRONG_SCOPE.includes(scopeWord.trim())) complexity += 1;
  complexity = Math.min(3, complexity);

  /* ambiguity: would a stranger know the first physical move? */
  let ambiguity = 0.15;
  if (vague) ambiguity += 0.45;
  if (!v) ambiguity += 0.2;
  if (complexity >= 2) ambiguity += 0.15;
  if (clearFirstStep) ambiguity -= 0.25;
  ambiguity = clamp01(ambiguity);

  const uncertainty = clamp01(ambiguity * 0.6 + (clearFirstStep ? 0 : 0.2) + dependencies * 0.08);
  const emotionalFriction = clamp01(stakes * 0.22 + (person ? 0.12 : 0) + (scopeWord ? 0.15 : 0) + (vague ? 0.1 : 0));
  const avoidanceTriggers =
    (scopeWord ? 1 : 0) + (vague ? 1 : 0) + (hasDeadline ? 1 : 0) + (person ? 1 : 0) + (stakes > 0 ? 1 : 0);

  return {
    title,
    structure: classifyTask(words, title),
    verb: v?.verb ?? null,
    verbPhrase: v?.phrase ?? null,
    object: extractObject(title, words, v?.verb ?? null),
    place: findFirst(words, PLACES),
    tool: findFirst(words, TOOLS),
    person,
    complexity,
    ambiguity,
    effort,
    actionCount,
    dependencies,
    physical,
    digital,
    needsApp,
    clearFirstStep,
    emotionalFriction,
    uncertainty,
    avoidanceTriggers,
    scopeWord,
  };
}

/* ---------------- barrier hypothesis ---------------- */

export interface BarrierHypothesis {
  barrier: Barrier;
  kind: BarrierKind;
  /** Internal one-liner: why this hypothesis. */
  reason: string;
}

const TASK_SIDE: Barrier[] = ["unclear", "overwhelmed"];

/**
 * Stage 5 — reason about WHY the user is stuck.
 * A user-named barrier wins. Otherwise the task's own signals
 * suggest the most likely one — and we separate TASK problems
 * (fix by clarifying/decomposing) from STARTING problems (fix by
 * cutting initiation friction).
 */
export function diagnoseBarrier(a: TaskAnalysis, named: Barrier | null): BarrierHypothesis {
  if (named) {
    return {
      barrier: named,
      kind: TASK_SIDE.includes(named) ? "task" : "starting",
      reason: named === "unknown" ? "user reports a block without a name" : `user named the barrier: ${named}`,
    };
  }
  if (a.ambiguity >= 0.55 && a.actionCount === 0) {
    return { barrier: "unclear", kind: "task", reason: "wording lacks a visible first move" };
  }
  if (a.complexity >= 2 || a.actionCount >= 2) {
    return { barrier: "overwhelmed", kind: "task", reason: "the ask contains several tasks in one" };
  }
  if (a.emotionalFriction >= 0.45) {
    return { barrier: "anxiety", kind: "starting", reason: "high stakes detected in the wording" };
  }
  if (a.avoidanceTriggers >= 3) {
    return { barrier: "avoiding", kind: "starting", reason: "multiple classic avoidance triggers present" };
  }
  return { barrier: "unknown", kind: "starting", reason: "no strong signal — assume friction, not confusion" };
}

/* ---------------- capacity ---------------- */

/**
 * Stage 6 — estimate current initiation capacity from observable
 * signals only: time of day, named energy barriers, and recent
 * momentum. Never infers character or motivation.
 */
export function estimateCapacity(
  hour: number,
  barrier: Barrier | null,
  momentum: "hot" | "warm" | "cold" | "none",
): Capacity {
  let energy = 0.75;
  const reasons: string[] = [];
  if (hour >= 22 || hour < 6) {
    energy -= 0.25;
    reasons.push("late hour");
  } else if (hour >= 13 && hour < 16) {
    energy -= 0.1;
    reasons.push("post-lunch dip");
  }
  if (barrier === "tired") {
    energy -= 0.3;
    reasons.push("user reports tiredness");
  }
  if (barrier === "distracted") {
    energy -= 0.1;
    reasons.push("attention wandering");
  }
  if (momentum === "hot") {
    energy += 0.15;
    reasons.push("recent momentum");
  } else if (momentum === "cold") {
    energy -= 0.1;
    reasons.push("recent attempts stalled");
  }
  return { energy: clamp01(energy), reason: reasons.length ? reasons.join(", ") : "baseline" };
}

/* ---------------- deterministic variety ---------------- */

/** Stable 32-bit hash — drives deterministic variety. */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic pick: same seed → same variant, different seed → different wording. */
export function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

/** Normalizes an action so near-identical recommendations can be detected. */
export function normalizeAction(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}
