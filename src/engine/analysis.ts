import { ANALYSIS_VERSION } from "./types";
import type {
  Barrier,
  BarrierKind,
  Capacity,
  Level,
  Medium,
  ParsedIntent,
  SlotEvidence,
  Structure,
  StructureScore,
  TaskAnalysis,
} from "./types";

/* ============================================================
   Stages 1–5 of the pipeline — next-generation task understanding.

   Architecture:
     normalize → tokenize → SEMANTIC PARSE (typed slots + evidence)
     → WEIGHTED FEATURE CLASSIFIER (structure + margin confidence)
     → medium inference → complexity/friction → barrier hypothesis
     → capacity.

   The parse layer extracts WHAT / WHO / ABOUT-WHAT / WHERE /
   WITH-WHAT / HOW-BIG / HOW-URGENT from the user's own words,
   always preserving the original text for display. Every
   downstream estimate is derived FROM these slots.
   Unknown context stays null — never fabricated.

   Pure, deterministic, local. The goal is not to label the task
   "correctly" but to extract every signal that changes what a
   good FIRST move looks like.
   ============================================================ */

/* ---------------- lexicons ---------------- */

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
  /* function words — dropped for matching, never for display */
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

const PROJECT_WORDS = ["project", "website", "web site", "app", "business", "startup", "portfolio", "thesis", "renovation", "launch", "campaign", "channel"];

const VAGUE_WORDS = ["stuff", "things", "thing", "everything", "my life", "somehow", "somewhere", "whatever", "it all"];
const DEADLINE_WORDS = ["today", "tonight", "tomorrow", "deadline", "due", "asap", "urgent", "this week", "friday", "monday", "sunday", "morning", "evening"];
const URGENT_WORDS = ["today", "tonight", "asap", "urgent", "due"];
/** Strong scope words — these MUST materially raise complexity/scope. */
export const STRONG_SCOPE_WORDS = [
  "entire", "whole", "all of", "everything", "from scratch", "complete", "completely",
  "whole house", "apartment", "house", "backlog", "inbox",
];
const SCOPE_WORDS = ["entire", "whole", "all", "every", "complete", "everything", "apartment", "house", "backlog", "inbox"];
const PHYSICAL_WORDS = ["clean", "tidy", "walk", "run", "gym", "laundry", "dishes", "pack", "move", "cook", "stretch", "exercise", "vacuum", "garden", "paint", "groceries", "store"];
const DIGITAL_WORDS = ["email", "inbox", "doc", "document", "file", "website", "site", "app", "form", "code", "codebase", "repo", "spreadsheet", "excel", "notion", "slides", "portal", "account", "blog", "article", "text", "message", "slack", "online"];
const APP_WORDS = ["email", "inbox", "doc", "document", "file", "website", "site", "app", "form", "code", "codebase", "repo", "spreadsheet", "excel", "notion", "slides", "portal", "account", "calendar", "banking", "browser", "editor", "vscode"];
const STAKE_WORDS = ["exam", "test", "interview", "boss", "client", "taxes", "tax", "deadline", "due", "urgent", "important", "presentation", "thesis", "visa", "contract", "rent"];
const FIRSTSTEP_WORDS = ["open", "call", "email", "text", "walk", "stand", "sit", "grab", "put on", "pick up", "find", "check"];

/* Communication verbs — the heart of recipient/topic parsing. */
const COMM_VERBS = new Set([
  "reply", "respond", "answer", "email", "text", "message", "call", "contact", "send", "write",
  "ring", "dm", "whatsapp", "ping",
]);
const MESSAGE_NOUNS = new Set([
  "email", "message", "letter", "text", "dm", "note", "mail",
]);
const TOPIC_MARKERS = ["about", "regarding", "concerning", "re:"];
const CONDITIONAL_WORDS = ["before", "after", "once", "when", "until", "wait", "waiting"];
const NEGATION_STARTS = ["don't", "dont", "do not", "never", "stop", "quit", "avoid", "no more"];
const SCREEN_VERBS = new Set(["email", "reply", "respond", "text", "message", "code", "debug", "send", "dm"]);
/* verbs that LOOK physical but are digital/mental when an artifact is present */
const DIGITAL_FIX_VERBS = new Set(["fix", "debug", "repair"]);
const BODY_VERBS = new Set(["clean", "tidy", "declutter", "pack", "cook", "walk", "run", "stretch", "exercise", "paint", "wash"]);

/* ---------------- stage 1: normalize + tokenize ---------------- */

/** Stage 1 — normalize: trim, cap, de-quote, collapse whitespace. */
export function normalizeTask(raw: string): string {
  return raw.replace(/^[\s"'“”`]+|[\s"'“”`]+$/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
}

/**
 * Unicode-safe tokenization for MATCHING ONLY. Display text always
 * uses the original title slice — this never touches what the user
 * sees. Supports accented Latin, apostrophes and hyphens.
 */
export const tokenize = (s: string): string[] =>
  s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

const stem = (t: string): string => t.replace(/(ing|ed|es|s)$/, "");

function findFirst(words: string[], list: string[]): string | null {
  const joined = words.join(" ");
  for (const item of list) {
    if (joined.includes(item)) return item.trim();
  }
  return null;
}

/* ---------------- stage 2: semantic parse ---------------- */

interface Chunk {
  /** ORIGINAL text — used for everything the user may see. */
  text: string;
  /** Normalized tokens — used for matching only. */
  toks: string[];
  /** Does any token carry real content? */
  content: boolean;
}

const chunkOf = (title: string): Chunk[] =>
  title
    .split(/\s+/)
    .filter(Boolean)
    .map((text) => {
      const toks = tokenize(text);
      return { text, toks, content: toks.some((t) => !STOPWORDS.has(t)) };
    });

function findVerb(chunks: Chunk[]): { base: string; phrase: string; index: number } | null {
  for (let i = 0; i < chunks.length; i++) {
    for (const t of chunks[i].toks) {
      const base = VERBS[t] ? t : VERBS[stem(t)] ? stem(t) : null;
      if (base) return { base, phrase: VERBS[base], index: i };
    }
  }
  return null;
}

/**
 * WHO is this directed at? Parses "reply to John's email",
 * "email Sarah about the invoice" — always returning the ORIGINAL
 * casing. Stops before artifacts ("John's EMAIL" → recipient is
 * John) and before topic markers.
 */
function findRecipient(chunks: Chunk[], verb: { base: string; index: number } | null): string | null {
  if (!verb || !COMM_VERBS.has(verb.base)) return null;
  const parts: string[] = [];
  for (let i = verb.index + 1; i < chunks.length && parts.length < 2; i++) {
    const c = chunks[i];
    const lead = c.toks[0];
    if (!lead) continue;
    if (TOPIC_MARKERS.includes(lead)) break;
    if (["to", "back", "on"].includes(lead)) continue;
    if (MESSAGE_NOUNS.has(lead) || TOOLS.includes(lead)) continue;
    if (!c.content) continue;
    parts.push(c.text);
  }
  if (parts.length === 0) return null;
  /* "John's" → "John" (the possessive marker belongs to the artifact) */
  const last = parts.length - 1;
  parts[last] = parts[last].replace(/['’]s$/i, "");
  return parts.join(" ");
}

/** WHAT is it about? "…about the invoice". */
function findTopic(chunks: Chunk[]): string | null {
  for (let i = 0; i < chunks.length; i++) {
    const lead = chunks[i].toks[0];
    if (!lead || !TOPIC_MARKERS.includes(lead)) continue;
    const parts: string[] = [];
    for (let j = i + 1; j < chunks.length && parts.length < 4; j++) {
      if (!chunks[j].content) continue;
      parts.push(chunks[j].text);
    }
    if (parts.length) return parts.join(" ");
  }
  return null;
}

function findSlot(chunks: Chunk[], list: string[], how: string): SlotEvidence | null {
  const joined = chunks.map((c) => c.toks.join(" ")).join(" ");
  for (const item of list) {
    if (joined.includes(item)) return { value: item.trim(), strength: 0.9, explicit: true, how } as SlotEvidence & { how: string };
  }
  return null;
}

/**
 * The semantic parse — every slot is evidence-backed and preserves
 * the user's original text. Unknown context stays UNKNOWN: nothing
 * here fabricates people, places or artifacts.
 */
export function parseTask(rawTitle: string): ParsedIntent {
  const title = normalizeTask(rawTitle);
  const chunks = chunkOf(title);
  const toks = chunks.flatMap((c) => c.toks);
  const lower = title.toLowerCase();

  const v = findVerb(chunks);
  const recipient = findRecipient(chunks, v);
  const topic = findTopic(chunks);
  const place = findSlot(chunks, PLACES, "lexicon:place");
  const tool = findSlot(chunks, TOOLS, "lexicon:tool");

  const scopeWord = SCOPE_WORDS.find((b) => lower.includes(b)) ?? null;
  const scopeStrong = scopeWord ? STRONG_SCOPE_WORDS.some((s) => lower.includes(s)) : false;

  const conjunctions = (lower.match(/\band\b|,|;/g) ?? []).length;
  const negated = NEGATION_STARTS.some((n) => lower.startsWith(n));
  const conditionals = CONDITIONAL_WORDS.filter((c) => toks.includes(c) || lower.includes(c)).length;
  const deadlineValue = DEADLINE_WORDS.find((d) => lower.includes(d)) ?? null;
  const deadlineSoon = URGENT_WORDS.some((u) => lower.includes(u)) || deadlineValue != null;
  const vague = VAGUE_WORDS.some((b) => lower.includes(b));

  const evidenceKinds: string[] = [];
  if (v) evidenceKinds.push("verb");
  if (recipient) evidenceKinds.push("recipient");
  if (topic) evidenceKinds.push("topic");
  if (place) evidenceKinds.push("place");
  if (tool) evidenceKinds.push("tool");
  if (scopeWord) evidenceKinds.push("scope");
  if (deadlineValue) evidenceKinds.push("deadline");

  return {
    raw: rawTitle,
    title,
    action: {
      verb: v?.base ?? null,
      phrase: v?.phrase ?? null,
      position: !v ? "none" : v.index === 0 ? "initial" : v.index <= Math.ceil(chunks.length * 0.4) ? "mid" : "late",
      strength: v ? 0.9 : 0,
    },
    target: { object: extractObject(title, v?.base ?? null), strength: v ? 0.85 : 0.6 },
    recipient,
    topic,
    place,
    tool,
    deadline: { value: deadlineValue, soon: deadlineSoon },
    scope: { word: scopeWord, strength: scopeWord ? (scopeStrong ? 3 : 2) : 0 },
    negated,
    conditionals,
    conjunctions,
    length: toks.length,
    vague,
    evidenceKinds,
  };
}

/* ---------------- stage 3: weighted feature classifier ---------------- */

interface Feature {
  test: (p: ParsedIntent) => boolean;
  /** Evidence weight. Verb evidence > noun evidence > context boosts. */
  w: number;
  /** Short evidence label recorded in structureEvidence. */
  why: string;
}

const hasTok = (p: ParsedIntent, ...words: string[]): boolean =>
  words.some((w) => p.title.toLowerCase().includes(w));

const verbIs = (p: ParsedIntent, ...verbs: string[]): boolean =>
  !!p.action.verb && verbs.some((v) => p.action.verb === v || stem(p.action.verb ?? "") === v);

const objHas = (p: ParsedIntent, ...words: string[]): boolean =>
  words.some((w) => {
    const t = tokenize(w);
    return p.target.object.toLowerCase().includes(w) || t.every((x) => p.target.object.toLowerCase().includes(x));
  });

/**
 * Weighted, explainable structure features. Verb evidence outweighs
 * noun evidence; contextual boosts disambiguate — a recipient turns
 * "write an email to Sarah" into communication, not writing.
 */
const STRUCTURE_FEATURES: Record<Structure, Feature[]> = {
  writing: [
    { test: (p) => verbIs(p, "write", "draft", "compose"), w: 3, why: "verb:write" },
    { test: (p) => objHas(p, "essay", "article", "blog", "post", "paper", "report", "thesis", "letter", "caption", "novel", "story", "script", "summary"), w: 2, why: "object:writable" },
  ],
  communication: [
    { test: (p) => verbIs(p, "reply", "respond", "email", "text", "message", "call", "contact", "send", "answer"), w: 3, why: "verb:communicate" },
    { test: (p) => objHas(p, "email", "emails", "inbox", "message", "messages", "replies", "slack", "dm"), w: 2, why: "object:channel" },
    { test: (p) => p.recipient != null, w: 1.5, why: "recipient:present" },
    { test: (p) => /reach out|follow up|followup|get back to/.test(p.title.toLowerCase()), w: 2, why: "phrase:follow-up" },
  ],
  cleaning: [
    { test: (p) => verbIs(p, "clean", "tidy", "declutter", "wash", "scrub", "sweep", "mop", "dust", "vacuum"), w: 3, why: "verb:clean" },
    { test: (p) => objHas(p, "laundry", "dishes", "mess", "trash", "room", "apartment", "house", "kitchen"), w: 2, why: "object:cleanable" },
  ],
  research: [
    { test: (p) => verbIs(p, "research", "compare", "investigate", "analyze", "analyse"), w: 3, why: "verb:research" },
    { test: (p) => /look into|find out|read up|which .* best/.test(p.title.toLowerCase()), w: 2.5, why: "phrase:inquiry" },
    { test: (p) => objHas(p, "options", "survey", "quotes"), w: 1.5, why: "object:comparison" },
  ],
  deciding: [
    { test: (p) => verbIs(p, "decide", "choose", "pick", "select"), w: 3, why: "verb:decide" },
    { test: (p) => hasTok(p, "whether", "decision", "choice") || /commit to|cancel or/.test(p.title.toLowerCase()), w: 2, why: "token:choice" },
  ],
  learning: [
    { test: (p) => verbIs(p, "study", "revise", "learn"), w: 3, why: "verb:study" },
    { test: (p) => objHas(p, "exam", "test", "homework", "course", "lecture", "flashcards", "textbook", "chapter"), w: 2, why: "object:study-material" },
  ],
  creating: [
    { test: (p) => verbIs(p, "draw", "paint", "design", "sketch", "compose", "sew", "knit", "bake", "craft", "film"), w: 3, why: "verb:create" },
    { test: (p) => objHas(p, "song", "music", "video", "photo", "logo", "poster", "shelf"), w: 2, why: "object:artifact" },
  ],
  errand: [
    { test: (p) => verbIs(p, "buy", "order", "renew", "book", "schedule", "reserve", "cancel", "deliver"), w: 2.5, why: "verb:errand" },
    { test: (p) => objHas(p, "groceries", "grocery", "pharmacy", "store", "bank", "post", "mail", "appointment", "taxes", "tax", "invoice", "bill", "form", "application"), w: 2, why: "object:admin-or-purchase" },
  ],
  fixing: [
    { test: (p) => verbIs(p, "fix", "repair", "debug", "mend", "troubleshoot"), w: 3, why: "verb:fix" },
    { test: (p) => objHas(p, "bug", "error", "leak", "crack") || /not working|broken/.test(p.title.toLowerCase()), w: 2, why: "object:defect" },
  ],
  organizing: [
    { test: (p) => verbIs(p, "organize", "organise", "sort", "file", "arrange", "catalog", "archive"), w: 3, why: "verb:organize" },
    { test: (p) => objHas(p, "folders", "documents", "paperwork", "inventory", "drawers", "closet", "files"), w: 2, why: "object:collection" },
  ],
  prep: [
    { test: (p) => verbIs(p, "prepare", "prep", "pack"), w: 2.5, why: "verb:prepare" },
    { test: (p) => /set up|setup|get ready|plan for/.test(p.title.toLowerCase()), w: 2.5, why: "phrase:setup" },
  ],
  project: [
    { test: (p) => verbIs(p, "build", "develop", "code", "launch"), w: 2, why: "verb:build" },
    { test: (p) => objHas(p, "website", "app", "business", "startup", "portfolio", "renovation", "launch", "campaign", "channel") || hasTok(p, "project"), w: 2.5, why: "object:endeavor" },
  ],
  generic: [],
};

/** Stage 3 — score every structure; confidence flows from the margin. */
export function classifyTaskParsed(p: ParsedIntent): StructureScore {
  const ranked: Array<{ structure: Structure; score: number; evidence: string[] }> = [];
  for (const structure of Object.keys(STRUCTURE_FEATURES) as Structure[]) {
    let score = 0;
    const evidence: string[] = [];
    for (const f of STRUCTURE_FEATURES[structure]) {
      if (f.test(p)) {
        score += f.w;
        evidence.push(f.why);
      }
    }
    ranked.push({ structure, score, evidence });
  }
  ranked.sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const second = ranked[1];

  const conf = (score: number, margin: number): number =>
    Math.min(0.95, 0.42 + Math.min(0.4, score * 0.1) + Math.min(0.13, margin * 0.04));

  if (top.score === 0 || top.structure === "generic") {
    const joined = p.title.toLowerCase();
    if (PROJECT_WORDS.some((w) => joined.includes(w))) {
      return { structure: "project", score: 2, confidence: 0.6, evidence: ["token:endeavor-word"] };
    }
    return { structure: "generic", score: 0, confidence: 0.4, evidence: [] };
  }
  /* several weakly-related parts → treat as a project, not a coin flip */
  const multiPart = p.conjunctions > 0 || p.length > 9;
  if (multiPart && top.score <= 2.5) {
    const margin = top.score - (second?.score ?? 0);
    return { structure: "project", score: top.score, confidence: conf(top.score, margin), evidence: [...top.evidence, "shape:multi-part"] };
  }
  const margin = top.score - (second?.score ?? 0);
  return { structure: top.structure, score: top.score, confidence: conf(top.score, margin), evidence: top.evidence };
}

/** Backward-compatible wrappers over the new classifier. */
export function classifyTaskScored(words: string[], title: string): { structure: Structure; score: number } {
  void words;
  const r = classifyTaskParsed(parseTask(title));
  return { structure: r.structure, score: Math.round(r.score) };
}

export function classifyTask(words: string[], title: string): Structure {
  return classifyTaskScored(words, title).structure;
}

/* ---------------- object extraction (entity-preserving) ---------------- */

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
  const hasDeterminer = /^(the|my|our|your|a|an|his|her|their|this|that|these|those)\b/.test(firstLower);
  const possessiveOrProper = /'s$/i.test(firstLower) || /^[A-Z][\p{L}']*$/u.test(first);
  const latin = /^[a-z]/i.test(first);
  if (hasDeterminer || possessiveOrProper || !latin) return phrase;
  return `the ${phrase}`;
}

/**
 * Split a multi-part task into its constituent moves, preserving the
 * user's original wording for each part. Splits on coordinating
 * conjunctions (and / , / ; / & / +) and on "then"/"after" joins.
 * Single-part tasks return []. The goal is NOT to plan the whole
 * task but to surface the FIRST move honestly, so the engine never
 * invents a starting point that wasn't in the user's words.
 */
function extractParts(title: string): string[] {
  const raw = title.trim();
  if (!raw) return [];
  const segs = raw
    .split(/\s*(?:,|;|\band\b|&|\+|\bthen\b|\bafter\b)/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segs.length < 2) return [];
  return segs.filter((s) => {
    const toks = tokenize(s);
    return toks.length >= 2 && !STOPWORDS.has(toks[0]);
  });
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/**
 * THE numeric safety gate for the whole engine. Every producer of a
 * step size routes through here, so a size can never reach the UI as
 * undefined, NaN, negative or > 4.
 */
export function clampLevel(n: number): Level {
  if (!Number.isFinite(n)) return 2;
  return Math.round(Math.max(0, Math.min(4, n))) as Level;
}

/**
 * Classify WHERE the task happens — the hard compatibility dimension.
 * A named tool alone is NOT digital evidence (a guitar is a tool,
 * not a screen).
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

/* ---------------- stage 4: full analysis ---------------- */

export function analyzeTask(rawTitle: string): TaskAnalysis {
  const p = parseTask(rawTitle);
  const title = p.title;
  const words = tokenize(title);
  const lower = title.toLowerCase();

  const cls = classifyTaskParsed(p);
  const structure = cls.structure;

  const multiPart = p.conjunctions > 0 || p.length > 9;
  const scopeWord = p.scope.word;
  const scopeStrength = p.scope.strength || (multiPart ? 1 : 0);
  const vague = p.vague;
  const hasDeadline = p.deadline.soon;

  const parts = extractParts(p.title);
  /* actionCount now counts REAL separated clauses, capped, instead of
     guessing from length alone — a 12-word single clause is ONE move */
  const actionCount = Math.min(3, parts.length >= 2 ? parts.length - 1 : p.conjunctions + (p.length > 9 ? 1 : 0));
  const dependencies = Math.min(3, p.conditionals + (parts.length >= 2 ? 1 : 0));

  /* medium evidence — verbs, recipients and tools count as signals */
  const v = p.action.verb;
  const isDigitalFix = !!v && DIGITAL_FIX_VERBS.has(v) &&
    (APP_WORDS.some((w) => lower.includes(w)) || DIGITAL_WORDS.some((w) => lower.includes(w)) || p.tool != null);
  const digScore =
    (DIGITAL_WORDS.some((d) => lower.includes(d)) ? 2 : 0) +
    (v && SCREEN_VERBS.has(v) ? 2 : 0) +
    (v && COMM_VERBS.has(v) && p.recipient ? 1.5 : 0) +
    (isDigitalFix ? 2 : 0);
  const isPhysicalFix = !!v && DIGITAL_FIX_VERBS.has(v) && !isDigitalFix;
  const physScore =
    (PHYSICAL_WORDS.some((w) => words.includes(w)) ? 2 : 0) +
    (v && BODY_VERBS.has(v) ? 2 : 0) +
    (isPhysicalFix ? 2 : 0) +
    (p.place?.value ? 2 : 0);

  const digital = digScore >= 2 || APP_WORDS.some((w) => lower.includes(w));
  const physical = physScore >= 2;
  const needsApp = APP_WORDS.some((w) => lower.includes(w));
  const place = p.place?.value ?? null;
  const medium = classifyMedium(digital, physical, needsApp, place);

  const clearFirstStep = FIRSTSTEP_WORDS.some((f) => words[0] === f) || lower.includes("open ");
  const stakes = STAKE_WORDS.filter((s) => lower.includes(s)).length;
  const person = findFirst(words, PEOPLE);
  const object = p.target.object;

  /* effort */
  let effort = p.length > 7 ? 1 : 0;
  if (scopeWord) effort += 1;
  if (["project", "organizing", "cleaning", "research"].includes(structure)) effort += 1;
  effort = Math.min(3, effort);

  /* complexity */
  let complexity = 0;
  if (multiPart) complexity += 1;
  if (scopeStrength >= 2 || vague) complexity += 1;
  if (p.length > 8 || PROJECT_WORDS.some((w) => lower.includes(w))) complexity += 1;
  if (scopeStrength >= 3) complexity += 1;
  complexity = Math.min(3, complexity);

  /* ambiguity: would a stranger know the first physical move? */
  let ambiguity = 0.15;
  if (vague) ambiguity += 0.45;
  if (!p.action.verb) ambiguity += 0.2;
  if (complexity >= 2) ambiguity += 0.15;
  if (clearFirstStep) ambiguity -= 0.25;
  if (p.recipient || p.topic) ambiguity -= 0.05;
  if (cls.confidence >= 0.7) ambiguity -= 0.05;
  ambiguity = clamp01(ambiguity);

  const uncertainty = clamp01(ambiguity * 0.6 + (clearFirstStep ? 0 : 0.2) + dependencies * 0.08);
  const emotionalFriction = clamp01(
    stakes * 0.22 + (person || p.recipient ? 0.12 : 0) + (scopeWord ? 0.15 : 0) + (vague ? 0.1 : 0) + (hasDeadline ? 0.12 : 0) + (p.negated ? 0.06 : 0),
  );
  const avoidanceTriggers =
    (scopeWord ? 1 : 0) + (vague ? 1 : 0) + (hasDeadline ? 1 : 0) + (person || p.recipient ? 1 : 0) + (stakes > 0 ? 1 : 0) + (p.negated ? 1 : 0);

  /* confidence — margin-based, honest, not decorative */
  const mediumConfidence =
    digScore === 0 && physScore === 0
      ? 0.35
      : digScore > 0 && physScore > 0
        ? 0.85
        : 0.72 + Math.min(0.18, Math.abs(digScore - physScore) * 0.05);
  const analysisConfidence = {
    structure: Math.round(cls.confidence * 100) / 100,
    medium: Math.round(mediumConfidence * 100) / 100,
    verb: p.action.strength > 0 ? 0.9 : 0.4,
    object: object.split(/\s+/).length >= 2 ? 0.8 : 0.6,
    barrier: 0.5,
  };

  return {
    title,
    structure,
    verb: p.action.verb,
    verbPhrase: p.action.phrase,
    object,
    place,
    tool: p.tool?.value ?? null,
    person,
    complexity,
    ambiguity,
    effort,
    actionCount,
    parts,
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
    recipient: p.recipient,
    topic: p.topic,
    deadlineSoon: hasDeadline,
    negated: p.negated,
    conditionals: p.conditionals,
    structureEvidence: cls.evidence,
    analysisConfidence,
    analysisVersion: ANALYSIS_VERSION,
  };
}

/* ---------------- stage 5: barrier hypothesis ---------------- */

export interface BarrierHypothesis {
  barrier: Barrier;
  kind: BarrierKind;
  /** Internal one-liner: why this hypothesis. */
  reason: string;
}

const TASK_SIDE: Barrier[] = ["unclear", "overwhelmed"];

/* wording that signals the user is dodging the task on purpose */
const AVOIDANCE_WORDS = [
  "avoid", "avoiding", "keep putting off", "putting off", "procrastinat", "dreading", "dread",
  "can't face", "cant face", "hate", "don't want to", "dont want to", "rather not", "skip",
];
/* wording that signals a real, visible first move already exists (→ not unclear) */
const FIRST_MOVE_WORDS = ["open", "write", "call", "email", "text", "start", "do", "make", "send", "clean", "reply", "read", "fix"];

/**
 * Reason about WHY the user is stuck. A user-named barrier wins.
 * Otherwise the parse's own signals suggest the most likely one —
 * separating TASK problems (fix by clarifying/decomposing) from
 * STARTING problems (fix by cutting initiation friction).
 *
 * Priority (most-certain first):
 *   1. named barrier
 *   2. explicit negation ("don't…") → avoiding
 *   3. avoidance wording present → avoiding
 *   4. genuinely unclear (no visible first move + low structure)
 *   5. too many parts / very complex → overwhelmed
 *   6. high stakes → anxiety
 *   7. many avoidance triggers → avoiding
 *   8. none strong → unknown (assume friction, not confusion)
 */
export function diagnoseBarrier(a: TaskAnalysis, named: Barrier | null): BarrierHypothesis {
  if (named) {
    return {
      barrier: named,
      kind: TASK_SIDE.includes(named) ? "task" : "starting",
      reason: named === "unknown" ? "user reports a block without a name" : `user named the barrier: ${named}`,
    };
  }
  const lower = a.title.toLowerCase();
  const hasFirstMove = FIRST_MOVE_WORDS.some((w) => lower.includes(w)) || a.clearFirstStep;
  if (a.negated) {
    return { barrier: "avoiding", kind: "starting", reason: "the task is framed as something to avoid" };
  }
  if (AVOIDANCE_WORDS.some((w) => lower.includes(w))) {
    return { barrier: "avoiding", kind: "starting", reason: "avoidance wording present in the task" };
  }
  if (a.ambiguity >= 0.55 && !hasFirstMove && a.actionCount === 0) {
    return { barrier: "unclear", kind: "task", reason: "wording lacks a visible first move" };
  }
  if (a.parts.length >= 2 || a.complexity >= 2 || a.actionCount >= 2) {
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

/* ---------------- stage 6: capacity ---------------- */

/**
 * Estimate current initiation capacity from observable signals only:
 * time of day, named energy barriers, and recent momentum. Never
 * infers character or motivation.
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
 * Keeps letters of every script so accented words compare cleanly.
 */
export function normalizeAction(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, "")
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
  "just", "only", "now", "then", "right", "exactly", "single", "one", "first",
  "whole", "entire", "all", "any", "that", "this", "it", "its", "from", "into",
  "stop", "after", "before", "when", "if", "and", "or", "of", "for", "to", "in", "on", "at", "with",
  "nothing", "else", "more", "out", "up", "down", "there", "here", "you", "yourself", "we", "us",
  "already", "change", "allowed", "free", "today", "roughly",
]);

/**
 * Intent fingerprint — THE canonical semantic-duplicate key, used by
 * EVERY dedupe path (selection, ladders, recovery, fallbacks).
 * "Open John's email", "Click John's email" and "Open the email from
 * John" all collide; genuinely different moves never do.
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
