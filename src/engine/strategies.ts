import { hashStr } from "./analysis";
import type { Barrier, CostVector, Level, Medium, StrategyId, Structure, TaskAnalysis } from "./types";

/* ============================================================
   Stage 7 — Initiation strategies & candidate generation.

   COMPATIBILITY MODEL (the fix for semantic leakage):
   Every template declares the media it is semantically valid for
   via a `fits` predicate over the task analysis. A template may
   only be rendered when its prerequisites hold:
     · interpolating a LOCATION requires a real place or a
       physical task — never an invented "where X happens";
     · interpolating an APP/FILE requires a digital artifact;
     · reading/writing steps require readable/writable content.
   renderStrategy filters templates through `fits` and returns
   null when a strategy has NO compatible template for this task —
   which hard-excludes that strategy from candidates, ladders,
   recovery and every synthesized path. A future strategy cannot
   bypass this: generation is impossible without a fitting
   template.
   ============================================================ */

interface Slots {
  /** "the report" — always present. */
  o: string;
  /** Digital artifact: named tool, or a grounded generic. Never an object pretending to be an app. */
  t: string;
  /** Physical location: named place, or a grounded generic. Never fabricated for digital tasks. */
  p: string;
  /** "writing" — verb phrase or "the first bit" fallback. */
  v: string;
  /** "your boss" — person, when present. */
  who: string | null;
}

const the = (s: string): string => (/^(the|my|our|your|a|an) /.test(s) ? s : `the ${s}`);

function slotsFor(a: TaskAnalysis): Slots {
  const digitalish = a.medium === "digital" || a.medium === "mixed";
  const physicalish = a.medium === "physical" || a.medium === "mixed";
  return {
    o: a.object,
    t: a.tool ? the(a.tool) : digitalish ? "the app or file for it" : a.object,
    p: a.place ? the(a.place) : physicalish ? "the spot it starts at" : "your usual spot",
    v: a.verbPhrase ?? "the first bit",
    who: a.person ? the(a.person).replace(/^the /, "your ") : null,
  };
}

/* ---------------- compatibility predicates ---------------- */

const isDigital = (a: TaskAnalysis): boolean => a.medium === "digital" || a.medium === "mixed";
const isPhysical = (a: TaskAnalysis): boolean => a.medium === "physical" || a.medium === "mixed";
const hasPlace = (a: TaskAnalysis): boolean => a.place != null;
const hasTool = (a: TaskAnalysis): boolean => a.tool != null;
/** Location interpolation is only honest here. */
const locationOk = (a: TaskAnalysis): boolean => hasPlace(a) || a.medium === "physical";
/** Opening/reading an on-screen artifact is only honest here. */
const artifactOk = (a: TaskAnalysis): boolean => hasTool(a) || isDigital(a) || a.needsApp;
const readableOk = (a: TaskAnalysis): boolean =>
  artifactOk(a) || ["learning", "research", "fixing", "organizing", "deciding", "writing", "communication"].includes(a.structure);

interface TemplateDef {
  /** Semantic prerequisites. Absent = valid for any medium. */
  fits?: (a: TaskAnalysis) => boolean;
  render: (s: Slots, a: TaskAnalysis) => string;
}

export interface StrategyDef {
  id: StrategyId;
  label: string;
  /** Typical size band this strategy serves. */
  sizes: [Level, Level];
  /**
   * Base cost profile (each 0..1) BEFORE task signals adjust it.
   *  progress   = real task-state change per attempt
   *  effort     = physical/time work
   *  initiation = activation energy (opening things, moving)
   *  cognitive  = decisions/thinking demanded
   *  emotional  = how close it gets to the scary part
   */
  base: Pick<CostVector, "progress" | "effort" | "initiation" | "cognitive" | "emotional">;
  templates: TemplateDef[];
}

export const STRATEGIES: StrategyDef[] = [
  {
    id: "physical",
    label: "physical start",
    sizes: [0, 3],
    base: { progress: 0.45, effort: 0.35, initiation: 0.2, cognitive: 0.1, emotional: 0.15 },
    templates: [
      /* bodily approaches — require a real location or a physical task */
      { fits: locationOk, render: (s) => `Stand up and walk to ${s.p}. Nothing else.` },
      { fits: locationOk, render: (s) => `Clear a hand-sized space at ${s.p} — that's the whole move.` },
      { fits: locationOk, render: (s) => `Sit down at ${s.p} and place your hands where the work happens.` },
      { fits: locationOk, render: (s) => `Get a glass of water, stand at ${s.p}, and face the mess.` },
      /* bodily approaches for screen work — body + named digital artifact */
      { fits: isDigital, render: (s) => `Sit down, open ${s.t}, and put your hands where the typing happens.` },
      { fits: isDigital, render: (s) => `Close every tab except ${s.t}. Then just look at it.` },
      { fits: isDigital, render: (s) => `Put your phone in another room, then open ${s.t}.` },
      /* no evidence either way — offer options, fabricate nothing */
      {
        fits: (a) => a.medium === "unknown",
        render: (s) => `Stand up and move to where ${s.o} lives — desk, room, or app.`,
      },
      { fits: (a) => a.medium === "unknown", render: () => `Stand up, stretch once, and face the thing.` },
    ],
  },
  {
    id: "info",
    label: "information start",
    sizes: [1, 3],
    base: { progress: 0.55, effort: 0.25, initiation: 0.35, cognitive: 0.35, emotional: 0.15 },
    templates: [
      { fits: artifactOk, render: (s) => `Open ${s.t} and only read what's already there.` },
      { fits: readableOk, render: (s) => `Read the first line about ${s.o}. Stop after one.` },
      { render: (s) => `Find ONE example of a finished ${s.o.replace(/^the /, "")}. Just look at it.` },
      { render: (s) => `Write down the three things ${s.o} needs — from memory, badly.` },
      { render: (s) => `Gather the two things ${s.o} needs into one spot. Don't use them yet.` },
    ],
  },
  {
    id: "decision",
    label: "decision-reduction start",
    sizes: [1, 3],
    base: { progress: 0.6, effort: 0.2, initiation: 0.25, cognitive: 0.45, emotional: 0.2 },
    templates: [
      { render: (s) => `Make the first decision about ${s.o} in 10 seconds — any option that isn't terrible.` },
      { render: (s) => `Write the ONE choice blocking ${s.o}, then pick either side. Wrong is fine; it moves.` },
      { render: (s) => `Flip a coin for the first choice on ${s.o}. Heads you go with option A.` },
      { render: (s) => `Pick the version of ${s.o} that takes the least setup. Commit for 2 minutes only.` },
    ],
  },
  {
    id: "tiny",
    label: "ridiculously small start",
    sizes: [2, 4],
    base: { progress: 0.35, effort: 0.08, initiation: 0.08, cognitive: 0.08, emotional: 0.08 },
    templates: [
      { render: (s) => `Do the 30-second version of ${s.o}. Stop when the half-minute is up.` },
      { render: (s) => `One single unit of ${s.o} — one line, one item, one click. That's the whole task.` },
      { fits: (a) => artifactOk(a) || isPhysical(a), render: (s) => `Touch ${s.t} for exactly 15 seconds. Then you're free.` },
      { render: (s) => `Do ${s.v} for one breath's worth. Then stop and look.` },
      { render: (s) => `The tiniest real slice of ${s.o} — smaller than feels useful. That's the point.` },
    ],
  },
  {
    id: "timebox",
    label: "time-boxed start",
    sizes: [0, 2],
    base: { progress: 0.5, effort: 0.3, initiation: 0.2, cognitive: 0.15, emotional: 0.2 },
    templates: [
      { render: (s) => `Set a 2-minute timer for ${s.o}. When it rings, stopping is allowed.` },
      { render: (s) => `Work on ${s.o} until the next song ends.` },
      { render: (s) => `Give ${s.o} exactly 90 seconds — watch the clock, not the task.` },
      { render: (s) => `One kitchen-timer round: 5 minutes on ${s.o}, then a real pause.` },
    ],
  },
  {
    id: "permission",
    label: "permission-to-be-bad start",
    sizes: [1, 3],
    base: { progress: 0.55, effort: 0.25, initiation: 0.2, cognitive: 0.2, emotional: 0.05 },
    templates: [
      { render: (s) => `Make the worst acceptable version of ${s.o}. Bad on purpose.` },
      { render: (s) => `Do ${s.v} badly for 2 minutes. Quality is banned until tomorrow.` },
      { fits: (a) => ["writing", "communication", "creating", "project", "learning"].includes(a.structure) || isDigital(a),
        render: (s) => `Write the version of ${s.o} you'd never show anyone.` },
      { render: (s) => `Lower the bar to the floor: a clumsy, half-done start on ${s.o} is today's win.` },
    ],
  },
  {
    id: "visual",
    label: "visual setup start",
    sizes: [1, 3],
    base: { progress: 0.4, effort: 0.15, initiation: 0.25, cognitive: 0.15, emotional: 0.1 },
    templates: [
      { fits: artifactOk, render: (s) => `Open ${s.t} and just look at it — no typing, no fixing, just looking.` },
      { render: (s) => `Put everything about ${s.o} in front of you: tabs, papers, tools. Arrange nothing.` },
      { render: (s) => `Sketch ${s.o} as three ugly boxes on any paper.` },
      { render: (s) => `Lay out the pieces of ${s.o} where you can see them. Seeing is the step.` },
    ],
  },
  {
    id: "social",
    label: "accountability start",
    sizes: [0, 2],
    base: { progress: 0.45, effort: 0.15, initiation: 0.35, cognitive: 0.1, emotional: 0.3 },
    templates: [
      {
        render: (s) =>
          s.who
            ? `Send ${s.who} one line: “doing ${s.o.replace(/^the /, "")} now.” That's it.`
            : `Say out loud, to the room: “I'm doing the first bit now.”`,
      },
      { render: () => `Tell me the very first move — say it out loud — then do only that.` },
      { render: (s) => `Text any friend: “starting ${s.o.replace(/^the /, "")}, 5 minutes.” No reply needed.` },
      { render: () => `Put on a “body double” — a video of someone working — and mirror them for 2 minutes.` },
    ],
  },
  {
    id: "question",
    label: "question start",
    sizes: [1, 3],
    base: { progress: 0.5, effort: 0.12, initiation: 0.15, cognitive: 0.4, emotional: 0.1 },
    templates: [
      { render: (s) => `Ask out loud: what's the very first physical move on ${s.o}? Do only that move.` },
      { fits: (a) => isPhysical(a) || hasPlace(a), render: (s) => `Ask: where does ${s.o} actually live? Go stand in that spot.` },
      { fits: isDigital, render: (s) => `Ask: which app does ${s.o} live in? Open only that app.` },
      { render: (s) => `Ask: what would a 5-year-old do first with ${s.o}? Do exactly that.` },
      { render: (s) => `Ask: what's already done on ${s.o}? Start one inch past that point.` },
    ],
  },
  {
    id: "direct",
    label: "direct action start",
    sizes: [0, 1],
    base: { progress: 0.8, effort: 0.5, initiation: 0.45, cognitive: 0.3, emotional: 0.35 },
    templates: [
      { render: (s) => `Do the first 2 minutes of ${s.o} — roughly, right now.` },
      { render: (s) => `Start ${s.v} immediately, one rough unit only.` },
      { render: (s) => `Take the first real action on ${s.o} before this sentence fades.` },
      { render: (s) => `Begin ${s.o.replace(/^the /, "")} mid-sentence: no intro, no setup, just motion.` },
    ],
  },
];

export const STRATEGY_MAP: Record<StrategyId, StrategyDef> = Object.fromEntries(
  STRATEGIES.map((s) => [s.id, s]),
) as Record<StrategyId, StrategyDef>;

export const STRATEGY_LABEL: Record<StrategyId, string> = Object.fromEntries(
  STRATEGIES.map((s) => [s.id, s.label]),
) as Record<StrategyId, string>;

/* ---------------- barrier → strategy preferences ---------------- */

/** Which strategy categories best counter each barrier (ordered). */
export const BARRIER_STRATEGIES: Record<Barrier, StrategyId[]> = {
  overwhelmed: ["tiny", "physical", "question", "permission"],
  unclear: ["question", "info", "visual", "tiny"],
  boring: ["timebox", "direct", "social", "tiny"],
  perfectionism: ["permission", "tiny", "visual", "decision"],
  anxiety: ["permission", "tiny", "info", "visual"],
  distracted: ["physical", "timebox", "tiny", "direct"],
  tired: ["tiny", "permission", "visual", "timebox"],
  avoiding: ["decision", "tiny", "question", "physical"],
  unknown: ["tiny", "question", "physical", "direct"],
};

/* ---------------- structure → strategy fit ---------------- */

/** Base fit (0..6) between a task structure and a strategy category. */
export const STRUCTURE_FIT: Record<Structure, Partial<Record<StrategyId, number>>> = {
  prep: { physical: 5, info: 4, visual: 4, tiny: 3 },
  writing: { permission: 6, tiny: 5, direct: 4, visual: 3 },
  research: { info: 6, question: 5, visual: 4, timebox: 3 },
  communication: { direct: 6, decision: 5, social: 4, tiny: 3 },
  cleaning: { physical: 6, timebox: 5, tiny: 5, visual: 3 },
  deciding: { decision: 6, question: 5, permission: 4, info: 3 },
  learning: { tiny: 5, info: 5, timebox: 4, physical: 3 },
  creating: { permission: 6, visual: 5, tiny: 4, timebox: 3 },
  errand: { physical: 6, decision: 4, direct: 4, tiny: 3 },
  fixing: { info: 5, visual: 5, tiny: 4, question: 4 },
  organizing: { tiny: 6, physical: 5, timebox: 4, visual: 3 },
  project: { question: 5, decision: 5, tiny: 5, visual: 4 },
  generic: { tiny: 4, physical: 4, question: 4, direct: 3 },
};

/* ---------------- rendering (the hard compatibility gate) ---------------- */

/**
 * Compatible templates only. Returns null when the strategy has NO
 * template whose semantic prerequisites hold for this task — callers
 * must treat null as "strategy unavailable", which is what keeps
 * physical moves out of digital tasks and invented places out of
 * everything.
 */
export function compatibleTemplates(id: StrategyId, a: TaskAnalysis): TemplateDef[] {
  return STRATEGY_MAP[id].templates.filter((t) => (t.fits ? t.fits(a) : true));
}

export function renderStrategy(id: StrategyId, a: TaskAnalysis, salt: number): string | null {
  const fit = compatibleTemplates(id, a);
  if (fit.length === 0) return null;
  const tpl = fit[hashStr(`${a.title}|${id}|${salt}`) % fit.length];
  return tpl.render(slotsFor(a), a);
}

/** Is this strategy usable AT ALL for this task? */
export function strategyFitsTask(id: StrategyId, a: TaskAnalysis): boolean {
  return compatibleTemplates(id, a).length > 0;
}

/* ---------------- task-scoped decomposition ----------------
   The ladder generator. Five rungs per medium, injective by
   construction (each size maps to a structurally different move),
   so a ladder can never repeat a rung while descending. No rung
   ever interpolates a location or artifact the task doesn't have.
   ---------------------------------------------------------- */

const short = (s: string): string => s.replace(/^the /, "");

/** The smallest addressable unit per structure ("one sentence", "one object"…). */
const UNIT: Record<Structure, string> = {
  prep: "one thing you'll need",
  writing: "one sentence",
  research: "one source",
  communication: "one short reply",
  cleaning: "one object",
  deciding: "one option",
  learning: "one paragraph",
  creating: "one mark",
  errand: "the first stop",
  fixing: "the first symptom",
  organizing: "one drawer or folder",
  project: "the first piece",
  generic: "one small unit",
};

function scopeRung(a: TaskAnalysis): string {
  if (a.scopeWord) return `Do one bounded part of ${a.object} — ignore the rest today.`;
  if (a.actionCount >= 2) return `Do only the first of those things: the rest doesn't exist yet.`;
  return `Do the first 2 minutes of ${a.object} — roughly, right now.`;
}

/**
 * A rung of the dynamic ladder for a given size, respecting medium.
 * 0 = scoped real start · 1 = doorway · 2 = one unit · 3 = contact ·
 * 4 = approach. Exhaustive over Level — there is no fall-through
 * default that could smuggle in an incompatible move.
 */
export function decompose(a: TaskAnalysis, size: Level): string {
  const o = short(a.object);
  const unit = UNIT[a.structure];
  const t = a.tool ? the(a.tool) : "the app or file for it";
  const p = a.place ? the(a.place) : null;

  const digital: Record<Level, string> = {
    0: scopeRung(a),
    1: `Open ${t} and read what's already there. Change nothing.`,
    2: `Handle ${unit}: ${a.object}. Stop right after.`,
    3: ["writing", "communication"].includes(a.structure)
      ? `Put your cursor in ${t} and let it blink for 15 seconds.`
      : `Open ${t} and scroll one screen. Nothing else.`,
    4: `Open ${t}. That's the whole step — closing after is allowed.`,
  };
  const physical: Record<Level, string> = {
    0: scopeRung(a),
    1: `Handle ${unit}: ${a.object}. Stop right after.`,
    2: p
      ? `Pick up the first thing you see at ${p}. Just hold it.`
      : `Pick up the first thing in front of you. Just hold it.`,
    3: `Touch one thing involved in ${o}. That's the whole step.`,
    4: p ? `Walk to ${p}. Standing there is the whole step.` : `Stand up and face ${o}. Standing there is the whole step.`,
  };
  const mixed: Record<Level, string> = {
    0: scopeRung(a),
    1: `Gather the pieces of ${o} into one spot. Don't start yet.`,
    2: `Handle ${unit}: ${a.object}. Stop right after.`,
    3: `Open it or clear a hand-sized space — whichever starts ${o}.`,
    4: `Stand up and take one step toward ${o}.`,
  };
  const unknown: Record<Level, string> = {
    0: scopeRung(a),
    1: `Get to where ${o} lives — app, desk, or drawer.`,
    2: `Handle ${unit}: ${a.object}. Stop right after.`,
    3: `Touch the first thing ${o} needs. 15 seconds only.`,
    4: `Open it or face it — just make contact. Nothing more.`,
  };

  const table: Record<Medium, Record<Level, string>> = { digital, physical, mixed, unknown };
  return table[a.medium][size];
}
