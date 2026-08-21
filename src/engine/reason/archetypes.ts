/* ============================================================
   reason/archetypes — case-based playbooks (Phase 2: five only).

   An archetype is a recurring task pattern with an ordered opening
   playbook. Matching uses the graph's subIntent + entity types —
   never raw text. Playbooks are ADAPTED to the graph at generation
   time (Phase 3); here we only MATCH and expose the plan.

   English-only, deterministic.
   ============================================================ */

import type { Archetype, SubIntent, TaskGraph } from "../types-v5";

const CLEANING: Archetype = {
  id: "cleaning",
  name: "Clean a space",
  subIntents: ["clean-space", "tidy-space"],
  features: ["target:cleanable-space", "action:clean"],
  playbook: [
    { via: "target", template: "Enter {target} and look at one corner only.", size: 1 },
    { via: "target", template: "Pick up the first thing that does not belong in {target}.", size: 2 },
    { via: "target", template: "Clear one hand-sized patch inside {target}.", size: 2 },
    { via: "target", template: "Set a 10-minute timer and fill one bag from {target}.", size: 3 },
  ],
};

const COMMUNICATION: Archetype = {
  id: "communication",
  name: "Handle a message",
  subIntents: ["reply", "initiate-contact", "follow-up", "cancel-plan", "negotiate"],
  features: ["target:communication-artifact", "recipient:person-contact"],
  playbook: [
    { via: "target", template: "Open {target} and read the last message only.", size: 1 },
    { via: "target", template: "Write the first line of your reply to {recipient} — stop there.", size: 2 },
    { via: "target", template: "Draft the full reply fast and ugly. Sending is a later step.", size: 3 },
  ],
};

const STUDYING: Archetype = {
  id: "studying",
  name: "Study material",
  subIntents: ["study-material", "practice-skill"],
  features: ["topic:reading-material", "action:study"],
  playbook: [
    { via: "target", template: "Open {target} and read the first heading only.", size: 1 },
    { via: "target", template: "Write three questions {target} should answer.", size: 2 },
    { via: "target", template: "Do one 15-minute focused pass on {target}.", size: 3 },
  ],
};

const ORGANIZING: Archetype = {
  id: "organizing",
  name: "Organize files or things",
  subIntents: ["file-organize", "tidy-space"],
  features: ["target:storage-space", "action:organize"],
  playbook: [
    { via: "target", template: "Look at {target} and name the first pile you see.", size: 1 },
    { via: "target", template: "Sort five items of {target} into two groups.", size: 2 },
    { via: "target", template: "Do one full sorting pass on {target} — imperfect is fine.", size: 3 },
  ],
};

const FIXING: Archetype = {
  id: "fixing",
  name: "Fix something broken",
  subIntents: ["fix-broken"],
  features: ["target:digital-system", "action:fix"],
  playbook: [
    { via: "target", template: "Open {target} and make the problem happen once.", size: 1 },
    { via: "target", template: "Write down the exact error or wrong behavior of {target}.", size: 2 },
    { via: "target", template: "Try one obvious fix on {target}. Reverting is allowed.", size: 3 },
  ],
};

const REGISTRY: Archetype[] = [CLEANING, COMMUNICATION, STUDYING, ORGANIZING, FIXING];

/** Score how well an archetype fits the graph (0..3). */
function scoreMatch(a: Archetype, g: TaskGraph): number {
  let score = 0;
  if (a.subIntents.includes(g.subIntent)) score += 2;
  const types = new Set(g.entities.map((e) => e.entityType));
  for (const f of a.features) {
    const [kind, value] = f.split(":");
    if (kind === "target" && g.primaryTarget?.entityType === value) score += 0.5;
    if (kind === "recipient" && g.recipient?.entityType === value) score += 0.25;
    if (kind === "action" && g.action === value) score += 0.25;
    void types;
  }
  return score;
}

export interface ArchetypeMatch {
  archetype: Archetype;
  score: number;
  /** Why this archetype won — recorded for debugging. */
  evidence: string[];
}

/** Match the graph to its nearest archetype; null when nothing fits. */
export function matchArchetype(g: TaskGraph): ArchetypeMatch | null {
  const ranked = REGISTRY.map((a) => ({ a, s: scoreMatch(a, g) })).sort((x, y) => y.s - x.s);
  const best = ranked[0];
  if (!best || best.s < 2) return null; /* require the subIntent hit */
  const evidence = [
    `subIntent:${g.subIntent}`,
    best.a.features.map((f) => `feature:${f}`).join(","),
  ];
  return { archetype: best.a, score: best.s, evidence };
}

/** All registered archetype ids (for tests and introspection). */
export function archetypeIds(): string[] {
  return REGISTRY.map((a) => a.id);
}

/** SubIntents covered by the current registry (for coverage checks). */
export function coveredIntents(): SubIntent[] {
  const s = new Set<SubIntent>();
  for (const a of REGISTRY) for (const i of a.subIntents) s.add(i);
  return [...s];
}
