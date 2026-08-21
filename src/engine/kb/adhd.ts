/* ============================================================
   kb/adhd — the knowledge layer (Phase 4-0).

   Evidence-based ADHD task-initiation techniques, each with its
   source, mechanism, and a routing matrix (barrier x state x
   persona). This layer PROPOSES intervention candidates; the
   policy decides; it never dictates output directly.

   Sources (retrieved 2026-08):
   - ADDRC "action gap" / "beginning is the whole problem"
   - FOCO 2-minute rule & 10-minute timer guides
   - Barkley (1997) self-regulation model; Volkow et al. dopamine
   - NICE NG87 micro-goals; RCPsych CR235 behavioural activation
   - ADDA body doubling; Neurolaunch initiation strategies review
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
    id: "permission-to-stop",
    name: "Permission to stop",
    mechanism:
      "A real exit contract ('you may quit after') removes dread; resumption is cheaper than initiation.",
    source: "ADDRC 'stop as soon as you have started'",
    bestForBarriers: ["overwhelm", "avoiding", "frustration-risk"],
    personas: ["gentle", "momentum"],
  },
  {
    id: "visible-timer",
    name: "Visible timer",
    mechanism:
      "Time blindness: external countdowns replace internal time tracking (Barkley's self-regulation-across-time).",
    source: "FOCO 10-min timer; Barkley 1997",
    bestForBarriers: ["time-pressure", "overwhelm", "unclear-task"],
    personas: ["structured", "direct"],
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
    id: "body-doubling",
    name: "Body doubling",
    mechanism:
      "Another present nervous system adds accountability + novelty; strongest for chronic paralysis.",
    source: "ADDA body-doubling guide",
    bestForBarriers: ["overwhelm", "avoiding", "social-friction"],
    personas: ["gentle", "momentum"],
  },
  {
    id: "novelty-injection",
    name: "Novelty injection",
    mechanism:
      "The ADHD go-signal fires on urgency/novelty/challenge/interest — rotate or gamify to supply them.",
    source: "Neurolaunch initiation review; Volkow et al.",
    bestForBarriers: ["avoiding", "frustration-risk"],
    personas: ["momentum", "direct"],
  },
  {
    id: "self-compassion-reframe",
    name: "Self-compassion reframe",
    mechanism:
      "Shame activates threat systems competing with prefrontal resources — self-criticism measurably worsens initiation.",
    source: "Neurolaunch emotional-weight section; ADDRC shame loop",
    bestForBarriers: ["avoiding", "frustration-risk", "social-friction"],
    personas: ["gentle", "socratic"],
  },
  {
    id: "externalize-working-memory",
    name: "Externalize working memory",
    mechanism:
      "'If it's not written down it doesn't exist': lists/checklists offload what working memory can't hold.",
    source: "Solanto CBT manual maxims; NICE NG87",
    bestForBarriers: ["unclear-task", "overwhelm"],
    personas: ["structured", "socratic"],
  },
];

/** Fast lookup: techniques that target a given barrier value. */
export function techniquesFor(barrierValue: string): Technique[] {
  return TECHNIQUES.filter((t) => t.bestForBarriers.includes(barrierValue));
}

/** Techniques matching any active barrier belief in a set. */
export function techniquesForBeliefs(beliefs: Belief[]): Technique[] {
  const barriers = beliefs.filter((b) => b.kind === "barrier").map((b) => b.value);
  if (barriers.length === 0) return techniquesFor("unclear-task");
  return techniquesForBeliefValues(barriers);
}

function techniquesForBeliefValues(values: string[]): Technique[] {
  return TECHNIQUES.filter((t) => t.bestForBarriers.some((v) => values.includes(v)));
}
