/* ============================================================
   nlu/entities — English-only entity extraction with roles.

   Extracts normalized, role-tagged entities from ONE clause.
   Display text keeps the user's original casing; matching uses
   lowercased keys. Nothing is invented: an entity exists only if
   its words appear in the clause.

   Deterministic, local, evidence-backed.
   ============================================================ */

import { PLACES, PEOPLE, TOOLS, STOPWORDS, VERBS, normalizeTask, stem, tokenize } from "../analysis";
import type { EntityRole, TaskEntity } from "../types-v5";

/** Message channels that imply a communication target. */
const MESSAGE_NOUNS = new Set([
  "email", "message", "text", "dm", "letter", "note", "mail", "reply",
  "inbox", "whatsapp", "slack", "call", "voicemail",
]);

/** Words that introduce a topic ("about the invoice", "for my exam"). */
const TOPIC_MARKERS = new Set(["about", "regarding", "concerning", "for"]);

/** Possessive marker: "Sarah's" -> owner Sarah. */
const POSSESSIVE = /^([a-z]+)'s?\b/i;

/** Day/month names — capitalized but NEVER people. */
const TEMPORAL_WORDS = new Set([
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december",
  "today", "tomorrow", "tonight", "weekend", "noon", "midnight",
]);

/** Temporal markers that START a time phrase ("before Friday"). */
const TIME_MARKERS = new Set(["before", "by", "until", "on"]);

/** Temporal modifiers that fuse with the following day ("next Tuesday"). */
const TEMPORAL_MODIFIERS = new Set(["next", "this", "coming", "last", "every"]);

/** Capitalized word(s) at a position — likely a proper name. */
function isProperName(word: string): boolean {
  return /^[A-Z][a-z]+$/.test(word);
}

interface EntityDraft {
  role: EntityRole;
  text: string;
  key: string;
  confidence: number;
  evidence: string;
}

/**
 * Extract entities from one clause. Order of extraction matters for
 * id assignment but roles are decided by EVIDENCE, not position.
 */
export function extractEntities(clauseText: string): TaskEntity[] {
  const title = normalizeTask(clauseText);
  const words = tokenize(title);
  const drafts: EntityDraft[] = [];
  const seen = new Set<string>();

  const push = (d: EntityDraft) => {
    if (!d.key || seen.has(`${d.role}:${d.key}`)) return;
    seen.add(`${d.role}:${d.key}`);
    drafts.push(d);
  };

  /* ---- time FIRST: locate the temporal boundary so the object
     phrase can be cut before it ("the garage before Saturday" ->
     object core is "the garage"). ---- */
  /* ---- recipient / person: possessive + known people + proper names ---- */
  let owner: string | null = null;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    /* possessive in original text: find the original-cased token */
    const origTokens = title.split(/\s+/);
    const orig = origTokens[i] ?? "";
    const poss = orig.match(POSSESSIVE);
    if (poss && !STOPWORDS.has(w.replace(/'s$/, ""))) {
      owner = poss[1];
      continue;
    }
    const bare = w.replace(/'s$/, "");
    if (PEOPLE.includes(bare)) {
      push({ role: "person", text: capitalize(bare), key: bare, confidence: 0.9, evidence: `lexicon:people:${bare}` });
      continue;
    }
    /* a capitalized non-lexicon word mid-task is likely a name
       ("email Sarah about...") — record as person with lower confidence,
       unless it is sentence-initial (could be anything) */
    if (
      isProperName(orig) && i > 0 && !STOPWORDS.has(w) &&
      !TOOLS.includes(w) && !PLACES.includes(w) &&
      !TEMPORAL_WORDS.has(w) /* days/months are times, never people */
    ) {
      push({ role: "person", text: orig, key: w, confidence: 0.7, evidence: `proper-name:${orig}` });
    }
  }
  if (owner) {
    push({ role: "person", text: capitalize(owner), key: owner.toLowerCase(), confidence: 0.85, evidence: `possessive:${owner}'s` });
  }

  /* ---- place ---- */
  for (const p of PLACES) {
    if (words.includes(p) || (p.includes(" ") && titleLower(title).includes(p))) {
      push({ role: "place", text: p, key: p, confidence: 0.9, evidence: `lexicon:place:${p}` });
      break;
    }
  }

  /* ---- tool ---- */
  for (const t of TOOLS) {
    if (t.includes(" ") ? titleLower(title).includes(t) : words.includes(t)) {
      push({ role: "tool", text: t, key: t, confidence: 0.85, evidence: `lexicon:tool:${t}` });
      break;
    }
  }

  /* ---- time: "before Friday", "by monday", "until june" ----
     Extracted BEFORE topic so topic extraction can stop at the
     temporal boundary. */
  let timeBoundary = words.length; /* index where the time phrase starts */
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    /* modifier + day fusion FIRST: "next Tuesday" is ONE time entity */
    if (TEMPORAL_MODIFIERS.has(w)) {
      const nxt = words[i + 1] ?? "";
      if (TEMPORAL_WORDS.has(nxt)) {
        push({
          role: "time",
          text: `${capitalize(w)} ${capitalize(nxt)}`,
          key: `${w} ${nxt}`,
          confidence: 0.9,
          evidence: `temporal-modifier:${w}`,
        });
        timeBoundary = Math.min(timeBoundary, i);
        break;
      }
      continue; /* bare "next" with no day — not a time phrase */
    }
    const isMarker = TIME_MARKERS.has(w);
    const isTemporal = TEMPORAL_WORDS.has(w);
    if (!isMarker && !isTemporal) continue;
    if (isMarker) {
      const nxt = words[i + 1] ?? "";
      if (!TEMPORAL_WORDS.has(nxt)) continue; /* "on the desk" is not time */
      push({
        role: "time",
        text: `${capitalize(w)} ${capitalize(nxt)}`,
        key: `${w} ${nxt}`,
        confidence: 0.85,
        evidence: `time-marker:${w}`,
      });
    } else {
      push({ role: "time", text: capitalize(w), key: w, confidence: 0.8, evidence: `temporal-word:${w}` });
    }
    timeBoundary = Math.min(timeBoundary, i);
    break;
  }

  /* ---- topic: after "about/regarding/concerning/for" ----
     "for" counts ONLY as purpose marker when followed by content
     ("for my chemistry exam"), not as plain preposition.
     Topic collection STOPS at the temporal boundary so
     "about the proposal before Friday" -> topic="proposal". */
  for (let i = 0; i < words.length; i++) {
    const marker = words[i];
    if (!TOPIC_MARKERS.has(marker)) continue;
    if (marker === "for") {
      /* skip if it is a plain-preposition use: next word is a person/
         place/tool or the phrase already has a target */
      const nxt = words[i + 1] ?? "";
      if (PEOPLE.includes(nxt) || PLACES.includes(nxt) || TOOLS.includes(nxt) || MESSAGE_NOUNS.has(nxt)) continue;
      if (i === 0) continue;
    }
    const topicWords: string[] = [];
    const origTokens = title.split(/\s+/);
    for (let j = i + 1; j < words.length && j < timeBoundary && topicWords.length < 4; j++) {
      if (STOPWORDS.has(words[j])) continue;
      if (TIME_MARKERS.has(words[j]) || TEMPORAL_WORDS.has(words[j])) break;
      topicWords.push(origTokens[j] ?? words[j]);
    }
    if (topicWords.length > 0) {
      push({
        role: "topic",
        text: topicWords.join(" "),
        key: words.slice(i + 1, Math.max(i + 1, timeBoundary)).filter((w: string) => !STOPWORDS.has(w)).join(" "),
        confidence: 0.9,
        evidence: `topic-marker:${marker}`,
      });
    }
    break;
  }

  /* ---- target: message noun AFTER the verb wins; the verb word
     itself never becomes the target ("reply to Sarah's email" ->
     target=email, not reply) ---- */
  const verbIdx = (() => {
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (Object.prototype.hasOwnProperty.call(VERBS, w) || Object.prototype.hasOwnProperty.call(VERBS, stem(w))) return i;
    }
    return -1;
  })();
  const msgNoun = words.find((w, idx) => MESSAGE_NOUNS.has(w) && idx > verbIdx);
  if (msgNoun) {
    push({ role: "target", text: msgNoun, key: msgNoun, confidence: 0.9, evidence: `message-noun:${msgNoun}` });
  }

  /* ---- target core fallback: the noun phrase right after the verb,
     CUT at every boundary (time / topic-marker / place already has
     its own entity). "Clean the garage before Saturday" ->
     target="the garage". Never spans past the clause. ---- */
  if (!drafts.some((d) => d.role === "target")) {
    const coreWords: string[] = [];
    for (let j = verbIdx + 1; j < words.length && j < timeBoundary && coreWords.length < 3; j++) {
      const w = words[j];
      if (STOPWORDS.has(w) && coreWords.length > 0) break; /* stop at "before/and" connectors */
      if (TOPIC_MARKERS.has(w) || TIME_MARKERS.has(w)) break;
      if (TEMPORAL_WORDS.has(w)) break;
      /* skip pure function words at the start (to/the/my) */
      if (STOPWORDS.has(w) && coreWords.length === 0) continue;
      const origTokens = title.split(/\s+/);
      coreWords.push(origTokens[j] ?? w);
      /* a known place/tool IS the whole target by itself */
      if (PLACES.includes(w) || TOOLS.includes(w)) break;
    }
    if (coreWords.length > 0) {
      push({
        role: "target",
        text: coreWords.join(" "),
        key: tokenize(coreWords.join(" ")).join(" "),
        confidence: 0.75,
        evidence: "clause-object-core",
      });
    }
  }

  return drafts.map((d, i) => ({
    id: `e${i + 1}`,
    role: d.role,
    text: d.text,
    key: d.key,
    confidence: d.confidence,
    evidence: d.evidence,
  }));
}

function titleLower(s: string): string {
  return s.toLowerCase();
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The display object phrase: prefer explicit target, else person's artifact. */
export function displayObject(entities: TaskEntity[], fallback: string): string {
  const target = entities.find((e) => e.role === "target");
  if (target) return target.text;
  return fallback;
}
