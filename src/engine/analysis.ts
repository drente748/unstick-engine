import type { Structure, TaskAnalysis, TaskSignals } from "./types";

/* ============================================================
   Stage 1 — Task understanding.
   Extracts real context from the user's words instead of only
   matching domains: verb, object, place, tool, person, structure
   and a complexity score. Everything here is deterministic.
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
  "piano", "sketchbook", "repo", "codebase", "printer", " sewing machine", "banking",
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

const tokenize = (s: string): string[] =>
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

function detectStructure(words: string[], title: string): Structure {
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

/** Stage 1 entry point: understand a task from its own words. */
export function analyzeTask(rawTitle: string): TaskAnalysis {
  const title = rawTitle.trim().slice(0, 120);
  const words = tokenize(title);
  const v = extractVerb(words);
  const lower = title.toLowerCase();

  const signals: TaskSignals = {
    multiPart: /\band\b|,|;/.test(lower) || words.length > 9,
    bigScope: BIG_WORDS.some((b) => lower.includes(b)),
    vague: VAGUE_WORDS.some((b) => lower.includes(b)),
    hasDeadline: DEADLINE_WORDS.some((b) => lower.includes(b)),
  };

  let complexity = 0;
  if (signals.multiPart) complexity += 1;
  if (signals.bigScope || signals.vague) complexity += 1;
  if (words.length > 8 || PROJECT_WORDS.some((p) => lower.includes(p))) complexity += 1;
  complexity = Math.min(3, complexity);

  const structure = detectStructure(words, title);

  return {
    title,
    structure,
    verb: v?.verb ?? null,
    verbPhrase: v?.phrase ?? null,
    object: extractObject(title, words, v?.verb ?? null),
    place: findFirst(words, PLACES),
    tool: findFirst(words, TOOLS),
    person: findFirst(words, PEOPLE),
    complexity,
    signals,
  };
}

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
