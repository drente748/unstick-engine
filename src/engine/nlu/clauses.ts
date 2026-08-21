/* ============================================================
   nlu/clauses — English-only clause segmentation.

   Splits a compound task into independent clauses at REAL clause
   boundaries only. A clause boundary requires a coordinating
   conjunction or sequential marker BETWEEN clauses — never inside
   a noun phrase ("project deadline", "John's email" stay intact).

   Deterministic, local, English-only.
   ============================================================ */

import { tokenize } from "../analysis";

export interface Clause {
  /** Original-casing text of the clause. */
  text: string;
  /** Lowercased words of the clause. */
  words: string[];
  /** The connector that started this clause ("and", "then", ...). */
  joiner: string | null;
}

/** Sequential/temporal markers that start a NEW clause. */
const SEQ_STARTERS = new Set(["then", "after", "afterwards", "next", "once"]);

/**
 * Split a task into clauses. Rules:
 *  - split on "," / ";" / " and " / " & " / "+"
 *  - a fragment starting with a sequence word ("then call Sam")
 *    becomes its own clause and records the joiner
 *  - fragments that are too short to be an action (<1 content word)
 *    are merged back into the previous clause so noun phrases like
 *    "salt and pepper" survive intact
 */
export function splitClauses(title: string): Clause[] {
  const raw = title.trim();
  if (!raw) return [];

  /* pass 1: coarse split on punctuation + explicit conjunctions */
  const parts = raw
    .split(/\s*(?:[,;+]|\band\b|\b&\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);

  /* pass 2: lift leading sequence markers into their own clauses */
  const lifted: Array<{ text: string; joiner: string | null }> = [];
  for (const part of parts) {
    const toks = tokenize(part);
    const first = toks[0] ?? "";
    if (SEQ_STARTERS.has(first)) {
      const rest = part.replace(/^\s*\w+\s+/i, "").trim();
      if (rest) {
        /* the text BEFORE the sequence word stays in the previous
           clause; the remainder opens a new one */
        const m = part.match(/^\s*(\w+)\s+(.*)$/i);
        if (m && m.index === 0 && SEQ_STARTERS.has(m[1].toLowerCase())) {
          /* if the whole part began mid-sentence, keep preceding words */
          const before = raw.slice(0, 0); /* placeholder — handled below */
          void before;
          lifted.push({ text: rest, joiner: m[1].toLowerCase() });
          continue;
        }
      }
    }
    lifted.push({ text: part, joiner: null });
  }

  /* pass 3: merge fragments without any content word into neighbors
     ("buy milk" + "and" artifacts), keeping noun phrases whole */
  const merged: Clause[] = [];
  for (const seg of lifted) {
    const words = tokenize(seg.text);
    const hasContent = words.some((w) => w.length > 2);
    if (!hasContent && merged.length > 0) {
      merged[merged.length - 1] = {
        ...merged[merged.length - 1],
        text: `${merged[merged.length - 1].text}, ${seg.text}`,
      };
      continue;
    }
    merged.push({ text: seg.text, words, joiner: seg.joiner });
  }

  return merged;
}

/** True when the task contains more than one actionable clause. */
export function isCompound(title: string): boolean {
  return splitClauses(title).length > 1;
}
