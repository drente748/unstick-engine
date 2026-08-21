/* ============================================================
   compose/generator — Phase 3: the constrained step generator.

   Takes (graph + beliefs + archetype) and produces CANDIDATE
   first steps by adapting playbook templates through the graph's
   RELATIONS — never from extracted words. Deterministic variety:
   the salt picks which compatible template leads, but every
   candidate must survive the validation cascade before any is
   returned.

   English-only, deterministic.
   ============================================================ */

import type {
  Archetype,
  Belief,
  CandidateV5,
  DedupeKeys,
  EntryRules,
  FidelityGrade,
  TaskGraph,
} from "../types-v5";
import { intentKey } from "../analysis";
import { hashStr } from "../analysis";

/** Build the five dedupe keys for a candidate action text. */
function buildKeys(action: string, g: TaskGraph, strategyId: string): DedupeKeys {
  const entityKeys = g.entities.map((e) => e.key).sort().join("+");
  const frame = `${g.subIntent}|${g.relations.map((r) => r.kind).sort().join(">")}`;
  return {
    surfaceKey: action.toLowerCase().replace(/\s+/g, " ").trim(),
    intentKey: intentKey(action),
    entityKey: entityKeys,
    strategyKey: strategyId,
    semanticFrameKey: frame,
  };
}

/** Is this barrier family "starting" (doorway steps allowed)? */
function isStartingBarrier(beliefs: Belief[]): boolean {
  const barriers = beliefs.filter((b) => b.kind === "barrier");
  if (barriers.length === 0) return true; /* no hypothesis -> default gentle start */
  /* overwhelm/unclear are task-side; social/time/frustration/avoiding are starting-side */
  return !barriers.every((b) => b.value === "overwhelm" || b.value === "unclear-task");
}

/**
 /** Fill a playbook template's role placeholders from the graph.
  * Uses ONLY relation-connected entities — never raw slices.
  * Lexicon persons render as "the dentist"; family relations
  * (mom, dad, brother...) drop the article: "for mom". */
 const FAMILY = new Set(["mom", "dad", "mum", "mother", "father", "brother", "sister", "aunt", "uncle", "grandma", "grandpa", "wife", "husband", "partner", "son", "daughter"]);

 function displayEntity(text: string, evidence: string): string {
   const lower = text.toLowerCase();
   if (FAMILY.has(lower)) return lower;
   if (evidence.startsWith("lexicon:people") || evidence.startsWith("lexicon:place")) {
     return `the ${lower}`;
   }
   return text;
 }

 function fillTemplate(template: string, g: TaskGraph): string {
   const recipient = g.recipient
     ? displayEntity(g.recipient.text, g.recipient.evidence)
     : "them";
   /* no explicit target: communication intents imply a message
      artifact ("email my boss" -> open the message), not "the task".
      A target RECOVERED from a topic role ("the project", "missing
      birthday") is the SUBJECT of the message, not the artifact to
      open — communication steps use "the message" instead. */
   const COMM = new Set(["reply", "initiate-contact", "follow-up", "cancel-plan", "negotiate"]);
   const tgt = g.primaryTarget;
   const recoveredTopic = tgt != null && tgt.evidence.startsWith("semantic-recovery:topic");
   const targetDisplay = tgt && !recoveredTopic
     ? tgt.text
     : COMM.has(g.subIntent)
       ? "the message"
       : (tgt?.text ?? "the task");
   return template
     .replace(/\{target\}/g, targetDisplay)
     .replace(/\{recipient\}/g, recipient)
     .replace(/\{topic\}/g, g.topic?.text ?? "it");
 }

/**
 * Generate candidate first steps for a task. Returns candidates in
 * deterministic order (salt-shuffled among VALID templates only).
 * The caller MUST run the validation cascade — nothing here is
 * user-facing yet.
 */
export function generateCandidates(
  g: TaskGraph,
  beliefs: Belief[],
  archetype: Archetype | null,
  salt: number,
): CandidateV5[] {
  const out: CandidateV5[] = [];

  /* ---- path A: archetype playbook adaptation ---- */
  if (archetype) {
    const startingBarrier = isStartingBarrier(beliefs);
    /* deterministic lead pick among playbook entries */
    const order = archetype.playbook
      .map((_, i) => i)
      .sort((a, b) => ((hashStr(`${g.subIntent}:${salt}`) + a) % 97) - ((hashStr(`${g.subIntent}:${salt}`) + b) % 97));

    for (const idx of order) {
      const entry = archetype.playbook[idx];
      const action = fillTemplate(entry.template, g);

      /* doorway rule: entry-legitimate moves (enter/approach/go-to)
         allowed only as OPENING steps under starting-type barriers */
      const isDoorway = /^(enter|approach|go to|walk to|stand|sit)\b/i.test(action);
      let fidelity: FidelityGrade = "task-faithful";
      if (isDoorway) {
        fidelity = startingBarrier ? "entry-legitimate" : "off-task";
      }

      const rules: EntryRules = {
        requiresStartingBarrier: startingBarrier,
        onlyAsOpeningStep: true,
        notConsecutively: true,
      };

      out.push({
        action,
        strategy: archetype.id as CandidateV5["strategy"],
        size: entry.size,
        subIntent: g.subIntent,
        touches: g.primaryTarget ? [g.primaryTarget.id] : [],
        preserves: ["acted-on"],
        fidelity,
        entryRules: rules,
        keys: buildKeys(action, g, archetype.id),
        source: "archetype",
      });
    }
  }

  /* ---- path B: intent-family fallbacks (no archetype matched) ---- */
  if (out.length === 0) {
    const t = g.primaryTarget?.text ?? "the task";
    const recipientDisplay = g.recipient
      ? displayEntity(g.recipient.text, g.recipient.evidence)
      : "the office";
    const FALLBACKS: Record<string, string[]> = {
      "schedule-appointment": [
        `Find the phone number for ${recipientDisplay} and write it down.`,
        `Open your calendar and pick one possible time slot for ${t}.`,
      ],
      "draft-new": [`Open a blank page and write one rough sentence of ${t}.`],
      "submit-form": [`Put ${t} in front of you and read the first field only.`],
      "pay-bill": [`Open ${t} and read the amount due only. Nothing more.`],
      "buy-item": [`Write ${t} on a shopping note. That's the whole step.`],
      "physical-activity": [`Lay out what you need for ${t}. Clothes count as started.`],
      "practice-skill": [`Get ${t} out and put it in your hands. That's the whole step.`],
      "file-organize": [`Open ${t} and name the first pile you see. Don't sort yet.`],
      "start-unknown": [
        /* long unclassified "tasks" are usually emotional states, not
           work ("I'm so overwhelmed I don't even know where to start").
           Echoing them back reads as robotic — respond warmly instead. */
        t.length >= 15 && (g.primaryTarget?.entityType ?? "unclassified") === "unclassified"
          ? "That sounds heavy. Pick ONE small thing and tell me what it is — we'll start there."
          : `Say out loud what "${t}" actually means. One sentence, to the room.`,
      ],
    };
    const lines = FALLBACKS[g.subIntent]
      ?? [g.action
        ? `Do the smallest visible piece of ${t} for two minutes.`
        : "That sounds heavy. Pick ONE small thing — even a tiny one — and tell me what it is. We'll start there."];
    for (const line of lines) {
      out.push({
        action: line,
        strategy: "tiny", /* ridiculously-small-start family fits every fallback */
        size: 1,
        subIntent: g.subIntent,
        touches: g.primaryTarget ? [g.primaryTarget.id] : [],
        preserves: [],
        fidelity: "task-faithful",
        entryRules: { requiresStartingBarrier: true, onlyAsOpeningStep: true, notConsecutively: true },
        keys: buildKeys(line, g, "fallback"),
        source: "fallback",
      });
    }
  }

  return out;
}
