/* ============================================================
   agent/programs — Phase 4-D: multi-step intervention protocols.

   A program is a small stateful policy for a SITUATION, not a
   task: rescue after "too big", re-entry after instant
   abandonment, a transition buffer after mid-task abandonment.
   Each program yields its steps in order; the pipeline validates
   each one through the normal cascade.

   Sources: ADDRC re-entry/resumption economics; FOCO transition
   triggers; Solanto CBT structured sequencing.
   ============================================================ */

export interface ProgramStep {
  text: string;
  /** Programs may override the policy's size for their steps. */
  size: -1 | 0 | 1;
}

export interface Program {
  id: string;
  name: string;
  when: string;
  steps: ProgramStep[];
}

export const PROGRAMS: Record<string, Program> = {
  /* After "too big": don't just shrink — rebuild safety first. */
  "rescue-ladder": {
    id: "rescue-ladder",
    name: "Rescue ladder",
    when: "the last step was rejected as too big",
    steps: [
      { text: "Breathe. The last step was genuinely too big — that's information, not failure.", size: -1 },
      { text: "Name the ONE physical object this task lives in (a laptop, a sink, a folder). Just name it.", size: -1 },
      { text: "Touch that object. Opening, moving, or holding counts as the whole step.", size: -1 },
    ],
  },
  /* After instant abandonment (quit at 0%): lower re-entry cost. */
  "re-entry-ritual": {
    id: "re-entry-ritual",
    name: "Re-entry ritual",
    when: "the user quit at the very start — re-entry must be cheaper",
    steps: [
      { text: "Stand up and sit back down somewhere else. Physical mode-switch first.", size: -1 },
      { text: "Set a visible 2-minute timer. When it rings you are DONE, guaranteed.", size: -1 },
      { text: "Do only the tiniest touch of the task until the timer rings.", size: -1 },
    ],
  },
  /* After mid-task abandonment: protect the restart, don't mourn. */
  "transition-buffer": {
    id: "transition-buffer",
    name: "Transition buffer",
    when: "the user started then stopped mid-way — resumption is cheaper than initiation",
    steps: [
      { text: "Leave the task EXACTLY as it is — open, visible, mid-state. No tidying.", size: 0 },
      { text: "Write one line: where you stopped and the very next move.", size: 0 },
      { text: "Next session is a RESUMPTION, not a start. That's the easier kind.", size: 0 },
    ],
  },
};

/** Look up a program; null when the id is unknown (never guess). */
export function getProgram(id: string): Program | null {
  return Object.prototype.hasOwnProperty.call(PROGRAMS, id) ? PROGRAMS[id] : null;
}
