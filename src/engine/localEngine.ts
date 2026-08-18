import type { Domain, RescueResult, StuckReason } from "./types";

/**
 * The Task Initiation Engine (deterministic, local-first).
 *
 * It implements the `InitiationEngine` contract: understand the task,
 * detect likely friction, and convert abstract intentions into one
 * concrete, physically observable action. A remote AI provider can be
 * swapped in via settings — this engine is always the fallback.
 */

const KEYWORDS: Array<[Domain, RegExp]> = [
  [
    "cleaning",
    /(clean|tidy|declutter|laundry|wash|dishes|mess|room|apartment|house|kitchen|vacuum|organize my (room|space|closet|desk)|organise)/i,
  ],
  [
    "writing",
    /(write|writing|essay|article|blog|post|draft|paper|report|thesis|dissertation|cover letter|novel|story|caption)/i,
  ],
  [
    "studying",
    /(study|studying|exam|test|revise|revision|review|homework|course|lecture|textbook|flashcards|read(ing)? (the|my|a) (book|chapter))/i,
  ],
  ["email", /(email|e-mail|inbox|reply|replies|message|slack|dm)/i],
  [
    "admin",
    /(tax|taxes|bill|finance|finances|budget|bank|invoice|form|application|paperwork|paper|renew|cancel|insurance|accountant|admin)/i,
  ],
  [
    "code",
    /(code|coding|program|programming|app|website|web ?site|feature|bug|repo|project|develop|software|script|api|portfolio)/i,
  ],
  [
    "health",
    /(workout|work out|exercise|gym|run|running|yoga|stretch|walk|shower|meditate|meditation|meal prep|cook)/i,
  ],
  ["calls", /(call|phone|ring|schedule|book|appointment|reserve|cancel my)/i],
  [
    "creative",
    /(draw|drawing|paint|painting|design|sketch|music|song|guitar|piano|practice|video|edit|photo|film|create)/i,
  ],
];

export function detectDomain(task: string): Domain {
  const t = task.trim();
  for (const [domain, re] of KEYWORDS) {
    if (re.test(t)) return domain;
  }
  return "generic";
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

/** Maps a stuck reason to a concrete rescue strategy. */
export function rescueStrategy(domain: Domain, reason: StuckReason, level: number): RescueResult {
  const next = Math.min(level + 1, 4);
  switch (reason) {
    case "unknown-next":
      return {
        message: "No panic. Here's the next physical move:",
        action: currentAction(domain, level, 1),
      };
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

/**
 * Optional remote provider. The app never depends on it: any failure
 * returns null and the local engine takes over with a gentle notice.
 */
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
