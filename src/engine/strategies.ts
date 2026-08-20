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

/**
 * The digital artifact the task lives in — resolved WITHOUT invention:
 * 1. the tool the user named ("the inbox")
 * 2. for communication/writing tasks, the object ITSELF ("John's email")
 * 3. a generic grounded phrase only when the medium is genuinely digital
 * Physical tasks never receive an artifact — that would be fabrication.
 */
export function artifactFor(a: TaskAnalysis): string | null {
  if (a.tool) return the(a.tool);
  if (["communication", "writing"].includes(a.structure) && (a.medium === "digital" || a.medium === "mixed")) {
    return a.object;
  }
  if (a.medium === "digital") return "the app or file for it";
  if (a.medium === "unknown" && a.needsApp) return "the app it lives in";
  return null;
}

function slotsFor(a: TaskAnalysis): Slots {
  const physicalish = a.medium === "physical" || a.medium === "mixed";
  return {
    o: a.object,
    t: artifactFor(a) ?? a.object,
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
      /* bodily approaches — ONLY with a real named location (explicit context) */
      { fits: hasPlace, render: (s) => `Stand up and walk to ${s.p}. Nothing else.` },
      { fits: hasPlace, render: (s) => `Clear a hand-sized space at ${s.p} — that's the whole move.` },
      { fits: hasPlace, render: (s) => `Sit down at ${s.p} and face ${s.o}.` },
      /* physical task without a named place — body meets the OBJECT, never a fabricated spot */
      { fits: (a) => isPhysical(a) && !hasPlace(a), render: (s) => `Pick up one thing that belongs to ${s.o}. Just hold it.` },
      { fits: (a) => isPhysical(a) && !hasPlace(a), render: () => `Clear one hand-sized space right in front of you.` },
      /* more bodily variety for physical tasks without a named place */
      { fits: (a) => isPhysical(a) && !hasPlace(a), render: (s) => `Touch the first thing connected to ${s.o}. Just touch it.` },
      { fits: (a) => isPhysical(a) && !hasPlace(a), render: (s) => `Move one object that belongs to ${s.o} from here to there.` },
      { fits: (a) => isPhysical(a) && !hasPlace(a), render: () => `Set a 60-second timer and do only what your hands are already near.` },
      /* bodily approaches for screen work — body + named digital artifact */
      { fits: isDigital, render: (s) => `Sit down, open ${s.t}, and put your hands on the keyboard.` },
      { fits: isDigital, render: (s) => `Close every tab except ${s.t}. Then just look at it.` },
      { fits: isDigital, render: (s) => `Put your phone in another room, then open ${s.t}.` },
      /* no evidence either way — anchored to the task, fabricate nothing */
      {
        fits: (a) => a.medium === "unknown",
        render: (s) => `Stand up and move to where ${s.o} lives — desk, room, or app.`,
      },
      {
        fits: (a) => a.medium === "unknown",
        render: (s) => `Stand up, take one breath, and get within arm's reach of ${s.o}.`,
      },
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
      /* extra information-start variety */
      { render: (s) => `Write down the single question you'd need answered to start ${s.o}.` },
      { render: (s) => `Skim the title and the first heading of ${s.o}. Nothing more.` },
      { render: (s) => `Name the very first input ${s.o} needs — file, idea, or thing. Find just that.` },
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
      /* extra decision variety */
      { render: (s) => `Write the one thing that's blocking ${s.o}. Circle it. That's the decision to make.` },
      { render: (s) => `Take the easiest fork on ${s.o}. You can switch later — motion beats paralysis.` },
      { render: (s) => `Decide the smallest open question on ${s.o}. Anything reversible counts.` },
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
      { render: (s) => `Do ${s.v} for one breath's worth. Then stop and look.` },
      { render: (s) => `The tiniest real slice of ${s.o} — smaller than feels useful. That's the point.` },
      /* extra tiny variety */
      { render: (s) => `Do the smallest version of ${s.o} that still counts as having started.` },
      { render: (s) => `Set a 25-second timer for ${s.o}. When it ends, you're allowed to stop. That's the win.` },
      { render: (s) => `Do the part of ${s.o} a distracted version of you could still do. Just that.` },
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
      /* extra permission variety */
      { fits: (a) => ["writing", "communication", "creating", "project", "learning"].includes(a.structure) || isDigital(a),
        render: (s) => `Type the worst opening line of ${s.o}. It will get deleted — that's the point.` },
      { render: (s) => `Give yourself explicit permission to do ${s.o} badly for the next 90 seconds.` },
      { render: (s) => `Make a deliberately ugly first attempt at ${s.o}. Ugly is allowed today.` },
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
      /* extra visual variety */
      { render: (s) => `Open ${s.t ? `the place ${s.o} lives` : `where ${s.o} lives`} and take one screenshot — no editing.` },
      { render: (s) => `Write the title of ${s.o} at the top of a blank page. That's setup done.` },
      { render: (s) => `Put a single visible reminder of ${s.o} on your desk. One sticky note.` },
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
            : `Say out loud, to the room: “I'm starting ${s.o} now.”`,
      },
      { render: (s) => `Say ${s.o} out loud, name its very first move, then do only that.` },
      { render: (s) => `Text any friend: “starting ${s.o.replace(/^the /, "")}, 5 minutes.” No reply needed.` },
      { render: (s) => `Put on a body-double video and start ${s.o} beside it for 2 minutes.` },
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
      /* extra question variety */
      { render: (s) => `Ask: if ${s.o} were a recipe, what's step one? Do only step one.` },
      { render: (s) => `Ask out loud: what's the cheapest possible first move on ${s.o}? Then do it.` },
      { render: (s) => `Ask: what would make ${s.o} 1% more started? Do that one thing.` },
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
  const t = artifactFor(a) ?? "the app or file for it";
  const p = a.place ? the(a.place) : null;

  /* Communication gets its own faithful chain: open → read → one sentence → reply */
  const communication: Record<Level, string> = {
    0: scopeRung(a),
    1: `Open ${t} and read what's already there. Nothing more.`,
    2: `Write the first sentence of your reply — stop there.`,
    3: `Open ${t} and click Reply. You don't have to type yet.`,
    4: `Open ${t}. That's the whole step — closing after is allowed.`,
  };

  const digital: Record<Level, string> = {
    0: scopeRung(a),
    1: `Open ${t} and read what's already there. Change nothing.`,
    2: `Handle ${unit}: ${a.object}. Stop right after.`,
    3: a.structure === "writing"
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
    /* floor: go to a REAL place, or make contact with one real object — never "face the whole thing" */
    4: p ? `Walk to ${p}. Arriving is the whole step.` : `Rest one hand on something you'll ${a.verb ?? "work on"}. 10 seconds only.`,
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

  /* structure-specific ladders for study/thinking tasks — these bind the
     first move to the ACT of engaging (open, read one unit, make one mark),
     not to generic motion, so learning/research/creating never get a
     "stand up and walk" rung. */
  const study: Record<Level, string> = {
    0: scopeRung(a),
    1: `Open ${a.object} and read the first ${unit}. Stop after.`,
    2: `Read one ${unit} of ${a.object}. Close it if you must.`,
    3: `Put a finger on the first line of ${a.object}. That's contact made.`,
    4: `Open ${a.object} and let the first page load. Nothing more.`,
  };
  const create: Record<Level, string> = {
    0: scopeRung(a),
    1: `Open the file/canvas for ${a.object} and make one mark. Ugly on purpose.`,
    2: `Make one ${unit} of ${a.object}. A rough scribble counts.`,
    3: `Put your cursor/hand where ${a.object} begins. 15 seconds only.`,
    4: `Open the blank ${a.object} and stare at it for 10 seconds. Starting is the step.`,
  };

  const table: Record<Medium, Record<Level, string>> = { digital, physical, mixed, unknown };
  if (a.structure === "communication" && (a.medium === "digital" || a.medium === "mixed" || a.medium === "unknown")) {
    return communication[size];
  }
  if (a.structure === "learning" || a.structure === "research") {
    return (a.medium === "physical" ? table.physical : study)[size];
  }
  if (a.structure === "creating" || a.structure === "writing") {
    return (a.medium === "physical" ? table.physical : create)[size];
  }
  return table[a.medium][size];
}
