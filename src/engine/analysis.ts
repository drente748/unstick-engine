import { ANALYSIS_VERSION } from "./types";
import type { Barrier, BarrierKind, Capacity, Level, Medium, Structure, TaskAnalysis } from "./types";

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
  /* Arabic base verbs — matched after tokenization */
  "نظف": "cleaning", "رتب": "tidying", "اكتب": "writing", "رد": "a reply",
  "ذاكر": "studying", "ادرس": "studying", "اتصل": "a call", "اشتر": "shopping",
  "صلح": "a fix", "جهز": "preparing", "نظم": "organizing", "ابحث": "research",
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
  "مطبخ", "مكتب", "غرفة", "حمام", "شرفة", "مرآب",
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
  /* Arabic structure signals */
  ["cleaning", ["نظف", "تنظيف", "رتب", "ترتيب", "غسيل", "أطباق", "صحون"]],
  ["writing", ["اكتب", "كتابة", "مقال", "مقالة", "مدونة", "تقرير", "بحث "]],
  ["communication", ["رد على", "رسالة", "رسائل", "بريد", "ايميل", "إيميل", "واتساب"]],
  ["learning", ["ذاكر", "مذاكرة", "مراجعة", "امتحان", "اختبار", "درس"]],
  ["errand", ["اشتر", "سوق", "بقالة", "موعد"]],
  ["fixing", ["صلح", "تصليح", "عطل", "مكسور"]],
  ["organizing", ["نظم", "تنظيم", "ملفات", "أوراق"]],
];

const PROJECT_WORDS = ["project", "website", "web site", "app", "business", "startup", "portfolio", "thesis", "renovation", "move ", "launch", "campaign", "channel"];

const VAGUE_WORDS = ["stuff", "things", "thing", "everything", "my life", "somehow", "somewhere", "whatever", "it all", "حاجة", "شيء ما"];
const BIG_WORDS = ["entire", "whole", "all ", "every", "complete", "completely", "everything", "whole house", "from scratch", "all of", "apartment", "house", "backlog", "inbox", "كل", "الشقة كلها", "البيت كله"];
const DEADLINE_WORDS = ["today", "tonight", "tomorrow", "deadline", "due", "asap", "urgent", "this week", "friday", "monday", "sunday", "morning", "evening"];
/** Strong scope words — these MUST materially raise complexity/scope. */
const STRONG_SCOPE_WORDS = [
  "entire", "whole", "all of", "everything", "from scratch", "complete", "completely",
  "whole house", "apartment", "house", "backlog", "inbox",
  "كل", "كلها", "الشقة كلها", "البيت كله", "جميع",
];
const PHYSICAL_WORDS = ["clean", "tidy", "walk", "run", "gym", "laundry", "dishes", "pack", "move", "cook", "stretch", "exercise", "vacuum", "garden", "paint", "repair", "fix", "groceries", "store"];
const DIGITAL_WORDS = ["email", "inbox", "doc", "document", "file", "website", "site", "app", "form", "code", "codebase", "repo", "spreadsheet", "excel", "notion", "slides", "portal", "account", "blog", "article", "text", "message", "slack", "online", "رسالة", "رسائل", "بريد", "ايميل", "إيميل", "موقع", "تطبيق", "واتساب", "مدونة"];
const APP_WORDS = ["email", "inbox", "doc", "document", "file", "website", "site", "app", "form", "code", "codebase", "repo", "spreadsheet", "excel", "notion", "slides", "portal", "account", "calendar", "banking", "browser", "editor", "vscode", "تطبيق", "ايميل", "إيميل", "بريد"];
const STAKE_WORDS = ["exam", "test", "interview", "boss", "client", "taxes", "tax", "deadline", "due", "urgent", "important", "presentation", "thesis", "visa", "contract", "rent"];
const FIRSTSTEP_WORDS = ["open", "call", "email", "text", "walk", "stand", "sit", "grab", "put on", "pick up", "find", "check"];

/** Stage 1 — normalize: trim, cap, de-quote, collapse whitespace. */
export function normalizeTask(raw: string): string {
  return raw.replace(/^[\s"'“”`]+|[\s"'“”`]+$/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
}

/**
 * Unicode-safe tokenization for MATCHING ONLY. Display text always
 * uses the original title slice — this never touches what the user sees.
 * Supports Arabic, accented Latin, apostrophes and hyphens.
 */
export const tokenize = (s: string): string[] =>
  s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

function findFirst(words: string[], list: string[]): string | null {
  const joined = words.join(" ");
  for (const item of list) {
    if (joined.includes(item)) return item.trim();
  }
  return null;
}

/** Stage 2 — classify the task structure from its own words (with evidence score). */
export function classifyTaskScored(words: string[], title: string): { structure: Structure; score: number } {
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
      if (joined.includes(p)) return { structure: "project", score: 2 };
    }
  }
  const multi = /\band\b|,|;|\+/.test(title) || words.length > 9;
  if (bestScore <= 2 && multi) return { structure: "project", score: bestScore };
  return { structure: best, score: bestScore };
}

export function classifyTask(words: string[], title: string): Structure {
  return classifyTaskScored(words, title).structure;
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

/**
 * Extract the concrete object phrase while PRESERVING the user's
 * original casing, possessives and script ("John's email" stays
 * "John's email", never "johns email"). Matching uses normalized
 * tokens; display uses the original title slice.
 */
function extractObject(title: string, verb: string | null): string {
  const lower = title.toLowerCase();
  let start = 0;
  if (verb) {
    const idx = lower.indexOf(verb);
    if (idx >= 0) start = idx + verb.length;
  }
  const rest = title.slice(start).trim().replace(/^[:\-–—\s]+/, "");
  /* keep ORIGINAL chunks; filter by their normalized tokens */
  const chunks = rest.split(/\s+/).filter(Boolean);
  let kept = chunks.filter((c) => {
    const toks = tokenize(c);
    return toks.length > 0 && !toks.every((t) => STOPWORDS.has(t));
  });
  if (kept.length === 0) {
    kept = title
      .split(/\s+/)
      .filter((c) => {
        const toks = tokenize(c);
        return toks.some((t) => !STOPWORDS.has(t)) && !(verb && toks.includes(verb));
      });
  }
  kept = kept.slice(0, 4);
  if (kept.length === 0) return title.trim().slice(0, 32) || "it";
  const phrase = kept.join(" ");
  const first = kept[0];
  const firstLower = first.toLowerCase();
  const hasDeterminer = /^(the|my|our|your|a|an|his|her|their|this|that|these|those)\b/.test(firstLower) || /^(ال|هذا|هذه|تلك)/.test(first);
  const possessiveOrProper = /'s$/i.test(firstLower) || /^[A-Z][\p{L}']*$/u.test(first);
  const latin = /^[a-z]/i.test(first);
  if (hasDeterminer || possessiveOrProper || !latin) return phrase;
  return `the ${phrase}`;
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/**
 * THE numeric safety gate for the whole engine. Every producer of a
 * step size routes through here, so a size can never reach the UI as
 * undefined, NaN, negative or > 4. Non-finite input is a contract
 * violation that cannot happen upstream any more; the middle of the
 * ladder is the least-surprising mapped value if it ever did.
 */
export function clampLevel(n: number): Level {
  if (!Number.isFinite(n)) return 2;
  return Math.round(Math.max(0, Math.min(4, n))) as Level;
}

/**
 * Classify WHERE the task happens — the hard compatibility dimension.
 * Digital evidence: digital wording or an app requirement. Physical
 * evidence: physical wording or a named location. A named tool alone
 * is NOT digital evidence (a guitar is a tool, not a screen).
 */
export function classifyMedium(
  digital: boolean,
  physical: boolean,
  needsApp: boolean,
  place: string | null,
): Medium {
  const dig = digital || needsApp;
  const phys = physical || place != null;
  if (dig && phys) return "mixed";
  if (dig) return "digital";
  if (phys) return "physical";
  return "unknown";
}

/** Stages 3–4 — complexity, friction and everything that shapes initiation. */
export function analyzeTask(rawTitle: string): TaskAnalysis {
  const title = normalizeTask(rawTitle);
  const words = tokenize(title);
  const v = extractVerb(words);
  const lower = title.toLowerCase();
  const classified = classifyTaskScored(words, title);
  const structure = classified.structure;

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
  if (["project", "organizing", "cleaning", "research"].includes(structure)) effort += 1;
  effort = Math.min(3, effort);

  /* scope strength: 0 bounded … 3 whole-domain ("clean my ENTIRE apartment") */
  let scopeStrength = 0;
  if (scopeWord) scopeStrength = STRONG_SCOPE_WORDS.includes(scopeWord.trim()) ? 3 : 2;
  else if (multiPart) scopeStrength = 1;

  /* complexity: how big/abstract the ask is */
  let complexity = 0;
  if (multiPart) complexity += 1;
  if (scopeStrength >= 2 || vague) complexity += 1;
  if (words.length > 8 || PROJECT_WORDS.some((p) => lower.includes(p))) complexity += 1;
  if (scopeStrength >= 3) complexity += 1;
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
  const place = findFirst(words, PLACES);
  const medium = classifyMedium(digital, physical, needsApp, place);
  const locale = /[\u0600-\u06FF]/.test(title) ? "ar" : "en";

  /* deterministic per-inference confidence */
  const digEvidence = (digital ? 1 : 0) + (needsApp ? 1 : 0);
  const physEvidence = (physical ? 1 : 0) + (place ? 1 : 0);
  const mediumConfidence =
    digEvidence === 0 && physEvidence === 0 ? 0.35 : digEvidence > 0 && physEvidence > 0 ? 0.85 : 0.75;
  const analysisConfidence = {
    structure: Math.min(0.95, 0.45 + classified.score * 0.18),
    medium: mediumConfidence,
    verb: v ? 0.9 : 0.4,
    object: extractObject(title, v?.verb ?? null).split(/\s+/).length >= 2 ? 0.8 : 0.6,
    barrier: 0.5,
  };

  return {
    title,
    structure,
    verb: v?.verb ?? null,
    verbPhrase: v?.phrase ?? null,
    object: extractObject(title, v?.verb ?? null),
    place,
    tool: findFirst(words, TOOLS),
    person,
    complexity,
    ambiguity,
    effort,
    actionCount,
    dependencies,
    physical,
    digital,
    medium,
    needsApp,
    clearFirstStep,
    emotionalFriction,
    uncertainty,
    avoidanceTriggers,
    scopeWord,
    scopeStrength,
    analysisConfidence,
    locale,
    analysisVersion: ANALYSIS_VERSION,
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

/**
 * Unicode-safe normalization for COMPARISON ONLY (never displayed).
 * Strips punctuation and diacritics but keeps letters of every script —
 * Arabic stays Arabic, accents collapse safely for matching.
 */
export function normalizeAction(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Action-verb synonym buckets — one canonical verb per intent family. */
const VERB_SYNONYMS: Record<string, string> = {
  open: "open", click: "open", tap: "open", launch: "open",
  write: "write", draft: "write", type: "write",
  read: "read", scan: "read", skim: "read",
  clear: "clear", wipe: "clear",
  reply: "reply", answer: "reply", respond: "reply",
};

const INTENT_NOISE = new Set([
  "the", "a", "an", "my", "your", "our", "their", "his", "her",
  "من", "على", "إلى", "في", "عن", "ال", "فقط", "الآن", "مرة",
  "just", "only", "now", "then", "right", "exactly", "single", "one", "first",
  "whole", "entire", "all", "any", "that", "this", "it", "its", "from", "into",
  "stop", "after", "before", "when", "if", "and", "or", "of", "for", "to", "in", "on", "at", "with",
  "nothing", "else", "more", "out", "up", "down", "there", "here", "you", "yourself", "we", "us",
  "already", "change", "allowed", "free", "today", "roughly",
]);

/**
 * Intent fingerprint — THE canonical semantic-duplicate key, used by
 * EVERY dedupe path (selection, ladders, recovery, fallbacks).
 * Levels covered: normalized text → numeral/quantifier collapse →
 * possessive folding → verb-synonym canonicalization → order-independent
 * token set. "Open John's email", "Click John's email" and "Open the
 * email from John" all collide; genuinely different moves never do.
 */
export function intentKey(s: string): string {
  const canon = new Set<string>();
  for (const raw of normalizeAction(s).split(" ")) {
    if (!raw || /^\d+$/.test(raw)) continue;
    if (INTENT_NOISE.has(raw)) continue;
    const bare = raw.replace(/s$/, (m) => (raw.length > 4 ? "" : m));
    const word = VERB_SYNONYMS[raw] ?? VERB_SYNONYMS[bare] ?? bare;
    if (word && !INTENT_NOISE.has(word)) canon.add(word);
  }
  return [...canon].sort().join(" ");
}
