/* ============================================================
   Engine + app domain types.
   The engine is staged: analysis → barrier → strategies →
   selection (with repetition memory) → generation → learning.
   ============================================================ */

/** Coarse task structure — what KIND of thing this is. */
export type Structure =
  | "prep"
  | "writing"
  | "research"
  | "communication"
  | "cleaning"
  | "deciding"
  | "learning"
  | "creating"
  | "errand"
  | "fixing"
  | "organizing"
  | "project"
  | "generic";

/** The ten initiation strategy categories. */
export type StrategyId =
  | "physical"
  | "info"
  | "decision"
  | "tiny"
  | "timebox"
  | "permission"
  | "visual"
  | "social"
  | "question"
  | "direct";

/** What is blocking the user right now. */
export type Barrier =
  | "overwhelmed"
  | "unclear"
  | "boring"
  | "perfectionism"
  | "anxiety"
  | "distracted"
  | "tired"
  | "avoiding"
  | "unknown";

/** Explicit lightweight feedback after an attempted step. */
export type FeedbackKind = "worked" | "tooBig" | "stuck" | "irrelevant";

export type Difficulty = "easy" | "abit" | "hard" | "impossible";

/** Legacy rescue-mode reasons (mapped onto barriers by the engine). */
export type StuckReason =
  | "unknown-next"
  | "too-big"
  | "distracted"
  | "tired"
  | "afraid"
  | "lost-interest"
  | "dont-want"
  | "dont-know";

export type EntryKind = "normal" | "ten" | "shrinker" | "overwhelm" | "onetap" | "statecheck" | "recover";

export type SessionKind = "focus" | "ten" | "micro";

export type Outcome = "kept" | "stopped" | "stuck";

export type ThemeId = "pine" | "dawn" | "rain";

/* ---------------- task analysis ---------------- */

export interface TaskSignals {
  multiPart: boolean;
  bigScope: boolean;
  vague: boolean;
  hasDeadline: boolean;
}

export interface TaskAnalysis {
  /** Original (trimmed, capped) task text. */
  title: string;
  structure: Structure;
  /** Base verb if a known one was found ("write"). */
  verb: string | null;
  /** Safe gerund/noun form for templates ("writing", "a reply"). */
  verbPhrase: string | null;
  /** The concrete object phrase ("the report", "my taxes"). */
  object: string;
  place: string | null;
  tool: string | null;
  person: string | null;
  /** 0..3 — how large/abstract the ask is. */
  complexity: number;
  signals: TaskSignals;
}

/* ---------------- engine runtime ---------------- */

/** Anti-repetition memory for the current attempt chain. */
export interface EngineMemory {
  /** Normalized action texts already shown (capped). */
  shown: string[];
  /** Strategy ids already used (capped). */
  strategies: StrategyId[];
  /** Strategies that were followed by negative feedback. */
  failed: StrategyId[];
}

export interface EngineResult {
  action: string;
  strategy: StrategyId;
  size: number;
  note: string | null;
}

export interface PreviewStep {
  action: string;
  strategy: StrategyId;
  size: number;
}

export interface PlanInput {
  title: string;
  barrier?: Barrier | null;
  size?: number | null;
  durationSec?: number | null;
  profile?: Profile | null;
}

/* ---------------- persistence ---------------- */

export interface Profile {
  starts: number;
  kept: number;
  /** Step size that most often led to momentum. */
  bestSize: number | null;
  /** Session length that most often led to momentum. */
  bestDuration: number | null;
  bestStrategy: StrategyId | null;
  commonBarrier: Barrier | null;
  /** Seconds between naming a task and starting it, when it worked. */
  avgTimeToStart: number | null;
  confidence: "none" | "low" | "enough";
}

export interface SessionRecord {
  id: string;
  title: string | null;
  structure: Structure;
  kind: SessionKind;
  startedAt: number;
  endedAt: number | null;
  seconds: number;
  steps: number;
  rescues: number;
  outcome: Outcome | null;
  /** Adaptive step size used (0..4). */
  size: number;
  /** Planned session length in seconds. */
  duration: number;
  entry: EntryKind;
  barrier: Barrier | null;
  strategy: StrategyId | null;
  /** Seconds from task entry to first start (null if unknown). */
  timeToStart: number | null;
}

export interface Draft {
  title: string;
  analysis: TaskAnalysis;
  /** Adaptive step size: 0 full … 4 the floor. */
  level: number;
  stepIndex: number;
  stepsDone: number;
  rescues: number;
  feedbacks: number;
  startedAt: number;
  enteredAt: number;
  sessionId: string | null;
  kind: SessionKind;
  /** The current single action (engine always keeps this set). */
  override: string | null;
  strategy: StrategyId | null;
  note: string | null;
  /** AI-provided ladder, if a remote engine was configured. */
  ladderOverride: string[] | null;
  entry: EntryKind;
  blocker: Barrier | null;
  lastFeedback: FeedbackKind | null;
  memory: EngineMemory;
}

export interface Settings {
  theme: ThemeId;
  textScale: 100 | 112 | 125;
  reduceMotion: boolean;
  sound: boolean;
  doubleMsgs: boolean;
  saveTitles: boolean;
  aiEndpoint: string;
}

export type Screen =
  | { id: "home" }
  | { id: "threshold"; task: string }
  | { id: "micro" }
  | { id: "quick" }
  | { id: "shrinker" }
  | { id: "onestep" }
  | { id: "statecheck" }
  | { id: "focus"; durationSec: number; bodyDouble: boolean }
  | { id: "rescue" }
  | { id: "reset"; returnTo: "focus" | "shrinker" | "onestep" }
  | { id: "recover" }
  | { id: "complete" }
  | { id: "overwhelm" }
  | { id: "progress" }
  | { id: "settings" }
  | { id: "about" };

export interface Persisted {
  v: 1;
  sessions: SessionRecord[];
  pending: Draft | null;
  settings: Settings;
  lastVisit: number;
}
