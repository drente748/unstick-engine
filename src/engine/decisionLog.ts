import { hashStr } from "./analysis";
import type { DecisionTrace } from "./types";

/* ============================================================
   Decision logging — LOCAL ONLY, PRIVACY-SAFE BY CONSTRUCTION.

   · In-memory ring buffer; never persisted, never transmitted.
   · Raw task text is never stored — titles are reduced to a
     32-bit hash before entering a trace entry.
   · Schema: docs/engine-data-schema.json documents the shape
     a persistent/exported log would use.

   Reward components (§29 of the engine spec) are kept separate
   so evaluation never collapses into a single magic number.
   ============================================================ */

export interface LoggedDecision {
  decisionId: string;
  /** Hash of the task title — the raw text never enters the log. */
  taskHash: string;
  policyVersion: string;
  analysisVersion: string;
  candidateCount: number;
  invalidCount: number;
  chosenStrategy: string;
  chosenSize: number;
  selectionProbability: 1;
  createdAt: number;
  /** Filled in later by the app when feedback/outcome arrive. */
  feedback?: string;
  outcome?: string;
  progress?: number;
}

const CAP = 60;
const buffer: LoggedDecision[] = [];
let counter = 0;

/** Record a decision trace. Returns the log entry id. */
export function recordDecision(taskTitle: string, trace: DecisionTrace, invalidCount: number): string {
  counter += 1;
  const entry: LoggedDecision = {
    decisionId: `d${counter.toString(36)}-${trace.createdAt.toString(36)}`,
    taskHash: hashStr(taskTitle).toString(36),
    policyVersion: trace.policyVersion,
    analysisVersion: trace.analysisVersion,
    candidateCount: trace.candidates.length,
    invalidCount,
    chosenStrategy: trace.candidates[trace.chosenIndex]?.strategy ?? "none",
    chosenSize: trace.candidates[trace.chosenIndex]?.size ?? -1,
    selectionProbability: 1,
    createdAt: trace.createdAt,
  };
  buffer.push(entry);
  if (buffer.length > CAP) buffer.shift();
  return entry.decisionId;
}

/** Attach user feedback/outcome to the most recent decision for a task. */
export function annotateDecision(
  taskTitle: string,
  patch: { feedback?: string; outcome?: string; progress?: number },
): void {
  const h = hashStr(taskTitle).toString(36);
  for (let i = buffer.length - 1; i >= 0; i--) {
    if (buffer[i].taskHash === h) {
      buffer[i] = { ...buffer[i], ...patch };
      return;
    }
  }
}

/** Read-only snapshot (newest last). Never mutate the returned array. */
export function getDecisionLog(): readonly LoggedDecision[] {
  return buffer;
}

/** Test/dev helper. */
export function clearDecisionLog(): void {
  buffer.length = 0;
}

/* ---------------- evaluation reward baseline (§29) ---------------- */

export interface RewardComponents {
  startedQuickly: number;
  worked: number;
  progress: number;
  kept: number;
}

export interface RewardPenalty {
  reason:
    | "irrelevance"
    | "semantic-duplication"
    | "medium-mismatch"
    | "fabricated-context"
    | "invalid-level"
    | "poor-task-fidelity"
    | "judgmental-language"
    | "excessive-action-count";
  amount: number;
}

/**
 * Evaluation baseline ONLY — not ground truth, never used to drive
 * the engine at runtime. Components stay separate in every log.
 */
export function rewardOf(c: RewardComponents, penalties: RewardPenalty[]): {
  total: number;
  parts: RewardComponents;
  penalties: RewardPenalty[];
} {
  const total =
    0.35 * c.startedQuickly + 0.35 * c.worked + 0.2 * c.progress + 0.1 * c.kept -
    penalties.reduce((a, p) => a + p.amount, 0);
  return { total, parts: c, penalties };
}
