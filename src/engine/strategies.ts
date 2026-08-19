import { hashStr, pick } from "./analysis";
import type { Barrier, Structure, StrategyId, TaskAnalysis } from "./types";

/* ============================================================
   Stage 2 — Initiation strategies.
   Ten categories, each expressed as template slots with several
   wording variants. Templates read the task's own extracted
   context (object / tool / place / person), so the same strategy
   says different things for different tasks.
   ============================================================ */

interface Slots {
  /** "the report" — always present. */
  o: string;
  /** "the document" — tool or object fallback. */
  t: string;
  /** "your desk" — place or generic fallback. */
  p: string;
  /** "writing" — verb phrase or "the first bit" fallback. */
  v: string;
  /** "your boss" — person, when present. */
  who: string | null;
}

function slotsFor(a: TaskAnalysis): Slots {
  return {
    o: a.object,
    t: a.tool ? (a.tool.startsWith("the ") || a.tool.startsWith("my ") ? a.tool : `the ${a.tool}`) : a.object,
    p: a.place ? (a.place.startsWith("the ") || a.place.startsWith("my ") ? a.place : `the ${a.place}`) : "the spot where it happens",
    v: a.verbPhrase ?? "the first bit",
    who: a.person ? (a.person.startsWith("my ") || a.person.startsWith("the ") ? a.person : `your ${a.person}`) : null,
  };
}

type Template = (s: Slots) => string;

export interface StrategyDef {
  id: StrategyId;
  label: string;
  /** Typical size band this strategy serves (0..4). */
  sizes: [number, number];
  templates: Template[];
}

export const STRATEGIES: StrategyDef[] = [
  {
    id: "physical",
    label: "physical start",
    sizes: [0, 3],
    templates: [
      (s) => `Stand up and walk to ${s.p}. Nothing else.`,
      (s) => `Clear a hand-sized space near ${s.p} — that's the whole move.`,
      (s) => `Put your phone in another room, then touch ${s.t}.`,
      (s) => `Sit down at ${s.p} and place your hands where ${s.o} happens.`,
      (s) => `Get a glass of water, sit at ${s.p}, and face ${s.o}.`,
    ],
  },
  {
    id: "info",
    label: "information start",
    sizes: [1, 3],
    templates: [
      (s) => `Open ${s.t} and only read what's already there.`,
      (s) => `Find ONE example of a finished ${s.o.replace(/^the /, "")}. Just look at it.`,
      (s) => `Write down the three things ${s.o} needs — from memory, badly.`,
      (s) => `Read the first instruction about ${s.o}. Stop after one.`,
      (s) => `Gather the two things ${s.o} needs into one spot. Don't use them yet.`,
    ],
  },
  {
    id: "decision",
    label: "decision-reduction start",
    sizes: [1, 3],
    templates: [
      (s) => `Make the first decision about ${s.o} in 10 seconds — any option that isn't terrible.`,
      (s) => `Write the ONE choice blocking ${s.o}, then pick either side. Wrong is fine; it moves.`,
      (s) => `Flip a coin for the first choice on ${s.o}. Heads you go with option A.`,
      (s) => `Pick the version of ${s.o} that takes the least setup. Commit for 2 minutes only.`,
    ],
  },
  {
    id: "tiny",
    label: "ridiculously small start",
    sizes: [2, 4],
    templates: [
      (s) => `Do the 30-second version of ${s.o}. Stop when the half-minute is up.`,
      (s) => `One single unit of ${s.o} — one line, one item, one click. That's the whole task.`,
      (s) => `Touch ${s.t} for exactly 15 seconds. Then you're free.`,
      (s) => `Do ${s.v} for one breath's worth. Then stop and look.`,
      (s) => `The tiniest real slice of ${s.o} — smaller than feels useful. That's the point.`,
    ],
  },
  {
    id: "timebox",
    label: "time-boxed start",
    sizes: [0, 2],
    templates: [
      (s) => `Set a 2-minute timer for ${s.o}. When it rings, stopping is allowed.`,
      (s) => `Work on ${s.o} until the next song ends.`,
      (s) => `Give ${s.o} exactly 90 seconds — watch the clock, not the task.`,
      (s) => `One kitchen-timer round: 5 minutes on ${s.o}, then a real pause.`,
    ],
  },
  {
    id: "permission",
    label: "permission-to-be-bad start",
    sizes: [1, 3],
    templates: [
      (s) => `Make the worst acceptable version of ${s.o}. Bad on purpose.`,
      (s) => `Do ${s.v} badly for 2 minutes. Quality is banned until tomorrow.`,
      (s) => `Write the version of ${s.o} you'd never show anyone.`,
      (s) => `Lower the bar to the floor: a clumsy, half-done start on ${s.o} is today's win.`,
    ],
  },
  {
    id: "visual",
    label: "visual setup start",
    sizes: [1, 3],
    templates: [
      (s) => `Open ${s.t} and just look at it — no typing, no fixing, just looking.`,
      (s) => `Put everything about ${s.o} in front of you: tabs, papers, tools. Arrange nothing.`,
      (s) => `Sketch ${s.o} as three ugly boxes on any paper.`,
      (s) => `Lay out the pieces of ${s.o} where you can see them. Seeing is the step.`,
    ],
  },
  {
    id: "social",
    label: "accountability start",
    sizes: [0, 2],
    templates: [
      (s) =>
        s.who
          ? `Send ${s.who} one line: “doing ${s.o.replace(/^the /, "")} now.” That's it.`
          : `Say out loud, to the room: “I'm doing the first bit now.”`,
      () => `Tell me the very first move — say it out loud — then do only that.`,
      (s) => `Text any friend: “starting ${s.o.replace(/^the /, "")}, 5 minutes.” No reply needed.`,
      () => `Put on a “body double” — a video of someone working — and mirror them for 2 minutes.`,
    ],
  },
  {
    id: "question",
    label: "question start",
    sizes: [1, 3],
    templates: [
      (s) => `Ask out loud: what's the very first physical move on ${s.o}? Do only that move.`,
      (s) => `Ask: where does ${s.o} actually live? Go there and stand in that spot.`,
      (s) => `Ask: what would a 5-year-old do first with ${s.o}? Do exactly that.`,
      (s) => `Ask: what's already done on ${s.o}? Start one inch past that point.`,
    ],
  },
  {
    id: "direct",
    label: "direct action start",
    sizes: [0, 1],
    templates: [
      (s) => `Do the first 2 minutes of ${s.o} — roughly, right now.`,
      (s) => `Start ${s.v} immediately, one rough unit only.`,
      (s) => `Take the first real action on ${s.o} before this sentence fades.`,
      (s) => `Begin ${s.o.replace(/^the /, "")} mid-sentence: no intro, no setup, just motion.`,
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

/** Render one concrete action for a strategy + task, deterministically varied. */
export function renderStrategy(id: StrategyId, a: TaskAnalysis, salt: number): string {
  const def = STRATEGY_MAP[id];
  const slots = slotsFor(a);
  const tpl = pick(def.templates, hashStr(`${a.title}|${id}|${salt}`));
  return tpl(slots);
}
