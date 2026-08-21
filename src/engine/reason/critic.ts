/* ============================================================
   reason/critic — strategy × entity-nature compatibility gate.

   Asks one question for every proposed action family:
     "Is this action semantically valid ON THIS KIND of thing?"

   This is the foundation that makes "Sit down at the room"
   structurally impossible: sitting is a work-surface action; the
   room is a cleanable-space whose fit list has no "sit-at".

   English-only, deterministic.
   ============================================================ */

import { ENTITY_ACTION_FIT, type EntityType, type Verdict } from "../types-v5";

/**
 * Proposed action families the generator may use (Phase 3 will
 * generate from these). Kept here so the critic can judge them
 * BEFORE any text exists.
 */
export type ActionFamily =
  | "clean" | "tidy" | "enter" | "approach" | "survey"
  | "clear" | "sit-at" | "arrange" | "wipe"
  | "organize" | "sort" | "open" | "declutter"
  | "read" | "reply" | "draft" | "send"
  | "contact" | "message" | "call" | "ask"
  | "write" | "edit" | "print" | "review" | "skim" | "annotate"
  | "fix" | "configure" | "inspect"
  | "start" | "plan" | "advance"
  | "pick-up" | "move" | "gather" | "wash"
  | "lay-out" | "put-on"
  | "go-to" | "travel-to" | "pack-for";

/**
 * Validate that an action family fits the entity's semantic nature.
 * Returns a Verdict: REJECT (not low score) when incompatible.
 */
export function checkActionFit(family: ActionFamily, entityType: EntityType): Verdict {
  const fit = ENTITY_ACTION_FIT[entityType];

  /* unclassified entities: allow conservative universal actions only */
  if (entityType === "unclassified") {
    const universal: ActionFamily[] = ["open", "approach", "survey", "start", "plan", "ask"];
    if (universal.includes(family)) {
      return { ok: true, gate: null, reason: `universal action on unclassified entity` };
    }
    return {
      ok: false,
      gate: "semantic",
      reason: `action "${family}" requires a known entity type; entity is unclassified`,
    };
  }

  if (fit.includes(family)) {
    return { ok: true, gate: null, reason: `"${family}" fits ${entityType}` };
  }

  return {
    ok: false,
    gate: "semantic",
    reason: `"${family}" is not valid on ${entityType} (valid: ${fit.join(", ") || "none"})`,
  };
}

/**
 * The Test-7 scenario as a unit: "sit-at" on a cleanable-space must
 * REJECT. Exported so tests pin this behavior forever.
 */
export function sitAtRoomIsRejected(): boolean {
  const v = checkActionFit("sit-at", "cleanable-space");
  return !v.ok && v.gate === "semantic";
}
