/* ============================================================
   kb/adhd — the knowledge layer (Phase 4-0, expanded).

   22 evidence-based ADHD task-initiation techniques. Each carries
   its source tag, mechanism, and routing matrix. This layer
   PROPOSES candidates; policy decides; personas only dress.

   Sources (retrieved 2026-08):
   - ADDRC action-gap & beginning-is-the-problem guides
   - FOCO 2-minute rule + 10-minute timer guides
   - Barkley 1997 self-regulation; Volkow et al. dopamine imaging
   - NICE NG87 micro-goals; RCPsych CR235 behavioural activation
   - ADDA body doubling; Neurolaunch initiation review
   - Neurodivergent Insights PINCH model (Dodson interest-based NS)
   - Houston DBT Center perfectionism/RSD; svift shame-spiral reframe
   - untstuck decision-paralysis guide; vmapsych functional freeze
   - Solanto CBT manual; Focusmo Pomodoro-for-ADHD; Tiimo app guides
   - SaskADHD evidence strategies; Honestly ADHD ritual building
   ============================================================ */

import type { Belief } from "../types-v5";

/** One documented ADHD technique. */
export interface Technique {
  id: string;
  name: string;
  /** The mechanism — WHY it works for an ADHD brain. */
  mechanism: string;
  /** Source tag for traceability (never shown as medical claim). */
  source: string;
  /** Barrier values this technique targets best. */
  bestForBarriers: string[];
  /** Persona ids that deliver this technique most naturally. */
  personas: string[];
}

export const TECHNIQUES: Technique[] = [
  /* ---------- LAUNCH FAMILY (get moving) ---------- */
  {
    id: "micro-launch",
    name: "Micro-launch",
    mechanism:
      "Shrink the entry move until refusing costs more than doing; motivation arrives DURING action, not before.",
    source: "FOCO 2-min rule; ADDRC 'stupid-small' first step",
    bestForBarriers: ["overwhelm", "unclear-task", "avoiding"],
    personas: ["direct", "gentle"],
  },
  {
    id: "two-minute-contract",
    name: "Two-minute contract",
    mechanism:
      "Commit to two minutes ONLY, with a real exit right. The brain can't refuse a launch that small.",
    source: "FOCO 2-min rule; Clear's 2-min rule adapted for ADHD",
    bestForBarriers: ["overwhelm", "avoiding"],
    personas: ["direct", "gentle"],
  },
  {
    id: "permission-to-stop",
    name: "Permission to stop",
    mechanism:
      "A real exit contract removes dread; resumption is cheaper than initiation.",
    source: "ADDRC 'stop as soon as you have started'",
    bestForBarriers: ["overwhelm", "avoiding", "frustration-risk"],
    personas: ["gentle", "momentum"],
  },
  {
    id: "next-smallest-step",
    name: "Next smallest step",
    mechanism:
      "'Put one dish in the dishwasher': halve the step until the brain cannot argue with it.",
    source: "SaskADHD next-smallest-step; ADDRC ten-ways",
    bestForBarriers: ["overwhelm", "unclear-task"],
    personas: ["direct", "structured"],
  },

  /* ---------- BODY & NERVOUS SYSTEM FAMILY ---------- */
  {
    id: "movement-first",
    name: "Movement first",
    mechanism:
      "Physical mode-switch (stand, walk, stretch) signals the nervous system to shift states before the task.",
    source: "FOCO transition trigger step 4",
    bestForBarriers: ["avoiding", "unclear-task", "sustain-risk"],
    personas: ["direct", "momentum"],
  },
  {
    id: "grounding-54321",
    name: "5-4-3-2-1 grounding",
    mechanism:
      "Sensory countdown interrupts the freeze response and returns the user to their window of tolerance.",
    source: "Healthline grounding; vmapsych functional-freeze",
    bestForBarriers: ["overwhelm", "frustration-risk"],
    personas: ["gentle"],
  },
  {
    id: "pleasure-pairing",
    name: "Pleasure pairing",
    mechanism:
      "Music/podcast/fidget supplies the stimulation the low-interest task starves the brain of.",
    source: "Neurodivergent Insights PINCH; coachformind pairing",
    bestForBarriers: ["avoiding", "frustration-risk"],
    personas: ["momentum", "gentle"],
  },

  /* ---------- TIME & STRUCTURE FAMILY ---------- */
  {
    id: "visible-timer",
    name: "Visible timer",
    mechanism:
      "Time blindness: external countdowns replace broken internal time tracking (Barkley).",
    source: "FOCO 10-min timer; Barkley 1997",
    bestForBarriers: ["time-pressure", "overwhelm", "unclear-task"],
    personas: ["structured", "direct"],
  },
  {
    id: "artificial-deadline",
    name: "Artificial deadline",
    mechanism:
      "Urgency is one of the four go-levers (PINCH); self-imposed daily deadlines create it without crisis.",
    source: "NDI Hurry section; Sachs Center adults guide",
    bestForBarriers: ["time-pressure", "avoiding"],
    personas: ["structured", "momentum"],
  },
  {
    id: "implementation-intention",
    name: "Implementation intention",
    mechanism:
      "'When [trigger], I will [action]' recruits cue-driven memory and outperforms vague goals.",
    source: "Gollwitzer via ADDRC action-gap",
    bestForBarriers: ["time-pressure", "social-friction", "avoiding"],
    personas: ["structured", "socratic"],
  },
  {
    id: "peak-window",
    name: "Peak window scheduling",
    mechanism:
      "Initiation is not equally available at all hours — guard your personal window (often post-medication).",
    source: "ADDRC 'learn your window'; SaskADHD rhythms",
    bestForBarriers: ["time-pressure", "sustain-risk"],
    personas: ["structured"],
  },
  {
    id: "pomodoro-flex",
    name: "Flexible Pomodoro",
    mechanism:
      "Short defined blocks beat open-ended sessions; length flexes by dread level (10 for dreaded, 35 for engaging).",
    source: "Focusmo ADHD Pomodoro guide",
    bestForBarriers: ["time-pressure", "overwhelm"],
    personas: ["structured"],
  },

  /* ---------- SOCIAL FAMILY ---------- */
  {
    id: "body-doubling",
    name: "Body doubling",
    mechanism:
      "Another present nervous system adds accountability + novelty; strongest for chronic paralysis.",
    source: "ADDA body-doubling guide",
    bestForBarriers: ["overwhelm", "avoiding", "social-friction"],
    personas: ["gentle", "momentum"],
  },
  {
    id: "accountability-promise",
    name: "Accountability promise",
    mechanism:
      "Announcing the plan to a person creates social urgency — a go-lever — without self-criticism.",
    source: "coachformind urgency section; NDI cooperation",
    bestForBarriers: ["social-friction", "time-pressure"],
    personas: ["structured", "momentum"],
  },

  /* ---------- MIND FAMILY (reframes) ---------- */
  {
    id: "self-compassion-reframe",
    name: "Self-compassion reframe",
    mechanism:
      "Shame activates threat systems competing with prefrontal resources — self-criticism measurably worsens initiation.",
    source: "Neurolaunch emotional-weight; ADDRC shame loop",
    bestForBarriers: ["avoiding", "frustration-risk", "social-friction"],
    personas: ["gentle", "socratic"],
  },
  {
    id: "done-not-perfect",
    name: "Done > perfect",
    mechanism:
      "Perfectionism is an RSD shield ('if I can't do it perfectly I won't start'); permission to be imperfect unblocks.",
    source: "Houston DBT perfectionism-RSD; svift shame-spiral",
    bestForBarriers: ["avoiding", "frustration-risk"],
    personas: ["gentle", "socratic"],
  },
  {
    id: "externalize-working-memory",
    name: "Externalize working memory",
    mechanism:
      "'If it's not written down it doesn't exist': lists offload what working memory cannot hold.",
    source: "Solanto CBT maxims; NICE NG87",
    bestForBarriers: ["unclear-task", "overwhelm"],
    personas: ["structured", "socratic"],
  },
  {
    id: "eliminate-dont-evaluate",
    name: "Eliminate, don't evaluate",
    mechanism:
      "Choice overload freezes ranking — cut options to two and pick either; both are probably fine.",
    source: "untstuck decision-paralysis guide",
    bestForBarriers: ["overwhelm", "unclear-task"],
    personas: ["socratic", "structured"],
  },
  {
    id: "name-the-barrier",
    name: "Name the actual barrier",
    mechanism:
      "Reframe 'the task' as its true obstacle ('the email isn't hard — starting it without pressure is').",
    source: "svift practical-reframes",
    bestForBarriers: ["unclear-task", "avoiding"],
    personas: ["socratic"],
  },

  /* ---------- INTEREST-BASED FAMILY (PINCH / Dodson) ---------- */
  {
    id: "gamify-challenge",
    name: "Gamify into a challenge",
    mechanism:
      "Challenge is a PINCH go-lever: race the timer, beat your record, count items cleared.",
    source: "NDI Competition/Cooperation; neurolaunch gamification",
    bestForBarriers: ["avoiding", "frustration-risk"],
    personas: ["momentum", "direct"],
  },
  {
    id: "novelty-injection",
    name: "Novelty injection",
    mechanism:
      "Novelty is a PINCH lever: new location, new tool, different approach re-triggers engagement.",
    source: "NDI Novelty; coachformind add-novelty",
    bestForBarriers: ["avoiding", "frustration-risk"],
    personas: ["momentum", "direct"],
  },
  {
    id: "progress-celebration",
    name: "Celebrate progress",
    mechanism:
      "Reward progress NOT completion — started-and-20-minutes is traction, feeding the reward system now.",
    source: "Columbia Mental Health tips; neurolaunch progress-frame",
    bestForBarriers: ["frustration-risk", "sustain-risk"],
    personas: ["momentum", "gentle"],
  },
];

/** Fast lookup: techniques targeting a given barrier value. */
export function techniquesFor(barrierValue: string): Technique[] {
  return TECHNIQUES.filter((t) => t.bestForBarriers.includes(barrierValue));
}

/** Techniques matching any active barrier belief in a set. */
export function techniquesForBeliefs(beliefs: Belief[]): Technique[] {
  const barriers = beliefs.filter((b) => b.kind === "barrier").map((b) => b.value);
  if (barriers.length === 0) return techniquesFor("unclear-task");
  return TECHNIQUES.filter((t) => t.bestForBarriers.some((v) => barriers.includes(v)));
}

/** Task-intent affinities: which techniques FIT the kind of work
 * itself, not just the barrier ("gym" wants movement/gamify, not
 * generic micro-launch). Third scoring dimension in the policy. */
export const TASK_AFFINITY: Record<string, string[]> = {
  "physical-activity": ["movement-first", "gamify-challenge", "pleasure-pairing"],
  "practice-skill": ["gamify-challenge", "pleasure-pairing", "micro-launch"],
  "study-material": ["externalize-working-memory", "pomodoro-flex", "visible-timer"],
  reply: ["two-minute-contract", "done-not-perfect", "implementation-intention"],
  "initiate-contact": ["implementation-intention", "accountability-promise", "self-compassion-reframe"],
  "file-organize": ["visible-timer", "gamify-challenge", "eliminate-dont-evaluate"],
  "clean-space": ["pleasure-pairing", "gamify-challenge", "visible-timer"],
  "tidy-space": ["visible-timer", "next-smallest-step"],
  "pay-bill": ["two-minute-contract", "externalize-working-memory"],
  "submit-form": ["externalize-working-memory", "next-smallest-step"],
  "schedule-appointment": ["implementation-intention", "accountability-promise"],
  "buy-item": ["next-smallest-step", "eliminate-dont-evaluate"],
  "draft-new": ["done-not-perfect", "pomodoro-flex", "externalize-working-memory"],
  "fix-broken": ["name-the-barrier", "externalize-working-memory"],
};
