import type {
  Blocker,
  Domain,
  Intervention,
  Profile,
  RescueResult,
  SessionRecord,
  StuckReason,
} from "./types";

/**
 * The Task Initiation Engine (deterministic, local-first).
 *
 * Responsibilities: understand the task, detect ambiguity and likely
 * friction, choose the smallest physically observable action, adapt step
 * size to the user's current state, their learned profile, task complexity
 * and available time. A remote AI provider can optionally replace the
 * ladder source — this engine is always the fallback.
 */

const KEYWORDS: Array<[Domain, RegExp]> = [
  [
    "cleaning",
    /(clean|tidy|declutter|laundry|wash|dishes|mess|room|apartment|house|kitchen|bathroom|garage|car|fridge|vacuum|mop|organize (my )?(room|space|closet|desk|garage)|organise|dust|trash)/i,
  ],
  [
    "writing",
    /(write|writing|essay|article|blog|post|draft|paper|report|thesis|dissertation|cover letter|novel|story|caption|script|newsletter|letter to)/i,
  ],
  [
    "studying",
    /(study|studying|exam|test|revise|revision|review for|homework|course|lecture|textbook|flashcards|anki|memorize|memorise|read(ing)? (the|my|a) (book|chapter)|assignment)/i,
  ],
  ["email", /(email|e-mail|inbox|reply|replies|message|slack|dm|discord)/i],
  [
    "admin",
    /(tax|taxes|bill|finance|finances|budget|bank|invoice|form|application|paperwork|paper ?s?\b|renew|cancel|insurance|accountant|admin|visa|refund|registration|contract)/i,
  ],
  [
    "code",
    /(code|coding|program|programming|app\b|website|web ?site|feature|bug|repo|project|develop|software|script|api|portfolio|database|deploy|css|database)/i,
  ],
  [
    "health",
    /(workout|work out|exercise|gym|run\b|running|yoga|stretch|walk\b|shower|meditate|meditation|meal prep|cook|dentist|doctor)/i,
  ],
  ["calls", /(call|phone|ring|schedule|book|appointment|reserve|cancel my)/i],
  [
    "creative",
    /(draw|drawing|paint|painting|design|sketch|music|song|guitar|piano|practice|video|edit|photo|film|create|compose)/i,
  ],
];

export function detectDomain(task: string): Domain {
  const t = task.trim();
  for (const [domain, re] of KEYWORDS) {
    if (re.test(t)) return domain;
  }
  return "generic";
}

/** 0..3 — how sprawling the ask is. Drives context-aware step sizing. */
export function complexityOf(title: string): 0 | 1 | 2 | 3 {
  const t = title.toLowerCase();
  let score = 0;
  if (/(entire|whole|all (my|the)|everything|complete|completely|every single|finally)/.test(t)) score++;
  if ((t.match(/\band\b|\bthen\b/g) ?? []).length >= 1) score++;
  if (t.length > 42) score++;
  if (/(stuff|things|my life|everything|project)/.test(t)) score++;
  return Math.min(score, 3) as 0 | 1 | 2 | 3;
}

export const LEVEL_LABELS = ["the normal start", "smaller", "tiny", "micro", "the floor"] as const;

/** Ordered ladders of physical actions, from a normal start down to the floor. */
const LADDERS: Record<Domain, string[][]> = {
  cleaning: [
    [
      "Pick ONE spot — a desk, a corner, a table.",
      "Grab a trash bag. Trash goes in first.",
      "Move the dishes toward the kitchen.",
      "Wipe ONE surface clear.",
      "Step back and look at the difference.",
    ],
    [
      "Choose ONE surface.",
      "Clear that surface completely. Everything else can wait.",
      "Admire it for five seconds.",
    ],
    ["Pick up ONE object.", "Put it where it belongs.", "That already counts."],
    ["Don't clean. Just stand up.", "Walk to the messiest spot.", "Touch one thing. You may stop after."],
    ["Stand up.", "That's it. Just stand up."],
  ],
  writing: [
    [
      "Open your editor.",
      "Create a blank document.",
      "Write the title — a working one, it can change.",
      "Write ONE sentence. Any sentence.",
      "Decide whether to continue.",
    ],
    ["Open your editor.", "Put your cursor in the document.", "Write one messy line."],
    ["Open the document.", "Just open it. Nothing else."],
    ["Don't write. Just open your editor.", "Put the cursor in the box. Watch it blink."],
    ["Sit down where you write.", "Touch the keyboard."],
  ],
  studying: [
    [
      "Clear a spot on your desk.",
      "Put the book or notes in front of you.",
      "Open to the right page.",
      "Read ONE paragraph.",
      "Write one line about what it said.",
    ],
    ["Put your notes on the desk.", "Open to the right page.", "Read one paragraph."],
    ["Open the textbook.", "Just open it. That's the whole step."],
    ["Don't study. Just take the book out.", "Lay it in front of you. Open it if you feel like it."],
    ["Walk to your desk.", "Sit down."],
  ],
  email: [
    [
      "Open your inbox.",
      "Scan for the EASIEST email.",
      "Reply to ONE — two sentences max.",
      "Send it. Close the tab, or do one more.",
    ],
    ["Open the inbox.", "Open ONE email.", "Write the first sentence of the reply."],
    ["Open the email.", "Just open it. No reply needed."],
    ["Don't reply. Just open the app.", "Read one subject line. That's all."],
    ["Pick up your phone or open the laptop.", "Unlock it."],
  ],
  admin: [
    [
      "Open the banking app or the folder.",
      "Find the ONE thing you need — statement, form, bill.",
      "Fill the first field only.",
      "Save. You are allowed to stop now.",
    ],
    ["Open the app or the envelope.", "Take out ONE paper.", "Read its first line."],
    ["Open the banking app or the file.", "Just open it."],
    ["Don't do the paperwork. Just open the folder.", "Look at one file name."],
    ["Put the paperwork within arm's reach.", "Sit down next to it."],
  ],
  code: [
    [
      "Open the project in your editor.",
      "Open the ONE file you'll touch.",
      "Search for the spot you left off.",
      "Write ONE line — even a comment counts.",
      "Run it.",
    ],
    ["Open your editor.", "Open the project.", "Put your cursor where the change goes."],
    ["Open the editor.", "Just open it. No code required."],
    ["Don't code. Just open the repo.", "Look at one file name."],
    ["Sit at the computer.", "Wake it up."],
  ],
  health: [
    [
      "Put on your workout clothes.",
      "Put on your shoes.",
      "Move for ONE minute — anything counts.",
      "Decide whether to continue.",
    ],
    ["Put on your shoes.", "Stand by the door.", "One minute of movement. That's the deal."],
    ["Put on your shoes.", "Just the shoes. Nothing else."],
    ["Don't work out. Just find your shoes.", "Put one shoe on."],
    ["Stand up.", "Roll your shoulders twice."],
  ],
  calls: [
    [
      "Find the number or the booking page.",
      "Open the dialer or the site.",
      "Type the number — don't call yet.",
      "Press call.",
    ],
    ["Open the contact.", "Read the number out loud."],
    ["Open your phone.", "Find the contact. That's the step."],
    ["Don't call. Just find the number.", "Look at it. You don't have to dial."],
    ["Pick up your phone.", "Unlock it."],
  ],
  creative: [
    [
      "Clear a small space.",
      "Lay out the ONE tool you need.",
      "Make ONE mark, note, or sound.",
      "Keep it ugly on purpose.",
    ],
    ["Take out your tool.", "Hold it.", "Make one mark."],
    ["Take out your tool.", "Just hold it. No creating required."],
    ["Don't create. Just open the tool.", "Look at the blank page. It can stay blank."],
    ["Stand up.", "Go to where your stuff lives."],
  ],
  generic: [
    [
      "Open it — the app, the doc, the thing.",
      "Find the exact spot you left off.",
      "Touch ONE control: a button, a field, a page.",
      "Do the first 10 seconds only.",
    ],
    ["Open the thing.", "Just open it. Nothing more."],
    ["Open it.", "Nothing else. Just open it."],
    ["Don't do it. Just get near it.", "Touch the thing — literally."],
    ["Stand up.", "Move one step toward it."],
  ],
};

/** Continuation actions once the ladder is exhausted — momentum fuel. */
const AGAIN: Record<Domain, string[]> = {
  cleaning: ["Pick up ONE more thing.", "One more object. Then you can stop.", "Clear one more corner of the surface."],
  writing: ["Write ONE more sentence.", "One more line. Bad is fine.", "Start the next sentence with the word “and”."],
  studying: ["Read ONE more paragraph.", "One more paragraph. Then stretch.", "Write one more line of notes."],
  email: ["Open the next email. Replying is optional.", "One more reply — two sentences.", "Archive three emails. No replies needed."],
  admin: ["Fill ONE more field.", "One more box. Then pause.", "Read one more line of the form."],
  code: ["Write ONE more line.", "One more line, even a comment.", "Save the file. Small wins count."],
  health: ["Move for ONE more minute.", "One more minute of anything.", "Stretch for 30 seconds."],
  calls: ["Say the first sentence out loud.", "Dial. You can hang up — you won't.", "Just listen for the ring."],
  creative: ["Make ONE more mark.", "One more note, line, or stroke.", "Make it worse on purpose. It frees you up."],
  generic: ["Do it for 10 more seconds.", "One more tiny action. Then reassess.", "Touch the next control. That's it."],
};

const MVT: Record<Domain, string> = {
  cleaning: "Clear ONE visible surface.",
  writing: "Write one terrible paragraph.",
  studying: "Open the book. Read one paragraph.",
  email: "Reply to ONE email — two sentences.",
  admin: "Open the app or form. Fill ONE field.",
  code: "Write one ugly line that runs.",
  health: "Move for one minute. Any movement.",
  calls: "Find the number. Don't dial yet.",
  creative: "Make one mark. Ugly on purpose.",
  generic: "Do the 10-second version. Stop after.",
};

const IMPERFECT: Record<Domain, string> = {
  cleaning: "Make one pile. Sorting is a future-you problem.",
  writing: "Write the worst acceptable paragraph. Bad on purpose.",
  studying: "Summarize the page in one sloppy sentence.",
  email: "Write a clumsy two-line reply. Send it before you polish.",
  admin: "Fill the form with pencil-level confidence. Guessing is allowed.",
  code: "Write the ugliest version that runs. Refactor never — today.",
  health: "Do the lazy version of the exercise. Half reps count.",
  calls: "Script a clumsy opener and read it badly.",
  creative: "Make something deliberately bad. Frame it if you dare.",
  generic: "Make a version you'd never show anyone. It still counts.",
};

/** “Just open it” flavor per domain — for avoidance and unknowns. */
const OPEN_IT: Record<Domain, string> = {
  cleaning: "Don't clean. Just walk to the messiest spot and touch one thing.",
  writing: "Don't write. Just open the document and watch the cursor blink.",
  studying: "Don't study. Just open the book to any page.",
  email: "Don't reply. Just open the inbox and read one subject line.",
  admin: "Don't do paperwork. Just open the folder or the app.",
  code: "Don't code. Just open the project and look at one file name.",
  health: "Don't work out. Just put one shoe on.",
  calls: "Don't call. Just find the number and look at it.",
  creative: "Don't create. Just hold the tool in your hand.",
  generic: "Don't do it. Just open it. Opening isn't doing.",
};

export function buildLadder(domain: Domain, level: number, ladderOverride?: string[] | null): string[] {
  if (level === 0 && ladderOverride && ladderOverride.length) return ladderOverride;
  const clamped = Math.min(Math.max(level, 0), 4);
  return LADDERS[domain][clamped];
}

export function continueAction(domain: Domain, n: number): string {
  const list = AGAIN[domain];
  return list[n % list.length];
}

export function currentAction(
  domain: Domain,
  level: number,
  stepIndex: number,
  override?: string | null,
  ladderOverride?: string[] | null,
): string {
  if (override) return override;
  const ladder = buildLadder(domain, level, ladderOverride);
  if (stepIndex < ladder.length) return ladder[stepIndex];
  return continueAction(domain, stepIndex - ladder.length);
}

export function minimumViable(domain: Domain): string {
  return MVT[domain];
}

export function imperfectFirst(domain: Domain): string {
  return IMPERFECT[domain];
}

export function openItAction(domain: Domain): string {
  return OPEN_IT[domain];
}

function shortTitle(title: string): string {
  const t = title.trim();
  return t.length > 34 ? `${t.slice(0, 32).trimEnd()}…` : t;
}

/** Scope step for sprawling tasks — pick ONE piece before touching anything. */
export function scopeStep(title: string): string {
  return `Choose ONE piece of “${shortTitle(title)}”. The rest can wait.`;
}

/* ---------------- rescue strategies (mid-task) ---------------- */

export function rescueStrategy(domain: Domain, reason: StuckReason, level: number): RescueResult {
  const next = Math.min(level + 1, 4);
  switch (reason) {
    case "unknown-next":
      return { message: "No panic. Here's the next physical move:", action: currentAction(domain, level, 1) };
    case "too-big":
      return { message: "Okay. Let's lower the bar.", level: next };
    case "distracted":
      return {
        message: "Your attention wandered. That's normal — not a flaw. Let's reset for 60 seconds.",
        reset: true,
      };
    case "tired":
      return {
        message: "Then the bar goes to the floor. Minimum viable only:",
        action: MVT[domain] + " Stop after. You have permission.",
      };
    case "afraid":
      return {
        message: "Your first version is allowed to be bad. Let's make the worst acceptable one:",
        action: IMPERFECT[domain],
      };
    case "lost-interest":
      return {
        message: "Interest left? Fine — the next step gets shorter:",
        action: "Give it exactly 10 seconds. Then you may stop with zero guilt.",
      };
    case "dont-want":
      return {
        message: "You don't have to want it. Minimum viable version, then you're free:",
        action: MVT[domain] + " That's the whole deal.",
      };
    case "dont-know":
      return {
        message: "“I don't know” is a fine answer. When we don't know, we go tiny:",
        action: "Just open it. That's the entire step.",
      };
  }
}

export const STRATEGY_LABEL: Record<StuckReason, string> = {
  "unknown-next": "one concrete next move",
  "too-big": "shrinking the bar",
  distracted: "a 60-second reset",
  tired: "the minimum viable version",
  afraid: "the “bad on purpose” version",
  "lost-interest": "10-second bursts",
  "dont-want": "the minimum viable deal",
  "dont-know": "a tiny open-it step",
};

/* ---------------- pre-start state check ---------------- */

export const BLOCKERS: Array<{ v: Blocker; label: string; icon: string; hint: string }> = [
  { v: "too-big", label: "It feels too big", icon: "mountain", hint: "we'll shrink it to one piece" },
  { v: "unclear", label: "It's unclear — I don't see the first move", icon: "fog", hint: "we'll find one physical move" },
  { v: "boring", label: "It's boring", icon: "zzz", hint: "a 10-second sprint beats boredom" },
  { v: "perfectionism", label: "I want to do it perfectly", icon: "eye", hint: "we'll make the worst acceptable version" },
  { v: "anxiety", label: "I'm anxious I'll do it wrong", icon: "heart", hint: "an intentionally imperfect first step" },
  { v: "distracted", label: "My attention keeps wandering", icon: "loop", hint: "a 60-second attention reset" },
  { v: "tired", label: "I'm tired", icon: "battery", hint: "the minimum viable version" },
  { v: "avoiding", label: "I keep avoiding it", icon: "door", hint: "just open it — nothing more" },
  { v: "dont-know", label: "I honestly don't know", icon: "question", hint: "that's fine — we'll go tiny" },
];

export const BLOCKER_LABEL: Record<Blocker, string> = {
  "too-big": "the size of it",
  unclear: "not seeing the first move",
  boring: "boredom",
  perfectionism: "perfectionism",
  anxiety: "fear of doing it wrong",
  distracted: "a wandering attention",
  tired: "low energy",
  avoiding: "avoidance",
  "dont-know": "an unnamed blocker",
};

/** Maps a named blocker to the right pre-start intervention. */
export function blockerIntervention(domain: Domain, blocker: Blocker, level: number): Intervention {
  switch (blocker) {
    case "too-big":
      return {
        headline: "Too big → one piece only.",
        action: "Pick ONE piece of it. Ignore the rest today.",
        levelShift: 1,
      };
    case "unclear":
      return {
        headline: "Unclear → here's the exact physical move.",
        action: currentAction(domain, Math.min(level, 1), 0),
        levelShift: 0,
      };
    case "boring":
      return {
        headline: "Boring → beat it with ten seconds.",
        action: "Give it 10 seconds. Boredom can't win a sprint.",
        levelShift: 0,
      };
    case "perfectionism":
      return {
        headline: "Perfectionism → make it bad on purpose.",
        action: IMPERFECT[domain],
        levelShift: 0,
      };
    case "anxiety":
      return {
        headline: "Anxiety → the bar drops to the floor.",
        action: IMPERFECT[domain],
        levelShift: 1,
      };
    case "distracted":
      return { headline: "Distraction → a 60-second reset first.", action: "", reset: true, levelShift: 0 };
    case "tired":
      return {
        headline: "Tired → minimum viable only.",
        action: MVT[domain] + " Stop after. Permission granted.",
        levelShift: 1,
      };
    case "avoiding":
      return { headline: "Avoiding → don't do it. Just open it.", action: OPEN_IT[domain], levelShift: 1 };
    case "dont-know":
      return {
        headline: "Unknown → we go tiny.",
        action: "Just open it. That's the entire step.",
        levelShift: 2,
      };
  }
}

/* ---------------- context-aware planning ---------------- */

export interface PlanInput {
  title: string;
  domain: Domain;
  profile: Profile | null;
  blocker?: Blocker | null;
  durationSec?: number;
}

export interface Plan {
  action: string;
  level: number;
  note: string | null;
}

/**
 * Chooses the first step using task complexity, the user's current state,
 * their learned profile and the available time. Always returns ONE action.
 */
export function planFirstStep(inp: PlanInput): Plan {
  const cx = complexityOf(inp.title);
  let level: number = cx >= 2 ? 2 : cx === 1 ? 1 : 0;
  const notes: string[] = [];

  if (cx >= 2) notes.push("small start — it's a big ask");

  const p = inp.profile;
  if (p && p.bestLevel != null && p.confidence !== "none" && p.bestLevel > level) {
    level = p.bestLevel;
    notes.unshift(`sized for you — ${LEVEL_LABELS[p.bestLevel]} steps have given you momentum before`);
  }

  if (inp.durationSec && inp.durationSec <= 60) {
    level = Math.min(4, level + 1);
    notes.push("10-second-sized");
  } else if (inp.durationSec && inp.durationSec >= 600) {
    level = Math.max(0, level - 1);
  }

  let action: string;
  if (inp.blocker === "perfectionism" || inp.blocker === "anxiety") {
    action = IMPERFECT[inp.domain];
  } else if (inp.blocker === "tired" || inp.blocker === "avoiding") {
    action = OPEN_IT[inp.domain];
  } else if (cx >= 2 && level <= 1) {
    action = scopeStep(inp.title);
  } else {
    action = currentAction(inp.domain, level, 0);
  }

  return { action, level, note: notes[0] ?? null };
}

/* ---------------- personal start profile (local learning) ---------------- */

export function durationLabel(sec: number): string {
  if (sec <= 10) return "10 seconds";
  if (sec <= 60) return "1 minute";
  const m = Math.round(sec / 60);
  return `${m} minutes`;
}

/**
 * Studies nothing but the user's own starts: which step sizes, session
 * lengths and rescue strategies most often lead to momentum (“I kept
 * going”). Computed on-device; nothing is stored or sent anywhere.
 */
export function computeProfile(sessions: SessionRecord[]): Profile {
  const starts = sessions.length;
  const done = sessions.filter((s) => s.outcome !== null && s.outcome !== undefined);
  const empty: Profile = {
    starts,
    bestLevel: null,
    bestDuration: null,
    bestStrategy: null,
    commonBlocker: null,
    confidence: starts >= 3 ? "low" : "none",
  };
  if (done.length < 2) return empty;

  const rate = (map: Map<string, { kept: number; total: number }>, key: string | null | undefined, kept: boolean) => {
    if (key == null) return;
    const e = map.get(key) ?? { kept: 0, total: 0 };
    e.total++;
    if (kept) e.kept++;
    map.set(key, e);
  };

  const levels = new Map<string, { kept: number; total: number }>();
  const durations = new Map<string, { kept: number; total: number }>();
  const strategies = new Map<string, { kept: number; total: number }>();
  const blockers = new Map<string, number>();

  for (const s of done) {
    const kept = s.outcome === "kept";
    rate(levels, s.level != null ? String(s.level) : null, kept);
    rate(durations, s.duration != null ? String(s.duration) : null, kept);
    rate(strategies, s.strategy ?? null, kept);
    if (s.blocker) blockers.set(s.blocker, (blockers.get(s.blocker) ?? 0) + 1);
  }

  const best = (map: Map<string, { kept: number; total: number }>): string | null => {
    let winner: string | null = null;
    let bestRate = -1;
    for (const [k, v] of map) {
      if (v.total < 2) continue;
      const r = v.kept / v.total;
      if (r > bestRate || (r === bestRate && winner === null)) {
        bestRate = r;
        winner = k;
      }
    }
    return bestRate > 0 ? winner : null;
  };

  const bl = best(levels);
  const bd = best(durations);
  const bs = best(strategies);

  let commonBlocker: Blocker | null = null;
  let top = 1;
  for (const [k, v] of blockers) {
    if (v >= 2 && v > top) {
      top = v;
      commonBlocker = k as Blocker;
    }
  }

  return {
    starts,
    bestLevel: bl != null ? Number(bl) : null,
    bestDuration: bd != null ? Number(bd) : null,
    bestStrategy: bs as StuckReason | null,
    commonBlocker,
    confidence: done.length >= 5 ? "enough" : "low",
  };
}

/* ---------------- optional remote AI provider ---------------- */

export async function tryRemoteEngine(endpoint: string, task: string): Promise<string[] | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const steps =
      data && typeof data === "object" && Array.isArray((data as { steps?: unknown }).steps)
        ? ((data as { steps: unknown[] }).steps.filter((s): s is string => typeof s === "string").slice(0, 6))
        : null;
    return steps && steps.length > 0 ? steps : null;
  } catch {
    return null;
  }
}
